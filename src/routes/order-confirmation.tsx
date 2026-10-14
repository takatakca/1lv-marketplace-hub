import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, AlertCircle, LifeBuoy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { getOrderByNumber } from "@/services/checkout";
import { createPaymentIntent, isStripeConfigured } from "@/services/payments";
import { PaymentBadge, isUnpaid } from "@/components/PaymentBadge";
import { StripePaymentForm } from "@/components/StripePaymentForm";
import { formatCAD } from "@/lib/data";
import {
  clearGuestPaymentContext,
  getGuestPaymentContext,
  type GuestPaymentContext,
} from "@/services/guest-payment";

type Search = { order?: string; demo?: number };

export const Route = createFileRoute("/order-confirmation")({
  component: Confirmation,
  validateSearch: (s: Record<string, unknown>): Search => ({
    order: typeof s.order === "string" ? s.order : undefined,
    demo: Number(s.demo) ? 1 : 0,
  }),
  head: () => ({
    meta: [
      { title: "Order status — 1LV.CA" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
});

function Confirmation() {
  const { order, demo } = Route.useSearch();
  const [details, setDetails] = useState<Awaited<ReturnType<typeof getOrderByNumber>> | null>(null);
  const [guestContext, setGuestContext] = useState<GuestPaymentContext | null>(null);
  const [loading, setLoading] = useState(Boolean(order && !demo));
  const [refreshing, setRefreshing] = useState(false);
  const paymentVerified = !demo && details?.payment_status === "paid";
  const orderLocated = Boolean(details);

  useEffect(() => {
    if (!order || demo) return;
    let cancel = false;
    const context = getGuestPaymentContext(order);
    setGuestContext(context);
    getOrderByNumber(order, context?.checkoutKey ?? null)
      .then((d) => !cancel && setDetails(d))
      .catch(() => undefined)
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [order, demo]);

  // Stripe may redirect before the signed webhook updates the order.
  // Query authoritative order state; never trust a redirect query flag.
  useEffect(() => {
    if (!order || demo || details?.payment_status === "paid") return;
    let active = true;
    let inFlight = false;
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (!active || inFlight || attempts >= 12 || document.visibilityState === "hidden") return;
      attempts += 1;
      inFlight = true;
      const context = getGuestPaymentContext(order);
      void getOrderByNumber(order, context?.checkoutKey ?? null)
        .then((latest) => {
          if (active && latest) setDetails(latest);
        })
        .catch(() => {
          // Preserve last known state; manual refresh remains available.
        })
        .finally(() => {
          inFlight = false;
          if (attempts >= 12) window.clearInterval(timer);
        });
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [order, demo, details?.payment_status]);

  const refreshStatus = async () => {
    if (!order || demo || refreshing) return;
    setRefreshing(true);
    try {
      const context = getGuestPaymentContext(order);
      const current = await getOrderByNumber(order, context?.checkoutKey ?? null);
      if (current) {
        setDetails(current);
        toast.message(current.payment_status === "paid"
          ? "Payment confirmed"
          : "Payment is not yet confirmed");
      } else {
        toast.error("We could not verify this order yet.");
      }
    } catch {
      toast.error("Unable to refresh order status. Please try again.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (order && details?.payment_status === "paid") {
      clearGuestPaymentContext(order);
    }
  }, [order, details?.payment_status]);

  if (!order) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-muted text-muted-foreground">
            <AlertCircle size={32} />
          </div>
          <h1 className="mt-5 font-display text-2xl font-extrabold text-navy">No order to show</h1>
          <p className="mt-2 text-sm text-muted-foreground">We couldn't find an order reference. Browse the marketplace to start a new order.</p>
          <Link to="/" className="mt-6 inline-block rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-navy-foreground hover:opacity-90">
            Back to home
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${paymentVerified ? "bg-success/10 text-success" : "bg-electric/10 text-electric"}`}>
          {paymentVerified ? <CheckCircle2 size={32} /> : <AlertCircle size={32} />}
        </div>
        <h1 className="mt-5 font-display text-3xl font-extrabold text-navy">
          {demo
            ? "Demo checkout — no payment"
            : loading
              ? "Checking order status…"
              : !orderLocated
                ? "Order status unavailable"
                : paymentVerified
                  ? "Payment received — thank you!"
                  : "Order received — payment pending"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Order <span className="font-semibold text-navy">{order}</span>
          {demo ? <> · <span className="rounded bg-electric/10 px-1.5 py-0.5 text-[11px] font-semibold text-electric">Demo</span></> : null}
        </p>

        {!demo && (
          <div className="mx-auto mt-6 max-w-md rounded-xl border border-border bg-card p-5 text-left">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading order…</p>
            ) : details ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="text-lg font-bold text-navy">{formatCAD(Number(details.total))}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Payment</span>
                  <PaymentBadge status={details.payment_status} />
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-muted-foreground">Fulfillment</span>
                  <span className="font-semibold text-navy capitalize">{details.status}</span>
                </div>
                {details.payment_status !== "paid" && (
                  <button
                    type="button"
                    onClick={() => void refreshStatus()}
                    disabled={refreshing}
                    className="mt-3 text-xs font-semibold text-electric underline-offset-2 hover:underline disabled:opacity-60"
                  >
                    {refreshing ? "Checking payment status…" : "Check payment status"}
                  </button>
                )}

                <div className="mt-4 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                  <p className="font-semibold text-navy">Next steps</p>
                  {details.payment_status === "paid" ? (
                    <p className="mt-1">Vendors are preparing your items. You'll receive tracking updates by email.</p>
                  ) : (
                    <p className="mt-1">
                      {isStripeConfigured()
                        ? "Complete payment to release your order to vendors."
                        : "Stripe is not yet configured. Your order is saved in pending-payment mode."}
                    </p>
                  )}
                </div>

                {isUnpaid(details.payment_status) && details.id && (
                  <RetryPayment
                    orderId={details.id}
                    orderNumber={order}
                    guestToken={guestContext?.token ?? null}
                  />
                )}
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  We could not verify this order or its payment status. Check My Orders or contact support if the problem continues.
                </p>
                <button
                  type="button"
                  onClick={() => void refreshStatus()}
                  disabled={refreshing}
                  className="text-xs font-semibold text-electric underline-offset-2 hover:underline disabled:opacity-60"
                >
                  {refreshing ? "Checking…" : "Try checking the order again"}
                </button>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <LifeBuoy size={14} />
              Need help? Reach us at <a href="mailto:support@1lv.ca" className="text-electric hover:underline">support@1lv.ca</a>
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link to="/orders" className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-navy-foreground hover:opacity-90">
            View my orders
          </Link>
          <Link to="/" className="rounded-md border border-border px-4 py-2.5 text-sm font-semibold text-navy hover:bg-muted">
            Continue shopping
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}

function RetryPayment({
  orderId,
  orderNumber,
  guestToken,
}: {
  orderId: string;
  orderNumber: string;
  guestToken: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const onRetry = async () => {
    setBusy(true);
    try {
      const intent = await createPaymentIntent(orderId, guestToken);
      if (intent.pending || !intent.clientSecret) {
        toast.message("Payment not ready", { description: intent.reason ?? "Stripe setup required." });
      } else if (!isStripeConfigured()) {
        toast.message("Stripe publishable key missing", { description: "Set VITE_STRIPE_PUBLISHABLE_KEY to enable card entry." });
      } else {
        setClientSecret(intent.clientSecret);
      }
    } finally {
      setBusy(false);
    }
  };
  if (clientSecret) {
    return (
      <div className="mt-4">
        <StripePaymentForm
          clientSecret={clientSecret}
          orderNumber={orderNumber}
          onCancel={() => setClientSecret(null)}
        />
      </div>
    );
  }
  return (
    <button
      onClick={onRetry}
      disabled={busy}
      className="mt-4 w-full rounded-md bg-electric px-4 py-2 text-sm font-bold text-electric-foreground disabled:opacity-60"
    >
      {busy ? "Preparing…" : "Retry payment"}
    </button>
  );
}
