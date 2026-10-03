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

async function makePaymentIntentNonPayable(
  paymentIntentId: string,
  orderId: string,
): Promise<"canceled" | "succeeded"> {
  const intent = await stripeGet(
    `/payment_intents/${encodeURIComponent(paymentIntentId)}`,
  );
  const intentId = typeof intent.id === "string" ? intent.id : "";
  const status = typeof intent.status === "string" ? intent.status : "";
  const metadata =
    intent.metadata &&
    typeof intent.metadata === "object" &&
    !Array.isArray(intent.metadata)
      ? (intent.metadata as Record<string, unknown>)
      : {};
  const stripeOrderId =
    typeof metadata["order_id"] === "string"
      ? String(metadata["order_id"])
      : "";

  if (intentId !== paymentIntentId || stripeOrderId !== orderId) {
    throw new Error(
      "Stored Stripe payment authorization does not match this order.",
    );
  }

  if (status === "succeeded") return "succeeded";
  if (status === "canceled") return "canceled";

  const canceled = await stripePost(
    `/payment_intents/${encodeURIComponent(paymentIntentId)}/cancel`,
    { cancellation_reason: "abandoned" },
    `1lv_order_${orderId}_expire_${paymentIntentId}_v1`,
  );
  const canceledId =
    typeof canceled.id === "string" ? canceled.id : "";
  const canceledStatus =
    typeof canceled.status === "string" ? canceled.status : "";

  if (canceledId !== paymentIntentId || canceledStatus !== "canceled") {
    throw new Error(
      "Stripe payment authorization could not be made non-payable safely.",
    );
  }

  return "canceled";
}

