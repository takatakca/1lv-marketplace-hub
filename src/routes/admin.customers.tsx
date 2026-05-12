import { createFileRoute } from "@tanstack/react-router";
import { DataTable } from "@/components/DataTable";

function Head() { return (
  <div className="mb-6"><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div><h1 className="text-2xl font-bold text-navy md:text-3xl">Customers</h1></div>
); }

const rows = Array.from({ length: 10 }).map((_, i) => ({ name: ["Jane Doe","Marc Pelletier","Sarah Kim","Liam Brown","Noor Ahmadi","Ava Singh","Eli Cohen","Maya Patel","Owen Wu","Sofia Rossi"][i], email: "user" + (i+1) + "@example.ca", orders: 1 + i * 2, spend: "$" + (120 + i * 85).toFixed(2), signup: new Date(2025, 11 - i, 4).toLocaleDateString("en-CA"), status: i === 9 ? "Suspended" : "Active" }));
function Page() {
  return <><Head /><DataTable columns={[{key:"name",label:"Name"},{key:"email",label:"Email"},{key:"orders",label:"Orders"},{key:"spend",label:"Lifetime spend"},{key:"signup",label:"Joined"},{key:"status",label:"Status"}]} rows={rows} /></>;
}
export const Route = createFileRoute("/admin/customers")({ component: Page });
