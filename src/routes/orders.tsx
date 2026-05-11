import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { EmptyState } from "@/components/EmptyState";
import { Package } from "lucide-react";
import { products, formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/orders")({
  component: Orders,
  head: () => ({ meta: [{ title: "My orders — 1LV.CA" }] }),
});

const sample = [
  { id: "1LV-482910", date: "2026-05-08", status: "Shipped", total: 189.45, items: products.slice(0, 2) },
  { id: "1LV-481204", date: "2026-04-29", status: "Delivered", total: 64.0, items: products.slice(3, 4) },
];

function Orders() {
  const { user } = useAuth();
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
        <ul className="mt-6 space-y-3">
          {sample.map((o) => (
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
              <div className="mt-3 flex gap-2">
                {o.items.map((p) => (
                  <img key={p.id} src={p.images[0]} alt="" className="h-14 w-14 rounded object-cover" />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AppLayout>
  );
}
