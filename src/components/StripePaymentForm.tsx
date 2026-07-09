import { useEffect, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Lock } from "lucide-react";

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  const pk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
  if (!pk) return null;
  if (!stripePromise) stripePromise = loadStripe(pk);
  return stripePromise;
}

type Props = {
  clientSecret: string;
  orderNumber: string;
  onCancel?: () => void;
};

export function StripePaymentForm({ clientSecret, orderNumber, onCancel }: Props) {
  const [ready, setReady] = useState<Promise<Stripe | null> | null>(null);
  useEffect(() => {
    setReady(getStripe());
  }, []);

  if (!ready) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Stripe publishable key missing. Set VITE_STRIPE_PUBLISHABLE_KEY to enable card payments.
      </div>
    );
  }

  return (
    <Elements stripe={ready} options={{ clientSecret, appearance: { theme: "stripe" } }}>
      <InnerForm orderNumber={orderNumber} onCancel={onCancel} />
    </Elements>
  );
}

function InnerForm({ orderNumber, onCancel }: { orderNumber: string; onCancel?: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    setError(null);
    const returnUrl = `${window.location.origin}/order-confirmation?order=${encodeURIComponent(orderNumber)}`;
    const { error: err } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });
    if (err) {
      setError(err.message ?? "Payment failed");
      setSubmitting(false);
    }
    // Otherwise the browser is redirecting to return_url.
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
        <Lock size={12} /> Secured by Stripe
      </p>
      <PaymentElement />
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="flex-1 rounded-md bg-electric px-4 py-3 text-sm font-bold text-electric-foreground shadow-glow hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Processing…" : "Pay now"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-3 text-sm font-semibold text-navy hover:bg-muted"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
