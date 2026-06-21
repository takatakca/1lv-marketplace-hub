import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { categories as demoCategories } from "@/lib/data";
import { listCategoriesAdmin, upsertCategory, deleteCategory } from "@/services/admin";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

type CatRow = {
  slug: string;
  name_en: string;
  name_fr: string | null;
  parent_slug: string | null;
  active: boolean;
  position: number;
};

const empty = { en: "", fr: "", slug: "", parent: "", position: 0, active: true, seoTitle: "", seoDesc: "", image: "" };

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [rows, setRows] = useState<CatRow[] | null>(null);
  const [form, setForm] = useState(empty);

  const refresh = async () => {
    const data = await listCategoriesAdmin();
    setRows(
      data.map((d) => ({
        slug: d.slug, name_en: d.name_en, name_fr: d.name_fr,
        parent_slug: d.parent_slug, active: d.active, position: d.position,
      })),
    );
  };
  useEffect(() => { if (!demo) refresh().catch(() => setRows([])); }, [demo]);

  const useDemo = demo || (rows && rows.length === 0);
  const display: CatRow[] = useDemo
    ? demoCategories.map((c, i) => ({
        slug: c.slug, name_en: c.name, name_fr: null, parent_slug: null, active: true, position: i,
      }))
    : rows!;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.en || !form.slug) { toast.error("Slug and English name required"); return; }
    if (demo) { toast.success("Saved (demo)"); return; }
    try {
      await upsertCategory({
        slug: form.slug, name_en: form.en, name_fr: form.fr || null,
        parent_slug: form.parent || null, active: form.active, position: Number(form.position) || 0,
      });
      toast.success("Category saved");
      setForm(empty);
      refresh();
    } catch (err) { toast.error((err as Error).message); }
  };

  const edit = (c: CatRow) => setForm({
    en: c.name_en, fr: c.name_fr ?? "", slug: c.slug,
    parent: c.parent_slug ?? "", position: c.position, active: c.active,
    seoTitle: "", seoDesc: "", image: "",
  });

  const remove = async (slug: string) => {
    if (demo) { toast.success("Removed (demo)"); return; }
    if (!confirm(`Delete category "${slug}"?`)) return;
    try { await deleteCategory(slug); toast.success("Deleted"); refresh(); }
    catch (err) { toast.error((err as Error).message); }
  };

  return (
    <>
      <div className="mb-6">
        {useDemo ? <DemoBanner label={demo ? "Preview mode" : "No categories yet"} /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Categories</h1>
        <p className="text-sm text-muted-foreground">Bilingual taxonomy with SEO and ordering.</p>
      </div>
      {demo && <PreviewModeNotice />}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">EN</th>
                <th className="px-4 py-3">FR</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Parent</th>
                <th className="px-4 py-3">Sort</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {display.map((c) => (
                <tr key={c.slug} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-navy">{c.name_en}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.name_fr ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{c.slug}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{c.parent_slug ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{c.position}</td>
                  <td className="px-4 py-3">{c.active ? "✓" : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => edit(c)} className="mr-3 text-xs text-electric">Edit</button>
                    <button onClick={() => remove(c.slug)} className="text-xs text-destructive">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-navy">Add / edit category</h3>
          <input placeholder="English name" value={form.en} onChange={(e) => setForm({ ...form, en: e.target.value })} className={inputCls} />
          <input placeholder="Nom français" value={form.fr} onChange={(e) => setForm({ ...form, fr: e.target.value })} className={inputCls} />
          <input placeholder="slug (kebab-case)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className={inputCls} />
          <input placeholder="Parent slug (optional)" value={form.parent} onChange={(e) => setForm({ ...form, parent: e.target.value })} className={inputCls} />
          <input type="number" placeholder="Sort order" value={form.position} onChange={(e) => setForm({ ...form, position: Number(e.target.value) })} className={inputCls} />
          <label className="flex items-center gap-2 text-xs text-navy">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
          </label>
          <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
            SEO &amp; image placeholders
          </div>
          <input placeholder="SEO title" value={form.seoTitle} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} className={inputCls} />
          <input placeholder="SEO meta description" value={form.seoDesc} onChange={(e) => setForm({ ...form, seoDesc: e.target.value })} className={inputCls} />
          <input placeholder="Category image URL" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} className={inputCls} />
          <button className="w-full rounded-md bg-electric px-3 py-2 text-sm font-semibold text-electric-foreground">Save category</button>
        </form>
      </div>
    </>
  );
}

const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
export const Route = createFileRoute("/admin/categories")({ component: Page });
