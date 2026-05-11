import { Link } from "@tanstack/react-router";
import { Heart, Truck, Zap } from "lucide-react";
import type { Product } from "@/lib/data";
import { vendors } from "@/lib/data";
import { PriceDisplay } from "./PriceDisplay";
import { RatingStars } from "./RatingStars";
import { useWishlist } from "@/hooks/use-wishlist";

export function ProductCard({ product }: { product: Product }) {
  const vendor = vendors.find((v) => v.slug === product.vendorSlug);
  const { toggle, has } = useWishlist();
  const wished = has(product.id);
  const off = product.compareAt && product.compareAt > product.price
    ? Math.round(((product.compareAt - product.price) / product.compareAt) * 100)
    : 0;

  return (
    <Link
      to="/product/$slug"
      params={{ slug: product.slug }}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition hover:-translate-y-0.5 hover:border-electric/50 hover:shadow-elevated"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        <img
          src={product.images[0]}
          alt={product.title}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        {product.tags.includes("flash") && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-gradient-deal px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow">
            <Zap size={10} /> Flash
          </span>
        )}
        {product.tags.includes("local") && (
          <span className="absolute right-2 top-2 rounded-md bg-success px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-success-foreground shadow">
            🇨🇦 Local
          </span>
        )}
        {off > 0 && !product.tags.includes("flash") && (
          <span className="absolute left-2 top-2 rounded-md bg-deal px-2 py-0.5 text-[10px] font-bold text-deal-foreground shadow">
            -{off}%
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            toggle(product.id);
          }}
          className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-navy shadow transition hover:scale-110"
          aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
        >
          <Heart size={15} className={wished ? "fill-deal text-deal" : ""} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-navy group-hover:text-electric">
          {product.title}
        </h3>
        <PriceDisplay price={product.price} compareAt={product.compareAt} />
        <RatingStars rating={product.rating} reviews={product.reviews} />
        <div className="mt-auto flex items-center justify-between pt-1.5 text-[11px] text-muted-foreground">
          {vendor && (
            <span className="truncate">
              {vendor.name} {vendor.country === "CA" && "🇨🇦"}
            </span>
          )}
          {product.shipping !== "standard" && (
            <span className="inline-flex items-center gap-1 font-medium text-success">
              <Truck size={11} />
              {product.shipping === "fast" ? "2-day" : "Free"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
