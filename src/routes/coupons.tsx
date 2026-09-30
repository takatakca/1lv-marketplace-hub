import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgePercent, Clock3, Store, Truck, Zap } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { FREE_SHIPPING_THRESHOLD_CAD } from "@/lib/canada-commerce";

export const Route = createFileRoute("/coupons")({
  component: SavingsPage,
  head: () => ({
    meta: [
      { title: "Savings & promotions — 1LV.CA" },
      {
        name: "description",
        content: "Current ways to save on 1LV.CA, including flash deals, Canadian sellers and eligible free shipping.",
      },
    ],
  }),
});

const OFFERS = [
  {
    title: `Free Canadian shipping from $${FREE_SHIPPING_THRESHOLD_CAD}`,
    detail: "Eligible merchandise unlocks standard Canadian shipping at the current marketplace threshold.",
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
    detail: "Browse products offered by Canadian marketplace merchants and local storefronts.",
    action: "Browse Canadian sellers",
    to: "/search" as const,
    icon: Store,
  },
  {
    title: "New promotions",
    detail: "Server-validated promotional offers will appear here when they are active and eligible for checkout.",
    action: "Browse new arrivals",
    to: "/new-arrivals" as const,
    icon: Clock3,
  },
];

function SavingsPage() {
  return (
    <AppLayout>
      <section className="bg-gradient-deal text-white">
        <div className="mx-auto max-w-7xl px-4 py-9">
          <p className="text-xs font-bold uppercase tracking-widest text-white/80">Savings center</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-3xl font-extrabold">
            <BadgePercent size={27} /> Current ways to save
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/85">
            1LV.CA only presents discount codes as active when they can be validated by the checkout system. Use the
            live marketplace offers below in the meantime.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 sm:grid-cols-2">
          {OFFERS.map((offer) => {
            const Icon = offer.icon;
            return (
              <article key={offer.title} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-electric/10 text-electric">
                  <Icon size={19} />
                </span>
                <h2 className="mt-4 text-lg font-extrabold text-navy">{offer.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{offer.detail}</p>
                <Link to={offer.to} className="mt-4 inline-flex text-sm font-bold text-electric hover:underline">
                  {offer.action} →
                </Link>
              </article>
            );
          })}
        </div>

        <div className="mt-8 rounded-xl border border-border bg-muted/40 p-5 text-sm">
          <p className="font-semibold text-navy">Promotion integrity</p>
          <p className="mt-1 text-muted-foreground">
            Promotional eligibility, minimum order values, usage limits, merchant scope and validity windows must be
            confirmed by the checkout system before a discount changes the amount payable.
          </p>
        </div>
      </section>
    </AppLayout>
  );
}
