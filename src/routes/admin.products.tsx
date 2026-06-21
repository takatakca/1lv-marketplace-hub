import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import { products as demoProducts, formatCAD } from "@/lib/data";
import {
  listAllProducts,
  setProductStatus,
  type ProductRecord,
  type ProductStatus,
} from "@/services/products";
import { listAllVendors, type VendorRecord } from "@/services/vendors";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

const STATUSES = ["all", "draft", "pending_review", "active", "rejected", "archived"] as const;

function badge(text: string, tone: "success" | "deal" | "muted" | "destructive") {
  const map = {
    success: "bg-success/10 text-success",
    deal: "bg-deal/10 text-deal",
    destructive: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[tone]}`}>{text}</span>;
}

const statusTone = (s: string) =>
  s === "active" ? "success" : s === "pending_review" ? "deal" : s === "rejected" ? "destructive" : "muted";

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [items, setItems] = useState<ProductRecord[] | null>(null);
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [category, setCategory] = useState("all");

  const refresh = async () => {
    try {
      const [p, v] = await Promise.all([listAllProducts(), listAllVendors().catch(() => [])]);
      setItems(p);
      setVendors(v);
    } finally { setLoading(false); }
  };
  useEffect(() => { if (!demo) refresh(); }, [demo]);

  const act = async (id: string, s: ProductStatus) => {
    try { await setProductStatus(id, s); toast.success("Product " + s.replace("_", " ")); await refresh(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const vendorById = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);

  const useDemo = demo || (items && items.length === 0);
  const source: ProductRecord[] = useDemo
    ? demoProducts.slice(0, 12).map((p, i) => ({
        id: "demo-" + i, vendor_id: p.vendorSlug, slug: p.slug, title: p.title,
        description: null, short_description: null, category_slug: p.category,
        price: p.price, compare_at_price: null, cost: null, sku: null,
        inventory_quantity: 10, track_inventory: false, images: [],
        supplier_source: null, supplier_product_id: null, supplier_url: null,
        status: (["pending_review", "active", "pending_review", "rejected", "pending_review", "active"][i % 6]) as ProductStatus,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }))
    : items ?? [];

  const categories = useMemo(
    () => Array.from(new Set(source.map((p) => p.category_slug).filter(Boolean) as string[])),
    [source],
  );

  const filtered = source.filter((p) => {
    if (status !== "all" && p.status !== status) return false;
    if (vendorFilter !== "all" && p.vendor_id !== vendorFilter) return false;
    if (category !== "all" && p.category_slug !== category) return false;
    if (q.trim() && !p.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const rows = filtered.map((p) => {
    const v = vendorById.get(p.vendor_id);
    const vendorWarn = v && (v.status !== "active" || v.subscription_status === "past_due");
    return {
      id: p.id,
      title: (
        <div>
          <div className="font-medium text-navy">{p.title}</div>
          <div className="text-xs text-muted-foreground">{p.category_slug ?? "—"}</div>
        </div>
      ),
      vendor: (
        <div className="text-xs">
          <div className="font-medium text-navy">{v?.store_name ?? p.vendor_id.slice(0, 8)}</div>
          {vendorWarn && <div className="text-deal">vendor {v?.status} / {v?.subscription_status}</div>}
        </div>
      ),
      price: formatCAD(Number(p.price)),
      status: badge(p.status, statusTone(p.status)),
      preview: (
        <Link to="/product/$slug" params={{ slug: p.slug }} className="text-xs text-electric hover:underline">View</Link>
      ),
      actions: (
        <div className="flex gap-2 text-xs">
          <button onClick={() => act(p.id, "active")} className="text-success">Approve</button>
          <button onClick={() => act(p.id, "rejected")} className="text-destructive">Reject</button>
          <button onClick={() => act(p.id, "archived")} className="text-muted-foreground">Archive</button>
        </div>
      ),
    };
  });

  return (
    <>
      <div className="mb-6">
        {useDemo ? <DemoBanner label={demo ? "Preview mode" : "No products yet"} /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Product moderation</h1>
        <p className="text-sm text-muted-foreground">Approve, reject and archive vendor submissions. Cost, SKU and supplier fields stay private.</p>
      </div>
      {demo && <PreviewModeNotice />}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product title"
          className="min-w-[220px] rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <select value={status} onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          {STATUSES.map((s) => <option key={s} value={s}>Status: {s}</option>)}
        </select>
        <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          <option value="all">All vendors</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.store_name}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} of {source.length}</span>
      </div>

      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
        <DataTable
          columns={[
            { key: "title", label: "Product" },
            { key: "vendor", label: "Vendor" },
            { key: "price", label: "Price" },
            { key: "status", label: "Status" },
            { key: "preview", label: "Preview" },
            { key: "actions", label: "" },
          ]}
          rows={rows}
        />
      )}
    </>
  );
}

export const Route = createFileRoute("/admin/products")({ component: Page });
