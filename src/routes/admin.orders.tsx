import { createFileRoute } from "@tanstack/react-router";
import { DataTable } from "@/components/DataTable";

function Head() { return (
  <div className="mb-6"><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div><h1 className="text-2xl font-bold text-navy md:text-3xl">All orders</h1></div>
); }

import { products, formatCAD } from "@/lib/data";
const rows = products.slice(0, 12).map((p, i) => ({ order: "1LV-" + (10100 + i), customer: ["Jane","Marc","Sarah","Liam","Noor","Ava"][i % 6], vendors: p.vendorSlug, total: formatCAD(p.price), payment: "Paid", fulfillment: ["Pending","Shipped","Delivered","Processing"][i % 4], date: new Date(2026, 4, 10 - i).toLocaleDateString("en-CA") }));
function Page() {
  return <><Head /><DataTable columns={[{key:"order",label:"Order"},{key:"customer",label:"Customer"},{key:"vendors",label:"Vendor(s)"},{key:"total",label:"Total"},{key:"payment",label:"Payment"},{key:"fulfillment",label:"Fulfillment"},{key:"date",label:"Date"},{key:"actions",label:"",render:()=>(<span className="text-xs font-semibold text-electric">View</span>)}]} rows={rows} /></>;
}
export const Route = createFileRoute("/admin/orders")({ component: Page });
