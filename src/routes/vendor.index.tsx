import { createFileRoute, Link } from "@tanstack/react-router";
import { StatCard } from "@/components/StatCard";
import { DataTable } from "@/components/DataTable";
import { DollarSign, Package, ShoppingBag, FileEdit, Crown, Wallet, CheckCircle2, Circle } from "lucide-react";
import { products, vendors, formatCAD } from "@/lib/data";

function PageHead() {
  return (
    <div className="mb-6">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div>
      <h1 className="text-2xl font-bold text-navy md:text-3xl">Vendor overview</h1>
      <p className="mt-1 text-sm text-muted-foreground">Snapshot of your store performance</p>
    </div>
  );
}
const recent = products.slice(0, 5).map((p, i) => ({
  order: "1LV-" + (10240 + i),
  product: p.title,
  total: formatCAD(p.price),
  status: ["Pending", "Processing", "Shipped", "Delivered", "Pending"][i],
}));
const checklist = [
  { label: "Store profile complete", done: true },
  { label: "Subscription active", done: true },
  { label: "Admin approved", done: false },
  { label: "First product uploaded", done: true },
];
function Page() {
  return (
    <div>
      <PageHead />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total sales" value={formatCAD(12480)} delta="+12.4%" icon={DollarSign} accent="success" />
        <StatCard label="Pending orders" value={7} icon={ShoppingBag} accent="deal" />
        <StatCard label="Active products" value={24} icon={Package} />
        <StatCard label="Draft products" value={3} icon={FileEdit} />
        <StatCard label="Subscription" value="Growth" icon={Crown} accent="electric" />
        <StatCard label="Payout balance" value={formatCAD(845.20)} icon={Wallet} accent="success" />
        <StatCard label="Vendor" value={vendors[0].name} icon={Package} />
        <StatCard label="Rating" value="4.8" icon={Crown} accent="deal" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-lg font-bold text-navy">Recent orders</h2>
          <DataTable
            columns={[
              { key: "order", label: "Order" },
              { key: "product", label: "Product" },
              { key: "total", label: "Total" },
              { key: "status", label: "Status" },
            ]}
            rows={recent}
          />
        </div>
        <div>
          <h2 className="mb-3 text-lg font-bold text-navy">Onboarding</h2>
          <ul className="space-y-3 rounded-xl border border-border bg-card p-5">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-3 text-sm">
                {c.done ? <CheckCircle2 size={18} className="text-success" /> : <Circle size={18} className="text-muted-foreground" />}
                <span className={c.done ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
              </li>
            ))}
            <Link to="/vendor/onboarding" className="mt-2 block rounded-md bg-electric px-3 py-2 text-center text-xs font-semibold text-electric-foreground">Complete onboarding</Link>
          </ul>
        </div>
      </div>
    </div>
  );
}
export const Route = createFileRoute("/vendor/")({ component: Page });
