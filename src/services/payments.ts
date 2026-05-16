/**
 * Payments service — Stripe-ready placeholder.
 *
 * Real Stripe integration requires server-side code with STRIPE_SECRET_KEY
 * and STRIPE_WEBHOOK_SECRET. These functions are intentionally stubs so the
 * checkout flow stays usable in Lovable preview until Stripe is enabled.
 *
 * Required env vars (set when enabling Stripe):
 *   VITE_STRIPE_PUBLISHABLE_KEY   (client, safe)
 *   STRIPE_SECRET_KEY             (server only — NEVER expose to client)
 *   STRIPE_WEBHOOK_SECRET         (server only)
 *
 * TODO (server function):
 *   - createPaymentIntent: POST { orderId } -> { clientSecret }
 *   - confirmPayment:      called by Stripe Elements
 *   - webhook handler:     /api/public/webhooks/stripe (verify signature,
 *                          update orders.payment_status, set status=paid)
 */

export type PaymentIntent = {
  clientSecret: string | null;
  pending: boolean;
  reason?: string;
};

export function isStripeConfigured() {
  return Boolean(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
}

export async function createPaymentIntent(_orderId: string, _amountCAD: number): Promise<PaymentIntent> {
  // TODO: call server function that talks to Stripe with STRIPE_SECRET_KEY
  return {
    clientSecret: null,
    pending: true,
    reason: "Stripe setup required — order created in pending-payment mode.",
  };
}

export async function confirmPayment(_clientSecret: string): Promise<{ ok: boolean }> {
  // TODO: integrate Stripe.js Elements on the client + server confirmation
  return { ok: false };
}
