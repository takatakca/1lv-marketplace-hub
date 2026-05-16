import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { products, formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { getMyVendor } from "@/services/vendors";
import { getOrderForVendor, updateOrderItem, type FulfillmentStatus } from "@/services/orders";

type Item = { id: string; title: string; quantity: number; unit_price: number; status: string; tracking_number: string | null; carrier: string | null };
type Order = { id: string; order_number: string; total: number; status: string; created_at: string; shipping_address: Record<string, unknown> | null; order_items: Item[] };

function Page() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("");

  const refresh = async () => {
    if (demo || !user) return;
    try {
      const vendor = await getMyVendor(user.id);
      const o = (await getOrderForVendor(id)) as Order | null;
      if (o && vendor) {
        o.order_items = (o.order_items ?? []).filter((it: Item & { vendor_id?: string }) => it.vendor_id === vendor.id);
      }
      setOrder(o);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id, user?.id, demo]);

  const useDemo = demo || !order || order.order_items.length === 0;

  const demoItems = products.slice(0, 2).map((p, i) => ({ id: "demo-" + i, title: p.title, quantity: 1, unit_price: p.price, status: "pending", tracking_number: null, carrier: null }));
  const items = useDemo ? demoItems : order!.order_items;
  const total = items.reduce((s, p) => s + p.unit_price * p.quantity, 0);

  const update = async (status?: FulfillmentStatus, withTracking = false) => {
    if (useDemo) { toast.message("Demo mode — update simulated"); return; }
    try {
      for (const it of items) {
        await updateOrderItem(it.id, {
          ...(status ? { status } : {}),
          ...(withTracking ? { tracking_number: tracking || null, carrier: carrier || null } : {}),
        });
      }
      toast.success("Order updated");
      await refresh();
    } catch (err) { toast.error((err as Error).message); }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div>
      <div className="mb-6">
        {useDemo && <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div>}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Order {useDemo ? id : order!.order_number}</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-navy">Items</h3>
            <ul className="mt-3 divide-y divide-border">
              {items.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3 text-sm">
                  <span>{p.title} {p.quantity > 1 && <span className="text-muted-foreground">× {p.quantity}</span>}</span>
                  <span className="font-medium">{formatCAD(Number(p.unit_price) * p.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm font-bold"><span>Total</span><span>{formatCAD(total)}</span></div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="space-y-2 rounded-xl border border-border bg-card p-5">
            <button onClick={() => update("processing")} className="w-full rounded-md bg-electric px-3 py-2 text-sm font-semibold text-electric-foreground">Mark processing</button>
            <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Tracking number" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            <input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Carrier" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            <button onClick={() => update("shipped", true)} className="w-full rounded-md bg-success px-3 py-2 text-sm font-semibold text-white">Mark shipped</button>
            <button onClick={() => update("delivered")} className="w-full rounded-md border border-border px-3 py-2 text-sm">Mark delivered</button>
          </div>
        </div>
      </div>
    </div>
  );
}
export const Route = createFileRoute("/vendor/orders/$id")({ component: Page });
