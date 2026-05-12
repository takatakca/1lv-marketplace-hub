import { createFileRoute } from "@tanstack/react-router";
import { DataTable } from "@/components/DataTable";

function Head() { return (
  <div className="mb-6"><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div><h1 className="text-2xl font-bold text-navy md:text-3xl">Product moderation</h1></div>
); }

import { products, formatCAD } from "@/lib/data";
const rows = products.slice(0, 12).map((p, i) => ({ title: p.title, vendor: p.vendorSlug, category: p.category, price: formatCAD(p.price), status: ["Pending","Active","Pending","Rejected","Pending","Active"][i % 6], submitted: new Date(2026, 4, 10 - i).toLocaleDateString("en-CA") }));
function Page() {
  return <><Head /><DataTable columns={[{key:"title",label:"Product"},{key:"vendor",label:"Vendor"},{key:"category",label:"Category"},{key:"price",label:"Price"},{key:"status",label:"Status"},{key:"submitted",label:"Submitted"},{key:"actions",label:"",render:()=>(<div className="flex gap-2 text-xs"><span className="text-success">Approve</span><span className="text-destructive">Reject</span><span className="text-muted-foreground">Edit</span></div>)}]} rows={rows} /></>;
}
export const Route = createFileRoute("/admin/products")({ component: Page });
