import { createFileRoute } from "@tanstack/react-router";
import { DataTable } from "@/components/DataTable";

function Head() { return (
  <div className="mb-6"><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div><h1 className="text-2xl font-bold text-navy md:text-3xl">Marketplace settings</h1></div>
); }

import { useState } from "react";
import { toast } from "sonner";
function Page() {
  const [s, setS] = useState({ name: "1LV.CA", currency: "CAD", tax: "GST/HST per province (placeholder)", shipping: "Canada Post + courier rates (placeholder)", support: "support@1lv.ca", vendorApproval: true, productApproval: true });
  return (
    <form onSubmit={(e)=>{e.preventDefault();toast.success("Settings saved");}} className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-6">
      <Head />
      {[["name","Marketplace name"],["currency","Currency"],["tax","Tax"],["shipping","Shipping"],["support","Support email"]].map(([k,l]) => (
        <label key={k} className="block text-sm"><span className="mb-1 block font-medium text-navy">{l}</span><input value={(s as any)[k]} onChange={(e)=>setS({...s,[k]:e.target.value})} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
      ))}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.vendorApproval} onChange={(e)=>setS({...s,vendorApproval:e.target.checked})} /> Require vendor approval</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.productApproval} onChange={(e)=>setS({...s,productApproval:e.target.checked})} /> Require product approval</label>
      <button className="rounded-md bg-electric px-5 py-2 text-sm font-semibold text-electric-foreground">Save settings</button>
    </form>
  );
}
export const Route = createFileRoute("/admin/settings")({ component: Page });
