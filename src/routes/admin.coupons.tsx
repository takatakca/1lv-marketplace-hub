import { createFileRoute } from "@tanstack/react-router";
import { DataTable } from "@/components/DataTable";

function Head() { return (
  <div className="mb-6"><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div><h1 className="text-2xl font-bold text-navy md:text-3xl">Coupons</h1></div>
); }

import { useState } from "react";
import { toast } from "sonner";
const rows = [
  { code: "WELCOME10", type: "Percent", value: "10%", status: "Active", usage: "120/500", starts: "2026-01-01", ends: "2026-12-31" },
  { code: "FREESHIP", type: "Fixed", value: "$10", status: "Active", usage: "44/200", starts: "2026-04-01", ends: "2026-06-30" },
  { code: "SUMMER25", type: "Percent", value: "25%", status: "Scheduled", usage: "0/1000", starts: "2026-06-15", ends: "2026-08-31" },
];
function Page() {
  const [c, setC] = useState({ code: "", type: "percent", value: "" });
  return (
    <>
      <Head />
      <DataTable columns={[{key:"code",label:"Code"},{key:"type",label:"Type"},{key:"value",label:"Value"},{key:"status",label:"Status"},{key:"usage",label:"Usage"},{key:"starts",label:"Starts"},{key:"ends",label:"Ends"}]} rows={rows} />
      <form onSubmit={(e) => { e.preventDefault(); toast.success("Coupon created"); }} className="mt-8 grid gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-4">
        <input placeholder="Code" value={c.code} onChange={(e)=>setC({...c,code:e.target.value})} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <select value={c.type} onChange={(e)=>setC({...c,type:e.target.value})} className="rounded-md border border-border bg-background px-3 py-2 text-sm"><option value="percent">Percent</option><option value="fixed">Fixed</option></select>
        <input placeholder="Value" value={c.value} onChange={(e)=>setC({...c,value:e.target.value})} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <button className="rounded-md bg-electric px-3 py-2 text-sm font-semibold text-electric-foreground">Create</button>
      </form>
    </>
  );
}
export const Route = createFileRoute("/admin/coupons")({ component: Page });
