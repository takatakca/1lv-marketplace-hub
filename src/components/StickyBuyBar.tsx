import { Link } from "@tanstack/react-router";
import { formatCAD } from "@/lib/data";
import type { Product } from "@/lib/data";
import { useCart } from "@/hooks/use-cart";
import { toast } from "sonner";

export function StickyBuyBar({ product }: { product: Product }) {
  const { add } = useCart();
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
          onClick={() => { add(product, 1); toast.success("Added to cart"); }}
          className="rounded-md border border-electric px-3 py-2.5 text-xs font-bold text-electric"
        >
          Add to cart
        </button>
        <Link
          to="/checkout"
          onClick={() => add(product, 1)}
          className="rounded-md bg-gradient-deal px-4 py-2.5 text-xs font-bold text-white"
        >
          Buy now
        </Link>
      </div>
    </div>
  );
}
