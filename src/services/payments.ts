/**
 * Payments service — thin client wrapper around Stripe server functions.
 *
 * Secret keys live only on the server. The browser may send a signed guest
 * capability, but it never sends an amount that Stripe trusts.
 */
import { createPaymentIntent as createPaymentIntentFn } from "@/lib/stripe.functions";

export type PaymentIntent = {
  clientSecret: string | null;
  pending: boolean;
  reason?: string;
};

export function isStripeConfigured() {
  return Boolean(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
}

export async function createPaymentIntent(
  orderId: string,
  guestToken?: string | null,
): Promise<PaymentIntent> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return {
      clientSecret: null,
      pending: true,
      reason: "Demo order — Stripe skipped.",
    };
  }

  try {
    return await createPaymentIntentFn({
      data: {
        orderId,
        guestToken: guestToken ?? null,
      },
    });
  } catch (error) {
    return {
      clientSecret: null,
      pending: true,
      reason:
        error instanceof Error ? error.message : "Payment authorization failed",
    };
  }
}
