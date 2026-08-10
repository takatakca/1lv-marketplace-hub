import { Link } from "@tanstack/react-router";
import { Heart, Truck, Zap, ShoppingCart } from "lucide-react";
import type { Product } from "@/lib/data";
import { vendors, formatCAD } from "@/lib/data";
import { RatingStars } from "./RatingStars";
import { ProductImage } from "./ProductImage";
import { useWishlist } from "@/hooks/use-wishlist";
import { useCart } from "@/hooks/use-cart";
import { toast } from "sonner";

export function ProductCard({ product, rank }: { product: Product; rank?: number }) {
  const vendor = vendors.find((v) => v.slug === product.vendorSlug);
  const { toggle, has } = useWishlist();
  const { add } = useCart();
  const wished = has(product.id);
  const off =
    product.compareAt && product.compareAt > product.price
      ? Math.round(((product.compareAt - product.price) / product.compareAt) * 100)
      : 0;

  return (
    <Link
      to="/product/$slug"
      params={{ slug: product.slug }}
      className="merch-card group relative flex flex-col overflow-hidden"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        <ProductImage src={product.images[0]} alt={product.title} />

        {typeof rank === "number" && (
          <span className="absolute left-0 top-0 rounded-br-lg bg-navy px-2 py-1 text-[11px] font-extrabold text-navy-foreground">
            #{rank}
          </span>
        )}
        {product.tags.includes("flash") && typeof rank !== "number" && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-gradient-deal px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow">
            <Zap size={10} /> Flash
          </span>
        )}
        {off > 0 && !product.tags.includes("flash") && typeof rank !== "number" && (
          <span className="absolute left-2 top-2 rounded-md bg-deal px-1.5 py-0.5 text-[10px] font-extrabold text-deal-foreground shadow">
            -{off}%
          </span>
        )}
        {product.tags.includes("local") && (
          <span className="absolute right-2 top-2 rounded-md bg-success px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success-foreground shadow">
            🇨🇦 Local
          </span>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            toggle(product.id);
          }}
          className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-background/95 text-navy shadow transition hover:scale-110 active:scale-95"
          aria-label={wished ? `Remove ${product.title} from wishlist` : `Save ${product.title} to wishlist`}
        >
          <Heart size={15} className={wished ? "fill-deal text-deal" : ""} />
        </button>

        {/* Desktop quick add */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            add(product, 1);
            toast.success("Added to cart");
          }}
          className="absolute inset-x-2 bottom-2 hidden translate-y-2 items-center justify-center gap-1.5 rounded-md bg-navy/95 py-2 text-xs font-bold text-navy-foreground opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 md:flex"
          aria-label={`Add ${product.title} to cart`}
        >
          <ShoppingCart size={13} /> Quick add
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-2.5 sm:p-3">
        <h3 className="line-clamp-2 text-[13px] font-medium leading-snug text-navy group-hover:text-electric sm:text-sm">
          {product.title}
        </h3>

        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-base font-extrabold tracking-tight text-deal sm:text-lg">
            {formatCAD(product.price)}
          </span>
          {product.compareAt && product.compareAt > product.price && (
            <>
              <span className="text-[11px] text-muted-foreground line-through">{formatCAD(product.compareAt)}</span>
              <span className="rounded-sm bg-deal/10 px-1 py-px text-[10px] font-bold text-deal">-{off}%</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <RatingStars rating={product.rating} size={12} />
          <span className="text-[11px] text-muted-foreground">{product.sold.toLocaleString()} sold</span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground">
          {vendor && (
            <span className="truncate">
              {vendor.name} {vendor.country === "CA" && "🇨🇦"}
            </span>
          )}
          {product.shipping !== "standard" && (
            <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-success">
              <Truck size={11} />
              {product.shipping === "fast" ? "2-day" : "Free ship"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
