import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { products, formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import {
  getVendorOrder,
  listItemsForVendorOrder,
  updateVendorOrder,
  type VendorOrderStatus,
} from "@/services/orders";

type Item = { id: string; title: string; quantity: number; unit_price: number };
type VendorOrder = {
  id: string;
  vendor_id: string;
  order_id: string;
  status: VendorOrderStatus;
  subtotal: number;
  commission_amount: number;
  vendor_payout_amount: number;
  tracking_number: string | null;
  carrier: string | null;
  orders: { order_number: string; payment_status: string; shipping_address: Record<string, unknown> | null; customer_email: string | null };
};

function Page() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const demo = isDemoMode(user);

  const [vo, setVo] = useState<VendorOrder | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("");

  const refresh = async () => {
    if (demo) return;
    try {
      const v = (await getVendorOrder(id)) as unknown as VendorOrder | null;
      if (v) {
        setVo(v);
        setTracking(v.tracking_number ?? "");
        setCarrier(v.carrier ?? "");
        const its = await listItemsForVendorOrder(v.order_id, v.vendor_id);
        setItems(its as Item[]);
      }
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id, demo]);

  const useDemo = demo || !vo;
  const demoItems: Item[] = products.slice(0, 2).map((p, i) => ({ id: "d" + i, title: p.title, quantity: 1, unit_price: p.price }));
  const lines = useDemo ? demoItems : items;
  const subtotal = useDemo
    ? lines.reduce((s, p) => s + p.unit_price * p.quantity, 0)
    : Number(vo!.subtotal);
  const commission = useDemo ? +(subtotal * 0.1).toFixed(2) : Number(vo!.commission_amount);
  const payout = useDemo ? +(subtotal - commission).toFixed(2) : Number(vo!.vendor_payout_amount);

  const update = async (status?: VendorOrderStatus, withTracking = false) => {
    if (useDemo) { toast.message("Demo mode — update simulated"); return; }
    try {
      await updateVendorOrder(vo!.id, {
        ...(status ? { status } : {}),
        ...(withTracking ? { tracking_number: tracking || null, carrier: carrier || null } : {}),
      });
      toast.success("Order updated");
      await refresh();
    } catch (err) { toast.error((err as Error).message); }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div>
      <div className="mb-6">
        {useDemo && <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div>}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">
          Order {useDemo ? id : vo!.orders.order_number}
        </h1>
        {!useDemo && (
          <p className="mt-1 text-sm text-muted-foreground">
            Status: <span className="font-semibold capitalize">{vo!.status}</span> · Payment: {vo!.orders.payment_status}
          </p>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-navy">Items</h3>
            <ul className="mt-3 divide-y divide-border">
              {lines.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3 text-sm">
                  <span>{p.title} {p.quantity > 1 && <span className="text-muted-foreground">× {p.quantity}</span>}</span>
                  <span className="font-medium">{formatCAD(Number(p.unit_price) * p.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatCAD(subtotal)}</dd></div>
              <div className="flex justify-between text-muted-foreground"><dt>Platform commission</dt><dd>− {formatCAD(commission)}</dd></div>
              <div className="flex justify-between font-bold text-navy"><dt>Your payout</dt><dd>{formatCAD(payout)}</dd></div>
            </dl>
          </div>
        </div>
        <div className="space-y-6">
          <div className="space-y-2 rounded-xl border border-border bg-card p-5">
            <button onClick={() => update("accepted")} className="w-full rounded-md border border-electric/40 px-3 py-2 text-sm font-semibold text-electric">Accept order</button>
            <button onClick={() => update("processing")} className="w-full rounded-md bg-electric px-3 py-2 text-sm font-semibold text-electric-foreground">Mark processing</button>
            <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Tracking number" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            <input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Carrier" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            <button onClick={() => update("shipped", true)} className="w-full rounded-md bg-success px-3 py-2 text-sm font-semibold text-white">Mark shipped</button>
            <button onClick={() => update("delivered")} className="w-full rounded-md border border-border px-3 py-2 text-sm">Mark delivered</button>
            <button onClick={() => update("cancelled")} className="w-full rounded-md border border-border px-3 py-2 text-sm text-destructive">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
export const Route = createFileRoute("/vendor/orders/$id")({ component: Page });
