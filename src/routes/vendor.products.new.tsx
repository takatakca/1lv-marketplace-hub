import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

function Page() {
  const existing = null;
  const nav = useNavigate();
  const [f, setF] = useState({
    title: existing?.title ?? "", description: existing?.description ?? "", short: "",
    category: existing?.category ?? "electronics", price: existing?.price ?? 0, compareAt: existing?.compareAt ?? 0,
    cost: 0, sku: "", qty: 10, track: true, supplierSource: "AliExpress", supplierId: "", supplierUrl: "",
  });
  const upd = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div>
        <h1 className="text-2xl font-bold text-navy md:text-3xl">New product</h1>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); toast.success("Draft saved"); nav({ to: "/vendor/products" }); }} className="space-y-5 rounded-xl border border-border bg-card p-6">
        <label className="block text-sm"><span className="mb-1 block font-medium text-navy">Title</span><input value={f.title} onChange={upd("title")} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-navy">Short description</span><input value={f.short} onChange={upd("short")} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium text-navy">Description</span><textarea rows={4} value={f.description} onChange={upd("description")} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm"><span className="mb-1 block font-medium text-navy">Category</span><input value={f.category} onChange={upd("category")} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium text-navy">Price</span><input type="number" value={f.price} onChange={upd("price")} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium text-navy">Compare at</span><input type="number" value={f.compareAt} onChange={upd("compareAt")} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium text-navy">Cost</span><input type="number" value={f.cost} onChange={upd("cost")} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium text-navy">SKU</span><input value={f.sku} onChange={upd("sku")} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium text-navy">Inventory</span><input type="number" value={f.qty} onChange={upd("qty")} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.track} onChange={upd("track")} /> Track inventory</label>
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Product images upload (placeholder)</div>
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <h3 className="mb-2 font-semibold text-navy">Variants & options</h3>
          <p className="text-xs text-muted-foreground">Add size, color or material variants (placeholder).</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm"><span className="mb-1 block font-medium text-navy">Supplier source</span><input value={f.supplierSource} onChange={upd("supplierSource")} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium text-navy">Supplier product ID</span><input value={f.supplierId} onChange={upd("supplierId")} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium text-navy">Supplier URL</span><input value={f.supplierUrl} onChange={upd("supplierUrl")} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /></label>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-navy">Save draft</button>
          <button type="button" onClick={() => toast.success("Submitted for review")} className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-electric-foreground">Submit for review</button>
          
        </div>
      </form>
    </div>
  );
}
export const Route = createFileRoute("/vendor/products/new")({ component: Page });
