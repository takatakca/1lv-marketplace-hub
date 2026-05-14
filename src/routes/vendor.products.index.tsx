import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { products as demoProducts, formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { getMyVendor } from "@/services/vendors";
import { listVendorProducts, type ProductRecord } from "@/services/products";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

const STATUSES = ["active", "draft", "pending_review", "active", "rejected", "active"];

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
  const [items, setItems] = useState<ProductRecord[] | null>(null);
  const [loading, setLoading] = useState(!demo);

  useEffect(() => {
    if (demo) return;
    (async () => {
      try {
        const v = await getMyVendor(user!.id);
        if (!v) { setItems([]); return; }
        setItems(await listVendorProducts(v.id));
      } finally { setLoading(false); }
    })();
  }, [demo, user]);

  const useDemo = demo || (items && items.length === 0);
  const rows = useDemo
    ? demoProducts.slice(0, 12).map((p, i) => ({
        id: p.id, title: p.title, status: STATUSES[i % STATUSES.length],
        price: formatCAD(p.price), stock: 5 + (i * 7) % 80, category: p.category,
      }))
    : (items ?? []).map((p) => ({
        id: p.id, title: p.title, status: p.status,
        price: formatCAD(Number(p.price)), stock: p.inventory_quantity, category: p.category_slug ?? "—",
      }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          {useDemo ? <DemoBanner label={demo ? "Preview mode" : "No products yet"} /> : null}
          <h1 className="text-2xl font-bold text-navy md:text-3xl">Products</h1>
        </div>
        <Link to="/vendor/products/new" className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-electric-foreground">New product</Link>
      </div>
      {demo && <PreviewModeNotice />}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: "title", label: "Product" },
            { key: "status", label: "Status", render: (r) => badge(r.status as string) },
            { key: "price", label: "Price" },
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
