import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Stripe server functions — production-safe scaffolding.
 *
 * All Stripe API calls are made server-side using STRIPE_SECRET_KEY.
 * The frontend never sees the secret key. If keys are missing, functions
 * return a `pending` state so the checkout/subscription UI can degrade
 * gracefully in preview and demo mode.
 */

const STRIPE_API = "https://api.stripe.com/v1";

function isConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function stripeFetch(path: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe not configured");
  const form = new URLSearchParams(body).toString();
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error as { message?: string } | undefined)?.message ?? "Stripe error";
    throw new Error(err);
  }
  return json;
}

export type PaymentIntentResult = {
  clientSecret: string | null;
  pending: boolean;
  reason?: string;
};

/**
 * Create a Stripe PaymentIntent for an existing order.
 * Loads the order from the DB and uses its stored `total` (server truth),
 * never a client-supplied amount.
 */
export const createPaymentIntent = createServerFn({ method: "POST" })
  .inputValidator((data: { orderId: string }) => data)
  .handler(async ({ data }): Promise<PaymentIntentResult> => {
    if (!isConfigured()) {
      return {
        clientSecret: null,
        pending: true,
        reason: "Stripe setup required — order created in pending-payment mode.",
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, total, currency, customer_email, payment_status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !order) throw new Error("Order not found");
    if (order.payment_status === "paid") {
      return { clientSecret: null, pending: false, reason: "Already paid" };
    }

    const amountCents = Math.round(Number(order.total) * 100);
    const intent = await stripeFetch("/payment_intents", {
      amount: String(amountCents),
      currency: (order.currency ?? "cad").toLowerCase(),
      "automatic_payment_methods[enabled]": "true",
      "metadata[order_id]": order.id,
      "metadata[order_number]": order.order_number,
      "metadata[customer_email]": order.customer_email ?? "",
      receipt_email: order.customer_email ?? "",
    });

    return {
      clientSecret: (intent.client_secret as string) ?? null,
      pending: false,
    };
  });

const PLAN_TO_PRICE: Record<string, string | undefined> = {
  starter: undefined, // filled from env at call time
  growth: undefined,
  scale: undefined,
};

function priceForPlan(plan: string): string | null {
  const map: Record<string, string | undefined> = {
    starter: process.env.STRIPE_PRICE_VENDOR_STARTER_MONTHLY,
    growth: process.env.STRIPE_PRICE_VENDOR_GROWTH_MONTHLY,
    scale: process.env.STRIPE_PRICE_VENDOR_SCALE_MONTHLY,
  };
  return map[plan] ?? null;
}

export type VendorCheckoutResult = {
  url: string | null;
  pending: boolean;
  reason?: string;
};

/**
 * Create a Stripe Checkout Session (mode=subscription) for the caller's vendor.
 * The caller must own the vendor row (verified via RLS on the authenticated
 * supabase client).
 */
export const createVendorSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { vendorId: string; plan: "starter" | "growth" | "scale"; returnOrigin: string }) => data)
  .handler(async ({ data, context }): Promise<VendorCheckoutResult> => {
    if (!isConfigured()) {
      return { url: null, pending: true, reason: "Stripe setup required" };
    }
    const priceId = priceForPlan(data.plan);
    if (!priceId) {
      return { url: null, pending: true, reason: `Price ID for plan "${data.plan}" not configured` };
    }

    // Verify ownership via RLS (only the vendor owner can select their row).
    const { data: vendor, error } = await context.supabase
      .from("vendors")
      .select("id, user_id, stripe_customer_id, contact_email")
      .eq("id", data.vendorId)
      .maybeSingle();
    if (error || !vendor) throw new Error("Vendor not found or access denied");
    if (vendor.user_id !== context.userId) throw new Error("Forbidden");

    let customerId = vendor.stripe_customer_id as string | null;
    if (!customerId) {
      const cust = await stripeFetch("/customers", {
        email: vendor.contact_email ?? "",
        "metadata[vendor_id]": vendor.id,
        "metadata[owner_id]": context.userId,
      });
      customerId = cust.id as string;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("vendors").update({ stripe_customer_id: customerId }).eq("id", vendor.id);
    }

    const origin = data.returnOrigin.replace(/\/$/, "");
    const session = await stripeFetch("/checkout/sessions", {
      mode: "subscription",
      customer: customerId!,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      success_url: `${origin}/vendor/subscription?success=1`,
      cancel_url: `${origin}/vendor/subscription?cancelled=1`,
      "metadata[vendor_id]": vendor.id,
      "metadata[owner_id]": context.userId,
      "metadata[plan]": data.plan,
      "subscription_data[metadata][vendor_id]": vendor.id,
      "subscription_data[metadata][plan]": data.plan,
    });

    return { url: (session.url as string) ?? null, pending: false };
  });

// Keep PLAN_TO_PRICE reference so tree-shaking doesn't warn on unused symbol.
void PLAN_TO_PRICE;
