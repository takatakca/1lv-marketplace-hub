import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { products } from "@/lib/data";
import { ProductGrid } from "./ProductGrid";

export function RecentlyViewed({ excludeId }: { excludeId?: string }) {
  const { ids } = useRecentlyViewed();
  const items = ids
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p && p.id !== excludeId)
    .slice(0, 6);
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <h2 className="mb-4 font-display text-xl font-extrabold text-navy">Recently viewed</h2>
      <ProductGrid products={items} cols={6} />
    </section>
  );
}
