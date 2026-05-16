import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { EmptyState } from "@/components/EmptyState";
import { Package } from "lucide-react";
import { products, formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { listMyOrders } from "@/services/checkout";

export const Route = createFileRoute("/orders")({
  component: Orders,
  head: () => ({ meta: [{ title: "My orders — 1LV.CA" }] }),
});

type OrderRow = Awaited<ReturnType<typeof listMyOrders>>[number];

const demoOrders = [
  { id: "1LV-482910", date: "2026-05-08", status: "Shipped", total: 189.45, items: products.slice(0, 2) },
  { id: "1LV-481204", date: "2026-04-29", status: "Delivered", total: 64.0, items: products.slice(3, 4) },
];

function Orders() {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);

  useEffect(() => {
    if (!user) return;
    listMyOrders(user.id).then(setOrders).catch(() => setOrders([]));
  }, [user]);

  if (loading) return <AppLayout><div className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted-foreground">Loading…</div></AppLayout>;

  if (!user) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl px-4 py-12">
          <EmptyState icon={Package} title="Sign in to see your orders" actionLabel="Sign in" to="/login" />
        </div>
      </AppLayout>
    );
  }

  const useDemo = !orders || orders.length === 0;

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-display text-3xl font-extrabold text-navy">My orders</h1>
        {useDemo && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">
            Demo data
          </div>
        )}
        {useDemo ? (
          <ul className="mt-6 space-y-3">
            {demoOrders.map((o) => (
              <li key={o.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link to="/orders/$id" params={{ id: o.id }} className="font-bold text-navy hover:text-electric">
                      Order {o.id}
                    </Link>
                    <p className="text-xs text-muted-foreground">{o.date} · {o.items.length} items</p>
                  </div>
                  <span className="rounded-full bg-electric/10 px-3 py-1 text-xs font-semibold text-electric">{o.status}</span>
                  <span className="font-bold text-navy">{formatCAD(o.total)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-6 space-y-3">
            {orders!.map((o) => {
              const items = (o.order_items ?? []) as Array<{ id: string; title: string; quantity: number }>;
              return (
                <li key={o.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Link to="/orders/$id" params={{ id: o.order_number }} className="font-bold text-navy hover:text-electric">
                        Order {o.order_number}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString("en-CA")} · {items.length} items
                      </p>
                    </div>
                    <span className="rounded-full bg-electric/10 px-3 py-1 text-xs font-semibold capitalize text-electric">{o.status}</span>
                    <span className="font-bold text-navy">{formatCAD(Number(o.total))}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}
