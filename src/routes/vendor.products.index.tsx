import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import { products as demoProducts, formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { getMyVendor, type VendorRecord } from "@/services/vendors";
import { listVendorProducts, setProductStatus, type ProductRecord, type ProductStatus } from "@/services/products";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

const STATUS_OPTIONS: (ProductStatus | "all")[] = ["all", "draft", "pending_review", "active", "rejected", "archived"];

function badge(s: string) {
  const m: Record<string, string> = {
    active: "bg-success/10 text-success",
    draft: "bg-muted text-muted-foreground",
    pending_review: "bg-deal/10 text-deal",
    rejected: "bg-destructive/10 text-destructive",
    archived: "bg-muted text-muted-foreground",
  };
  return <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + (m[s] || "bg-muted")}>{s.replace("_", " ")}</span>;
}

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [vendor, setVendor] = useState<VendorRecord | null>(null);
  const [items, setItems] = useState<ProductRecord[] | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  const reload = async (vId: string) => setItems(await listVendorProducts(vId));

  useEffect(() => {
    if (demo) return;
    (async () => {
      try {
        const v = await getMyVendor(user!.id);
        setVendor(v);
        if (!v) { setItems([]); return; }
        await reload(v.id);
      } finally { setLoading(false); }
    })();
  }, [demo, user]);

  const useDemo = demo || (items && items.length === 0);
  const baseRows = useDemo
    ? demoProducts.slice(0, 12).map((p, i) => ({
        id: p.id, title: p.title,
        status: (["active", "draft", "pending_review", "active", "rejected", "active"] as ProductStatus[])[i % 6],
        price: Number(p.price), stock: 5 + (i * 7) % 80, category: p.category,
      }))
    : (items ?? []).map((p) => ({
        id: p.id, title: p.title, status: p.status as ProductStatus,
        price: Number(p.price), stock: p.inventory_quantity, category: p.category_slug ?? "—",
      }));

  const categories = useMemo(() => Array.from(new Set(baseRows.map((r) => r.category))).sort(), [baseRows]);

  const rows = baseRows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
    if (query && !r.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const toggle = (id: string) => {
    const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); setSelected(next);
  };

  const subActive = vendor?.subscription_status === "active" || vendor?.subscription_status === "trialing";
  const canPublish = vendor?.status === "active" && subActive;

  const bulkSubmit = async () => {
    if (useDemo) { toast.message("Demo mode — bulk submit simulated"); return; }
    if (!canPublish) { toast.error("Vendor must be approved and subscribed to submit for review."); return; }
    setWorking(true);
    try {
      await Promise.all(Array.from(selected).map((id) => setProductStatus(id, "pending_review")));
      toast.success(`Submitted ${selected.size} product(s) for review`);
      setSelected(new Set());
      if (vendor) await reload(vendor.id);
    } catch (err) { toast.error((err as Error).message); }
    finally { setWorking(false); }
  };

  const bulkArchive = async () => {
    if (useDemo) { toast.message("Demo mode — bulk archive simulated"); return; }
    setWorking(true);
    try {
      await Promise.all(Array.from(selected).map((id) => setProductStatus(id, "archived")));
      toast.success(`Archived ${selected.size} product(s)`);
      setSelected(new Set());
      if (vendor) await reload(vendor.id);
    } catch (err) { toast.error((err as Error).message); }
    finally { setWorking(false); }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          {useDemo ? <DemoBanner label={demo ? "Preview mode" : "No products yet"} /> : null}
          <h1 className="text-2xl font-bold text-navy md:text-3xl">Products</h1>
        </div>
        <Link to="/vendor/products/new" className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-electric-foreground">New product</Link>
      </div>
      {demo && <PreviewModeNotice />}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          placeholder="Search title…" value={query} onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[200px] rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProductStatus | "all")}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span className="font-semibold">{selected.size} selected</span>
          <button onClick={bulkSubmit} disabled={working} className="rounded-md bg-electric px-3 py-1.5 text-xs font-semibold text-electric-foreground disabled:opacity-50">Submit for review</button>
          <button onClick={bulkArchive} disabled={working} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold">Archive</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground">Clear</button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: "select", label: "", render: (r) => (
              <input type="checkbox" checked={selected.has(r.id as string)} onChange={() => toggle(r.id as string)} />
            ) },
            { key: "title", label: "Product" },
            { key: "status", label: "Status", render: (r) => badge(r.status as string) },
            { key: "price", label: "Price", render: (r) => formatCAD(Number(r.price)) },
            { key: "stock", label: "Stock" },
            { key: "category", label: "Category" },
            { key: "actions", label: "", render: (r) => (
              <Link to="/vendor/products/$id/edit" params={{ id: r.id as string }} className="text-xs font-semibold text-electric">Edit</Link>
            ) },
          ]}
          rows={rows}
        />
      )}
    </div>
  );
}

export const Route = createFileRoute("/vendor/products/")({ component: Page });
