import { createFileRoute } from "@tanstack/react-router";
import { DataTable } from "@/components/DataTable";

function Head() { return (
  <div className="mb-6"><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div><h1 className="text-2xl font-bold text-navy md:text-3xl">Categories</h1></div>
); }

import { categories } from "@/lib/data";
import { useState } from "react";
import { toast } from "sonner";
function Page() {
  const [form, setForm] = useState({ en: "", fr: "", slug: "", parent: "" });
  return (
    <>
      <Head />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">EN</th><th className="px-4 py-3">FR</th><th className="px-4 py-3">Slug</th><th className="px-4 py-3">Active</th></tr></thead>
            <tbody>{categories.map((c) => (<tr key={c.slug} className="border-t border-border"><td className="px-4 py-3">{c.name}</td><td className="px-4 py-3 text-muted-foreground">—</td><td className="px-4 py-3 font-mono text-xs">{c.slug}</td><td className="px-4 py-3"><input type="checkbox" defaultChecked /></td></tr>))}</tbody>
          </table>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); toast.success("Category saved"); }} className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-navy">Add / edit category</h3>
          <input placeholder="English name" value={form.en} onChange={(e)=>setForm({...form,en:e.target.value})} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <input placeholder="Nom français" value={form.fr} onChange={(e)=>setForm({...form,fr:e.target.value})} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <input placeholder="slug" value={form.slug} onChange={(e)=>setForm({...form,slug:e.target.value})} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <input placeholder="Parent slug (optional)" value={form.parent} onChange={(e)=>setForm({...form,parent:e.target.value})} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <button className="w-full rounded-md bg-electric px-3 py-2 text-sm font-semibold text-electric-foreground">Save category</button>
        </form>
      </div>
    </>
  );
}
export const Route = createFileRoute("/admin/categories")({ component: Page });
