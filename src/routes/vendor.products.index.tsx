import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable } from "@/components/DataTable";
import { products, formatCAD } from "@/lib/data";
const STATUSES = ["active", "draft", "pending_review", "active", "rejected", "active"];
const rows = products.slice(0, 12).map((p, i) => ({
  id: p.id, slug: p.slug, title: p.title, status: STATUSES[i % STATUSES.length],
  price: formatCAD(p.price), stock: 5 + (i * 7) % 80, category: p.category,
}));
const badge = (s: string) => {
  const m: Record<string,string> = { active: "bg-success/10 text-success", draft: "bg-muted text-muted-foreground", pending_review: "bg-deal/10 text-deal", rejected: "bg-destructive/10 text-destructive" };
  return <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + (m[s] || "bg-muted")}>{s.replace("_"," ")}</span>;
};
function Page() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div>
          <h1 className="text-2xl font-bold text-navy md:text-3xl">Products</h1>
        </div>
        <Link to="/vendor/products/new" className="rounded-md bg-electric px-4 py-2 text-sm font-semibold text-electric-foreground">New product</Link>
      </div>
      <DataTable
        columns={[
          { key: "title", label: "Product" },
          { key: "status", label: "Status", render: (r) => badge(r.status as string) },
          { key: "price", label: "Price" },
          { key: "stock", label: "Stock" },
          { key: "category", label: "Category" },
          { key: "actions", label: "", render: (r) => (<div className="flex gap-2 text-xs"><Link to="/vendor/products/$id/edit" params={{ id: r.id as string }} className="text-electric">Edit</Link><span className="text-muted-foreground">Duplicate</span><span className="text-muted-foreground">Submit</span></div>) },
        ]}
        rows={rows}
      />
    </div>
  );
}
export const Route = createFileRoute("/vendor/products/")({ component: Page });
