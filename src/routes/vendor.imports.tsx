import { createFileRoute } from "@tanstack/react-router";

function PageHead() {
  return (
    <div className="mb-6">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div>
      <h1 className="text-2xl font-bold text-navy md:text-3xl">Product imports</h1>
      <p className="mt-1 text-sm text-muted-foreground">Bring in supplier catalogues</p>
    </div>
  );
}

import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { toast } from "sonner";
const history = [
  { date: "2026-05-10", source: "AliExpress", count: 12, status: "Completed" },
  { date: "2026-05-04", source: "CSV", count: 48, status: "Completed" },
  { date: "2026-04-22", source: "CJDropshipping", count: 6, status: "Failed" },
];
function Page() {
  const [src, setSrc] = useState({ source: "AliExpress", url: "", productId: "" });
  return (
    <div>
      <PageHead />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Drop CSV file here</p>
          <p className="mt-1 text-xs text-muted-foreground">CSV upload placeholder</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); toast.success("Import queued (demo)"); }} className="space-y-3 rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-navy">Manual supplier import</h3>
          <select value={src.source} onChange={(e) => setSrc({ ...src, source: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
            <option>AliExpress</option><option>CJDropshipping</option><option>Spocket</option>
          </select>
          <input placeholder="Supplier URL" value={src.url} onChange={(e) => setSrc({ ...src, url: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <input placeholder="Supplier product ID" value={src.productId} onChange={(e) => setSrc({ ...src, productId: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <button className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-electric-foreground">Preview import</button>
        </form>
      </div>
      <div className="mt-8">
        <h3 className="mb-3 text-lg font-bold text-navy">Import history</h3>
        <DataTable columns={[{key:"date",label:"Date"},{key:"source",label:"Source"},{key:"count",label:"Items"},{key:"status",label:"Status"}]} rows={history} />
      </div>
      <p className="mt-6 rounded-lg border border-dashed border-deal/40 bg-deal/5 p-4 text-xs text-deal-foreground">Supplier API credentials will be stored securely in backend secrets — never in the frontend.</p>
    </div>
  );
}
export const Route = createFileRoute("/vendor/imports")({ component: Page });
