import { Link } from "@tanstack/react-router";
import { Heart, ShoppingCart, Flame, Check } from "lucide-react";
import type { Product } from "@/lib/data";
import { vendors, formatCAD } from "@/lib/data";
import { RatingStars } from "./RatingStars";
import { ProductImage } from "./ProductImage";
import { useWishlist } from "@/hooks/use-wishlist";
import { useCart } from "@/hooks/use-cart";
import { toast } from "sonner";

export function ProductCard({ product, rank }: { product: Product; rank?: number }) {
  const fallbackVendor = vendors.find((vendor) => vendor.slug === product.vendorSlug);
  const vendorName = product.vendorName ?? fallbackVendor?.name;
  const vendorCountry = product.vendorCountry ?? fallbackVendor?.country;
  const { toggle, has } = useWishlist();
  const { add } = useCart();
  const wished = has(product.id);
  const off =
    product.compareAt && product.compareAt > product.price
      ? Math.round(((product.compareAt - product.price) / product.compareAt) * 100)
      : 0;
  const savings =
    product.compareAt && product.compareAt > product.price
      ? product.compareAt - product.price
      : 0;
  const lowStock =
    product.trackInventory &&
    typeof product.inventoryQuantity === "number" &&
    product.inventoryQuantity > 0 &&
    product.inventoryQuantity <= 5;
  const soldOut =
    product.trackInventory &&
    typeof product.inventoryQuantity === "number" &&
    product.inventoryQuantity <= 0;

  const addToCart = () => {
    if (soldOut) return;
    add(product, 1);
    toast.success("Added to cart", { description: product.title });
  };

  return (
    <article className="merch-card group relative flex min-w-0 flex-col overflow-hidden bg-card">
      <div className="relative aspect-square overflow-hidden bg-muted">
        <Link
          to="/product/$slug"
          params={{ slug: product.slug }}
          className="block h-full w-full"
          aria-label={product.title}
        >
          <ProductImage src={product.images[0]} alt={product.title} />
        </Link>

        {typeof rank === "number" && (
          <span className="absolute left-0 top-0 rounded-br-lg bg-navy px-2 py-1 text-[11px] font-extrabold text-navy-foreground">
            #{rank}
          </span>
        )}

        {off > 0 && typeof rank !== "number" && (
          <span className="absolute left-2 top-2 rounded-md bg-deal px-2 py-1 text-[10px] font-extrabold text-deal-foreground shadow">
            -{off}%
          </span>
        )}

        {product.tags.includes("local") && (
          <span className="absolute right-2 top-2 rounded-md bg-success px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success-foreground shadow">
            🇨🇦 Canada
          </span>
        )}

        <button
          type="button"
          onClick={() => toggle(product.id)}
          className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full border border-border/70 bg-background/95 text-navy shadow transition hover:scale-105 hover:text-deal active:scale-95"
          aria-label={(wished ? "Remove " : "Save ") + product.title + (wished ? " from wishlist" : " to wishlist")}
        >
          <Heart size={16} className={wished ? "fill-deal text-deal" : ""} />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="mb-1 flex min-h-4 items-center gap-1.5">
          {product.sold > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-deal">
              <Flame size={11} /> {product.sold.toLocaleString()} sold
            </span>
          )}
          {lowStock && (
            <span className="ml-auto text-[10px] font-bold text-deal">
              Only {product.inventoryQuantity} left
            </span>
          )}
        </div>

        <Link
          to="/product/$slug"
          params={{ slug: product.slug }}
          className="line-clamp-2 min-h-10 text-[13px] font-medium leading-snug text-navy hover:text-electric sm:text-sm"
        >
          {product.title}
        </Link>

        <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5">
          <span className="text-lg font-extrabold tracking-tight text-navy">
            {formatCAD(product.price)}
          </span>
          {product.compareAt && product.compareAt > product.price && (
            <span className="text-[11px] text-muted-foreground line-through">
              {formatCAD(product.compareAt)}
            </span>
          )}
        </div>

        {savings > 0 && (
          <div className="mt-0.5 text-[11px] font-semibold text-success">
            Save {formatCAD(savings)}
          </div>
        )}

        {product.rating > 0 && (
          <div className="mt-1.5">
            <RatingStars rating={product.rating} size={12} />
          </div>
        )}

        <div className="mt-2 min-h-5 text-[11px] text-muted-foreground">
          {vendorName ? (
            <span className="inline-flex max-w-full items-center gap-1">
              <Check size={11} className="shrink-0 text-success" />
              <span className="truncate">{vendorName}</span>
              {vendorCountry === "CA" && <span aria-label="Canada">🇨🇦</span>}
            </span>
          ) : (
            <span>1LV marketplace seller</span>
          )}
        </div>

        <button
          type="button"
          onClick={addToCart}
          disabled={soldOut}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-navy px-3 py-2.5 text-xs font-extrabold text-navy-foreground transition hover:bg-electric active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          aria-label={
            soldOut
              ? product.title + " is sold out"
              : "Add " + product.title + " to cart"
          }
        >
          <ShoppingCart size={14} /> {soldOut ? "Sold out" : "Add to cart"}
        </button>
      </div>
    </article>
  );
}
