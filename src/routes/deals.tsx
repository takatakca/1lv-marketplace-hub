import { createFileRoute } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ProductGrid } from "@/components/ProductGrid";
import { CountdownTimer } from "@/components/CountdownTimer";
import { products } from "@/lib/data";

export const Route = createFileRoute("/deals")({
  component: DealsPage,
  head: () => ({
    meta: [
      { title: "Daily Deals — 1LV.CA" },
      { name: "description", content: "Flash sales, daily deals and limited-time discounts on top products. Free shipping over $49 CAD." },
    ],
  }),
});

function DealsPage() {
  const discounted = products
    .filter((p) => p.compareAt && p.compareAt > p.price)
    .sort((a, b) => ((b.compareAt! - b.price) / b.compareAt!) - ((a.compareAt! - a.price) / a.compareAt!));
  const under10 = products.filter((p) => p.price < 10);
  const under25 = products.filter((p) => p.price < 25);

  return (
    <AppLayout>
      <section className="bg-gradient-deal text-white">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/80">Today only</p>
              <h1 className="mt-1 flex items-center gap-2 font-display text-3xl font-extrabold">
                <Zap size={26} /> Flash Deals
              </h1>
            </div>
            <CountdownTimer label="Ends in" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <h2 className="mb-4 font-display text-xl font-extrabold text-navy">Biggest discounts right now</h2>
        <ProductGrid products={discounted.slice(0, 12)} cols={6} />
      </section>

      {under10.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-8">
          <h2 className="mb-4 font-display text-xl font-extrabold text-navy">💸 Under $10</h2>
          <ProductGrid products={under10} cols={6} />
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 py-8">
        <h2 className="mb-4 font-display text-xl font-extrabold text-navy">🛍️ Under $25</h2>
        <ProductGrid products={under25} cols={6} />
      </section>
    </AppLayout>
  );
}
