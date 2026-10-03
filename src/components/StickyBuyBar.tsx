import { Link } from "@tanstack/react-router";
import { formatCAD } from "@/lib/data";
import type { Product } from "@/lib/data";
import { useCart } from "@/hooks/use-cart";
import { toast } from "sonner";

type StickyVariantIdentity = {
  id: string;
  sku?: string;
  price: number;
  compareAt?: number | null;
  image?: string;
};

export function StickyBuyBar({
  product,
  quantity = 1,
  variant,
  variantIdentity,
  unavailable = false,
}: {
  product: Product;
  quantity?: number;
  variant?: Record<string, string>;
  variantIdentity?: StickyVariantIdentity;
  unavailable?: boolean;
}) {
  const { add } = useCart();
  const soldOut =
    unavailable ||
    (!variantIdentity &&
      product.trackInventory &&
      typeof product.inventoryQuantity === "number" &&
      product.inventoryQuantity <= 0);
  const price = variantIdentity?.price ?? product.price;
  const compareAt = variantIdentity?.compareAt ?? product.compareAt;
  const cartIdentity = variantIdentity
    ? {
        id: variantIdentity.id,
        sku: variantIdentity.sku,
        price: variantIdentity.price,
        image: variantIdentity.image,
      }
    : undefined;

  return (
    <div className="fixed inset-x-0 bottom-12 z-30 border-t border-border bg-white/95 p-2 shadow-elevated backdrop-blur md:hidden">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold text-deal">{formatCAD(price)}</div>
          {compareAt && compareAt > price && (
            <div className="text-[10px] text-muted-foreground line-through">
              {formatCAD(compareAt)}
            </div>
          )}
          {variantIdentity?.sku && (
            <div className="truncate text-[9px] text-muted-foreground">
              SKU {variantIdentity.sku}
            </div>
          )}
        </div>
        <button
          disabled={soldOut}
          onClick={() => {
            if (soldOut) return;
            add(product, quantity, variant, cartIdentity);
            toast.success("Added to cart");
          }}
          className="rounded-md border border-electric px-3 py-2.5 text-xs font-bold text-electric disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
        >
          {soldOut ? "Unavailable" : "Add to cart"}
        </button>
        {soldOut ? (
          <button
            type="button"
            disabled
            className="rounded-md bg-muted px-4 py-2.5 text-xs font-bold text-muted-foreground"
          >
            Unavailable
          </button>
        ) : (
          <Link
            to="/checkout"
            onClick={() => add(product, quantity, variant, cartIdentity)}
            className="rounded-md bg-gradient-deal px-4 py-2.5 text-xs font-bold text-white"
          >
            Buy now
          </Link>
        )}
      </div>
    </div>
  );
}
