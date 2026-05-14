import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getProduct, updateProduct, setProductStatus } from "@/services/products";
import { isDemoMode } from "@/lib/demo-mode";
import { useAuth } from "@/hooks/use-auth";
import { DemoBanner } from "@/components/DemoBanner";

function Page() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    title: "",
    description: "",
    short_description: "",
    category_slug: "electronics",
    price: 0,
    compare_at_price: 0,
    cost: 0,
    sku: "",
    inventory_quantity: 0,
    track_inventory: true,
    supplier_source: "",
    supplier_product_id: "",
    supplier_url: "",
  });

  useEffect(() => {
    if (demo) { setLoading(false); return; }
    getProduct(id)
      .then((p) => {
        if (p) {
          setF({
            title: p.title,
            description: p.description ?? "",
            short_description: p.short_description ?? "",
            category_slug: p.category_slug ?? "",
            price: Number(p.price),
            compare_at_price: Number(p.compare_at_price ?? 0),
            cost: Number(p.cost ?? 0),
            sku: p.sku ?? "",
            inventory_quantity: p.inventory_quantity,
            track_inventory: p.track_inventory,
            supplier_source: p.supplier_source ?? "",
            supplier_product_id: p.supplier_product_id ?? "",
            supplier_url: p.supplier_url ?? "",
          });
        }
      })
      .finally(() => setLoading(false));
  }, [id, demo]);

  const upd = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.target as HTMLInputElement;
    const v = target.type === "checkbox" ? target.checked : target.type === "number" ? Number(target.value) : target.value;
    setF({ ...f, [k]: v });
  };

  const save = async () => {
    if (demo) { toast.success("Saved (demo)"); nav({ to: "/vendor/products" }); return; }
    setSaving(true);
    try {
      await updateProduct(id, {
        ...f,
        compare_at_price: f.compare_at_price || null,
        cost: f.cost || null,
      });
      toast.success("Product updated");
      nav({ to: "/vendor/products" });
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const archive = async () => {
    if (demo) { toast.message("Archived (demo)"); return; }
    try { await setProductStatus(id, "archived"); toast.success("Archived"); nav({ to: "/vendor/products" }); }
    catch (err) { toast.error((err as Error).message); }
  };

  const submitReview = async () => {
    if (demo) { toast.success("Submitted (demo)"); return; }
    try { await setProductStatus(id, "pending_review"); toast.success("Submitted for review"); }
    catch (err) { toast.error((err as Error).message); }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        {demo ? <DemoBanner label="Preview mode" /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Edit product</h1>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-5 rounded-xl border border-border bg-card p-6">
        <Field label="Title"><input value={f.title} onChange={upd("title")} required className={inputCls} /></Field>
        <Field label="Short description"><input value={f.short_description} onChange={upd("short_description")} className={inputCls} /></Field>
        <Field label="Description"><textarea rows={4} value={f.description} onChange={upd("description")} className={inputCls} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Category"><input value={f.category_slug} onChange={upd("category_slug")} className={inputCls} /></Field>
          <Field label="Price"><input type="number" step="0.01" value={f.price} onChange={upd("price")} className={inputCls} /></Field>
          <Field label="Compare at"><input type="number" step="0.01" value={f.compare_at_price} onChange={upd("compare_at_price")} className={inputCls} /></Field>
          <Field label="Cost"><input type="number" step="0.01" value={f.cost} onChange={upd("cost")} className={inputCls} /></Field>
          <Field label="SKU"><input value={f.sku} onChange={upd("sku")} className={inputCls} /></Field>
          <Field label="Inventory"><input type="number" value={f.inventory_quantity} onChange={upd("inventory_quantity")} className={inputCls} /></Field>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saving} className="rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50">Save</button>
          <button type="button" onClick={submitReview} className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-electric-foreground">Submit for review</button>
          <button type="button" onClick={archive} className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm font-semibold text-destructive">Archive</button>
        </div>
      </form>
    </div>
  );
}

const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-navy">{label}</span>{children}</label>;
}

export const Route = createFileRoute("/vendor/products/$id/edit")({ component: Page });
