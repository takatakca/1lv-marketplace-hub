import { createFileRoute } from "@tanstack/react-router";
import { Crown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getMyVendor } from "@/services/vendors";
import { createVendorSubscriptionCheckout } from "@/lib/stripe.functions";
import { VENDOR_PLANS, type VendorPlanKey } from "@/lib/vendor-plans";

function PageHead() {
  return (
    <div className="mb-6">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">
        Subscription
      </div>
      <h1 className="text-2xl font-bold text-navy md:text-3xl">Choose your plan</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Billed monthly via Stripe in CAD. Marketplace commission is defined by the selected plan.
      </p>
    </div>
  );
}

function Page() {
  const { user } = useAuth();
  const { success, cancelled } = Route.useSearch();
  const [loading, setLoading] = useState<string | null>(null);

  const upgrade = async (plan: VendorPlanKey) => {
    if (!user) {
      toast.error("Please sign in first.");
      return;
    }
    setLoading(plan);
    try {
      const vendor = await getMyVendor(user.id);
      if (!vendor) {
        toast.error("Complete vendor onboarding first.");
        return;
      }
      const res = await createVendorSubscriptionCheckout({
        data: { vendorId: vendor.id, plan },
      });
      if (res.pending || !res.url) {
        toast.message("Subscription checkout unavailable", {
          description:
            res.reason ?? "Billing will activate once Stripe is connected.",
        });
        return;
      }
      window.location.href = res.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start checkout");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      <PageHead />
      {success ? (
        <div className="mb-4 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
          Subscription started. It may take a moment to appear here while Stripe confirms.
        </div>
      ) : null}
      {cancelled ? (
        <div className="mb-4 rounded-lg border border-deal/30 bg-deal/5 p-3 text-sm text-deal">
          Checkout cancelled. You can pick a plan again below.
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        {VENDOR_PLANS.map((plan) => (
          <div key={plan.key} className="rounded-xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-center gap-2 text-electric">
              <Crown size={18} />
              <span className="text-xs font-semibold uppercase">{plan.name}</span>
            </div>
            <div className="mt-3 text-3xl font-bold text-navy">
              {plan.monthlyCad === 0 ? "Free" : `$${plan.monthlyCad}`}
              <span className="text-sm font-normal text-muted-foreground">/mo</span>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>• {plan.productLimitLabel}</li>
              <li>• {plan.commissionLabel} commission</li>
              {plan.features.map((feature) => <li key={feature}>• {feature}</li>)}
            </ul>
            <button
              onClick={() => upgrade(plan.key)}
              disabled={loading === plan.key}
              className="mt-5 w-full rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading === plan.key ? "Starting…" : plan.monthlyCad === 0 ? "Select" : "Upgrade"}
            </button>
          </div>
        ))}
      </div>
      <p className="mt-6 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        Stripe live keys and matching Price IDs are required before a paid plan can activate.
      </p>
    </div>
  );
}

export const Route = createFileRoute("/vendor/subscription")({
  component: Page,
  validateSearch: (search: Record<string, unknown>) => ({
    success: search.success === "1" || search.success === 1 ? 1 : 0,
    cancelled: search.cancelled === "1" || search.cancelled === 1 ? 1 : 0,
  }),
});
