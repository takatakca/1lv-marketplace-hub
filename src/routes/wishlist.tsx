import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ProductGrid } from "@/components/ProductGrid";
import { EmptyState } from "@/components/EmptyState";
import { useWishlist } from "@/hooks/use-wishlist";
import { usePublicCatalog } from "@/hooks/use-public-catalog";
import { useAuth } from "@/hooks/use-auth";
import { listMySavedProducts } from "@/services/saved-lists";

export const Route = createFileRoute("/wishlist")({
  component: Wishlist,
  head: () => ({ meta: [{ title: "Wishlist — 1LV.CA" }] }),
});

function Wishlist() {
  const { user } = useAuth();
  const { ids } = useWishlist();
  const { products } = usePublicCatalog();

  const savedProducts = useQuery({
    queryKey: ["saved-products", user?.id ?? "guest"],
    queryFn: () => listMySavedProducts(null, 500),
    enabled: Boolean(user),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const items = user
    ? (savedProducts.data ?? [])
    : products.filter((product) => ids.includes(product.id));

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="font-display text-3xl font-extrabold text-navy">
          Wishlist
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length} saved
        </p>
        <div className="mt-6">
          {user && savedProducts.isPending ? (
            <div className="py-10 text-sm text-muted-foreground">
              Loading your saved products…
            </div>
          ) : items.length > 0 ? (
            <ProductGrid products={items} />
          ) : (
            <EmptyState
              icon={Heart}
              title="Nothing saved yet"
              description="Tap the heart on any product to save it for later."
              actionLabel="Browse products"
              to="/categories"
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
