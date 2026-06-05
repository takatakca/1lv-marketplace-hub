import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ProductGrid } from "@/components/ProductGrid";
import { products } from "@/lib/data";

export const Route = createFileRoute("/trending")({
  component: TrendingPage,
  head: () => ({
    meta: [
      { title: "Trending now — 1LV.CA" },
      { name: "description", content: "What Canadian shoppers are loving right now. Best-selling and trending products updated daily." },
    ],
  }),
});

function TrendingPage() {
  const trending = [...products].sort((a, b) => b.sold - a.sold);
  return (
    <AppLayout>
      <section className="bg-gradient-hero text-white">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <p className="text-xs font-bold uppercase tracking-widest text-white/70">What's hot</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-3xl font-extrabold">
            <TrendingUp size={26} /> Trending now
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/80">Top sellers across the marketplace, ranked by units sold this week.</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-8">
        <ProductGrid products={trending} cols={6} />
      </section>
    </AppLayout>
  );
}
