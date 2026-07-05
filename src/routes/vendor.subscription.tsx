import { createFileRoute } from "@tanstack/react-router";
import { Crown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getMyVendor } from "@/services/vendors";
import { createVendorSubscriptionCheckout } from "@/lib/stripe.functions";

const plans = [
  { key: "starter", name: "Starter", price: 0, limit: "10 products", commission: "12%", features: ["Basic analytics", "Email support"] },
  { key: "growth", name: "Growth", price: 39, limit: "200 products", commission: "9%", features: ["Advanced analytics", "Priority support", "CSV imports"] },
  { key: "scale", name: "Scale", price: 119, limit: "Unlimited", commission: "6%", features: ["All Growth features", "Dedicated CSM", "API access"] },
] as const;

function PageHead() {
  return (
    <div className="mb-6">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Subscription</div>
      <h1 className="text-2xl font-bold text-navy md:text-3xl">Choose your plan</h1>
      <p className="mt-1 text-sm text-muted-foreground">Billed monthly via Stripe. Cancel anytime.</p>
    </div>
  );
}

function Page() {
  const { user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  const upgrade = async (plan: "starter" | "growth" | "scale") => {
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
        data: { vendorId: vendor.id, plan, returnOrigin: window.location.origin },
      });
      if (res.pending || !res.url) {
        toast.message("Stripe setup required", {
          description: res.reason ?? "Billing will activate once Stripe is connected.",
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
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <div key={p.key} className="rounded-xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-center gap-2 text-electric"><Crown size={18} /><span className="text-xs font-semibold uppercase">{p.name}</span></div>
            <div className="mt-3 text-3xl font-bold text-navy">{p.price === 0 ? "Free" : "$" + p.price}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>• {p.limit}</li><li>• {p.commission} commission</li>
              {p.features.map((f) => <li key={f}>• {f}</li>)}
            </ul>
            <button
              onClick={() => upgrade(p.key)}
              disabled={loading === p.key}
              className="mt-5 w-full rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading === p.key ? "Starting…" : p.price === 0 ? "Select" : "Upgrade"}
            </button>
          </div>
        ))}
      </div>
      <p className="mt-6 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        Stripe live keys required to complete checkout. Until keys are configured, upgrading shows a setup notice.
      </p>
    </div>
  );
}
export const Route = createFileRoute("/vendor/subscription")({
  component: Page,
  validateSearch: (s: Record<string, unknown>) => ({
    success: s.success === "1" || s.success === 1 ? 1 : 0,
    cancelled: s.cancelled === "1" || s.cancelled === 1 ? 1 : 0,
  }),
});
