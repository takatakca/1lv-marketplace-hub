import { createFileRoute } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ProductGrid } from "@/components/ProductGrid";
import { EmptyState } from "@/components/EmptyState";
import { useWishlist } from "@/hooks/use-wishlist";
import { products } from "@/lib/data";

export const Route = createFileRoute("/wishlist")({
  component: Wishlist,
  head: () => ({ meta: [{ title: "Wishlist — 1LV.CA" }] }),
});

function Wishlist() {
  const { ids } = useWishlist();
  const items = products.filter((p) => ids.includes(p.id));
  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="font-display text-3xl font-extrabold text-navy">Wishlist</h1>
        <p className="mt-1 text-sm text-muted-foreground">{items.length} saved</p>
        <div className="mt-6">
          {items.length > 0 ? (
            <ProductGrid products={items} />
          ) : (
            <EmptyState icon={Heart} title="Nothing saved yet" description="Tap the heart on any product to save it for later." actionLabel="Browse products" to="/categories" />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
