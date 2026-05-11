import type { Product } from "@/lib/data";
import { ProductCard } from "./ProductCard";

export function ProductGrid({ products, cols = 5 }: { products: Product[]; cols?: 4 | 5 | 6 }) {
  const colClass =
    cols === 6
      ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      : cols === 4
      ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
      : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
  return (
    <div className={`grid gap-3 sm:gap-4 ${colClass}`}>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
