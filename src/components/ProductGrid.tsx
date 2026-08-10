import type { Product } from "@/lib/data";
import { ProductCard } from "./ProductCard";

export function ProductGrid({
  products,
  cols = 5,
  ranked = false,
}: {
  products: Product[];
  cols?: 4 | 5 | 6;
  ranked?: boolean;
}) {
  const colClass =
    cols === 6
      ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      : cols === 4
      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
      : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
  return (
    <div className={`grid gap-2.5 sm:gap-3.5 ${colClass}`}>
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} rank={ranked ? i + 1 : undefined} />
      ))}
    </div>
  );
}
