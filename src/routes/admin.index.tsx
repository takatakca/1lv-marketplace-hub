import { createFileRoute } from "@tanstack/react-router";
import { StatCard } from "@/components/StatCard";
import { DataTable } from "@/components/DataTable";
import { DollarSign, ShoppingBag, Store, ShieldCheck, Crown, AlertTriangle } from "lucide-react";
import { products, formatCAD } from "@/lib/data";
const recent = products.slice(0, 6).map((p, i) => ({ order: "1LV-" + (10240 + i), customer: ["Jane","Marc","Sarah","Liam","Noor","Ava"][i], vendor: p.vendorSlug, total: formatCAD(p.price), status: ["Paid","Paid","Refunded","Paid","Paid","Pending"][i] }));
function Page() {
  return (
    <div>
      <div className="mb-6"><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div><h1 className="text-2xl font-bold text-navy md:text-3xl">Marketplace overview</h1></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total GMV" value={formatCAD(184220)} delta="+18%" icon={DollarSign} accent="success" />
        <StatCard label="Total orders" value={2841} icon={ShoppingBag} />
        <StatCard label="Active vendors" value={42} icon={Store} accent="electric" />
        <StatCard label="Pending vendors" value={6} icon={ShieldCheck} accent="deal" />
        <StatCard label="Pending products" value={18} icon={ShieldCheck} accent="deal" />
        <StatCard label="Active subscriptions" value={31} icon={Crown} />
        <StatCard label="Commission revenue" value={formatCAD(16580)} icon={DollarSign} accent="success" />
        <StatCard label="Open disputes" value={3} icon={AlertTriangle} accent="deal" />
      </div>
      <h2 className="mt-8 mb-3 text-lg font-bold text-navy">Recent orders</h2>
      <DataTable columns={[{key:"order",label:"Order"},{key:"customer",label:"Customer"},{key:"vendor",label:"Vendor"},{key:"total",label:"Total"},{key:"status",label:"Status"}]} rows={recent} />
    </div>
  );
}
export const Route = createFileRoute("/admin/")({ component: Page });
