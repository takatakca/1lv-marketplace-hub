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
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const timestamp = parts.t;
  const sig = parts.v1;
  if (!timestamp || !sig) return false;
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
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

async function handleEvent(evt: StripeEvent) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Idempotency: skip if already processed.
  const { data: existing } = await supabaseAdmin
    .from("stripe_event_log")
    .select("id")
    .eq("id", evt.id)
    .maybeSingle();
  if (existing) return;

  const obj = evt.data.object;
  const meta = ((obj as { metadata?: Record<string, string> }).metadata) ?? {};

  switch (evt.type) {
    case "payment_intent.succeeded": {
      const orderId = meta.order_id;
      if (orderId) {
        await supabaseAdmin.from("orders").update({ payment_status: "paid", status: "processing" }).eq("id", orderId);
      }
      break;
    }
    case "payment_intent.payment_failed": {
      const orderId = meta.order_id;
      if (orderId) {
        await supabaseAdmin.from("orders").update({ payment_status: "failed" }).eq("id", orderId);
      }
      break;
    }
    case "charge.refunded": {
      const orderId = meta.order_id;
      const amountRefunded = Number((obj as { amount_refunded?: number }).amount_refunded ?? 0);
      const amount = Number((obj as { amount?: number }).amount ?? 0);
      if (orderId) {
        const status = amountRefunded >= amount ? "refunded" : "partially_refunded";
        await supabaseAdmin.from("orders").update({ payment_status: status }).eq("id", orderId);
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
            subscription_status: "active",
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
      if (customerId) {
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

  await supabaseAdmin.from("stripe_event_log").insert({
    id: evt.id,
    type: evt.type,
    payload: evt as unknown as Record<string, unknown>,
  });
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

        try {
          await handleEvent(evt);
        } catch (err) {
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
