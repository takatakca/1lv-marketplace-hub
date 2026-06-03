import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { DataTable } from "@/components/DataTable";
import { TrendingUp, ShoppingBag, DollarSign, Wallet } from "lucide-react";
import { products as demoProducts, formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { getMyVendor } from "@/services/vendors";
import { getVendorStats, getDailySales, type VendorStats, type DailySales } from "@/services/vendor-stats";
import { listVendorProducts, type ProductRecord } from "@/services/products";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

function buildDemoDaily(): DailySales[] {
  const out: DailySales[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const orders = 4 + ((i * 3) % 6);
    const gmv = orders * (60 + ((i * 17) % 40));
    out.push({
      date: d.toISOString().slice(0, 10),
      orders,
      gmv,
      commission: +(gmv * 0.1).toFixed(2),
      payout: +(gmv * 0.9).toFixed(2),
    });
  }
  return out;
}

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [stats, setStats] = useState<VendorStats | null>(null);
  const [prods, setProds] = useState<ProductRecord[] | null>(null);
  const [daily, setDaily] = useState<DailySales[] | null>(null);
  const [loading, setLoading] = useState(!demo);

  useEffect(() => {
    if (demo) return;
    (async () => {
      try {
        const v = await getMyVendor(user!.id);
        if (!v) return;
        const [s, p, d] = await Promise.all([getVendorStats(v.id), listVendorProducts(v.id), getDailySales(v.id, 7)]);
        setStats(s); setProds(p); setDaily(d);
      } finally { setLoading(false); }
    })();
  }, [demo, user]);

  const useDemo = demo || !stats || (stats && stats.orders.total === 0);
  const s: VendorStats = useDemo
    ? { gmv: 12480, commission: 1248, payoutAvailable: 845.2, payoutPending: 312.4, payoutLifetime: 18420,
        orders: { total: 132, pending: 7, accepted: 4, processing: 9, shipped: 21, delivered: 86, cancelled: 5 },
        products: { total: 24, draft: 3, pending: 2, active: 18, rejected: 1, archived: 0 } }
    : stats!;

  const series: DailySales[] = useDemo || !daily || daily.every((d) => d.orders === 0) ? buildDemoDaily() : daily;
  const maxGmv = Math.max(1, ...series.map((d) => d.gmv));

  const top: Array<{ title: string; sold: string; revenue: string }> = (useDemo || !prods || prods.length === 0
    ? demoProducts.slice(0, 6).map((p) => ({ title: p.title, sold: String(p.sold), revenue: formatCAD(p.price * 12) }))
    : prods.slice(0, 6).map((p) => ({ title: p.title, sold: "—", revenue: formatCAD(Number(p.price)) })));

  return (
    <div>
      <div className="mb-6">
        {useDemo ? <DemoBanner label={demo ? "Preview mode" : "No data yet"} /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Performance trends for your store</p>
      </div>
      {demo && <PreviewModeNotice />}
      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="GMV" value={formatCAD(s.gmv)} icon={DollarSign} accent="success" />
        <StatCard label="Commission paid" value={formatCAD(s.commission)} icon={TrendingUp} accent="deal" />
        <StatCard label="Net payout estimate" value={formatCAD(s.payoutAvailable + s.payoutPending)} icon={Wallet} />
        <StatCard label="Orders" value={s.orders.total} icon={ShoppingBag} />
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-semibold text-navy">Orders by status</h3>
        <div className="mt-4 grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
          {(["pending","accepted","processing","shipped","delivered","cancelled"] as const).map((k) => (
            <div key={k} className="rounded-md border border-border p-3 text-center">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
              <div className="mt-1 text-lg font-bold text-navy">{s.orders[k]}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <div className="flex items-end justify-between">
          <h3 className="text-sm font-semibold text-navy">Sales — last 7 days</h3>
          <span className="text-xs text-muted-foreground">{useDemo ? "Demo data" : "Live"}</span>
        </div>
        <div className="mt-4 flex h-40 items-end gap-2">
          {series.map((d) => {
            const h = Math.max(4, Math.round((d.gmv / maxGmv) * 140));
            return (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t bg-electric/80 transition hover:bg-electric" style={{ height: `${h}px` }} title={`${d.date}: ${formatCAD(d.gmv)}`} />
                <span className="text-[10px] text-muted-foreground">{d.date.slice(5)}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 text-left font-medium">Date</th>
                <th className="py-2 text-right font-medium">Orders</th>
                <th className="py-2 text-right font-medium">GMV</th>
                <th className="py-2 text-right font-medium">Commission</th>
                <th className="py-2 text-right font-medium">Est. payout</th>
              </tr>
            </thead>
            <tbody>
              {series.map((d) => (
                <tr key={d.date} className="border-b border-border/50">
                  <td className="py-2 font-medium text-navy">{d.date}</td>
                  <td className="py-2 text-right">{d.orders}</td>
                  <td className="py-2 text-right">{formatCAD(d.gmv)}</td>
                  <td className="py-2 text-right text-muted-foreground">{formatCAD(d.commission)}</td>
                  <td className="py-2 text-right font-semibold text-navy">{formatCAD(d.payout)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="mb-3 text-lg font-bold text-navy">Top products</h3>
        <DataTable columns={[{key:"title",label:"Product"},{key:"sold",label:"Sold"},{key:"revenue",label:"Revenue"}]} rows={top} />
      </div>
    </div>
  );
}
export const Route = createFileRoute("/vendor/analytics")({ component: Page });
