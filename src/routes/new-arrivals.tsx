import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ProductGrid } from "@/components/ProductGrid";
import { products, productsByTag } from "@/lib/data";

export const Route = createFileRoute("/new-arrivals")({
  component: NewArrivalsPage,
  head: () => ({
    meta: [
      { title: "New arrivals — 1LV.CA" },
      { name: "description", content: "Just landed: fresh products from Canadian and global vendors on 1LV.CA." },
    ],
  }),
});

function NewArrivalsPage() {
  const fresh = productsByTag("new");
  const rest = products.filter((p) => !fresh.includes(p)).slice(0, 18);
  return (
    <AppLayout>
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <p className="text-xs font-bold uppercase tracking-widest text-electric">Fresh drops</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-3xl font-extrabold">
            <Sparkles size={26} /> New arrivals
          </h1>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-8">
        <h2 className="mb-4 font-display text-xl font-extrabold text-navy">Just landed</h2>
        <ProductGrid products={fresh} cols={6} />
      </section>
      <section className="mx-auto max-w-7xl px-4 py-8">
        <h2 className="mb-4 font-display text-xl font-extrabold text-navy">More to discover</h2>
        <ProductGrid products={rest} cols={6} />
      </section>
    </AppLayout>
  );
}
