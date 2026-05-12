import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable } from "@/components/DataTable";
import { products, formatCAD } from "@/lib/data";
const rows = products.slice(0, 10).map((p, i) => ({
  id: "ord_" + (i + 1), order: "1LV-" + (10240 + i), customer: ["Jane D.","Marc P.","Sarah K.","Liam B.","Noor A."][i % 5],
  date: new Date(2026, 4, 11 - i).toLocaleDateString("en-CA"), total: formatCAD(p.price), fulfillment: ["Pending","Processing","Shipped","Delivered","Pending"][i % 5], payment: "Paid", tracking: i > 1 ? "1Z999AA" + i : "—",
}));
function Page() {
  return (
    <div>
      <div className="mb-6"><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div><h1 className="text-2xl font-bold text-navy md:text-3xl">Orders</h1></div>
      <DataTable columns={[
        { key:"order", label:"Order" },{ key:"customer", label:"Customer" },{ key:"date", label:"Date" },{ key:"total", label:"Total" },{ key:"fulfillment", label:"Fulfillment" },{ key:"payment", label:"Payment" },{ key:"tracking", label:"Tracking" },
        { key:"actions", label:"", render: (r) => <Link to="/vendor/orders/$id" params={{ id: r.id as string }} className="text-xs font-semibold text-electric">View</Link> },
      ]} rows={rows} />
    </div>
  );
}
export const Route = createFileRoute("/vendor/orders/")({ component: Page });
