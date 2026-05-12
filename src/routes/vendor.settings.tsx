import { createFileRoute } from "@tanstack/react-router";

function PageHead() {
  return (
    <div className="mb-6">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div>
      <h1 className="text-2xl font-bold text-navy md:text-3xl">Store settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Configure your storefront</p>
    </div>
  );
}

import { useState } from "react";
import { toast } from "sonner";
function Page() {
  const [form, setForm] = useState({ store: "Northstar Tech", email: "owner@northstar.ca", phone: "+1 514 555 0199", address: "123 Rue Sherbrooke, Montréal, QC", shipping: "Ships within 2 business days, Canada Post.", returns: "30-day returns on unopened items." });
  return (
    <div className="max-w-3xl">
      <PageHead />
      <form onSubmit={(e) => { e.preventDefault(); toast.success("Settings saved"); }} className="space-y-5 rounded-xl border border-border bg-card p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Logo placeholder</div>
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Banner placeholder</div>
        </div>
        {Object.entries(form).map(([k, v]) => (
          <label key={k} className="block text-sm">
            <span className="mb-1 block font-medium capitalize text-navy">{k.replace("_", " ")}</span>
            {k === "shipping" || k === "returns" ? (
              <textarea rows={3} value={v} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            ) : (
              <input value={v} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            )}
          </label>
        ))}
        <button type="submit" className="rounded-md bg-electric px-5 py-2.5 text-sm font-semibold text-electric-foreground">Save settings</button>
      </form>
    </div>
  );
}
export const Route = createFileRoute("/vendor/settings")({ component: Page });
