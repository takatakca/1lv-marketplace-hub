import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ChevronRight, Heart, Minus, Plus, ShieldCheck, Truck, RefreshCw, Store, Ticket, Star, Lock, PackageCheck,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ProductGrid } from "@/components/ProductGrid";
import { ProductRail, SectionHead } from "@/components/ProductRail";
import { ProductImage } from "@/components/ProductImage";
import { RatingStars } from "@/components/RatingStars";
import { StickyBuyBar } from "@/components/StickyBuyBar";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { getProduct, getVendor, products, productsByCategory, formatCAD, getCategory, type Product } from "@/lib/data";
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
        { property: "og:title", content: `${data?.product.title ?? "Product"} — 1LV.CA` },
        { property: "og:description", content: data?.product.description.slice(0, 150) ?? "" },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(data?.product.images[0]
          ? [
              { property: "og:image", content: data.product.images[0] },
              { name: "twitter:image", content: data.product.images[0] },
            ]
          : []),
      ],
    };
  },
});

function Accordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-b border-border py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-navy">
        {title}
        <ChevronRight size={16} className="text-muted-foreground transition group-open:rotate-90" />
      </summary>
      <div className="pt-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </details>
  );
}

function ProductPage() {
  const { product } = Route.useLoaderData() as LoaderData;
  const vendor = getVendor(product.vendorSlug);
  const category = getCategory(product.category);
  const related = productsByCategory(product.category).filter((p) => p.id !== product.id).slice(0, 6);
  const fromStore = products.filter((p) => p.vendorSlug === product.vendorSlug && p.id !== product.id).slice(0, 8);
  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  const initialVariant: Record<string, string> = {};
  product.variants?.forEach((v) => { initialVariant[v.name] = v.options[0]; });
  const [variant, setVariant] = useState<Record<string, string>>(initialVariant);
  const { add } = useCart();
  const { has, toggle } = useWishlist();
  const { push } = useRecentlyViewed();
  useEffect(() => { push(product.id); }, [product.id, push]);

  const off = product.compareAt && product.compareAt > product.price
    ? Math.round(((product.compareAt - product.price) / product.compareAt) * 100)
    : 0;
  const eta = new Date(Date.now() + 1000 * 60 * 60 * 24 * (product.shipping === "fast" ? 2 : 6));

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-5 pb-36 md:pb-8">
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-electric">Home</Link>
          <ChevronRight size={12} />
          <Link to="/category/$slug" params={{ slug: product.category }} className="hover:text-electric">
            {category?.name ?? product.category}
          </Link>
          <ChevronRight size={12} />
          <span className="truncate text-navy">{product.title}</span>
        </nav>

        <div className="grid gap-6 lg:grid-cols-[64px_minmax(0,1fr)_360px]">
          {/* Thumbnails */}
          <div className="order-2 flex gap-2 lg:order-1 lg:flex-col">
            {product.images.map((src, i) => (
              <button
                key={i}
                onClick={() => setActiveImg(i)}
                aria-label={`View image ${i + 1} of ${product.title}`}
                className={`relative h-16 w-16 overflow-hidden rounded-md border-2 transition ${
                  i === activeImg ? "border-electric" : "border-border hover:border-navy/40"
                }`}
              >
                <ProductImage src={src} alt="" zoom={false} />
              </button>
            ))}
          </div>

          {/* Gallery */}
          <div className="group order-1 lg:order-2">
            <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted shadow-merch">
              <ProductImage src={product.images[activeImg]} alt={product.title} eager />
              {off > 0 && (
                <span className="absolute left-3 top-3 rounded-md bg-gradient-deal px-2 py-1 text-xs font-extrabold text-white shadow">
                  -{off}% today
                </span>
              )}
            </div>

            {/* Details on desktop under gallery */}
            <div className="mt-6 hidden lg:block">
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-navy">{product.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <RatingStars rating={product.rating} reviews={product.reviews} />
                <span className="text-xs text-muted-foreground">{product.sold.toLocaleString()} sold</span>
                {product.tags.includes("local") && (
                  <span className="rounded-md bg-success/10 px-2 py-0.5 text-[11px] font-bold text-success">🇨🇦 Ships from Canada</span>
                )}
              </div>
              <div className="mt-4 rounded-xl border border-border bg-card">
                <div className="px-4">
                  <Accordion title="Product details" defaultOpen>
                    {product.description}
                  </Accordion>
                  <Accordion title="Specifications">
                    <ul className="space-y-1">
                      <li>Category: {category?.name ?? product.category}</li>
                      <li>Seller: {vendor?.name}</li>
                      <li>SKU: {product.id.toUpperCase()}</li>
                      {product.variants?.map((v) => <li key={v.name}>{v.name}: {v.options.join(", ")}</li>)}
                    </ul>
                  </Accordion>
                  <Accordion title="Shipping & delivery">
                    {product.shipping === "fast"
                      ? "Express 2-day delivery across Canada."
                      : product.shipping === "free"
                      ? "Free standard shipping, 4–8 business days."
                      : "Standard shipping, 5–10 business days. Free over $49 CAD."}
                  </Accordion>
                  <Accordion title="Returns & buyer protection">
                    30-day returns on unused items. Every order is covered by 1LV buyer protection — if it doesn't arrive
                    as described, you're refunded.
                  </Accordion>
                </div>
              </div>
            </div>
          </div>

          {/* Buy panel */}
          <div className="order-3 lg:sticky lg:top-28 lg:self-start">
            {/* Mobile title block */}
            <div className="mb-3 lg:hidden">
              <h1 className="font-display text-xl font-extrabold tracking-tight text-navy">{product.title}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <RatingStars rating={product.rating} reviews={product.reviews} />
                <span className="text-xs text-muted-foreground">{product.sold.toLocaleString()} sold</span>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-merch">
              <div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-display text-3xl font-extrabold tracking-tight text-deal">{formatCAD(product.price)}</span>
                  {product.compareAt && product.compareAt > product.price && (
                    <span className="text-sm text-muted-foreground line-through">{formatCAD(product.compareAt)}</span>
                  )}
                </div>
                {off > 0 && (
                  <p className="mt-1 text-xs font-semibold text-deal">
                    You save {formatCAD((product.compareAt ?? 0) - product.price)} · limited-time price
                  </p>
                )}
              </div>

              <Link to="/coupons" className="flex items-center gap-2 rounded-md border border-dashed border-deal/40 bg-deal/5 px-3 py-2 text-xs text-navy hover:border-deal">
                <Ticket size={14} className="text-deal" />
                Extra 10% off with code <span className="font-mono font-bold text-deal">WELCOME10</span>
              </Link>

              <div className="space-y-1.5 rounded-md bg-muted/50 px-3 py-2.5 text-xs">
                <p className="flex items-center gap-2 text-navy">
                  <Truck size={14} className="text-electric" />
                  {product.shipping === "free" ? "Free shipping" : product.shipping === "fast" ? "Express shipping" : "Standard shipping"} · arrives by{" "}
                  <strong>{eta.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</strong>
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <PackageCheck size={14} className="text-success" /> Free returns within 30 days
                </p>
              </div>

              {product.variants?.map((v) => (
                <div key={v.name}>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-navy">
                    {v.name}: <span className="font-normal normal-case text-muted-foreground">{variant[v.name]}</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {v.options.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setVariant((s) => ({ ...s, [v.name]: opt }))}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                          variant[v.name] === opt ? "border-electric bg-electric/5 text-electric" : "border-border text-navy hover:border-navy"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-navy">Quantity</span>
                <div className="flex items-center gap-1 rounded-md border border-border">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="grid h-9 w-9 place-items-center text-muted-foreground hover:text-navy">
                    <Minus size={15} />
                  </button>
                  <span className="w-8 text-center text-sm font-bold text-navy">{qty}</span>
                  <button onClick={() => setQty((q) => q + 1)} aria-label="Increase quantity" className="grid h-9 w-9 place-items-center text-muted-foreground hover:text-navy">
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Link
                  to="/checkout"
                  onClick={() => add(product, qty, variant)}
                  className="block w-full rounded-md bg-gradient-deal px-4 py-3 text-center text-sm font-bold text-white transition hover:opacity-90"
                >
                  Buy now
                </Link>
                <button
                  onClick={() => { add(product, qty, variant); toast.success("Added to cart"); }}
                  className="w-full rounded-md border-2 border-electric bg-electric/5 px-4 py-2.5 text-sm font-bold text-electric transition hover:bg-electric hover:text-electric-foreground"
                >
                  Add to cart
                </button>
                <button
                  onClick={() => toggle(product.id)}
                  className="flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-navy hover:bg-muted"
                >
                  <Heart size={15} className={has(product.id) ? "fill-deal text-deal" : ""} />
                  {has(product.id) ? "Saved to wishlist" : "Save for later"}
                </button>
              </div>

              <div className="grid gap-1.5 border-t border-border pt-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-2"><ShieldCheck size={13} className="text-success" /> 1LV buyer protection on every order</span>
                <span className="inline-flex items-center gap-2"><Lock size={13} className="text-electric" /> Secure payment · Visa, Mastercard, Amex</span>
                <span className="inline-flex items-center gap-2"><RefreshCw size={13} className="text-electric" /> 30-day returns, Canadian support</span>
              </div>
            </div>

            {vendor && (
              <Link
                to="/store/$slug"
                params={{ slug: vendor.slug }}
                className="merch-card mt-3 flex items-center gap-3 p-3"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gradient-electric text-white"><Store size={18} /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-navy">{vendor.name} {vendor.country === "CA" && "🇨🇦"}</div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Star size={10} className="fill-warning text-warning" /> {vendor.rating} · {vendor.city} · {vendor.yearsActive}y on 1LV
                  </div>
                </div>
                <span className="shrink-0 text-xs font-bold text-electric">Visit store</span>
              </Link>
            )}
          </div>
        </div>

        {/* Mobile detail accordions */}
        <div className="mt-8 rounded-xl border border-border bg-card px-4 lg:hidden">
          <Accordion title="Product details" defaultOpen>{product.description}</Accordion>
          <Accordion title="Shipping & delivery">Ships to all Canadian provinces. Free over $49 CAD.</Accordion>
          <Accordion title="Returns & buyer protection">30-day returns on unused items, covered by 1LV buyer protection.</Accordion>
        </div>

        {/* Review summary */}
        <section className="mt-10 rounded-xl border border-border bg-card p-5 shadow-merch">
          <div className="grid gap-6 sm:grid-cols-[200px_1fr]">
            <div className="text-center sm:text-left">
              <div className="font-display text-4xl font-extrabold text-navy">{product.rating.toFixed(1)}</div>
              <RatingStars rating={product.rating} size={16} />
              <p className="mt-1 text-xs text-muted-foreground">{product.reviews.toLocaleString()} verified reviews</p>
            </div>
            <div className="space-y-1.5">
              {[5, 4, 3, 2, 1].map((s) => {
                const pct = s === 5 ? 72 : s === 4 ? 18 : s === 3 ? 6 : s === 2 ? 2 : 2;
                return (
                  <div key={s} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-8">{s}★</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-9 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {fromStore.length > 0 && vendor && (
          <section className="mt-10">
            <SectionHead eyebrow="Same seller" title={`More from ${vendor.name}`} />
            <ProductRail products={fromStore} />
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-10">
            <SectionHead eyebrow="Similar items" title="Customers also viewed" />
            <ProductGrid products={related} cols={6} />
          </section>
        )}

        <RecentlyViewed excludeId={product.id} />
      </div>
      <StickyBuyBar product={product} />
    </AppLayout>
  );
}
