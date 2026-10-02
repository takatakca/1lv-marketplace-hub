import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getOptionalSupabaseUserId } from "@/integrations/supabase/optional-auth.server";
import { verifyGuestPaymentToken } from "@/lib/guest-payment-token.server";
import { resolveTrustedAppOrigin } from "@/lib/request-origin.server";

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_TIMEOUT_MS = 20_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function stripePost(
  path: string,
  body: Record<string, string>,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe not configured");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers,
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(STRIPE_TIMEOUT_MS),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      (json.error as { message?: string } | undefined)?.message ??
      "Stripe error";
    throw new Error(message);
  }
  return json;
}

async function stripeGet(path: string): Promise<Record<string, unknown>> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe not configured");

  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(STRIPE_TIMEOUT_MS),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      (json.error as { message?: string } | undefined)?.message ??
      "Stripe error";
    throw new Error(message);
  }
  return json;
}

export type PaymentIntentResult = {
  clientSecret: string | null;
  pending: boolean;
  reason?: string;
};

/**
 * Create or reuse a Stripe PaymentIntent for an existing trusted order.
 *
 * Authorization:
 * - authenticated order: current Supabase user must own the order;
 * - guest order: caller must present the server-signed guest payment token.
 *
 * Amount always comes from orders.total. Stripe creation also uses an
 * order-scoped idempotency key and the resulting PaymentIntent id is persisted.
 */
export const createPaymentIntent = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { orderId: string; guestToken?: string | null }) => data,
  )
  .handler(async ({ data }): Promise<PaymentIntentResult> => {
    if (!UUID_RE.test(data.orderId)) {
      throw new Response("Invalid order", { status: 400 });
    }

    if (!isConfigured()) {
      return {
        clientSecret: null,
        pending: true,
        reason: "Stripe setup required — order remains pending payment.",
      };
    }

    const userId = await getOptionalSupabaseUserId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, total, currency, customer_email, customer_id, status, payment_status, stripe_payment_intent_id, inventory_reserved_until, inventory_released_at, inventory_committed_at",
      )
      .eq("id", data.orderId)
      .maybeSingle();

    if (error || !order) throw new Response("Order not found", { status: 404 });

    if (order.customer_id) {
      if (!userId || userId !== order.customer_id) {
        throw new Response("Forbidden", { status: 403 });
      }
    } else {
      const allowed = await verifyGuestPaymentToken(data.guestToken, order.id);
      if (!allowed) throw new Response("Forbidden", { status: 403 });
    }

    if (order.payment_status === "paid") {
      return {
        clientSecret: null,
        pending: false,
        reason: "Order is already paid.",
      };
    }

    if (
      order.status === "cancelled" ||
      order.status === "refunded" ||
      order.payment_status === "refunded" ||
      order.payment_status === "partially_refunded"
    ) {
      return {
        clientSecret: null,
        pending: true,
        reason: "This order can no longer accept payment.",
      };
    }

    const reservationExpired =
      !order.inventory_committed_at &&
      Boolean(order.inventory_reserved_until) &&
      new Date(order.inventory_reserved_until as string).getTime() <= Date.now();

    if (order.inventory_released_at || reservationExpired) {
      if (!order.inventory_released_at && reservationExpired) {
        await supabaseAdmin.rpc(
          "release_order_inventory" as never,
          { _order_id: order.id } as never,
        );
      }
      return {
        clientSecret: null,
        pending: true,
        reason: "This checkout reservation expired. Return to your cart and place the order again.",
      };
    }

    if (order.stripe_payment_intent_id) {
      const existing = await stripeGet(
        `/payment_intents/${encodeURIComponent(order.stripe_payment_intent_id)}`,
      );
      return {
        clientSecret:
          typeof existing.client_secret === "string"
            ? existing.client_secret
            : null,
        pending: false,
      };
    }

    const amountCents = Math.round(Number(order.total) * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents < 50) {
      throw new Error("Invalid payable order total.");
    }

    const intent = await stripePost(
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
      `1lv_order_${order.id}_payment_v1`,
    );

    const intentId = typeof intent.id === "string" ? intent.id : null;
    const clientSecret =
      typeof intent.client_secret === "string" ? intent.client_secret : null;

    if (!intentId || !clientSecret) {
      throw new Error("Stripe did not return a valid PaymentIntent.");
    }

    const { error: persistError } = await supabaseAdmin
      .from("orders")
      .update({ stripe_payment_intent_id: intentId })
      .eq("id", order.id);

    if (persistError) {
      throw new Error("Could not persist payment authorization.");
    }

    return {
      clientSecret,
      pending: false,
    };
  });

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
 * Create a Stripe Checkout Session for the caller's vendor subscription.
 * Vendor ownership is verified server-side through the authenticated client.
 */
export const createVendorSubscriptionCheckout = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      vendorId: string;
      plan: "starter" | "growth" | "scale";
    }) => data,
  )
  .handler(async ({ data, context }): Promise<VendorCheckoutResult> => {
    if (!isConfigured()) {
      return { url: null, pending: true, reason: "Stripe setup required" };
    }

    const priceId = priceForPlan(data.plan);
    if (!priceId) {
      return {
        url: null,
        pending: true,
        reason: `Price ID for plan "${data.plan}" not configured`,
      };
    }

    const { data: vendor, error } = await context.supabase
      .from("vendors")
      .select("id, user_id, stripe_customer_id, contact_email")
      .eq("id", data.vendorId)
      .maybeSingle();

    if (error || !vendor) throw new Error("Vendor not found or access denied");
    if (vendor.user_id !== context.userId) throw new Error("Forbidden");

    let customerId = vendor.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripePost("/customers", {
        email: vendor.contact_email ?? "",
        "metadata[vendor_id]": vendor.id,
        "metadata[owner_id]": context.userId,
      });
      customerId = customer.id as string;

      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      await supabaseAdmin
        .from("vendors")
        .update({ stripe_customer_id: customerId })
        .eq("id", vendor.id);
    }

    const request = getRequest();
    if (!request?.url) {
      throw new Error("Could not resolve the trusted 1LV return origin.");
    }

    const origin = resolveTrustedAppOrigin(request.url);
    const session = await stripePost("/checkout/sessions", {
      mode: "subscription",
      customer: customerId,
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

    return {
      url: typeof session.url === "string" ? session.url : null,
      pending: false,
    };
  });
