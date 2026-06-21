import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { DataTable } from "@/components/DataTable";
import {
  DollarSign,
  ShoppingBag,
  Store,
  ShieldCheck,
  AlertTriangle,
  Package,
  Wallet,
  CreditCard,
} from "lucide-react";
import { products, formatCAD } from "@/lib/data";
import { getAdminOverview, type AdminOverview } from "@/services/admin";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoBanner } from "@/components/DemoBanner";

const demoRecent = products.slice(0, 6).map((p, i) => ({
  order: "1LV-" + (10240 + i),
  customer: ["Jane", "Marc", "Sarah", "Liam", "Noor", "Ava"][i],
  vendor: p.vendorSlug,
  total: formatCAD(p.price),
  status: ["Paid", "Paid", "Refunded", "Paid", "Paid", "Pending"][i],
}));

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [stats, setStats] = useState<AdminOverview | null>(null);

  useEffect(() => {
    if (demo) return;
    getAdminOverview().then(setStats).catch(() => setStats(null));
  }, [demo]);

  const useDemo = demo || !stats || !stats.hasData;
  const s: AdminOverview = stats ?? {
    gmv: 184220,
    orderCount: 2841,
    pendingVendors: 6,
    activeVendors: 42,
    pendingProducts: 18,
    activeProducts: 312,
    unpaidVendors: 4,
    commissionRevenue: 16580,
    payoutLiability: 38420,
    hasData: false,
  };

  return (
    <div>
      <div className="mb-6">
        {useDemo && <DemoBanner label={demo ? "Preview mode" : "No live data yet"} />}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Marketplace overview</h1>
        <p className="text-sm text-muted-foreground">Operational health, revenue and moderation queues.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total GMV" value={formatCAD(s.gmv)} icon={DollarSign} accent="success" />
        <StatCard label="Total orders" value={s.orderCount} icon={ShoppingBag} />
        <StatCard label="Active vendors" value={s.activeVendors} icon={Store} accent="electric" />
        <StatCard label="Pending vendors" value={s.pendingVendors} icon={ShieldCheck} accent="deal" />
        <StatCard label="Active products" value={s.activeProducts} icon={Package} accent="electric" />
        <StatCard label="Pending products" value={s.pendingProducts} icon={ShieldCheck} accent="deal" />
        <StatCard label="Unpaid / past_due" value={s.unpaidVendors} icon={CreditCard} accent="deal" />
        <StatCard label="Open disputes" value={0} icon={AlertTriangle} accent="deal" />
        <StatCard label="Commission revenue" value={formatCAD(s.commissionRevenue)} icon={DollarSign} accent="success" />
        <StatCard label="Payout liability" value={formatCAD(s.payoutLiability)} icon={Wallet} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-bold text-navy">Recent orders</h2>
          <DataTable
            columns={[
              { key: "order", label: "Order" },
              { key: "customer", label: "Customer" },
              { key: "vendor", label: "Vendor" },
              { key: "total", label: "Total" },
              { key: "status", label: "Status" },
            ]}
            rows={demoRecent}
          />
        </section>
        <section>
          <h2 className="mb-3 text-lg font-bold text-navy">Queues</h2>
          <ul className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
            <li className="flex justify-between"><span>Vendor applications waiting</span><span className="font-semibold text-navy">{s.pendingVendors}</span></li>
            <li className="flex justify-between"><span>Product submissions waiting</span><span className="font-semibold text-navy">{s.pendingProducts}</span></li>
            <li className="flex justify-between"><span>Vendors with billing issues</span><span className="font-semibold text-deal">{s.unpaidVendors}</span></li>
            <li className="flex justify-between text-muted-foreground"><span>Disputes open</span><span>0 (placeholder)</span></li>
          </ul>
        </section>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/admin/")({ component: Page });
