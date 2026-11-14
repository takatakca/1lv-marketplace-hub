import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BadgePercent, Clock3, Store, Truck, Zap } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { FREE_SHIPPING_THRESHOLD_CAD } from "@/lib/canada-commerce";
import {
  describePromotion,
  listPublicPromotions,
  type PublicPromotion,
} from "@/services/promotions";

export const Route = createFileRoute("/coupons")({
  component: SavingsPage,
  head: () => ({
    meta: [
      { title: "Savings & promotions — 1LV.CA" },
      {
        name: "description",
        content:
          "Verified active promotions and current ways to save on 1LV.CA.",
      },
    ],
  }),
});

const OFFERS = [
  {
    title: `Free Canadian shipping from $${FREE_SHIPPING_THRESHOLD_CAD}`,
    detail:
      "Eligible merchandise unlocks standard Canadian shipping at the current marketplace threshold.",
    action: "View shipping terms",
    to: "/shipping" as const,
    icon: Truck,
  },
  {
    title: "Flash deals",
    detail: "Limited-time markdowns across selected marketplace products.",
    action: "Shop flash deals",
    to: "/deals" as const,
    icon: Zap,
  },
  {
    title: "Canadian sellers",
    detail:
      "Browse products offered by Canadian marketplace merchants and local storefronts.",
    action: "Browse Canadian sellers",
    to: "/search" as const,
    icon: Store,
  },
];

function SavingsPage() {
  const [promotions, setPromotions] = useState<PublicPromotion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void listPublicPromotions().then((rows) => {
      if (!active) return;
      setPromotions(rows);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppLayout>
      <section className="bg-gradient-deal text-white">
        <div className="mx-auto max-w-7xl px-4 py-9">
          <p className="text-xs font-bold uppercase tracking-widest text-white/80">
            Savings center
          </p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-3xl font-extrabold">
            <BadgePercent size={27} /> Verified promotions
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/85">
            Codes shown here come from the live promotion system. Final
            eligibility and savings are recalculated securely when you place the
            order.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-electric">
                Live codes
              </p>
              <h2 className="text-2xl font-extrabold text-navy">
                Active marketplace promotions
              </h2>
            </div>
            <Clock3 size={18} className="text-muted-foreground" />
          </div>

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((key) => (
                <div
                  key={key}
                  className="h-40 animate-pulse rounded-xl border border-border bg-muted/50"
                />
              ))}
            </div>
          ) : promotions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
              No public promotion codes are active right now. Flash markdowns
              and the marketplace shipping threshold remain available where
              eligible.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {promotions.map((promotion) => (
                <article
                  key={promotion.id}
                  className="rounded-xl border border-electric/20 bg-card p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-md bg-electric/10 px-2 py-1 font-mono text-sm font-black tracking-wider text-electric">
                      {promotion.code}
                    </span>
                    <BadgePercent size={18} className="text-electric" />
                  </div>
                  <h3 className="mt-4 text-lg font-extrabold text-navy">
                    {promotion.name}
                  </h3>
                  <p className="mt-1 font-semibold text-success">
                    {describePromotion(promotion)}
                  </p>
                  {promotion.description && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {promotion.description}
                    </p>
                  )}
                  <div className="mt-4 space-y-1 text-[11px] text-muted-foreground">
                    {Number(promotion.min_order) > 0 && (
                      <p>
                        Minimum order: $
                        {Number(promotion.min_order).toFixed(2)} CAD
                      </p>
                    )}
                    {promotion.first_order_only && <p>First paid order only</p>}
                    {promotion.ends_at && (
                      <p>
                        Ends{" "}
                        {new Date(promotion.ends_at).toLocaleDateString(
                          "en-CA",
                        )}
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {OFFERS.map((offer) => {
            const Icon = offer.icon;
            return (
              <article
                key={offer.title}
                className="rounded-xl border border-border bg-card p-5 shadow-sm"
              >
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-electric/10 text-electric">
                  <Icon size={19} />
                </span>
                <h2 className="mt-4 text-lg font-extrabold text-navy">
                  {offer.title}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {offer.detail}
                </p>
                <Link
                  to={offer.to}
                  className="mt-4 inline-flex text-sm font-bold text-electric hover:underline"
                >
                  {offer.action} →
                </Link>
              </article>
            );
          })}
        </div>

        <div className="mt-8 rounded-xl border border-border bg-muted/40 p-5 text-sm">
          <p className="font-semibold text-navy">Promotion integrity</p>
          <p className="mt-1 text-muted-foreground">
            Dates, minimums, usage limits, first-order rules and product or
            merchant eligibility are enforced by the checkout transaction. The
            browser never decides the payable discount.
          </p>
        </div>
      </section>
    </AppLayout>
  );
}
