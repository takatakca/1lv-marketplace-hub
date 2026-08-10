import { createFileRoute, Link } from "@tanstack/react-router";
import { Zap, TrendingUp, ShieldCheck, Truck, RefreshCw, Store, Star, ArrowRight } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ProductGrid } from "@/components/ProductGrid";
import { ProductRail, SectionHead } from "@/components/ProductRail";
import { ProductImage } from "@/components/ProductImage";
import { CountdownTimer } from "@/components/CountdownTimer";
import { CouponStrip } from "@/components/CouponStrip";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { categories, products, productsByTag, vendors, formatCAD } from "@/lib/data";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "1LV.CA — Daily deals from Canadian & global vendors" },
      {
        name: "description",
        content:
          "Shop flash deals, trending products and verified Canadian sellers on 1LV.CA. Free shipping over $49 CAD, 30-day returns, buyer protection.",
      },
      { property: "og:title", content: "1LV.CA — Canada's deal marketplace" },
      { property: "og:description", content: "Flash deals, Canadian sellers, free shipping over $49 CAD." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Home() {
  const flash = productsByTag("flash");
  const trending = productsByTag("trending");
  const local = productsByTag("local");
  const newArrivals = productsByTag("new");
  const best = productsByTag("best");
  const under10 = products.filter((p) => p.price < 25).slice(0, 4);
  const heroDeal = flash[0] ?? products[0];
  const tiles = [products[3], products[6], products[12]].filter(Boolean);
  const featuredVendors = vendors.slice(0, 4).map((v) => ({
    vendor: v,
    items: products.filter((p) => p.vendorSlug === v.slug),
  }));

  return (
    <AppLayout>
      {/* ---------- HERO MERCHANDISING ---------- */}
      <section className="surface-3 border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-4 md:py-6">
          <div className="grid gap-3 lg:grid-cols-[1.55fr_1fr]">
            {/* Primary campaign */}
            <Link
              to="/deals"
              className="group relative overflow-hidden rounded-xl bg-gradient-hero p-5 text-white shadow-merch md:p-8"
            >
              <div className="relative z-10 max-w-md">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur">
                  <Zap size={12} className="text-deal deal-pulse" /> Flash event live
                </span>
                <h1 className="mt-3 font-display text-3xl font-extrabold leading-[1.05] tracking-tight md:text-5xl">
                  Up to 60% off
                  <br />
                  daily deals in CAD
                </h1>
                <p className="mt-3 text-sm text-white/80">
                  New markdowns every morning. Free shipping over $49, 30-day returns.
                </p>
                <span className="mt-5 inline-flex items-center gap-2 rounded-md bg-deal px-5 py-2.5 text-sm font-bold text-deal-foreground transition group-hover:opacity-90">
                  Shop the event <ArrowRight size={15} />
                </span>
                <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-white/70">
                  <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-electric" /> Buyer protection</span>
                  <span className="inline-flex items-center gap-1.5"><Truck size={13} className="text-electric" /> Fast CA delivery</span>
                  <span className="inline-flex items-center gap-1.5"><RefreshCw size={13} className="text-electric" /> 30-day returns</span>
                </div>
              </div>
              {heroDeal && (
                <div className="pointer-events-none absolute -bottom-6 -right-6 hidden h-64 w-64 rotate-6 overflow-hidden rounded-2xl border border-white/20 shadow-elevated md:block lg:h-72 lg:w-72">
                  <ProductImage src={heroDeal.images[0]} alt={heroDeal.title} zoom={false} eager />
                </div>
              )}
            </Link>

            {/* Supporting tiles */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:grid-rows-3">
              {tiles.map((p, i) => (
                <Link
                  key={p.id}
                  to="/product/$slug"
                  params={{ slug: p.slug }}
                  className={`merch-card group flex items-center gap-3 overflow-hidden p-3 ${i === 2 ? "col-span-2 lg:col-span-1" : ""}`}
                >
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <ProductImage src={p.images[0]} alt={p.title} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-electric">
                      {i === 0 ? "Editor's pick" : i === 1 ? "Best seller" : "Lowest price this week"}
                    </p>
                    <p className="line-clamp-2 text-sm font-semibold text-navy group-hover:text-electric">{p.title}</p>
                    <p className="mt-0.5 text-sm font-extrabold text-deal">{formatCAD(p.price)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- CATEGORY RAIL ---------- */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-2 py-4">
          <div className="scrollbar-hide flex gap-1 overflow-x-auto">
            {categories.map((c) => (
              <Link
                key={c.slug}
                to="/category/$slug"
                params={{ slug: c.slug }}
                className="group flex min-w-[76px] flex-col items-center gap-1.5 rounded-lg px-2 py-1.5 text-center transition hover:bg-muted"
              >
                <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-electric/12 to-deal/12 text-xl transition group-hover:shadow-merch">
                  {c.emoji}
                </div>
                <span className="text-[11px] font-medium leading-tight text-navy group-hover:text-electric">{c.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CouponStrip />

      {/* ---------- FLASH DEALS ---------- */}
      <section className="surface-2 border-y border-border">
        <div className="mx-auto max-w-7xl px-4 py-7">
          <SectionHead eyebrow="Ends tonight" title="⚡ Flash deals" action="Shop all deals" actionTo="/deals">
            <CountdownTimer />
          </SectionHead>
          <ProductGrid products={flash.slice(0, 6)} cols={6} />
        </div>
      </section>

      {/* ---------- VALUE PICKS ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-7">
        <SectionHead eyebrow="Budget buys" title="Value picks under $25" action="More deals" actionTo="/deals" />
        <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            {[
              { label: "Under $10", to: "/deals", tone: "bg-deal text-deal-foreground" },
              { label: "Free shipping", to: "/search", tone: "bg-success text-success-foreground" },
              { label: "Canadian sellers 🇨🇦", to: "/search", tone: "bg-navy text-navy-foreground" },
              { label: "New this week", to: "/new-arrivals", tone: "bg-electric text-electric-foreground" },
            ].map((t) => (
              <Link
                key={t.label}
                to={t.to as "/"}
                className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm font-bold shadow-merch transition hover:opacity-90 ${t.tone}`}
              >
                {t.label} <ArrowRight size={15} />
              </Link>
            ))}
          </div>
          <ProductGrid products={under10} cols={4} />
        </div>
      </section>

      {/* ---------- TRENDING ---------- */}
      <section className="surface-2 border-y border-border">
        <div className="mx-auto max-w-7xl px-4 py-7">
          <SectionHead eyebrow="Rising fast" title="Trending now" action="See ranking" actionTo="/trending">
            <span className="hidden items-center gap-1 rounded-full bg-deal/10 px-2 py-1 text-[11px] font-bold text-deal sm:inline-flex">
              <TrendingUp size={12} /> Updated hourly
            </span>
          </SectionHead>
          <ProductGrid products={trending.slice(0, 6)} cols={6} ranked />
        </div>
      </section>

      {/* ---------- FEATURED STORES ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-7">
        <SectionHead eyebrow="Verified sellers" title="Featured stores" action="All stores" actionTo="/categories" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {featuredVendors.map(({ vendor, items }) => (
            <div key={vendor.slug} className="merch-card group overflow-hidden">
              <div className="relative h-24 overflow-hidden bg-muted">
                <ProductImage src={items[0]?.images[0]} alt={`${vendor.name} storefront`} />
                <div className="absolute inset-0 bg-gradient-to-t from-navy/80 to-transparent" />
                <div className="absolute bottom-2 left-2 flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-electric text-sm font-extrabold text-white">
                    {vendor.name[0]}
                  </div>
                  <div className="text-white">
                    <div className="text-sm font-bold leading-tight">{vendor.name}</div>
                    <div className="flex items-center gap-1 text-[11px] text-white/85">
                      <Star size={10} className="fill-warning text-warning" /> {vendor.rating} · {vendor.city}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 p-2">
                {items.slice(0, 3).map((p) => (
                  <div key={p.id} className="relative aspect-square flex-1 overflow-hidden rounded-md bg-muted">
                    <ProductImage src={p.images[0]} alt={p.title} zoom={false} />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-border px-3 py-2">
                <span className="text-[11px] text-muted-foreground">
                  {items.length} products · {vendor.yearsActive}y on 1LV
                </span>
                <Link
                  to="/store/$slug"
                  params={{ slug: vendor.slug }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-electric hover:underline"
                >
                  <Store size={12} /> Shop store
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- NEW ARRIVALS RAIL ---------- */}
      <section className="surface-2 border-y border-border">
        <div className="mx-auto max-w-7xl px-4 py-7">
          <SectionHead eyebrow="Just landed" title="New arrivals" action="Browse new" actionTo="/new-arrivals" />
          <ProductRail products={newArrivals} />
        </div>
      </section>

      {/* ---------- CANADIAN SELLERS ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-7">
        <SectionHead eyebrow="Ships from Canada" title="Local Canadian sellers 🇨🇦" action="Discover" actionTo="/search" />
        <ProductGrid products={local.slice(0, 6)} cols={6} />
      </section>

      {/* ---------- BEST SELLERS ---------- */}
      <section className="surface-2 border-y border-border">
        <div className="mx-auto max-w-7xl px-4 py-7">
          <SectionHead eyebrow="Most ordered" title="Best sellers this week" action="See top products" actionTo="/trending" />
          <ProductRail products={best} />
        </div>
      </section>

      <RecentlyViewed />

      {/* ---------- RECOMMENDED FEED ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-8">
        <SectionHead eyebrow="Picked for you" title="Recommended" />
        <ProductGrid products={products} cols={6} />
        <div className="mt-6 text-center">
          <Link
            to="/search"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-6 py-3 text-sm font-bold text-navy shadow-merch hover:border-electric hover:text-electric"
          >
            Load more products <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      {/* ---------- VENDOR CTA ---------- */}
      <section className="surface-ink bg-navy">
        <div className="mx-auto grid max-w-7xl items-center gap-6 px-4 py-10 text-white md:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-electric">Sell on 1LV.CA</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight md:text-3xl">
              Reach Canadian shoppers. Get paid in CAD.
            </h2>
            <p className="mt-2 max-w-lg text-sm text-white/70">
              List products in minutes, manage every order from one dashboard, and receive weekly payouts.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:justify-end">
            <Link to="/become-a-vendor" className="rounded-md bg-electric px-6 py-3 text-center text-sm font-bold text-electric-foreground hover:opacity-90">
              Apply to sell
            </Link>
            <Link to="/vendor-pricing" className="rounded-md border border-white/25 px-6 py-3 text-center text-sm font-semibold hover:bg-white/10">
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
