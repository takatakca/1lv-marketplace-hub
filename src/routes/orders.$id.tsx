import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { getOrderByNumber } from "@/services/checkout";
import { createPaymentIntent } from "@/services/payments";
import { PaymentBadge, isUnpaid } from "@/components/PaymentBadge";
import { formatCAD } from "@/lib/data";

export const Route = createFileRoute("/orders/$id")({ component: OrderDetail });

type OrderData = Awaited<ReturnType<typeof getOrderByNumber>>;

function OrderDetail() {
  const { id } = Route.useParams();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    getOrderByNumber(id)
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
              {isUnpaid(order.payment_status) && order.id && <RetryButton orderId={order.id} />}
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
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">
              We couldn't load this order. It may not exist yet, or you may not have access.
              If you just placed a demo order, details are not persisted.
            </p>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-semibold text-electric">Shipped</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tracking</span><span className="font-semibold text-navy">CP1234567CA</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Carrier</span><span>Canada Post</span></div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
