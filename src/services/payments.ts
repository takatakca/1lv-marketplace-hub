/**
 * Payments service — thin client wrapper around Stripe server functions.
 *
 * Secret keys live only on the server. This file must never import
 * STRIPE_SECRET_KEY or make direct Stripe API calls.
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

export async function createPaymentIntent(orderId: string, _amountCAD: number): Promise<PaymentIntent> {
  // Demo/synthetic orders (non-UUID) skip Stripe entirely.
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return { clientSecret: null, pending: true, reason: "Demo order — Stripe skipped." };
  }
  try {
    const res = await createPaymentIntentFn({ data: { orderId } });
    return res;
  } catch (err) {
    return {
      clientSecret: null,
      pending: true,
      reason: err instanceof Error ? err.message : "Stripe setup required",
    };
  }
}

export async function confirmPayment(_clientSecret: string): Promise<{ ok: boolean }> {
  // Stripe.js Elements will confirm on the client using VITE_STRIPE_PUBLISHABLE_KEY.
  // Wire this up when the checkout UI is upgraded to full Elements integration.
  return { ok: false };
}
