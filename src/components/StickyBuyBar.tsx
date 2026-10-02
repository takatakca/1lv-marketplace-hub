import { Link } from "@tanstack/react-router";
import { formatCAD } from "@/lib/data";
import type { Product } from "@/lib/data";
import { useCart } from "@/hooks/use-cart";
import { toast } from "sonner";

export function StickyBuyBar({
  product,
  quantity = 1,
  variant,
}: {
  product: Product;
  quantity?: number;
  variant?: Record<string, string>;
}) {
  const { add } = useCart();
  const soldOut =
    product.trackInventory &&
    typeof product.inventoryQuantity === "number" &&
    product.inventoryQuantity <= 0;
  return (
    <div className="fixed inset-x-0 bottom-12 z-30 border-t border-border bg-white/95 p-2 shadow-elevated backdrop-blur md:hidden">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold text-deal">{formatCAD(product.price)}</div>
          {product.compareAt && (
            <div className="text-[10px] text-muted-foreground line-through">{formatCAD(product.compareAt)}</div>
          )}
        </div>
        <button
          disabled={soldOut}
          onClick={() => {
            if (soldOut) return;
            add(product, quantity, variant);
            toast.success("Added to cart");
          }}
          className="rounded-md border border-electric px-3 py-2.5 text-xs font-bold text-electric disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
        >
          {soldOut ? "Sold out" : "Add to cart"}
        </button>
        {soldOut ? (
          <button
            type="button"
            disabled
            className="rounded-md bg-muted px-4 py-2.5 text-xs font-bold text-muted-foreground"
          >
            Sold out
          </button>
        ) : (
          <Link
            to="/checkout"
            onClick={() => add(product, quantity, variant)}
            className="rounded-md bg-gradient-deal px-4 py-2.5 text-xs font-bold text-white"
          >
            Buy now
          </Link>
        )}
      </div>
    </div>
  );
}
