/**
 * TAKATAK master-platform server functions.
 *
 * SAFETY RULES
 * - Admin operations (status, drain, retry, manual queue) require a
 *   server-side admin check; the route guard is UX only.
 * - Payloads are ALWAYS rebuilt from the database by the mappers. A browser
 *   can never hand us a payload to forward to TAKATAK.
 * - TAKATAK_MASTER_API_URL / TAKATAK_MASTER_API_KEY never leave the server;
 *   only booleans ("configured") are returned to the console.
 * - Lifecycle calls are fire-and-forget for the caller: they never block
 *   signup, vendor onboarding, or checkout.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AggregateType, TakatakEventType } from "./takatak/types";

export type TakatakActionResult = {
  ok: boolean;
  reason?: string;
  setupRequired?: boolean;
  processed?: number;
  delivered?: number;
  failed?: number;
  requeued?: number;
};

const CUSTOMER_EVENTS = ["customer.created", "customer.updated"] as const;
const MERCHANT_EVENTS = [
  "merchant.application.created",
  "merchant.updated",
  "merchant.approved",
  "merchant.suspended",
] as const;
const ORDER_EVENTS = ["order.created", "order.paid", "order.fulfilled", "order.refunded"] as const;

type CustomerEvent = (typeof CUSTOMER_EVENTS)[number];
type MerchantEvent = (typeof MERCHANT_EVENTS)[number];

/* ------------------------------------------------------------------ */
/* Admin — status / operations                                         */
/* ------------------------------------------------------------------ */

export const getTakatakIntegrationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin } = await import("./disputes.server");
    await assertAdmin(context);
    const { takatakStatus } = await import("./takatak/outbox.server");
    return await takatakStatus();
  });

export const getTakatakEventDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("./disputes.server");
    await assertAdmin(context);
    const { takatakEventDetail } = await import("./takatak/outbox.server");
    return await takatakEventDetail(data.id);
  });

export const drainTakatakOutboxNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TakatakActionResult> => {
    const { assertAdmin } = await import("./disputes.server");
    await assertAdmin(context);
    const { drainTakatakOutbox } = await import("./takatak/outbox.server");
    const res = await drainTakatakOutbox(25);
    if (!res.ok) {
      return {
        ok: false,
        setupRequired: res.setupRequired,
        reason: "TAKATAK Master API is not configured — events stay safely queued.",
      };
    }
    return { ok: true, processed: res.processed, delivered: res.delivered, failed: res.failed };
  });

export const retryFailedTakatakEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TakatakActionResult> => {
    const { assertAdmin } = await import("./disputes.server");
    await assertAdmin(context);
    const { retryFailedOutbox } = await import("./takatak/outbox.server");
    const requeued = await retryFailedOutbox();
    return { ok: true, requeued };
  });

/**
 * Manual admin re-queue. Accepts ONLY an aggregate reference and event type;
 * the payload is rebuilt server-side from current database state.
 */
export const queueTakatakAggregate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { aggregate_type: AggregateType; aggregate_id: string; event_type: TakatakEventType }) => data,
  )
  .handler(async ({ data, context }): Promise<TakatakActionResult> => {
    const { assertAdmin } = await import("./disputes.server");
    await assertAdmin(context);
    const id = (data.aggregate_id ?? "").trim();
    if (!id) return { ok: false, reason: "Missing aggregate reference." };

    const ob = await import("./takatak/outbox.server");
    switch (data.aggregate_type) {
      case "customer":
        if (!(CUSTOMER_EVENTS as readonly string[]).includes(data.event_type))
          return { ok: false, reason: "Unsupported customer event." };
        await ob.queueCustomerEvent(id, data.event_type as CustomerEvent);
        return { ok: true };
      case "merchant":
        if (!(MERCHANT_EVENTS as readonly string[]).includes(data.event_type))
          return { ok: false, reason: "Unsupported merchant event." };
        await ob.queueMerchantEvent(id, data.event_type);
        return { ok: true };
      case "order":
        if (!(ORDER_EVENTS as readonly string[]).includes(data.event_type))
          return { ok: false, reason: "Unsupported order event." };
        await ob.queueOrderEvent(id, data.event_type);
        return { ok: true };
      case "relationship":
        await ob.queueRelationshipEvents(id);
        return { ok: true };
      default:
        return { ok: false, reason: "Unsupported aggregate type." };
    }
  });

/* ------------------------------------------------------------------ */
/* Lifecycle wiring — called from the app after a successful mutation  */
/* ------------------------------------------------------------------ */

/** Customer lifecycle. The profile id always comes from the session, never input. */
export const syncTakatakCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { event: CustomerEvent }) => data)
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    if (!(CUSTOMER_EVENTS as readonly string[]).includes(data.event)) return { ok: false };
    const { queueCustomerEvent } = await import("./takatak/outbox.server");
    await queueCustomerEvent(context.userId, data.event);
    return { ok: true };
  });

/** Merchant lifecycle. Owner may signal application/update; admins own approval/suspension. */
export const syncTakatakMerchant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { vendorId: string; event: MerchantEvent }) => data)
  .handler(async ({ data, context }): Promise<{ ok: boolean; reason?: string }> => {
    if (!(MERCHANT_EVENTS as readonly string[]).includes(data.event))
      return { ok: false, reason: "Unsupported event." };

    const isAdminCall = data.event === "merchant.approved" || data.event === "merchant.suspended";
    if (isAdminCall) {
      const { assertAdmin } = await import("./disputes.server");
      await assertAdmin(context);
    } else {
      const { data: owned } = await context.supabase
        .from("vendors")
        .select("id")
        .eq("id", data.vendorId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!owned) return { ok: false, reason: "Not your store." };
    }
    const { queueMerchantEvent } = await import("./takatak/outbox.server");
    await queueMerchantEvent(data.vendorId, data.event);
    return { ok: true };
  });

/**
 * Order created. Guest checkout has no session, so this is unauthenticated —
 * but it only accepts an order id, rebuilds everything from the database, and
 * refuses anything that is not a freshly created order. Duplicate calls are
 * absorbed by the outbox event_key unique index.
 */
export const syncTakatakOrderCreated = createServerFn({ method: "POST" })
  .inputValidator((data: { orderId: string }) => data)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    if (!/^[0-9a-f-]{36}$/i.test(data.orderId ?? "")) return { ok: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, created_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { ok: false };
    const ageMs = Date.now() - new Date(order.created_at).getTime();
    if (ageMs > 30 * 60_000) return { ok: false };
    const { queueOrderEvent } = await import("./takatak/outbox.server");
    await queueOrderEvent(order.id, "order.created");
    return { ok: true };
  });

/** Vendor split delivered → relationship + (when all splits are done) order.fulfilled. */
export const syncTakatakVendorOrderDelivered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { vendorOrderId: string }) => data)
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { data: allowed } = await context.supabase
      .from("vendor_orders")
      .select("id")
      .eq("id", data.vendorOrderId)
      .maybeSingle();
    if (!allowed) return { ok: false };
    const { queueVendorOrderDelivered } = await import("./takatak/outbox.server");
    await queueVendorOrderDelivered(data.vendorOrderId);
    return { ok: true };
  });
