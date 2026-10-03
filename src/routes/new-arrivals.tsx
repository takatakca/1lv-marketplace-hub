import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ProductGrid } from "@/components/ProductGrid";
import { usePublicCatalog } from "@/hooks/use-public-catalog";
import { searchPublicCatalogProducts } from "@/services/public-catalog";

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
  const { products, demo, loading: catalogLoading } = usePublicCatalog();
  const liveNewestQuery = useQuery({
    queryKey: ["public-marketplace-new-arrivals"],
    queryFn: () =>
      searchPublicCatalogProducts({
        sort: "newest",
        limit: 500,
      }),
    enabled: !demo && !catalogLoading,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const ordered = demo
    ? [...products].sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime(),
      )
    : liveNewestQuery.data ?? [];
  const fresh = ordered.filter((p) => p.tags.includes("new"));
  const featured = fresh.length > 0 ? fresh : ordered.slice(0, 12);
  const featuredIds = new Set(featured.map((product) => product.id));
  const rest = ordered
    .filter((p) => !featuredIds.has(p.id))
    .slice(0, 18);
  const loading =
    catalogLoading || (!demo && liveNewestQuery.isPending);
  const loadError =
    !demo && liveNewestQuery.error instanceof Error;

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
        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Loading new arrivals…
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-destructive/30 bg-card p-8 text-center text-sm text-destructive">
            New arrivals could not be loaded. Please try again.
          </div>
        ) : (
          <ProductGrid products={featured} cols={6} />
        )}
      </section>
      <section className="mx-auto max-w-7xl px-4 py-8">
        <h2 className="mb-4 font-display text-xl font-extrabold text-navy">More to discover</h2>
        <ProductGrid products={rest} cols={6} />
      </section>
    </AppLayout>
  );
}
