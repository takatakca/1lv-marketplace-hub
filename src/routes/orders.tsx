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
  const userId = user?.id ?? null;
  const [retryToken, setRetryToken] = useState(0);
  const [view, setView] = useState<{
    owner: string | null;
    orders: OrderRow[] | null;
    error: boolean;
  }>({ owner: null, orders: null, error: false });

  useEffect(() => {
    let active = true;
    if (!userId) {
      setView({ owner: null, orders: null, error: false });
      return () => { active = false; };
    }
    setView({ owner: userId, orders: null, error: false });
    void listMyOrders(userId)
      .then((rows) => {
        if (active) setView({ owner: userId, orders: rows, error: false });
      })
      .catch(() => {
        if (active) setView({ owner: userId, orders: null, error: true });
      });
    return () => { active = false; };
  }, [userId, retryToken]);

  // Never show a previous account's order rows while switching identities.
  const orders = view.owner === userId ? view.orders : null;
  const orderLoadError = view.owner === userId && view.error;

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

        {orderLoadError ? (
          <div role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <p className="font-semibold text-navy">Your orders could not be loaded.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We could not verify your order history. No orders have been removed.
            </p>
            <button type="button" onClick={() => setRetryToken((value) => value + 1)}
              className="mt-3 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white">
              Retry loading orders
            </button>
          </div>
        ) : orders === null ? (
          <div role="status" className="mt-6 text-sm text-muted-foreground">Loading orders…</div>
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
