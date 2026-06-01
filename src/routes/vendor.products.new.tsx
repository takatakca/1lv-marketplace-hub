import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getMyVendor, type VendorRecord } from "@/services/vendors";
import { createProduct } from "@/services/products";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

function Page() {
  const nav = useNavigate();
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [vendor, setVendor] = useState<VendorRecord | null>(null);
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
    inventory_quantity: 10,
    track_inventory: true,
    supplier_source: "AliExpress",
    supplier_product_id: "",
    supplier_url: "",
  });

  useEffect(() => {
    if (!user) return;
    getMyVendor(user.id).then((v) => setVendor(v)).catch(() => {});
  }, [user]);

  const upd = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.target as HTMLInputElement;
    const v = target.type === "checkbox" ? target.checked : target.type === "number" ? Number(target.value) : target.value;
    setF({ ...f, [k]: v });
  };

  const subActive = vendor?.subscription_status === "active" || vendor?.subscription_status === "trialing";
  const canPublish = vendor?.status === "active" && subActive;

  const submit = async (status: "draft" | "pending_review") => {
    if (demo) {
      toast.success(`Draft saved (demo)`);
      nav({ to: "/vendor/products" });
      return;
    }
    if (!vendor) {
      toast.error("Complete vendor onboarding first.");
      nav({ to: "/vendor/onboarding" });
      return;
    }
    if (status === "pending_review" && !canPublish) {
      toast.error("Vendor must be approved and have an active subscription to submit for review. Draft saved instead.");
      status = "draft";
    }
    setSaving(true);
    try {
      await createProduct(vendor.id, {
        title: f.title,
        description: f.description,
        short_description: f.short_description,
        category_slug: f.category_slug,
        price: f.price,
        compare_at_price: f.compare_at_price || null,
        cost: f.cost || null,
        sku: f.sku || null,
        inventory_quantity: f.inventory_quantity,
        track_inventory: f.track_inventory,
        supplier_source: f.supplier_source || null,
        supplier_product_id: f.supplier_product_id || null,
        supplier_url: f.supplier_url || null,
        status,
      });
        title: f.title,
        description: f.description,
        short_description: f.short_description,
        category_slug: f.category_slug,
        price: f.price,
        compare_at_price: f.compare_at_price || null,
        cost: f.cost || null,
        sku: f.sku || null,
        inventory_quantity: f.inventory_quantity,
        track_inventory: f.track_inventory,
        supplier_source: f.supplier_source || null,
        supplier_product_id: f.supplier_product_id || null,
        supplier_url: f.supplier_url || null,
        status,
      });
      toast.success(status === "draft" ? "Draft saved" : "Submitted for review");
      nav({ to: "/vendor/products" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        {demo ? <DemoBanner label="Preview mode" /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">New product</h1>
      </div>
      {demo && <PreviewModeNotice />}
      <form onSubmit={(e) => { e.preventDefault(); submit("draft"); }} className="space-y-5 rounded-xl border border-border bg-card p-6">
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.track_inventory} onChange={upd("track_inventory")} /> Track inventory
        </label>
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Product images upload (placeholder)</div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Supplier source"><input value={f.supplier_source} onChange={upd("supplier_source")} className={inputCls} /></Field>
          <Field label="Supplier product ID"><input value={f.supplier_product_id} onChange={upd("supplier_product_id")} className={inputCls} /></Field>
          <Field label="Supplier URL"><input value={f.supplier_url} onChange={upd("supplier_url")} className={inputCls} /></Field>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saving} className="rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50">Save draft</button>
          <button type="button" disabled={saving} onClick={() => submit("pending_review")} className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-electric-foreground disabled:opacity-50">Submit for review</button>
        </div>
      </form>
    </div>
  );
}

const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-navy">{label}</span>
      {children}
    </label>
  );
}

export const Route = createFileRoute("/vendor/products/new")({ component: Page });
