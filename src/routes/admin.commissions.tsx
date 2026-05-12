import { createFileRoute } from "@tanstack/react-router";
import { DataTable } from "@/components/DataTable";

function Head() { return (
  <div className="mb-6"><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div><h1 className="text-2xl font-bold text-navy md:text-3xl">Commissions</h1></div>
); }

import { vendors } from "@/lib/data";
import { StatCard } from "@/components/StatCard";
import { DollarSign } from "lucide-react";
const rows = vendors.map((v, i) => ({ vendor: v.name, plan: ["Growth","Scale","Starter","Growth","Scale","Growth"][i], rate: ["9%","6%","12%","8%","6%","9%"][i] }));
function Page() {
  return (
    <>
      <Head />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Default rate" value="10%" icon={DollarSign} />
        <StatCard label="Commission revenue (30d)" value="$16,580" icon={DollarSign} accent="success" />
        <StatCard label="Active vendors" value={42} icon={DollarSign} accent="electric" />
      </div>
      <h2 className="mt-8 mb-3 text-lg font-bold text-navy">Vendor custom rates</h2>
      <DataTable columns={[{key:"vendor",label:"Vendor"},{key:"plan",label:"Plan"},{key:"rate",label:"Commission"}]} rows={rows} />
    </>
  );
}
export const Route = createFileRoute("/admin/commissions")({ component: Page });
