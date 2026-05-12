import { createFileRoute } from "@tanstack/react-router";

function PageHead() {
  return (
    <div className="mb-6">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div>
      <h1 className="text-2xl font-bold text-navy md:text-3xl">Payouts</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your earnings and payment history</p>
    </div>
  );
}

import { StatCard } from "@/components/StatCard";
import { DataTable } from "@/components/DataTable";
import { Wallet, Clock, DollarSign } from "lucide-react";
import { formatCAD } from "@/lib/data";
const history = Array.from({ length: 6 }).map((_, i) => ({
  date: new Date(2026, 4 - i, 15).toLocaleDateString("en-CA"),
  amount: formatCAD(620 + i * 110),
  method: "Direct deposit",
  status: i === 0 ? "Pending" : "Paid",
}));
function Page() {
  return (
    <div>
      <PageHead />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Available" value={formatCAD(845.20)} icon={Wallet} accent="success" />
        <StatCard label="Pending" value={formatCAD(312.40)} icon={Clock} accent="deal" />
        <StatCard label="Lifetime paid" value={formatCAD(18420)} icon={DollarSign} />
      </div>
      <div className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-navy">Payout history</h2>
        <DataTable columns={[{key:"date",label:"Date"},{key:"amount",label:"Amount"},{key:"method",label:"Method"},{key:"status",label:"Status"}]} rows={history} />
      </div>
      <div className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-navy">Commission breakdown</h2>
        <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Growth plan: 9% platform commission + Stripe processing fees.</div>
      </div>
    </div>
  );
}
export const Route = createFileRoute("/vendor/payouts")({ component: Page });
