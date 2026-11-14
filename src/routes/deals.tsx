import { createFileRoute, Link } from "@tanstack/react-router";
import { Zap, Flame, ArrowRight } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ProductGrid } from "@/components/ProductGrid";
import { SectionHead } from "@/components/ProductRail";
import { CountdownTimer } from "@/components/CountdownTimer";
import { products } from "@/lib/data";
import { CouponStrip } from "@/components/CouponStrip";

export const Route = createFileRoute("/deals")({
  component: DealsPage,
  head: () => ({
    meta: [
      { title: "Daily Deals & Flash Sales — 1LV.CA" },
      { name: "description", content: "Flash sales, daily markdowns and limited-time discounts in CAD. Free shipping over $49, 30-day returns." },
      { property: "og:title", content: "Daily Deals & Flash Sales — 1LV.CA" },
      { property: "og:description", content: "Up to 60% off daily deals from Canadian and global sellers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});


function DealsPage() {
  const discounted = products
    .filter((p) => p.compareAt && p.compareAt > p.price)
    .sort((a, b) => ((b.compareAt! - b.price) / b.compareAt!) - ((a.compareAt! - a.price) / a.compareAt!));
  const under10 = products.filter((p) => p.price < 10);
  const under25 = products.filter((p) => p.price < 25);
  const halfOff = discounted.filter((p) => (p.compareAt! - p.price) / p.compareAt! >= 0.4);

  return (
    <AppLayout>
      {/* Campaign header */}
      <section className="relative overflow-hidden bg-gradient-deal text-white">
        <div className="relative mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 py-8">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest">
              <Zap size={12} className="deal-pulse" /> Today only
            </p>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight md:text-4xl">Flash deals up to 60% off</h1>
            <p className="mt-1 text-sm text-white/85">{discounted.length} products marked down · restocked every morning</p>
          </div>
          <div className="rounded-lg bg-white/15 px-3 py-2 backdrop-blur">
            <CountdownTimer label="Ends in" />
          </div>
        </div>
      </section>

      <div className="surface-3 border-b border-border">
        <CouponStrip />
      </div>

      <section className="mx-auto max-w-7xl px-4 py-7">
        <SectionHead eyebrow="Steepest markdowns" title="🔥 40% off and over" />
        <ProductGrid products={(halfOff.length ? halfOff : discounted).slice(0, 12)} cols={6} />
      </section>

      {under10.length > 0 && (
        <section className="surface-2 border-y border-border">
          <div className="mx-auto max-w-7xl px-4 py-7">
            <SectionHead eyebrow="Impulse buys" title="💸 Everything under $10" />
            <ProductGrid products={under10} cols={6} />
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 py-7">
        <SectionHead eyebrow="Budget picks" title="🛍️ Under $25" />
        <ProductGrid products={under25} cols={6} />
      </section>

      <section className="surface-2 border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-7">
          <SectionHead eyebrow="Keep browsing" title="All discounted products" />
          <ProductGrid products={discounted} cols={6} />
          <div className="mt-6 flex justify-center">
            <Link to="/trending" className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-6 py-3 text-sm font-bold text-navy shadow-merch hover:border-electric hover:text-electric">
              <Flame size={15} /> See what's trending <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
