import { createFileRoute } from "@tanstack/react-router";

function PageHead() {
  return (
    <div className="mb-6">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div>
      <h1 className="text-2xl font-bold text-navy md:text-3xl">Vendor onboarding</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tell us about your store</p>
    </div>
  );
}

import { useState } from "react";
import { toast } from "sonner";
const fields = [
  ["store_name", "Store name"], ["business_name", "Business name"],
  ["contact_email", "Contact email"], ["phone", "Phone"],
  ["address", "Address"], ["city", "City"],
  ["province", "Province"], ["postal_code", "Postal code"],
];
function Page() {
  const [form, setForm] = useState<Record<string,string>>({});
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="max-w-3xl">
      <PageHead />
      <form onSubmit={(e) => { e.preventDefault(); toast.success("Application submitted for review"); }} className="space-y-5 rounded-xl border border-border bg-card p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map(([k, l]) => (
            <label key={k} className="block text-sm">
              <span className="mb-1 block font-medium text-navy">{l}</span>
              <input value={form[k] ?? ''} onChange={set(k)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </label>
          ))}
        </div>
        {[["store_description", "Store description"], ["shipping_policy", "Shipping policy"], ["return_policy", "Return policy"]].map(([k, l]) => (
          <label key={k} className="block text-sm">
            <span className="mb-1 block font-medium text-navy">{l}</span>
            <textarea value={form[k] ?? ''} onChange={set(k)} rows={3} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </label>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Logo upload (placeholder)</div>
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Banner upload (placeholder)</div>
        </div>
        <button type="submit" className="rounded-md bg-electric px-5 py-2.5 text-sm font-semibold text-electric-foreground">Submit application</button>
      </form>
    </div>
  );
}
export const Route = createFileRoute("/vendor/onboarding")({ component: Page });
