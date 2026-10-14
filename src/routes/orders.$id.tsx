import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { getOrderByNumber } from "@/services/checkout";
import { createPaymentIntent, isStripeConfigured } from "@/services/payments";
import { PaymentBadge, isUnpaid } from "@/components/PaymentBadge";
import { StripePaymentForm } from "@/components/StripePaymentForm";
import { ReportProblem } from "@/components/ReportProblem";
import { formatCAD } from "@/lib/data";
import { getGuestPaymentContext } from "@/services/guest-payment";

export const Route = createFileRoute("/orders/$id")({ component: OrderDetail });

type OrderData = Awaited<ReturnType<typeof getOrderByNumber>>;

function OrderDetail() {
  const { id } = Route.useParams();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setOrder(null);
    setLoading(true);
    const context = getGuestPaymentContext(id);
    getOrderByNumber(id, context?.checkoutKey ?? null)
      .then((d) => !cancel && setOrder(d))
      .catch(() => undefined)
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [id]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-display text-2xl font-extrabold text-navy">Order {id}</h1>

        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : order ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Fulfillment</span><span className="font-semibold capitalize text-electric">{order.status}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Payment</span><PaymentBadge status={order.payment_status} /></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-bold text-navy">{formatCAD(Number(order.total))}</span></div>
              </div>
              {isUnpaid(order.payment_status) && order.id && <RetryButton orderId={order.id} orderNumber={order.order_number} guestToken={getGuestPaymentContext(id)?.token ?? null} />}
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-3 font-bold text-navy">Items</h2>
              <ul className="space-y-2 text-sm">
                {(order.order_items ?? []).map((it: { id: string; title: string; quantity: number; unit_price: number; status: string; tracking_number: string | null; carrier: string | null }) => (
                  <li key={it.id} className="flex justify-between border-b border-border pb-2 last:border-0">
                    <div>
                      <p className="font-medium text-navy">{it.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        Qty {it.quantity} · {it.status}
                        {it.tracking_number ? ` · ${it.carrier ?? "Tracking"} ${it.tracking_number}` : ""}
                      </p>
                    </div>
                    <span className="font-semibold">{formatCAD(Number(it.unit_price) * it.quantity)}</span>
                  </li>
                ))}
              </ul>
            </div>
            {order.id && <ReportProblem orderId={order.id} paymentStatus={order.payment_status} />}
          </div>

        ) : (
          <div className="mt-6 rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">
              We couldn't load this order. It may not exist yet, or you may not have access.
              If you just placed a demo order, details are not persisted.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              No order status or tracking information can be verified for this reference.
              Guest orders require the original checkout session; authenticated customers
              can also check My Orders or contact support.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function RetryButton({ orderId, orderNumber, guestToken }: { orderId: string; orderNumber: string; guestToken: string | null }) {
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment retry could not be prepared.");
    } finally {
      setBusy(false);
    }
  };
  if (clientSecret) {
    return (
      <div className="mt-4">
        <StripePaymentForm clientSecret={clientSecret} orderNumber={orderNumber} onCancel={() => setClientSecret(null)} />
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
