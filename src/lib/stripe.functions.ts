import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getOptionalSupabaseUserId } from "@/integrations/supabase/optional-auth.server";

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

async function stripeFetch(
  path: string,
  body?: Record<string, string>,
  options?: { method?: "GET" | "POST"; idempotencyKey?: string },
): Promise<Record<string, unknown>> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe not configured");

  const method = options?.method ?? "POST";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
  };
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (options?.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers,
    ...(body ? { body: new URLSearchParams(body).toString() } : {}),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error as { message?: string } | undefined)?.message ?? "Stripe error";
    throw new Error(err);
  }
  return json;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
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
  .inputValidator((data: { orderId: string; checkoutKey?: string | null }) => data)
  .handler(async ({ data }): Promise<PaymentIntentResult> => {
    if (!isConfigured()) {
      return {
        clientSecret: null,
        pending: true,
        reason: "Stripe setup required — order created in pending-payment mode.",
      };
    }

    if (!/^[0-9a-f-]{36}$/i.test(data.orderId)) {
      throw new Error("Invalid order reference.");
    }

    const userId = await getOptionalSupabaseUserId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, total, currency, customer_email, customer_id, payment_status, status, checkout_key_hash, stripe_payment_intent_id",
      )
      .eq("id", data.orderId)
      .maybeSingle();

    if (error || !order) throw new Error("Order not found");

    if (order.customer_id) {
      if (!userId || userId !== order.customer_id) throw new Error("Order access denied.");
    } else {
      if (!data.checkoutKey || !order.checkout_key_hash) throw new Error("Order access denied.");
      const suppliedHash = await sha256Hex(data.checkoutKey);
      if (!constantTimeEqual(suppliedHash, order.checkout_key_hash)) {
        throw new Error("Order access denied.");
      }
    }

    if (order.payment_status === "paid") {
      return { clientSecret: null, pending: false, reason: "Already paid" };
    }
    if (order.status === "cancelled" || order.status === "refunded") {
      throw new Error("This order can no longer be paid.");
    }

    const amountCents = Math.round(Number(order.total) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new Error("Invalid order total.");
    }

    if (order.stripe_payment_intent_id) {
      const existing = await stripeFetch(
        `/payment_intents/${encodeURIComponent(order.stripe_payment_intent_id)}`,
        undefined,
        { method: "GET" },
      );
      return {
        clientSecret: (existing.client_secret as string) ?? null,
        pending: false,
      };
    }

    const intent = await stripeFetch(
      "/payment_intents",
      {
        amount: String(amountCents),
        currency: (order.currency ?? "cad").toLowerCase(),
        "automatic_payment_methods[enabled]": "true",
        "metadata[order_id]": order.id,
        "metadata[order_number]": order.order_number,
        "metadata[customer_email]": order.customer_email ?? "",
        receipt_email: order.customer_email ?? "",
      },
      { idempotencyKey: `1lv-order-${order.id}` },
    );

    const paymentIntentId = intent.id as string | undefined;
    if (!paymentIntentId) throw new Error("Stripe did not return a PaymentIntent ID.");

    const { error: saveError } = await supabaseAdmin
      .from("orders")
      .update({ stripe_payment_intent_id: paymentIntentId })
      .eq("id", order.id);
    if (saveError) throw new Error("Could not attach payment to order.");

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
