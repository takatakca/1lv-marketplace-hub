import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { EmptyState } from "@/components/EmptyState";
import { Package } from "lucide-react";
import { formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { listMyOrders } from "@/services/checkout";

export const Route = createFileRoute("/orders")({
  component: Orders,
  head: () => ({ meta: [{ title: "My orders — 1LV.CA" }] }),
});

type OrderRow = Awaited<ReturnType<typeof listMyOrders>>[number];

function Orders() {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);

  useEffect(() => {
    if (!user) return;
    listMyOrders(user.id).then(setOrders).catch(() => setOrders([]));
  }, [user]);

  if (loading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted-foreground">
          Loading…
        </div>
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl px-4 py-12">
          <EmptyState icon={Package} title="Sign in to see your orders" actionLabel="Sign in" to="/login" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-display text-3xl font-extrabold text-navy">My orders</h1>

        {orders === null ? (
          <div className="mt-6 text-sm text-muted-foreground">Loading orders…</div>
        ) : orders.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={Package}
              title="No orders yet"
              description="Your real 1LV.CA orders will appear here after checkout."
              actionLabel="Start shopping"
              to="/categories"
            />
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {orders.map((order) => {
              const items = (order.order_items ?? []) as Array<{
                id: string;
                title: string;
                quantity: number;
              }>;
              return (
                <li key={order.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Link
                        to="/orders/$id"
                        params={{ id: order.order_number }}
                        className="font-bold text-navy hover:text-electric"
                      >
                        Order {order.order_number}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString("en-CA")} · {items.length} items
                      </p>
                    </div>
                    <span className="rounded-full bg-electric/10 px-3 py-1 text-xs font-semibold capitalize text-electric">
                      {order.status}
                    </span>
                    <span className="font-bold text-navy">{formatCAD(Number(order.total))}</span>
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
