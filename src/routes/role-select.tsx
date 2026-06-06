import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShoppingBag, Store } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";

export const Route = createFileRoute("/role-select")({
  component: RoleSelect,
  head: () => ({ meta: [{ title: "Choose your account type — 1LV.CA" }] }),
});

function RoleSelect() {
  const nav = useNavigate();
  return (
    <AuthShell
      title="How will you use 1LV.CA?"
      subtitle="You can always change this later — many members do both."
    >
      <div className="grid gap-3">
        <button
          onClick={() => nav({ to: "/account" })}
          className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 text-left transition hover:border-electric hover:shadow-card"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-electric/10 text-electric">
            <ShoppingBag size={22} />
          </span>
          <span className="flex-1">
            <span className="block text-base font-bold text-navy">Shop as a customer</span>
            <span className="block text-xs text-muted-foreground">
              Browse millions of products, save wishlists, track orders, and earn coupons.
            </span>
          </span>
          <span className="self-center text-electric opacity-0 transition group-hover:opacity-100">→</span>
        </button>

        <button
          onClick={() => nav({ to: "/vendor/onboarding" })}
          className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 text-left transition hover:border-deal hover:shadow-card"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-deal/10 text-deal">
            <Store size={22} />
          </span>
          <span className="flex-1">
            <span className="block text-base font-bold text-navy">Sell as a vendor</span>
            <span className="block text-xs text-muted-foreground">
              Open a store, upload products, and reach Canadian shoppers. Onboarding takes ~5 min.
            </span>
          </span>
          <span className="self-center text-deal opacity-0 transition group-hover:opacity-100">→</span>
        </button>
      </div>
    </AuthShell>
  );
}
