import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Heart, MinusCircle, PlusCircle, ShieldCheck, Truck, RefreshCw, Store, Ticket } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ProductGrid } from "@/components/ProductGrid";
import { PriceDisplay } from "@/components/PriceDisplay";
import { RatingStars } from "@/components/RatingStars";
import { StickyBuyBar } from "@/components/StickyBuyBar";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { getProduct, getVendor, products, productsByCategory, type Product } from "@/lib/data";
import { useCart } from "@/hooks/use-cart";
import { useWishlist } from "@/hooks/use-wishlist";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { toast } from "sonner";

type LoaderData = { product: Product };

export const Route = createFileRoute("/product/$slug")({
  component: ProductPage,
  loader: ({ params }): LoaderData => {
    const product = getProduct(params.slug);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData }) => {
    const data = loaderData as LoaderData | undefined;
    return {
      meta: [
        { title: `${data?.product.title ?? "Product"} — 1LV.CA` },
        { name: "description", content: data?.product.description.slice(0, 150) ?? "" },
        { property: "og:image", content: data?.product.images[0] ?? "" },
      ],
    };
  },
});

function ProductPage() {
  const { product } = Route.useLoaderData() as LoaderData;
  const vendor = getVendor(product.vendorSlug);
  const related = productsByCategory(product.category).filter((p) => p.id !== product.id).slice(0, 5);
  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  const initialVariant: Record<string, string> = {};
  product.variants?.forEach((v) => { initialVariant[v.name] = v.options[0]; });
  const [variant, setVariant] = useState<Record<string, string>>(initialVariant);
  const { add } = useCart();
  const { has, toggle } = useWishlist();

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Breadcrumb */}
        <nav className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-electric">Home</Link>
          <ChevronRight size={12} />
          <Link to="/category/$slug" params={{ slug: product.category }} className="hover:text-electric">
            {product.category}
          </Link>
          <ChevronRight size={12} />
          <span className="truncate text-navy">{product.title}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1fr_1fr_320px]">
          {/* Gallery */}
          <div>
            <div className="overflow-hidden rounded-2xl border border-border bg-muted">
              <img src={product.images[activeImg]} alt={product.title} className="aspect-square w-full object-cover" />
            </div>
            <div className="mt-3 flex gap-2">
              {product.images.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(i)}
                  className={`h-16 w-16 overflow-hidden rounded-md border-2 ${i === activeImg ? "border-electric" : "border-transparent"}`}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Info */}
          <div>
            <h1 className="font-display text-2xl font-extrabold text-navy md:text-3xl">{product.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <RatingStars rating={product.rating} reviews={product.reviews} />
              <span className="text-xs text-muted-foreground">· {product.sold.toLocaleString()} sold</span>
            </div>
            <div className="mt-4">
              <PriceDisplay price={product.price} compareAt={product.compareAt} size="lg" />
            </div>

            {product.variants?.map((v) => (
              <div key={v.name} className="mt-5">
                <p className="mb-2 text-sm font-semibold text-navy">{v.name}: <span className="font-normal text-muted-foreground">{variant[v.name]}</span></p>
                <div className="flex flex-wrap gap-2">
                  {v.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setVariant((s) => ({ ...s, [v.name]: opt }))}
                      className={`rounded-md border px-3 py-1.5 text-sm transition ${
                        variant[v.name] === opt ? "border-electric bg-electric/5 text-electric" : "border-border hover:border-navy"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="mt-6 prose prose-sm max-w-none text-muted-foreground">
              <p>{product.description}</p>
            </div>

            <div className="mt-6 grid gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm sm:grid-cols-3">
              <div className="flex items-center gap-2"><Truck size={16} className="text-electric" /> Ships to Canada</div>
              <div className="flex items-center gap-2"><RefreshCw size={16} className="text-electric" /> 30-day returns</div>
              <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-success" /> Buyer protection</div>
            </div>
          </div>

          {/* Buy box */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
              <PriceDisplay price={product.price} compareAt={product.compareAt} size="lg" />

              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-navy">Quantity</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="decrease"><MinusCircle size={20} className="text-muted-foreground hover:text-navy" /></button>
                  <span className="w-8 text-center text-sm font-bold">{qty}</span>
                  <button onClick={() => setQty((q) => q + 1)} aria-label="increase"><PlusCircle size={20} className="text-muted-foreground hover:text-navy" /></button>
                </div>
              </div>

              <button
                onClick={() => { add(product, qty, variant); toast.success("Added to cart"); }}
                className="w-full rounded-md bg-electric px-4 py-3 text-sm font-bold text-electric-foreground shadow-glow hover:opacity-90"
              >
                Add to cart
              </button>
              <Link
                to="/checkout"
                onClick={() => add(product, qty, variant)}
                className="block w-full rounded-md bg-deal px-4 py-3 text-center text-sm font-bold text-deal-foreground hover:opacity-90"
              >
                Buy now
              </Link>
              <button
                onClick={() => toggle(product.id)}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium text-navy hover:bg-muted"
              >
                <Heart size={16} className={has(product.id) ? "fill-deal text-deal" : ""} />
                {has(product.id) ? "Saved" : "Add to wishlist"}
              </button>

              {vendor && (
                <Link to="/" className="flex items-center gap-3 rounded-lg border border-border p-3 hover:border-electric">
                  <div className="grid h-10 w-10 place-items-center rounded-md bg-gradient-electric text-white"><Store size={16} /></div>
                  <div className="min-w-0 text-sm">
                    <div className="font-semibold text-navy">{vendor.name} {vendor.country === "CA" && "🇨🇦"}</div>
                    <div className="text-xs text-muted-foreground">⭐ {vendor.rating} · {vendor.city}</div>
                  </div>
                </Link>
              )}
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="mb-4 font-display text-xl font-extrabold text-navy">You might also like</h2>
            <ProductGrid products={related} />
          </section>
        )}

        <section className="mt-16">
          <h2 className="mb-4 font-display text-xl font-extrabold text-navy">More from this category</h2>
          <ProductGrid products={products.slice(0, 5)} />
        </section>
      </div>
    </AppLayout>
  );
}
