import { createFileRoute } from "@tanstack/react-router";

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
  data: { object: Record<string, unknown> };
};

type AdminDb = Awaited<
  ReturnType<typeof import("@/integrations/supabase/client.server")["supabaseAdmin"]>
>;

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

  const notifications = (adminRoles ?? []).map((row) => ({
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
  const { data, error } = await db.rpc(
    "claim_stripe_event" as never,
    {
      _id: evt.id,
      _type: evt.type,
      _payload: evt,
    } as never,
  );
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

/** Queue a TAKATAK order event without ever failing the webhook. */
async function takatakOrder(orderId: string, eventType: "order.paid" | "order.refunded") {
  try {
    const { queueOrderEvent } = await import("@/lib/takatak/outbox.server");
    await queueOrderEvent(orderId, eventType);
  } catch (err) {
    console.warn("takatak order event skipped:", (err as Error).message);
  }
}

async function handleEvent(evt: StripeEvent) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const obj = evt.data.object;
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

        if (order.payment_status === "paid") break;

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

        if (updated) await takatakOrder(orderId, "order.paid");
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
          .eq("stripe_payment_intent_id", paymentIntentId);
      }
      break;
    }
    case "charge.refunded": {
      const orderId = meta.order_id;
      const amountRefunded = Number((obj as { amount_refunded?: number }).amount_refunded ?? 0);
      const amount = Number((obj as { amount?: number }).amount ?? 0);
      if (orderId) {
        const fullyRefunded = amount > 0 && amountRefunded >= amount;
        const status = fullyRefunded ? "refunded" : "partially_refunded";
        await supabaseAdmin.from("orders").update({ payment_status: status }).eq("id", orderId);

        if (fullyRefunded) {
          const { error: promotionRefundError } = await supabaseAdmin.rpc(
            "mark_order_promotion_refunded" as never,
            { _order_id: orderId } as never,
          );
          if (promotionRefundError) throw promotionRefundError;
        }

        await takatakOrder(orderId, "order.refunded");
      }
      break;
    }
    case "checkout.session.completed": {
      const vendorId = meta.vendor_id;
      const customerId = (obj as { customer?: string }).customer;
      const subscriptionId = (obj as { subscription?: string }).subscription;
      if (vendorId) {
        await supabaseAdmin
          .from("vendors")
          .update({
            stripe_customer_id: customerId ?? null,
            stripe_subscription_id: subscriptionId ?? null,
            subscription_plan: meta.plan ?? null,
          } as never)
          .eq("id", vendorId);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const vendorId = meta.vendor_id;
      const status = (obj as { status?: string }).status ?? "active";
      const subId = (obj as { id?: string }).id;
      if (vendorId) {
        await supabaseAdmin
          .from("vendors")
          .update({
            stripe_subscription_id: subId ?? null,
            subscription_status: status,
            subscription_plan: meta.plan ?? null,
          } as never)
          .eq("id", vendorId);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const vendorId = meta.vendor_id;
      if (vendorId) {
        await supabaseAdmin
          .from("vendors")
          .update({ subscription_status: "canceled" } as never)
          .eq("id", vendorId);
      }
      break;
    }
    case "invoice.payment_succeeded":
    case "invoice.payment_failed": {
      const status = evt.type === "invoice.payment_succeeded" ? "active" : "past_due";
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
        await supabaseAdmin
          .from("vendors")
          .update({ subscription_status: status } as never)
          .eq("stripe_subscription_id", subscriptionId);
      } else if (customerId) {
        await supabaseAdmin
          .from("vendors")
          .update({ subscription_status: status } as never)
          .eq("stripe_customer_id", customerId);
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
        const body = await request.text();
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
