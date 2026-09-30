import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgePercent, Store, Truck, Zap } from "lucide-react";
import { FREE_SHIPPING_THRESHOLD_CAD } from "@/lib/canada-commerce";

const SAVINGS = [
  {
    label: "Free Canadian shipping",
    detail: `Eligible orders $${FREE_SHIPPING_THRESHOLD_CAD}+`,
    to: "/shipping" as const,
    icon: Truck,
  },
  {
    label: "Flash deals",
    detail: "Limited-time markdowns",
    to: "/deals" as const,
    icon: Zap,
  },
  {
    label: "Canadian sellers",
    detail: "Shop local marketplace stores",
    to: "/search" as const,
    icon: Store,
  },
  {
    label: "Savings center",
    detail: "See current promotions",
    to: "/coupons" as const,
    icon: BadgePercent,
  },
];

export function CouponStrip() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-4" aria-label="Ways to save">
      <div className="scrollbar-hide flex gap-2 overflow-x-auto">
        {SAVINGS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.to}
              className="group flex min-w-[220px] items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition hover:-translate-y-0.5 hover:border-electric/40 hover:shadow-merch"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-electric/10 text-electric">
                <Icon size={16} />
              </span>
              <div className="min-w-0 flex-1 text-xs">
                <div className="font-bold text-navy">{item.label}</div>
                <div className="text-[11px] text-muted-foreground">{item.detail}</div>
              </div>
              <ArrowRight size={14} className="text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-electric" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
