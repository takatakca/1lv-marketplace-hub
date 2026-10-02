import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

/**
 * Stripe webhook endpoint — verifies signature, then applies idempotent
 * updates to orders and vendor subscriptions using the service-role client.
 *
 * Public path (`/api/public/*`) bypasses auth; security lives in signature
 * verification and DB-side idempotency (stripe_event_log unique constraint).
 */

async function verifyStripeSignature(payload: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;

  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "t" && !timestamp) timestamp = value;
    if (key === "v1" && value) signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) return false;
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (ageSeconds > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const expected = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return signatures.some((signature) => {
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
  });
}

type StripeEvent = {
  id: string;
  type: string;
  data: { object: { [key: string]: Json | undefined } };
};

type AdminDb = SupabaseClient<Database>;

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_API_TIMEOUT_MS = 20_000;
const MAX_STRIPE_WEBHOOK_BYTES = 1024 * 1024;

type StripeSubscriptionSnapshot = {
  id: string;
  status: string;
  customerId: string | null;
  metadata: Record<string, unknown>;
  priceIds: string[];
};

type VendorPlan = "starter" | "growth" | "scale";

function configuredVendorPlanForPrice(priceId: string): VendorPlan | null {
  const configured: Array<[VendorPlan, string | undefined]> = [
    ["starter", process.env.STRIPE_PRICE_VENDOR_STARTER_MONTHLY],
    ["growth", process.env.STRIPE_PRICE_VENDOR_GROWTH_MONTHLY],
    ["scale", process.env.STRIPE_PRICE_VENDOR_SCALE_MONTHLY],
  ];

  for (const [plan, configuredPriceId] of configured) {
    if (configuredPriceId?.trim() && configuredPriceId.trim() === priceId) {
      return plan;
    }
  }

  return null;
}

function verifiedVendorPlan(
  subscription: StripeSubscriptionSnapshot,
): VendorPlan | null {
  if (subscription.priceIds.length !== 1) return null;

  const plan = configuredVendorPlanForPrice(subscription.priceIds[0]!);
  const metadataPlan =
    typeof subscription.metadata["plan"] === "string"
      ? subscription.metadata["plan"].trim().toLowerCase()
      : "";

  return plan && metadataPlan === plan ? plan : null;
}

