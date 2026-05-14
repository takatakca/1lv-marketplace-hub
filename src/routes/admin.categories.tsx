import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { categories as demoCategories } from "@/lib/data";
import { listCategoriesAdmin, upsertCategory } from "@/services/admin";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

type CatRow = { slug: string; name_en: string; name_fr: string | null; active: boolean };

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [rows, setRows] = useState<CatRow[] | null>(null);
  const [form, setForm] = useState({ en: "", fr: "", slug: "", parent: "" });

  const refresh = async () => {
    const data = await listCategoriesAdmin();
    setRows(data.map((d) => ({ slug: d.slug, name_en: d.name_en, name_fr: d.name_fr, active: d.active })));
  };
  useEffect(() => { if (!demo) refresh().catch(() => setRows([])); }, [demo]);

  const useDemo = demo || (rows && rows.length === 0);
  const display: CatRow[] = useDemo
    ? demoCategories.map((c) => ({ slug: c.slug, name_en: c.name, name_fr: null, active: true }))
    : rows!;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (demo) { toast.success("Saved (demo)"); return; }
    if (!form.en || !form.slug) { toast.error("Slug and English name required"); return; }
    try {
      await upsertCategory({
        slug: form.slug, name_en: form.en, name_fr: form.fr || null,
        parent_slug: form.parent || null, active: true,
      });
      toast.success("Category saved");
      setForm({ en: "", fr: "", slug: "", parent: "" });
      refresh();
    } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <>
      <div className="mb-6">
        {useDemo ? <DemoBanner label={demo ? "Preview mode" : "No categories yet"} /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Categories</h1>
      </div>
      {demo && <PreviewModeNotice />}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-4 py-3">EN</th><th className="px-4 py-3">FR</th><th className="px-4 py-3">Slug</th><th className="px-4 py-3">Active</th></tr>
            </thead>
            <tbody>
              {display.map((c) => (
                <tr key={c.slug} className="border-t border-border">
                  <td className="px-4 py-3">{c.name_en}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.name_fr ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{c.slug}</td>
                  <td className="px-4 py-3">{c.active ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-navy">Add / edit category</h3>
          <input placeholder="English name" value={form.en} onChange={(e) => setForm({ ...form, en: e.target.value })} className={inputCls} />
          <input placeholder="Nom français" value={form.fr} onChange={(e) => setForm({ ...form, fr: e.target.value })} className={inputCls} />
          <input placeholder="slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className={inputCls} />
          <input placeholder="Parent slug (optional)" value={form.parent} onChange={(e) => setForm({ ...form, parent: e.target.value })} className={inputCls} />
          <button className="w-full rounded-md bg-electric px-3 py-2 text-sm font-semibold text-electric-foreground">Save category</button>
        </form>
      </div>
    </>
  );
}

const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
export const Route = createFileRoute("/admin/categories")({ component: Page });
