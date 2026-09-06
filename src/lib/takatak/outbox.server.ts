/**
 * TAKATAK integration outbox — SERVER ONLY.
 *
 * Marketplace operations NEVER depend synchronously on TAKATAK availability.
 * Everything is queued in public.takatak_outbox and drained separately.
 */

import { mapCustomer, mapGuestCustomer } from "./customer-mapper";
import { mapMerchant } from "./merchant-mapper";
import { mapOrder } from "./order-mapper";
import { mapRelationship } from "./relationship-mapper";
import { sendTakatakEvent, takatakConfigured } from "./client.server";
import type { AggregateType, TakatakEventType } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from: (t: string) => any };

export async function db(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

const BACKOFF_MINUTES = [1, 5, 15, 60, 180, 720];
export const MAX_ATTEMPTS = 6;

function nextAttemptAt(attempt: number): string {
  const minutes = BACKOFF_MINUTES[Math.min(attempt, BACKOFF_MINUTES.length - 1)] ?? 720;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/**
 * Queue one event. `event_key` gives durable, DB-enforced idempotency for
 * one-time lifecycle events (unique partial index on takatak_outbox.event_key),
 * so webhook retries can never create duplicate master events.
 */
export async function enqueue(
  event_type: TakatakEventType,
  aggregate_type: AggregateType,
  aggregate_id: string,
  payload: Record<string, unknown>,
  event_key?: string | null,
): Promise<void> {
  const client = await db();
  const { error } = await client.from("takatak_outbox").insert({
    event_type,
    aggregate_type,
    aggregate_id,
    source_application: "1lv",
    payload,
    event_key: event_key ?? null,
  });
  // 23505 = duplicate event_key → the lifecycle event is already queued/delivered.
  if (error && (error as { code?: string }).code !== "23505") {
    console.warn("takatak enqueue failed:", (error as { message?: string }).message);
  }
}


/* ------------------------------------------------------------------ */
/* Event builders — payloads are always rebuilt from the database,     */
/* never trusted from the caller.                                      */
/* ------------------------------------------------------------------ */

export async function queueCustomerEvent(
  profileId: string,
  eventType: Extract<TakatakEventType, "customer.created" | "customer.updated">,
) {
  const client = await db();
  const { data: profile } = await client
    .from("profiles")
    .select("id, display_name, locale, country, created_at")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return;
  // Email/phone come from the last order the person placed (auth schema is off-limits).
  const { data: lastOrder } = await client
    .from("orders")
    .select("customer_email, customer_phone, shipping_address")
    .eq("customer_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const addr = (lastOrder?.shipping_address ?? null) as Record<string, string> | null;
  await enqueue(
    eventType,
    "customer",
    profileId,
    {
      ...mapCustomer({
        id: profile.id,
        display_name: profile.display_name,
        email: lastOrder?.customer_email ?? null,
        phone: lastOrder?.customer_phone ?? null,
        locale: profile.locale,
        country: profile.country,
        province: addr?.["province"] ?? null,
        created_at: profile.created_at,
      }),
    },
    // "created" is a one-time lifecycle event; "updated" may legitimately repeat.
    eventType === "customer.created" ? `customer.created:${profileId}` : null,
  );

}

export async function queueGuestCustomerEvent(orderId: string) {
  const client = await db();
  const { data: order } = await client
    .from("orders")
    .select("id, order_number, customer_id, customer_email, customer_phone, shipping_address, created_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.customer_id) return;
  const addr = (order.shipping_address ?? null) as Record<string, string> | null;
  const fullName = addr
    ? [addr["first_name"], addr["last_name"]].filter(Boolean).join(" ") || null
    : null;
  await enqueue(
    "customer.created",
    "customer",
    `guest:${order.order_number}`,
    {
      ...mapGuestCustomer({
        orderNumber: order.order_number,
        email: order.customer_email,
        phone: order.customer_phone,
        fullName,
        country: addr?.["country"] ?? null,
        province: addr?.["province"] ?? null,
        createdAt: order.created_at,
      }),
    },
    `customer.created:guest:${order.order_number}`,
  );

}

export async function queueMerchantEvent(vendorId: string, eventType: TakatakEventType) {
  const client = await db();
  const { data: vendor } = await client
    .from("vendors")
    .select(
      "id, user_id, store_name, slug, business_name, contact_email, phone, address, city, province, postal_code, country, status, subscription_status, subscription_plan, created_at",
    )
    .eq("id", vendorId)
    .maybeSingle();
  if (!vendor) return;
  // One-time merchant lifecycle transitions are keyed; free-form updates are not.
  const key =
    eventType === "merchant.updated" ? null : `${eventType}:${vendorId}`;
  await enqueue(eventType, "merchant", vendorId, { ...mapMerchant(vendor) }, key);
}

export async function queueOrderEvent(orderId: string, eventType: TakatakEventType) {
  const client = await db();
  const { data: order } = await client
    .from("orders")
    .select(
      "id, order_number, customer_id, total, currency, payment_status, status, created_at, vendor_orders(vendor_id, subtotal, status)",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;
  await enqueue(eventType, "order", orderId, { ...mapOrder(order) }, `${eventType}:${orderId}`);

  if (eventType === "order.created") {
    await queueRelationshipEvents(orderId);
    if (!order.customer_id) await queueGuestCustomerEvent(orderId);
  }
}

/**
 * Queue order.fulfilled only once EVERY vendor split has been delivered.
 * Safe to call after any vendor order status change.
 */
export async function queueOrderFulfilledIfComplete(orderId: string) {
  const client = await db();
  const { data: splits } = await client
    .from("vendor_orders")
    .select("status")
    .eq("order_id", orderId);
  const rows = (splits ?? []) as Array<{ status: string }>;
  if (rows.length === 0) return;
  const done = rows.every((r) => r.status === "delivered" || r.status === "cancelled");
  if (!done) return;
  await queueOrderEvent(orderId, "order.fulfilled");
}


/**
 * One relationship edge per vendor split. Metrics are scoped to THAT vendor
 * only — never aggregated across merchants.
 */
export async function queueRelationshipEvents(orderId: string) {
  const client = await db();
  const { data: order } = await client
    .from("orders")
    .select("id, order_number, customer_id, created_at, vendor_orders(vendor_id, subtotal)")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;
  const customerRef = order.customer_id ?? `guest:${order.order_number}`;
  const isGuest = !order.customer_id;

  for (const split of (order.vendor_orders ?? []) as Array<{ vendor_id: string; subtotal: number }>) {
    let orderCount: number | null = null;
    let ltv: number | null = null;
    let firstSeen: string | null = order.created_at;

    if (order.customer_id) {
      const { data: history } = await client
        .from("vendor_orders")
        .select("subtotal, created_at, orders!inner(customer_id)")
        .eq("vendor_id", split.vendor_id)
        .eq("orders.customer_id", order.customer_id);
      const rows = (history ?? []) as Array<{ subtotal: number; created_at: string }>;
      orderCount = rows.length;
      ltv = Math.round(rows.reduce((s, r) => s + Number(r.subtotal ?? 0), 0) * 100) / 100;
      firstSeen = rows.map((r) => r.created_at).sort()[0] ?? order.created_at;
    }

    const isFirst = orderCount === null || orderCount <= 1;
    await enqueue(
      isFirst ? "customer.vendor.first_order" : "customer.vendor.order_completed",
      "relationship",
      `${customerRef}:${split.vendor_id}`,
      {
        ...mapRelationship({
          customerLocalReference: customerRef,
          customerIsGuest: isGuest,
          vendorLocalReference: split.vendor_id,
          firstSeenAt: firstSeen,
          lastSeenAt: order.created_at,
          orderCount,
          lifetimeValue: ltv,
        }),
        local_order_id: order.id,
      },
    );
  }
}

export async function queueDisputeRelationshipEvent(disputeId: string) {
  const client = await db();
  const { data: dispute } = await client
    .from("disputes")
    .select("id, customer_id, vendor_id, order_id, created_at, orders(order_number)")
    .eq("id", disputeId)
    .maybeSingle();
  if (!dispute) return;
  const orderNumber = (dispute.orders as { order_number?: string } | null)?.order_number ?? dispute.order_id;
  const customerRef = dispute.customer_id ?? `guest:${orderNumber}`;
  await enqueue(
    "customer.vendor.dispute_opened",
    "relationship",
    `${customerRef}:${dispute.vendor_id}`,
    {
      ...mapRelationship({
        customerLocalReference: customerRef,
        customerIsGuest: !dispute.customer_id,
        vendorLocalReference: dispute.vendor_id,
        lastSeenAt: dispute.created_at,
      }),
      local_dispute_id: dispute.id,
      local_order_id: dispute.order_id,
    },
  );
}

/* ------------------------------------------------------------------ */
/* Drain                                                               */
/* ------------------------------------------------------------------ */

export type DrainResult = {
  ok: boolean;
  setupRequired?: boolean;
  processed: number;
  delivered: number;
  failed: number;
};

/** Process pending/retryable events with exponential backoff. */
export async function drainTakatakOutbox(limit = 25): Promise<DrainResult> {
  if (!takatakConfigured()) {
    return { ok: false, setupRequired: true, processed: 0, delivered: 0, failed: 0 };
  }
  const client = await db();
  const { data: rows } = await client
    .from("takatak_outbox")
    .select("*")
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  let delivered = 0;
  let failed = 0;
  const list = (rows ?? []) as Array<{
    id: string;
    event_type: TakatakEventType;
    aggregate_type: string;
    aggregate_id: string;
    payload: Record<string, unknown>;
    attempt_count: number;
  }>;

  for (const row of list) {
    await client.from("takatak_outbox").update({ status: "processing" }).eq("id", row.id);
    const result = await sendTakatakEvent({
      eventId: row.id,
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      payload: row.payload ?? {},
    });
    const attempt = row.attempt_count + 1;
    if (result.ok) {
      delivered++;
      await client
        .from("takatak_outbox")
        .update({
          status: "delivered",
          attempt_count: attempt,
          last_error: null,
          remote_id: result.remoteId,
          delivered_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      await recordRemoteId(client, row.aggregate_type, row.aggregate_id, result.remoteId);
    } else {
      failed++;
      await client
        .from("takatak_outbox")
        .update({
          status: attempt >= MAX_ATTEMPTS ? "failed" : "pending",
          attempt_count: attempt,
          last_error: result.error,
          next_attempt_at: nextAttemptAt(attempt),
        })
        .eq("id", row.id);
    }
  }

  return { ok: true, processed: list.length, delivered, failed };
}

async function recordRemoteId(
  client: Db,
  aggregateType: string,
  aggregateId: string,
  remoteId: string | null,
) {
  if (!remoteId) return;
  if (aggregateType === "customer" && !aggregateId.startsWith("guest:")) {
    await client.from("profiles").update({ takatak_person_id: remoteId }).eq("id", aggregateId);
  } else if (aggregateType === "merchant") {
    await client
      .from("vendors")
      .update({
        takatak_merchant_id: remoteId,
        takatak_sync_status: "synced",
        takatak_last_synced_at: new Date().toISOString(),
      })
      .eq("id", aggregateId);
  } else if (aggregateType === "order") {
    await client.from("orders").update({ takatak_order_event_id: remoteId }).eq("id", aggregateId);
  }
}

/** Requeue failed events for immediate retry. */
export async function retryFailedOutbox(): Promise<number> {
  const client = await db();
  const { data } = await client
    .from("takatak_outbox")
    .update({ status: "pending", next_attempt_at: new Date().toISOString() })
    .eq("status", "failed")
    .select("id");
  return (data ?? []).length;
}
