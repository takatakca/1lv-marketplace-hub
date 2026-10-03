import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { usePublicCatalog } from "@/hooks/use-public-catalog";
import { ProductRail, SectionHead } from "./ProductRail";

export function RecentlyViewed({ excludeId }: { excludeId?: string }) {
  const { ids } = useRecentlyViewed();
  const { products } = usePublicCatalog();
  const items = ids
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p && p.id !== excludeId)
    .slice(0, 6);
  if (items.length === 0) return null;
  return (
    <section className="surface-2 border-y border-border">
      <div className="mx-auto max-w-7xl px-4 py-7">
        <SectionHead eyebrow="Pick up where you left off" title="Recently viewed" />
        <ProductRail products={items} />
      </div>
    </section>

  );
}
