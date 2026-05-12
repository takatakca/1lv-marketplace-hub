import { createFileRoute } from "@tanstack/react-router";
import { DataTable } from "@/components/DataTable";

function Head() { return (
  <div className="mb-6"><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div><h1 className="text-2xl font-bold text-navy md:text-3xl">Disputes</h1></div>
); }

const rows = Array.from({ length: 5 }).map((_, i) => ({ id: "DSP-" + (820 + i), order: "1LV-" + (10240 + i), customer: ["Jane","Marc","Sarah","Liam","Noor"][i], vendor: ["northstar-tech","maple-home","atlantic-style","boreal-outfitters","pacific-pets"][i], reason: ["Item not received","Damaged item","Wrong item","Not as described","Late delivery"][i], status: ["Open","In review","Open","Resolved","Open"][i], updated: new Date(2026, 4, 10 - i).toLocaleDateString("en-CA") }));
function Page() {
  return <><Head /><DataTable columns={[{key:"id",label:"Dispute"},{key:"order",label:"Order"},{key:"customer",label:"Customer"},{key:"vendor",label:"Vendor"},{key:"reason",label:"Reason"},{key:"status",label:"Status"},{key:"updated",label:"Updated"},{key:"actions",label:"",render:()=>(<span className="text-xs font-semibold text-electric">Review</span>)}]} rows={rows} /></>;
}
export const Route = createFileRoute("/admin/disputes")({ component: Page });
