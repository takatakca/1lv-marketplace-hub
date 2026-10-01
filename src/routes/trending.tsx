import { createFileRoute, Link } from "@tanstack/react-router";
import { TrendingUp, Flame } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ProductGrid } from "@/components/ProductGrid";
import { SectionHead } from "@/components/ProductRail";
import { categories } from "@/lib/data";
import { usePublicCatalog } from "@/hooks/use-public-catalog";

export const Route = createFileRoute("/trending")({
  component: TrendingPage,
  head: () => ({
    meta: [
      { title: "Trending Now — Best Sellers on 1LV.CA" },
      { name: "description", content: "Products ranked by recorded paid marketplace unit sales on 1LV.CA." },
      { property: "og:title", content: "Trending Marketplace Products — 1LV.CA" },
      { property: "og:description", content: "Live marketplace products ranked from recorded paid unit sales." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function TrendingPage() {
  const { products } = usePublicCatalog();
  const trending = [...products].sort((a, b) => b.sold - a.sold);
  const top = trending.slice(0, 12);
  const rising = [...products]
    .sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
    )
    .slice(0, 6);
  const hotCategories = categories
    .map((c) => ({ c, sold: products.filter((p) => p.category === c.slug).reduce((s, p) => s + p.sold, 0) }))
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 6);

  return (
    <AppLayout>
      <section className="bg-gradient-hero text-white">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">Live marketplace data</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            <TrendingUp size={26} /> Trending on 1LV.CA
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/80">
            Ranked from recorded paid unit sales across active marketplace products.
          </p>
        </div>
      </section>

      {/* Hot categories */}
      <section className="surface-3 border-b border-border">
        <div className="scrollbar-hide mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3">
          {hotCategories.map(({ c, sold }) => (
            <Link
              key={c.slug}
              to="/category/$slug"
              params={{ slug: c.slug }}
              className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-navy shadow-merch hover:border-electric hover:text-electric"
            >
              <span>{c.emoji}</span> {c.name}
              <span className="text-[10px] font-bold text-deal">{sold.toLocaleString()} sold</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-7">
        <SectionHead eyebrow="Top 12" title="Most ordered products" />
        <ProductGrid products={top} cols={6} ranked />
      </section>

      <section className="surface-2 border-y border-border">
        <div className="mx-auto max-w-7xl px-4 py-7">
          <SectionHead eyebrow="Recently published" title="🔥 Rising fast" />
          <ProductGrid products={rising} cols={6} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-7">
        <SectionHead eyebrow="Full ranking" title="Everything trending" >
          <span className="hidden items-center gap-1 rounded-full bg-deal/10 px-2 py-1 text-[11px] font-bold text-deal sm:inline-flex">
            <Flame size={12} /> {trending.length} products
          </span>
        </SectionHead>
        <ProductGrid products={trending} cols={6} />
      </section>
    </AppLayout>
  );
}
