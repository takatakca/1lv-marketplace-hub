import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import { products as demoProducts, formatCAD } from "@/lib/data";
import { listAllProducts, setProductStatus, type ProductRecord, type ProductStatus } from "@/services/products";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [items, setItems] = useState<ProductRecord[] | null>(null);
  const [loading, setLoading] = useState(!demo);

  const refresh = async () => {
    try { setItems(await listAllProducts()); } finally { setLoading(false); }
  };
  useEffect(() => { if (!demo) refresh(); }, [demo]);

  const act = async (id: string, status: ProductStatus) => {
    try { await setProductStatus(id, status); toast.success("Product " + status.replace("_", " ")); await refresh(); }
    catch (err) { toast.error((err as Error).message); }
  };

  const useDemo = demo || (items && items.length === 0);
  const rows = useDemo
    ? demoProducts.slice(0, 12).map((p, i) => ({
        id: "demo-" + i, title: p.title, vendor: p.vendorSlug, category: p.category,
        price: formatCAD(p.price), status: ["pending_review", "active", "pending_review", "rejected", "pending_review", "active"][i % 6],
      }))
    : (items ?? []).map((p) => ({
        id: p.id, title: p.title, vendor: p.vendor_id.slice(0, 8), category: p.category_slug ?? "—",
        price: formatCAD(Number(p.price)), status: p.status,
      }));

  return (
    <>
      <div className="mb-6">
        {useDemo ? <DemoBanner label={demo ? "Preview mode" : "No products yet"} /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Product moderation</h1>
      </div>
      {demo && <PreviewModeNotice />}
      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
        <DataTable
          columns={[
            { key: "title", label: "Product" },
            { key: "vendor", label: "Vendor" },
            { key: "category", label: "Category" },
            { key: "price", label: "Price" },
            { key: "status", label: "Status" },
            { key: "actions", label: "", render: (r) => (
              <div className="flex gap-2 text-xs">
                <button onClick={() => act(r.id as string, "active")} className="text-success">Approve</button>
                <button onClick={() => act(r.id as string, "rejected")} className="text-destructive">Reject</button>
                <button onClick={() => act(r.id as string, "archived")} className="text-muted-foreground">Archive</button>
              </div>
            ) },
          ]}
          rows={rows}
        />
      )}
    </>
  );
}

export const Route = createFileRoute("/admin/products")({ component: Page });
