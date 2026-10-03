import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Zap, Flame, ArrowRight } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ProductGrid } from "@/components/ProductGrid";
import { SectionHead } from "@/components/ProductRail";
import { CountdownTimer } from "@/components/CountdownTimer";
import { usePublicCatalog } from "@/hooks/use-public-catalog";
import { CouponStrip } from "@/components/CouponStrip";
import { searchPublicCatalogProducts } from "@/services/public-catalog";

export const Route = createFileRoute("/deals")({
  component: DealsPage,
  head: () => ({
    meta: [
      { title: "Daily Deals & Flash Sales — 1LV.CA" },
      { name: "description", content: "Browse active marketplace markdowns and verified promotions in CAD on 1LV.CA." },
      { property: "og:title", content: "Daily Deals & Marketplace Savings — 1LV.CA" },
      { property: "og:description", content: "Current product markdowns from active 1LV.CA marketplace sellers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});


function DealsPage() {
  const { products, demo, loading: catalogLoading } = usePublicCatalog();

  const liveDealsQuery = useQuery({
    queryKey: ["public-marketplace-deals", "markdowns"],
    queryFn: () =>
      searchPublicCatalogProducts({
        saleOnly: true,
        sort: "relevance",
        limit: 500,
      }),
    enabled: !demo && !catalogLoading,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const liveBudgetQuery = useQuery({
    queryKey: ["public-marketplace-deals", "under-25"],
    queryFn: () =>
      searchPublicCatalogProducts({
        maxPrice: 24.99,
        sort: "price-asc",
        limit: 500,
      }),
    enabled: !demo && !catalogLoading,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const discounted = [
    ...(demo
      ? products.filter((p) => p.compareAt && p.compareAt > p.price)
      : liveDealsQuery.data ?? []),
  ].sort(
    (a, b) =>
      ((b.compareAt! - b.price) / b.compareAt!) -
      ((a.compareAt! - a.price) / a.compareAt!),
  );

  const maxDiscount = discounted.reduce((max, product) => {
    const compareAt = product.compareAt ?? product.price;
    if (compareAt <= product.price) return max;
    return Math.max(
      max,
      Math.round(((compareAt - product.price) / compareAt) * 100),
    );
  }, 0);

  const budgetProducts = demo
    ? products.filter((p) => p.price < 25)
    : liveBudgetQuery.data ?? [];
  const under10 = budgetProducts.filter((p) => p.price < 10);
  const under25 = budgetProducts;
  const halfOff = discounted.filter(
    (p) => (p.compareAt! - p.price) / p.compareAt! >= 0.4,
  );
  const loading =
    catalogLoading ||
    (!demo && (liveDealsQuery.isPending || liveBudgetQuery.isPending));
  const loadError =
    !demo &&
    (liveDealsQuery.error instanceof Error ||
      liveBudgetQuery.error instanceof Error);

  return (
    <AppLayout>
      {loading && (
        <div className="border-b border-border bg-card px-4 py-3 text-center text-sm text-muted-foreground">
          Loading live marketplace deals…
        </div>
      )}
      {loadError && !loading && (
        <div className="border-b border-destructive/30 bg-card px-4 py-3 text-center text-sm text-destructive">
          Live deal data could not be loaded. Please try again.
        </div>
      )}

      {/* Campaign header */}
      <section className="relative overflow-hidden bg-gradient-deal text-white">
        <div className="relative mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 py-8">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest">
              <Zap size={12} className="deal-pulse" /> {demo ? "Preview event" : "Current markdowns"}
            </p>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight md:text-4xl">
              {maxDiscount > 0 ? `Current deals up to ${maxDiscount}% off` : "Current marketplace deals"}
            </h1>
            <p className="mt-1 text-sm text-white/85">
              {discounted.length} active markdown{discounted.length === 1 ? "" : "s"} in the live catalog
            </p>
          </div>
          {demo && (
            <div className="rounded-lg bg-white/15 px-3 py-2 backdrop-blur">
              <CountdownTimer label="Preview ends in" />
            </div>
          )}
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
