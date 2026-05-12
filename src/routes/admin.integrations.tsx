import { createFileRoute } from "@tanstack/react-router";
import { DataTable } from "@/components/DataTable";

function Head() { return (
  <div className="mb-6"><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div><h1 className="text-2xl font-bold text-navy md:text-3xl">Integrations</h1></div>
); }

const items = [
  { name: "Stripe", status: "Setup required", desc: "Subscriptions and payouts" },
  { name: "Lovable Cloud (Supabase)", status: "Connected", desc: "Database, auth, storage" },
  { name: "SMTP / email", status: "Setup required", desc: "Transactional email" },
  { name: "AliExpress / CJDropshipping", status: "Setup required", desc: "Supplier product import APIs" },
  { name: "CSV imports", status: "Available", desc: "Bulk product upload" },
];
function Page() {
  return (
    <>
      <Head />
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((it) => (
          <div key={it.name} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between"><h3 className="font-semibold text-navy">{it.name}</h3><span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + (it.status === "Connected" ? "bg-success/10 text-success" : it.status === "Available" ? "bg-electric/10 text-electric" : "bg-deal/10 text-deal")}>{it.status}</span></div>
            <p className="mt-1 text-sm text-muted-foreground">{it.desc}</p>
            <div className="mt-3 rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">API credentials placeholder</div>
          </div>
        ))}
      </div>
      <p className="mt-6 rounded-lg border border-dashed border-deal/40 bg-deal/5 p-4 text-xs text-deal-foreground">Security: secret keys must never be stored in the frontend. Use backend secrets only.</p>
    </>
  );
}
export const Route = createFileRoute("/admin/integrations")({ component: Page });
