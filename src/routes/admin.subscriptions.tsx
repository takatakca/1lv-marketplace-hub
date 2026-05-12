import { createFileRoute } from "@tanstack/react-router";
import { DataTable } from "@/components/DataTable";

function Head() { return (
  <div className="mb-6"><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div><h1 className="text-2xl font-bold text-navy md:text-3xl">Subscriptions</h1></div>
); }

import { vendors } from "@/lib/data";
const rows = vendors.map((v, i) => ({ vendor: v.name, plan: ["Growth","Scale","Starter","Growth","Scale","Growth"][i], status: i === 2 ? "Trialing" : "Active", revenue: ["$39","$119","$0","$39","$119","$39"][i], next: new Date(2026, 5, 15 - i).toLocaleDateString("en-CA") }));
function Page() {
  return <><Head /><DataTable columns={[{key:"vendor",label:"Vendor"},{key:"plan",label:"Plan"},{key:"status",label:"Status"},{key:"revenue",label:"Monthly"},{key:"next",label:"Next billing"},{key:"actions",label:"",render:()=>(<span className="text-xs text-electric">View</span>)}]} rows={rows} /></>;
}
export const Route = createFileRoute("/admin/subscriptions")({ component: Page });
