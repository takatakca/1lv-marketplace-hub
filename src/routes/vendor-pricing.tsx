import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { VENDOR_PLANS } from "@/lib/vendor-plans";

export const Route = createFileRoute("/vendor-pricing")({
  component: VendorPricing,
  head: () => ({ meta: [{ title: "Vendor pricing — 1LV.CA" }] }),
});

function VendorPricing() {
  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-16">
        <div className="text-center">
          <h1 className="font-display text-4xl font-extrabold text-navy">Simple, fair pricing.</h1>
          <p className="mt-2 text-muted-foreground">CAD monthly pricing with transparent marketplace commissions.</p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {VENDOR_PLANS.map((plan) => {
            const featured = plan.key === "growth";
            return (
              <div
                key={plan.key}
                className={`relative flex flex-col rounded-2xl border bg-card p-6 ${featured ? "border-electric shadow-elevated" : "border-border"}`}
              >
                {featured && (
                  <span className="absolute -top-3 left-6 rounded-full bg-electric px-3 py-1 text-[10px] font-bold uppercase text-electric-foreground">
                    Recommended
                  </span>
                )}
                <h3 className="font-display text-xl font-extrabold text-navy">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
                <p className="mt-4 text-3xl font-extrabold text-navy">
                  {plan.monthlyCad === 0 ? "Free" : `$${plan.monthlyCad}`}
                  {plan.monthlyCad > 0 && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
                </p>
                <ul className="mt-5 space-y-2 text-sm">
                  <li className="flex items-center gap-2 text-navy">
                    <Check size={16} className="text-success" /> {plan.productLimitLabel}
                  </li>
                  <li className="flex items-center gap-2 text-navy">
                    <Check size={16} className="text-success" /> {plan.commissionLabel} marketplace commission
                  </li>
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-navy">
                      <Check size={16} className="text-success" /> {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/signup"
                  className={`mt-6 rounded-md px-4 py-2.5 text-center text-sm font-bold ${featured ? "bg-electric text-electric-foreground" : "bg-navy text-navy-foreground"} hover:opacity-90`}
                >
                  Get started
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
