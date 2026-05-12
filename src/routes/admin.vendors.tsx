import { createFileRoute } from "@tanstack/react-router";
import { DataTable } from "@/components/DataTable";

function Head() { return (
  <div className="mb-6"><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div><h1 className="text-2xl font-bold text-navy md:text-3xl">Vendors</h1></div>
); }

import { vendors } from "@/lib/data";
const rows = vendors.map((v, i) => ({ store: v.name, email: v.slug + "@1lv.ca", status: ["Active","Active","Pending","Active","Suspended","Active"][i], plan: ["Growth","Scale","Starter","Growth","Scale","Growth"][i], commission: ["9%","6%","12%","9%","6%","9%"][i], products: 8 + i * 4 }));
function Page() {
  return <><Head /><DataTable columns={[{key:"store",label:"Store"},{key:"email",label:"Owner"},{key:"status",label:"Status"},{key:"plan",label:"Plan"},{key:"commission",label:"Commission"},{key:"products",label:"Products"},{key:"actions",label:"",render:()=>(<div className="flex gap-2 text-xs"><span className="text-electric">Approve</span><span className="text-destructive">Reject</span><span className="text-muted-foreground">Suspend</span></div>)}]} rows={rows} /></>;
}
export const Route = createFileRoute("/admin/vendors")({ component: Page });