async function findOpenVendorSubscriptionCheckout(
  customerId: string,
  vendorId: string,
): Promise<{ url: string; plan: string | null } | null> {
  const params = new URLSearchParams({
    customer: customerId,
    status: "open",
    limit: "10",
  });
  const response = await stripeGet(`/checkout/sessions?${params.toString()}`);
  const sessions = Array.isArray(response.data)
    ? (response.data as Array<Record<string, unknown>>)
    : [];

  for (const session of sessions) {
    if (session.mode !== "subscription" || session.status !== "open") continue;
    const metadata =
      session.metadata &&
      typeof session.metadata === "object" &&
      !Array.isArray(session.metadata)
        ? (session.metadata as Record<string, unknown>)
        : {};
    if (metadata["vendor_id"] !== vendorId) continue;

    const url = typeof session.url === "string" ? session.url : "";
    if (!url.startsWith("https://checkout.stripe.com/")) continue;

    return {
      url,
      plan:
        typeof metadata["plan"] === "string"
          ? String(metadata["plan"])
          : null,
    };
  }

  return null;
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
      if (order.stripe_payment_intent_id) {
        const paymentState = await makePaymentIntentNonPayable(
          order.stripe_payment_intent_id,
          order.id,
        );
        if (paymentState === "succeeded") {
          return {
            clientSecret: null,
            pending: true,
            reason:
              "Stripe already reports this payment as succeeded. The order is being reconciled before any inventory is released.",
          };
        }
      }

      if (!order.inventory_released_at && reservationExpired) {
        const { data: released, error: releaseError } =
          await supabaseAdmin.rpc(
            "release_order_inventory" as never,
            {
              _order_id: order.id,
              _expected_payment_intent_id:
                order.stripe_payment_intent_id ?? null,
            } as never,
          );
        if (releaseError || released !== true) {
          throw new Error(
            "Expired checkout state changed before inventory could be released safely.",
          );
        }
      }

      return {
        clientSecret: null,
        pending: true,
        reason: "This checkout reservation expired. Return to your cart and place the order again.",
      };
    }

    const amountCents = Math.round(Number(order.total) * 100);
    const expectedCurrency = String(order.currency ?? "cad").toLowerCase();
    if (!Number.isSafeInteger(amountCents) || amountCents < 50) {
      throw new Error("Invalid payable order total.");
    }

    if (order.stripe_payment_intent_id) {
      const existing = await stripeGet(
        `/payment_intents/${encodeURIComponent(order.stripe_payment_intent_id)}`,
      );
      const existingMetadata =
        existing.metadata &&
        typeof existing.metadata === "object" &&
        !Array.isArray(existing.metadata)
          ? (existing.metadata as Record<string, unknown>)
          : {};
      const existingAmount = Number(existing.amount ?? NaN);
      const existingCurrency = String(existing.currency ?? "").toLowerCase();
      const existingOrderId =
        typeof existingMetadata["order_id"] === "string"
          ? existingMetadata["order_id"]
          : "";
      const existingStatus =
        typeof existing.status === "string" ? existing.status : "";
      const existingSecret =
        typeof existing.client_secret === "string"
          ? existing.client_secret
          : null;

      if (
        !Number.isSafeInteger(existingAmount) ||
        existingAmount !== amountCents ||
        existingCurrency !== expectedCurrency ||
        existingOrderId !== order.id
      ) {
        throw new Error(
          "Stored Stripe payment authorization does not match this order.",
        );
      }

      if (existingStatus === "canceled") {
        const replacement = await stripePost(
          "/payment_intents",
          {
            amount: String(amountCents),
            currency: expectedCurrency,
            "automatic_payment_methods[enabled]": "true",
            "metadata[order_id]": order.id,
            "metadata[order_number]": order.order_number,
            "metadata[customer_email]": order.customer_email ?? "",
            receipt_email: order.customer_email ?? "",
          },
          `1lv_order_${order.id}_payment_after_${order.stripe_payment_intent_id}_v1`,
        );

        const replacementId =
          typeof replacement.id === "string" ? replacement.id : null;
        const replacementSecret =
          typeof replacement.client_secret === "string"
            ? replacement.client_secret
            : null;

        if (!replacementId || !replacementSecret) {
          throw new Error(
            "Stripe did not return a valid replacement PaymentIntent.",
          );
        }

        const { data: rebound, error: reboundError } = await supabaseAdmin
          .from("orders")
          .update({ stripe_payment_intent_id: replacementId })
          .eq("id", order.id)
          .eq(
            "stripe_payment_intent_id",
            order.stripe_payment_intent_id,
          )
          .in("payment_status", ["unpaid", "failed"])
          .select("id, stripe_payment_intent_id")
          .maybeSingle();

        if (reboundError) {
          throw new Error(
            "Could not persist replacement payment authorization.",
          );
        }

        if (!rebound) {
          const { data: currentOrder, error: currentOrderError } =
            await supabaseAdmin
              .from("orders")
              .select("stripe_payment_intent_id, payment_status")
              .eq("id", order.id)
              .maybeSingle();

          if (
            currentOrderError ||
            currentOrder?.stripe_payment_intent_id !== replacementId ||
            !["unpaid", "failed"].includes(
              String(currentOrder?.payment_status ?? ""),
            )
          ) {
            throw new Error(
              "Replacement payment authorization could not be bound safely to the order.",
            );
          }
        }

        return {
          clientSecret: replacementSecret,
          pending: false,
        };
      }

      if (!existingSecret) {
        throw new Error(
          "Stored Stripe payment authorization does not match this order.",
        );
      }

      return {
        clientSecret: existingSecret,
        pending: false,
      };
    }

    const intent = await stripePost(
      "/payment_intents",
      {
        amount: String(amountCents),
        currency: expectedCurrency,
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

    const { data: persistedIntent, error: persistError } =
      await supabaseAdmin
        .from("orders")
        .update({ stripe_payment_intent_id: intentId })
        .eq("id", order.id)
        .is("stripe_payment_intent_id", null)
        .select("id, stripe_payment_intent_id")
        .maybeSingle();

    if (persistError) {
      throw new Error("Could not persist payment authorization.");
    }

    if (!persistedIntent) {
      const { data: currentOrder, error: currentOrderError } =
        await supabaseAdmin
          .from("orders")
          .select("stripe_payment_intent_id")
          .eq("id", order.id)
          .maybeSingle();

      if (
        currentOrderError ||
        currentOrder?.stripe_payment_intent_id !== intentId
      ) {
        throw new Error(
          "Payment authorization was created but could not be bound safely to the order.",
        );
      }
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
      .select(
        "id, user_id, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_plan, contact_email",
      )
      .eq("id", data.vendorId)
      .maybeSingle();

    if (error || !vendor) throw new Error("Vendor not found or access denied");
    if (vendor.user_id !== context.userId) throw new Error("Forbidden");

    const subscriptionStatus = String(
      vendor.subscription_status ?? "none",
    ).toLowerCase();
    const terminalSubscriptionStatuses = new Set([
      "none",
      "canceled",
      "incomplete_expired",
    ]);
    if (
      !terminalSubscriptionStatuses.has(subscriptionStatus) ||
      (vendor.stripe_subscription_id &&
        !["canceled", "incomplete_expired"].includes(subscriptionStatus))
    ) {
      return {
        url: null,
        pending: true,
        reason:
          "An existing Stripe subscription is already active or awaiting resolution. 1LV will not create a second subscription for this vendor.",
      };
    }

    let customerId = vendor.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripePost(
        "/customers",
        {
          email: vendor.contact_email ?? "",
          "metadata[vendor_id]": vendor.id,
          "metadata[owner_id]": context.userId,
        },
        `1lv_vendor_${vendor.id}_customer_v1`,
      );
      const createdCustomerId =
        typeof customer.id === "string" && customer.id.startsWith("cus_")
          ? customer.id
          : null;
      if (!createdCustomerId) {
        throw new Error("Stripe did not return a valid customer id.");
      }

      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const { data: persistedCustomer, error: customerPersistError } =
        await supabaseAdmin
          .from("vendors")
          .update({ stripe_customer_id: createdCustomerId })
          .eq("id", vendor.id)
          .is("stripe_customer_id", null)
          .select("stripe_customer_id")
          .maybeSingle();

      if (customerPersistError) {
        throw new Error("Could not persist the Stripe customer.");
      }

      if (!persistedCustomer) {
        const { data: currentVendor, error: currentVendorError } =
          await supabaseAdmin
            .from("vendors")
            .select("stripe_customer_id")
            .eq("id", vendor.id)
            .maybeSingle();

        if (
          currentVendorError ||
          currentVendor?.stripe_customer_id !== createdCustomerId
        ) {
          throw new Error(
            "Stripe customer was created but could not be bound safely to this vendor.",
          );
        }
      }

      customerId = createdCustomerId;
    }

    const openCheckout = await findOpenVendorSubscriptionCheckout(
      customerId,
      vendor.id,
    );
    if (openCheckout) {
      if (openCheckout.plan === data.plan) {
        return { url: openCheckout.url, pending: false };
      }
      return {
        url: null,
        pending: true,
        reason:
          "Another subscription checkout is already open for this vendor. Complete or let that Stripe Checkout expire before choosing a different plan.",
      };
    }

    const request = getRequest();
    if (!request?.url) {
      throw new Error("Could not resolve the trusted 1LV return origin.");
    }

    const origin = resolveTrustedAppOrigin(request.url);
    // The key only needs to collapse concurrent/retried creation attempts.
    // Do not reuse it for an entire day: Stripe can retain idempotent results
    // for at least 24 hours, which could otherwise resurrect an expired or
    // completed Checkout Session on a legitimate later retry.
    const checkoutWindow = Math.floor(Date.now() / (5 * 60_000));
    const session = await stripePost(
      "/checkout/sessions",
      {
        mode: "subscription",
        customer: customerId,
        client_reference_id: vendor.id,
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        success_url: `${origin}/vendor/subscription?success=1`,
        cancel_url: `${origin}/vendor/subscription?cancelled=1`,
        "metadata[vendor_id]": vendor.id,
        "metadata[owner_id]": context.userId,
        "metadata[plan]": data.plan,
        "subscription_data[metadata][vendor_id]": vendor.id,
        "subscription_data[metadata][plan]": data.plan,
      },
      `1lv_vendor_${vendor.id}_subscription_checkout_${checkoutWindow}_v1`,
    );

    return {
      url: typeof session.url === "string" ? session.url : null,
      pending: false,
    };
  });