async function retrieveStripeSubscription(
  subscriptionId: string,
): Promise<StripeSubscriptionSnapshot> {
  if (!/^sub_[A-Za-z0-9_]+$/.test(subscriptionId)) {
    throw new Error("Invalid Stripe subscription id.");
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe secret key not configured.");

  const response = await fetch(
    `${STRIPE_API}/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(STRIPE_API_TIMEOUT_MS),
    },
  );

  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      json.error &&
      typeof json.error === "object" &&
      !Array.isArray(json.error) &&
      typeof (json.error as Record<string, unknown>).message === "string"
        ? String((json.error as Record<string, unknown>).message)
        : "Stripe subscription lookup failed.";
    throw new Error(message);
  }

  const id = typeof json.id === "string" ? json.id : "";
  const status = typeof json.status === "string" ? json.status : "";
  const customerId =
    typeof json.customer === "string"
      ? json.customer
      : json.customer &&
          typeof json.customer === "object" &&
          !Array.isArray(json.customer) &&
          typeof (json.customer as Record<string, unknown>).id === "string"
        ? String((json.customer as Record<string, unknown>).id)
        : null;
  const metadata =
    json.metadata &&
    typeof json.metadata === "object" &&
    !Array.isArray(json.metadata)
      ? (json.metadata as Record<string, unknown>)
      : {};

  const itemRows =
    json.items &&
    typeof json.items === "object" &&
    !Array.isArray(json.items) &&
    Array.isArray((json.items as Record<string, unknown>)["data"])
      ? ((json.items as Record<string, unknown>)["data"] as Array<
          Record<string, unknown>
        >)
      : [];
  const priceIds = itemRows
    .map((item) => {
      const price = item["price"];
      if (typeof price === "string") return price;
      if (
        price &&
        typeof price === "object" &&
        !Array.isArray(price) &&
        typeof (price as Record<string, unknown>)["id"] === "string"
      ) {
        return String((price as Record<string, unknown>)["id"]);
      }
      return "";
    })
    .filter((priceId) => /^price_[A-Za-z0-9_]+$/.test(priceId));

  if (id !== subscriptionId || !status || priceIds.length === 0) {
    throw new Error("Stripe subscription response is invalid.");
  }

  return { id, status, customerId, metadata, priceIds };
}

async function readLimitedBody(request: Request): Promise<string | null> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const parsed = Number(declaredLength);
    if (Number.isFinite(parsed) && parsed > MAX_STRIPE_WEBHOOK_BYTES) {
      return null;
    }
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > MAX_STRIPE_WEBHOOK_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const payload = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(payload);
}

type VendorSubscriptionState = {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
};

function terminalSubscriptionStatus(status: string | null | undefined) {
  return ["none", "canceled", "incomplete_expired"].includes(
    String(status ?? "none").toLowerCase(),
  );
}

async function loadVendorSubscriptionState(
  db: AdminDb,
  vendorId: string,
): Promise<VendorSubscriptionState | null> {
  const { data, error } = await db
    .from("vendors")
    .select(
      "stripe_customer_id, stripe_subscription_id, subscription_status",
    )
    .eq("id", vendorId)
    .maybeSingle();

  if (error) throw error;
  return data as VendorSubscriptionState | null;
}

async function notifyAdmins(
  db: AdminDb,
  kind: string,
  title: string,
  body: string,
) {
  const { data: adminRoles } = await db
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  const notifications = (adminRoles ?? []).map((row: { user_id: string }) => ({
    user_id: row.user_id,
    kind,
    title,
    body,
    link: "/admin/orders",
  }));

  if (notifications.length > 0) {
    const { error } = await db.from("notifications").insert(notifications);
    if (error) console.warn("Admin notification failed:", error.message);
  }
}

async function claimEvent(db: AdminDb, evt: StripeEvent): Promise<boolean> {
  const payload = JSON.parse(JSON.stringify(evt)) as Json;
  const { data, error } = await db.rpc("claim_stripe_event", {
    _id: evt.id,
    _type: evt.type,
    _payload: payload,
  });
  if (error) throw error;
  return data === true;
}

async function finishEvent(db: AdminDb, eventId: string) {
  const { error } = await db
    .from("stripe_event_log")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: null,
    } as never)
    .eq("id", eventId);
  if (error) throw error;
}

async function failEvent(db: AdminDb, eventId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Webhook handler failed";
  const { error: persistError } = await db
    .from("stripe_event_log")
    .update({
      status: "failed",
      updated_at: new Date().toISOString(),
      last_error: message.slice(0, 500),
    } as never)
    .eq("id", eventId);
  if (persistError) {
    console.error("Could not persist Stripe webhook failure:", persistError.message);
  }
}

async function handleEvent(evt: StripeEvent) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const obj: Record<string, unknown> = evt.data.object;
  const meta = ((obj as { metadata?: Record<string, string> }).metadata) ?? {};

  switch (evt.type) {
    case "payment_intent.succeeded": {
      const orderId = meta.order_id;
      const paymentIntentId = typeof obj.id === "string" ? obj.id : null;
      const amountReceived = Number(
        (obj as { amount_received?: number }).amount_received ?? NaN,
      );
      const paymentCurrency =
        typeof (obj as { currency?: string }).currency === "string"
          ? (obj as { currency: string }).currency.toLowerCase()
          : "";

      if (orderId && paymentIntentId) {
        const { data: order, error: orderError } = await supabaseAdmin
          .from("orders")
          .select(
            "id, order_number, total, currency, payment_status, stripe_payment_intent_id",
          )
          .eq("id", orderId)
          .maybeSingle();

        if (orderError) throw orderError;
        if (!order || order.stripe_payment_intent_id !== paymentIntentId) {
          await notifyAdmins(
            supabaseAdmin,
            "stripe_payment_order_mismatch",
            "Stripe payment/order mismatch",
            `PaymentIntent ${paymentIntentId} referenced an order that does not match the stored payment authorization.`,
          );
          break;
        }

        const expectedAmount = Math.round(Number(order.total) * 100);
        const expectedCurrency = String(order.currency ?? "CAD").toLowerCase();
        if (
          !Number.isSafeInteger(amountReceived) ||
          amountReceived !== expectedAmount ||
          paymentCurrency !== expectedCurrency
        ) {
          await notifyAdmins(
            supabaseAdmin,
            "stripe_payment_amount_mismatch",
            `Payment mismatch on order ${order.order_number}`,
            `Expected ${expectedAmount} ${expectedCurrency.toUpperCase()} cents but Stripe reported ${amountReceived} ${paymentCurrency.toUpperCase()} cents. Fulfillment was blocked for manual review.`,
          );
          break;
        }

        if (
          ["paid", "partially_refunded", "refunded"].includes(
            order.payment_status,
          )
        ) {
          break;
        }

        const { data: inventoryCommitted, error: inventoryError } =
          await supabaseAdmin.rpc(
            "commit_order_inventory" as never,
            { _order_id: orderId } as never,
          );

        if (inventoryError) throw inventoryError;

        const committed = inventoryCommitted === true;
        const { data: updated, error: updateError } = await supabaseAdmin
          .from("orders")
          .update({
            payment_status: "paid",
            status: committed ? "processing" : "pending",
          })
          .eq("id", orderId)
          .eq("stripe_payment_intent_id", paymentIntentId)
          .select("id, order_number")
          .maybeSingle();

        if (updateError) throw updateError;

        if (updated && !committed) {
          await notifyAdmins(
            supabaseAdmin,
            "inventory_payment_conflict",
            `Inventory conflict on paid order ${updated.order_number}`,
            "Stripe reported payment success after the inventory reservation was released. Review the order before fulfillment.",
          );
        }

      }
      break;
    }
    case "payment_intent.payment_failed": {
      const orderId = meta.order_id;
      const paymentIntentId = typeof obj.id === "string" ? obj.id : null;
      if (orderId && paymentIntentId) {
        await supabaseAdmin
          .from("orders")
          .update({ payment_status: "failed" })
          .eq("id", orderId)
          .eq("stripe_payment_intent_id", paymentIntentId)
          .in("payment_status", ["unpaid", "failed"]);
      }
      break;
    }
    case "payment_intent.canceled": {
      const orderId = meta.order_id;
      const paymentIntentId = typeof obj.id === "string" ? obj.id : null;

      if (orderId && paymentIntentId) {
        const { data: order, error: orderError } = await supabaseAdmin
          .from("orders")
          .select(
            "id, order_number, payment_status, status, stripe_payment_intent_id, inventory_reserved_until, inventory_committed_at, inventory_released_at",
          )
          .eq("id", orderId)
          .maybeSingle();

        if (orderError) throw orderError;

        if (!order || order.stripe_payment_intent_id !== paymentIntentId) {
          await notifyAdmins(
            supabaseAdmin,
            "stripe_payment_cancel_order_mismatch",
            "Stripe payment cancellation/order mismatch",
            `Canceled PaymentIntent ${paymentIntentId} did not match the stored 1LV payment authorization. Automatic cancellation was blocked.`,
          );
          break;
        }

        if (
          ["paid", "partially_refunded", "refunded"].includes(
            order.payment_status,
          ) ||
          order.inventory_committed_at
        ) {
          await notifyAdmins(
            supabaseAdmin,
            "stripe_payment_cancel_after_commit",
            `Canceled payment needs review for order ${order.order_number}`,
            "Stripe reported a canceled PaymentIntent after 1LV considered payment/inventory committed. Automatic cancellation was blocked.",
          );
          break;
        }

        const reservationExpired =
          Boolean(order.inventory_reserved_until) &&
          new Date(order.inventory_reserved_until as string).getTime() <=
            Date.now();
        const checkoutClosed =
          Boolean(order.inventory_released_at) || reservationExpired;

        if (checkoutClosed && !order.inventory_released_at) {
          const { error: releaseError } = await supabaseAdmin.rpc(
            "release_order_inventory" as never,
            { _order_id: order.id } as never,
          );
          if (releaseError) throw releaseError;
        }

        const { error: cancelError } = await supabaseAdmin
          .from("orders")
          .update({
            payment_status: "failed",
            ...(checkoutClosed ? { status: "cancelled" as const } : {}),
          })
          .eq("id", order.id)
          .eq("stripe_payment_intent_id", paymentIntentId)
          .in("payment_status", ["unpaid", "failed"])
          .is("inventory_committed_at", null);

        if (cancelError) throw cancelError;
      }
      break;
    }
    case "charge.refunded": {
      const paymentIntentId =
        typeof (obj as { payment_intent?: string }).payment_intent === "string"
          ? (obj as { payment_intent: string }).payment_intent
          : null;
      const chargeAmount = Number((obj as { amount?: number }).amount ?? NaN);
      const chargeCurrency =
        typeof (obj as { currency?: string }).currency === "string"
          ? (obj as { currency: string }).currency.toLowerCase()
          : "";
      const chargeMetadata =
        ((obj as { metadata?: Record<string, string> }).metadata) ?? {};
      const refundList = (
        obj as {
          refunds?: {
            data?: Array<Record<string, unknown>>;
            has_more?: boolean;
          };
        }
      ).refunds;
      const refunds = Array.isArray(refundList?.data) ? refundList.data : [];

      if (!paymentIntentId) {
        await notifyAdmins(
          supabaseAdmin,
          "stripe_refund_payment_mismatch",
          "Stripe refund needs reconciliation",
          "A charge.refunded event did not include a PaymentIntent. Automatic 1LV accounting was blocked.",
        );
        break;
      }

      const { data: order, error: orderError } = await supabaseAdmin
        .from("orders")
        .select(
          "id, order_number, total, currency, payment_status, stripe_payment_intent_id",
        )
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();

      if (orderError) throw orderError;

      const expectedAmount = order
        ? Math.round(Number(order.total) * 100)
        : NaN;
      const expectedCurrency = String(order?.currency ?? "CAD").toLowerCase();

      if (
        !order ||
        order.stripe_payment_intent_id !== paymentIntentId ||
        !Number.isSafeInteger(chargeAmount) ||
        chargeAmount !== expectedAmount ||
        chargeCurrency !== expectedCurrency ||
        (chargeMetadata.order_id && chargeMetadata.order_id !== order.id)
      ) {
        await notifyAdmins(
          supabaseAdmin,
          "stripe_refund_order_mismatch",
          "Stripe refund/order mismatch",
          "A refund event did not match the stored 1LV PaymentIntent, order amount, currency, or order metadata. Automatic accounting was blocked.",
        );
        break;
      }

      let reconciledAny = false;
      let untrackedSuccessfulRefunds = 0;

      for (const refundObj of refunds) {
        const stripeRefundId =
          typeof refundObj.id === "string" && refundObj.id.startsWith("re_")
            ? refundObj.id
            : null;
        const refundStatus =
          typeof refundObj.status === "string" ? refundObj.status : "";
        if (!stripeRefundId || refundStatus !== "succeeded") continue;

        const refundMetadata =
          refundObj.metadata &&
          typeof refundObj.metadata === "object" &&
          !Array.isArray(refundObj.metadata)
            ? (refundObj.metadata as Record<string, unknown>)
            : {};
        const refundRecordId =
          typeof refundMetadata["refund_record_id"] === "string"
            ? refundMetadata["refund_record_id"]
            : "";
        const refundOrderId =
          typeof refundMetadata["order_id"] === "string"
            ? refundMetadata["order_id"]
            : "";
        const refundAmount = Number(refundObj.amount ?? NaN);
        const refundCurrency =
          typeof refundObj.currency === "string"
            ? refundObj.currency.toLowerCase()
            : chargeCurrency;

        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            refundRecordId,
          ) ||
          refundOrderId !== order.id
        ) {
          untrackedSuccessfulRefunds += 1;
          continue;
        }

        const { data: refundRecord, error: refundRecordError } =
          await supabaseAdmin
            .from("refund_records")
            .select(
              "id, order_id, amount, currency, status, stripe_refund_id",
            )
            .eq("id", refundRecordId)
            .maybeSingle();

        if (refundRecordError) throw refundRecordError;

        const expectedRefundAmount = refundRecord
          ? Math.round(Number(refundRecord.amount) * 100)
          : NaN;
        const expectedRefundCurrency = String(
          refundRecord?.currency ?? expectedCurrency,
        ).toLowerCase();

        if (
          !refundRecord ||
          refundRecord.order_id !== order.id ||
          !Number.isSafeInteger(refundAmount) ||
          refundAmount !== expectedRefundAmount ||
          refundCurrency !== expectedRefundCurrency ||
          (refundRecord.stripe_refund_id &&
            refundRecord.stripe_refund_id !== stripeRefundId)
        ) {
          untrackedSuccessfulRefunds += 1;
          continue;
        }

        const { data: accounting, error: accountingError } =
          await supabaseAdmin.rpc("finalize_refund_accounting", {
            _refund_id: refundRecord.id,
            _stripe_refund_id: stripeRefundId,
          });

        if (accountingError) throw accountingError;
        if (
          !accounting ||
          typeof accounting !== "object" ||
          (accounting as Record<string, unknown>)["ok"] !== true
        ) {
          throw new Error(
            `Refund accounting did not finalize for ${refundRecord.id}.`,
          );
        }

        reconciledAny = true;
      }

      if (refundList?.has_more === true) {
        untrackedSuccessfulRefunds += 1;
      }

      if (untrackedSuccessfulRefunds > 0 || refunds.length === 0) {
        await notifyAdmins(
          supabaseAdmin,
          "stripe_external_refund_detected",
          `Stripe refund needs reconciliation for order ${order.order_number}`,
          "Stripe reported one or more successful refunds that are not tied to a verified 1LV refund record. Automatic accounting for those refunds was blocked; review Stripe and 1LV before adjusting payouts.",
        );
      }

      break;
    }
    case "checkout.session.completed": {
      const vendorId = meta.vendor_id;
      const eventCustomerId =
        typeof (obj as { customer?: string }).customer === "string"
          ? (obj as { customer: string }).customer
          : null;
      const subscriptionId =
        typeof (obj as { subscription?: string }).subscription === "string"
          ? (obj as { subscription: string }).subscription
          : null;

      if (vendorId && subscriptionId) {
        const current = await loadVendorSubscriptionState(
          supabaseAdmin,
          vendorId,
        );
        if (!current) break;

        const remote = await retrieveStripeSubscription(subscriptionId);
        const remoteVendorId =
          typeof remote.metadata["vendor_id"] === "string"
            ? String(remote.metadata["vendor_id"])
            : "";
        const verifiedPlan = verifiedVendorPlan(remote);

        const customerConflict =
          !remote.customerId ||
          (eventCustomerId !== null && remote.customerId !== eventCustomerId) ||
          (current.stripe_customer_id !== null &&
            remote.customerId !== current.stripe_customer_id);
        const subscriptionConflict =
          current.stripe_subscription_id &&
          current.stripe_subscription_id !== subscriptionId &&
          !terminalSubscriptionStatus(current.subscription_status);

        if (
          remoteVendorId !== vendorId ||
          !verifiedPlan ||
          customerConflict ||
          subscriptionConflict
        ) {
          await notifyAdmins(
            supabaseAdmin,
            "stripe_subscription_binding_conflict",
            "Stripe subscription binding conflict",
            `A completed Checkout Session did not match the configured vendor, customer, subscription, or price for vendor ${vendorId.slice(0, 8)}. Automatic rebinding was blocked.`,
          );
          break;
        }

        const { error: updateError } = await supabaseAdmin
          .from("vendors")
          .update({
            stripe_customer_id: remote.customerId,
            stripe_subscription_id: subscriptionId,
            subscription_status: remote.status,
            subscription_plan: verifiedPlan,
          } as never)
          .eq("id", vendorId);

        if (updateError) throw updateError;
      }
      break;
    }
    case "customer.subscription.updated": {
      const vendorId = meta.vendor_id;
      const subId =
        typeof (obj as { id?: string }).id === "string"
          ? (obj as { id: string }).id
          : null;

      if (vendorId && subId) {
        const current = await loadVendorSubscriptionState(
          supabaseAdmin,
          vendorId,
        );
        if (!current) break;

        if (
          current.stripe_subscription_id &&
          current.stripe_subscription_id !== subId &&
          !terminalSubscriptionStatus(current.subscription_status)
        ) {
          await notifyAdmins(
            supabaseAdmin,
            "stripe_subscription_event_conflict",
            "Stripe subscription event conflict",
            `A Stripe subscription event attempted to replace another non-terminal subscription for vendor ${vendorId.slice(0, 8)}. The stale/conflicting event was ignored.`,
          );
          break;
        }

        const remote = await retrieveStripeSubscription(subId);
        const remoteVendorId =
          typeof remote.metadata["vendor_id"] === "string"
            ? String(remote.metadata["vendor_id"])
            : "";
        const verifiedPlan = verifiedVendorPlan(remote);

        if (
          remoteVendorId !== vendorId ||
          !verifiedPlan ||
          !remote.customerId ||
          (current.stripe_customer_id !== null &&
            remote.customerId !== current.stripe_customer_id)
        ) {
          await notifyAdmins(
            supabaseAdmin,
            "stripe_subscription_metadata_mismatch",
            "Stripe subscription binding mismatch",
            `Stripe subscription ${subId.slice(0, 12)} does not match the configured 1LV vendor, customer, or price. Automatic status mutation was blocked.`,
          );
          break;
        }

        const { error: updateError } = await supabaseAdmin
          .from("vendors")
          .update({
            stripe_customer_id: remote.customerId,
            stripe_subscription_id: subId,
            subscription_status: remote.status,
            subscription_plan: verifiedPlan,
          } as never)
          .eq("id", vendorId);

        if (updateError) throw updateError;
      }
      break;
    }
    case "customer.subscription.deleted": {
      const vendorId = meta.vendor_id;
      const subId =
        typeof (obj as { id?: string }).id === "string"
          ? (obj as { id: string }).id
          : null;

      if (vendorId && subId) {
        const current = await loadVendorSubscriptionState(
          supabaseAdmin,
          vendorId,
        );
        if (!current) break;

        if (
          current.stripe_subscription_id &&
          current.stripe_subscription_id !== subId
        ) {
          await notifyAdmins(
            supabaseAdmin,
            "stripe_stale_subscription_deleted",
            "Stale Stripe cancellation ignored",
            `A cancellation for an old Stripe subscription was ignored for vendor ${vendorId.slice(0, 8)} because another subscription is currently linked.`,
          );
          break;
        }

        const { error: updateError } = await supabaseAdmin
          .from("vendors")
          .update({
            stripe_subscription_id:
              current.stripe_subscription_id ?? subId,
            subscription_status: "canceled",
          } as never)
          .eq("id", vendorId);

        if (updateError) throw updateError;
      }
      break;
    }
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const customerId = (obj as { customer?: string }).customer;
      const legacySubscription = (obj as { subscription?: string }).subscription;
      const parent = (obj as {
        parent?: {
          subscription_details?: {
            subscription?: string;
          };
        };
      }).parent;
      const subscriptionId =
        legacySubscription ??
        parent?.subscription_details?.subscription ??
        null;

      if (subscriptionId) {
        const remote = await retrieveStripeSubscription(subscriptionId);

        if (
          typeof customerId === "string" &&
          remote.customerId &&
          remote.customerId !== customerId
        ) {
          await notifyAdmins(
            supabaseAdmin,
            "stripe_invoice_customer_mismatch",
            "Stripe invoice/customer mismatch",
            "A subscription invoice referenced a customer different from the current Stripe subscription. Automatic status mutation was blocked.",
          );
          break;
        }

        const { data: vendor, error: vendorError } = await supabaseAdmin
          .from("vendors")
          .select("id, stripe_customer_id")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();
        if (vendorError) throw vendorError;
        if (!vendor) break;

        const remoteVendorId =
          typeof remote.metadata["vendor_id"] === "string"
            ? String(remote.metadata["vendor_id"])
            : "";
        if (
          remoteVendorId !== vendor.id ||
          (vendor.stripe_customer_id &&
            remote.customerId &&
            vendor.stripe_customer_id !== remote.customerId)
        ) {
          await notifyAdmins(
            supabaseAdmin,
            "stripe_invoice_subscription_binding_mismatch",
            "Stripe invoice subscription binding mismatch",
            "A subscription invoice did not match the stored 1LV vendor/customer binding. Automatic status mutation was blocked.",
          );
          break;
        }

        const { error: updateError } = await supabaseAdmin
          .from("vendors")
          .update({ subscription_status: remote.status } as never)
          .eq("id", vendor.id);
        if (updateError) throw updateError;
      } else if (customerId) {
        await notifyAdmins(
          supabaseAdmin,
          "stripe_invoice_missing_subscription",
          "Stripe invoice needs subscription reconciliation",
          "A subscription invoice event did not contain a subscription id. Automatic vendor subscription status mutation was blocked.",
        );
      }
      break;
    }
    default:
      break;
  }

}

export const Route = createFileRoute("/api/public/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) {
          return new Response("Stripe webhook secret not configured", { status: 503 });
        }
        const body = await readLimitedBody(request);
        if (body === null) {
          return new Response("Payload too large", { status: 413 });
        }
        const sig = request.headers.get("stripe-signature");
        const ok = await verifyStripeSignature(body, sig, secret);
        if (!ok) return new Response("Invalid signature", { status: 401 });

        let evt: StripeEvent;
        try {
          evt = JSON.parse(body) as StripeEvent;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        if (
          !evt?.id ||
          typeof evt.id !== "string" ||
          !evt.type ||
          typeof evt.type !== "string" ||
          !evt.data ||
          typeof evt.data.object !== "object" ||
          evt.data.object === null
        ) {
          return new Response("Invalid Stripe event", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let claimed = false;
        try {
          claimed = await claimEvent(supabaseAdmin, evt);
        } catch (err) {
          console.error("Stripe webhook claim error:", err);
          return new Response("Handler error", { status: 500 });
        }

        if (!claimed) {
          return new Response(JSON.stringify({ received: true, duplicate: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          await handleEvent(evt);
          await finishEvent(supabaseAdmin, evt.id);
        } catch (err) {
          await failEvent(supabaseAdmin, evt.id, err);
          console.error("Stripe webhook handler error:", err);
          return new Response("Handler error", { status: 500 });
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
