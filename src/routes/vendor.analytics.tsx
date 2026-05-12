import { createFileRoute } from "@tanstack/react-router";

function PageHead() {
  return (
    <div className="mb-6">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div>
      <h1 className="text-2xl font-bold text-navy md:text-3xl">Analytics</h1>
      <p className="mt-1 text-sm text-muted-foreground">Performance trends for your store</p>
    </div>
  );
}

import { StatCard } from "@/components/StatCard";
import { DataTable } from "@/components/DataTable";
import { TrendingUp, ShoppingBag, DollarSign } from "lucide-react";
import { products, formatCAD } from "@/lib/data";
const top = products.slice(0, 6).map((p) => ({ title: p.title, sold: p.sold, revenue: formatCAD(p.price * 12) }));
const byDay = Array.from({ length: 7 }).map((_, i) => ({ day: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i], orders: 4 + i * 2, revenue: formatCAD(220 + i * 95) }));
function Page() {
  return (
    <div>
      <PageHead />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Conversion rate" value="2.6%" icon={TrendingUp} accent="success" />
        <StatCard label="Avg order value" value={formatCAD(64.20)} icon={DollarSign} />
        <StatCard label="Orders (30d)" value={132} icon={ShoppingBag} accent="deal" />
      </div>
      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-semibold text-navy">Sales (last 30 days)</h3>
        <div className="mt-4 grid h-44 place-items-center rounded-md bg-muted/40 text-sm text-muted-foreground">Chart placeholder</div>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-lg font-bold text-navy">Top products</h3>
          <DataTable columns={[{key:"title",label:"Product"},{key:"sold",label:"Sold"},{key:"revenue",label:"Revenue"}]} rows={top} />
        </div>
        <div>
          <h3 className="mb-3 text-lg font-bold text-navy">Revenue by day</h3>
          <DataTable columns={[{key:"day",label:"Day"},{key:"orders",label:"Orders"},{key:"revenue",label:"Revenue"}]} rows={byDay} />
        </div>
      </div>
    </div>
  );
}
export const Route = createFileRoute("/vendor/analytics")({ component: Page });
