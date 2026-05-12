import { createFileRoute } from "@tanstack/react-router";

function PageHead() {
  return (
    <div className="mb-6">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div>
      <h1 className="text-2xl font-bold text-navy md:text-3xl">Subscription</h1>
      <p className="mt-1 text-sm text-muted-foreground">Choose the plan that fits your store</p>
    </div>
  );
}

import { Crown } from "lucide-react";
import { toast } from "sonner";
const plans = [
  { name: "Starter", price: 0, limit: "10 products", commission: "12%", features: ["Basic analytics", "Email support"] },
  { name: "Growth", price: 39, limit: "200 products", commission: "9%", features: ["Advanced analytics", "Priority support", "CSV imports"], current: true },
  { name: "Scale", price: 119, limit: "Unlimited", commission: "6%", features: ["All Growth features", "Dedicated CSM", "API access"] },
];
function Page() {
  return (
    <div>
      <PageHead />
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <div key={p.name} className={"rounded-xl border bg-card p-6 shadow-card " + (p.current ? "border-electric ring-2 ring-electric/30" : "border-border")}>
            <div className="flex items-center gap-2 text-electric"><Crown size={18} /><span className="text-xs font-semibold uppercase">{p.name}</span></div>
            <div className="mt-3 text-3xl font-bold text-navy">{p.price === 0 ? "Free" : "$" + p.price}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>• {p.limit}</li><li>• {p.commission} commission</li>
              {p.features.map((f) => <li key={f}>• {f}</li>)}
            </ul>
            <button onClick={() => toast.message("Stripe setup required", { description: "Payments will activate once Stripe is connected." })} className="mt-5 w-full rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white">{p.current ? "Current plan" : "Upgrade"}</button>
          </div>
        ))}
      </div>
      <p className="mt-6 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">Stripe setup required — billing is not active in this preview.</p>
    </div>
  );
}
export const Route = createFileRoute("/vendor/subscription")({ component: Page });
