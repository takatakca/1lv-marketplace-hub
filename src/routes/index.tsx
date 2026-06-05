import { createFileRoute, Link } from "@tanstack/react-router";
import { Zap, Sparkles, TrendingUp, Trophy, MapPin, ChevronRight, ShieldCheck, Truck, RefreshCw, Tag } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ProductGrid } from "@/components/ProductGrid";
import { CountdownTimer } from "@/components/CountdownTimer";
import { CouponStrip } from "@/components/CouponStrip";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { categories, products, productsByTag, vendors } from "@/lib/data";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "1LV.CA — Daily deals from Canadian & global vendors" },
      { name: "description", content: "Discover flash deals, trending products, and Canadian local brands on 1LV.CA. Free shipping over $49 CAD, 30-day returns." },
    ],
  }),
});

function Section({
  icon, title, accent, more, children,
}: { icon: React.ReactNode; title: string; accent?: string; more?: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className={`grid h-9 w-9 place-items-center rounded-lg ${accent ?? "bg-electric/10 text-electric"}`}>
            {icon}
          </span>
          <h2 className="font-display text-xl font-extrabold text-navy sm:text-2xl">{title}</h2>
        </div>
        {more && (
          <Link to="/search" className="hidden items-center gap-1 text-sm font-semibold text-electric hover:underline sm:inline-flex">
            {more} <ChevronRight size={16} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Home() {
  const flash = productsByTag("flash");
  const trending = productsByTag("trending");
  const local = productsByTag("local");
  const newArrivals = productsByTag("new");
  const best = productsByTag("best");

  return (
    <AppLayout>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-hero text-white">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 60%, white 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-2 md:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">
              <span>🇨🇦</span> Canada's marketplace
            </span>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight text-balance md:text-6xl">
              Everything you need.<br />
              <span className="bg-gradient-to-r from-white to-electric bg-clip-text text-transparent">From everyone you trust.</span>
            </h1>
            <p className="mt-4 max-w-md text-white/80">
              Shop 1M+ products from Canadian and global vendors. Free shipping on CA orders over $49. Easy 30-day returns.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/categories" className="inline-flex items-center justify-center rounded-md bg-electric px-5 py-3 text-sm font-bold text-electric-foreground shadow-glow hover:opacity-90">
                Start shopping
              </Link>
              <Link to="/become-a-vendor" className="inline-flex items-center justify-center rounded-md border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10">
                Sell on 1LV →
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/70">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-electric" /> Buyer protection</span>
              <span className="inline-flex items-center gap-1.5"><Truck size={14} className="text-electric" /> Fast CA delivery</span>
              <span className="inline-flex items-center gap-1.5"><RefreshCw size={14} className="text-electric" /> 30-day returns</span>
            </div>
          </div>
          <div className="relative hidden md:block">
            <div className="grid grid-cols-2 gap-3">
              {products.slice(0, 4).map((p, i) => (
                <div
                  key={p.id}
                  className={`overflow-hidden rounded-xl border border-white/15 bg-white/5 backdrop-blur ${i % 2 ? "translate-y-6" : ""}`}
                >
                  <img src={p.images[0]} alt={p.title} className="aspect-square w-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Category strip */}
      <section className="border-b border-border bg-white">
        <div className="mx-auto max-w-7xl px-2 py-5">
          <div className="scrollbar-hide flex gap-2 overflow-x-auto">
            {categories.map((c) => (
              <Link
                key={c.slug}
                to="/category/$slug"
                params={{ slug: c.slug }}
                className="group flex min-w-[88px] flex-col items-center gap-1.5 rounded-xl px-3 py-2 text-center transition hover:bg-muted"
              >
                <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-electric/10 to-deal/10 text-2xl">
                  {c.emoji}
                </div>
                <span className="text-xs font-medium text-navy group-hover:text-electric">{c.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CouponStrip />

      <Section
        icon={<Zap size={18} />}
        title="⚡ Flash Deals"
        accent="bg-deal/10 text-deal"
        more="Shop all"
      >
        <div className="mb-3 flex items-center justify-between rounded-lg bg-deal/5 px-3 py-2">
          <span className="text-xs font-semibold text-navy">Refreshes daily · limited stock</span>
          <CountdownTimer />
        </div>
        <ProductGrid products={flash.slice(0, 6)} cols={6} />
      </Section>

      <Section icon={<Tag size={18} />} title="💸 Under $25" accent="bg-deal/10 text-deal" more="All deals">
        <ProductGrid products={products.filter((p) => p.price < 25).slice(0, 6)} cols={6} />
      </Section>

      {/* Promo banner */}
      <section className="mx-auto max-w-7xl px-4">
        <div className="overflow-hidden rounded-2xl bg-gradient-deal p-6 text-white shadow-elevated md:p-10">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/80">Limited time</p>
              <h3 className="mt-1 font-display text-2xl font-extrabold md:text-3xl">Up to 60% off, ends Sunday</h3>
              <p className="mt-1 max-w-md text-sm text-white/85">Thousands of products marked down across electronics, home, fashion and more.</p>
            </div>
            <Link to="/search" className="rounded-md bg-white px-5 py-3 text-sm font-bold text-deal hover:opacity-90">
              Browse the sale
            </Link>
          </div>
        </div>
      </section>

      <Section icon={<TrendingUp size={18} />} title="Trending now" more="See more">
        <ProductGrid products={trending.slice(0, 5)} />
      </Section>

      <Section icon={<MapPin size={18} />} title="Local Canadian Vendors 🇨🇦" accent="bg-success/10 text-success" more="Discover">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.filter((v) => v.country === "CA").slice(0, 3).map((v) => (
            <div key={v.slug} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-gradient-electric text-white text-xl font-bold">
                {v.name[0]}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-navy">{v.name}</div>
                <div className="text-xs text-muted-foreground">⭐ {v.rating} · {v.city}, {v.country} · {v.yearsActive}y</div>
              </div>
            </div>
          ))}
        </div>
        <ProductGrid products={local.slice(0, 5)} />
      </Section>

      <Section icon={<Sparkles size={18} />} title="New arrivals" more="Browse new">
        <ProductGrid products={newArrivals.slice(0, 5)} />
      </Section>

      <Section icon={<Trophy size={18} />} title="Best sellers" accent="bg-deal/10 text-deal" more="See top products">
        <ProductGrid products={best.slice(0, 5)} />
      </Section>

      {/* Vendor CTA */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid items-center gap-8 rounded-2xl bg-navy p-8 text-white md:grid-cols-2 md:p-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-electric">For vendors</p>
            <h3 className="mt-2 font-display text-3xl font-extrabold">Reach Canadian shoppers, sell with confidence.</h3>
            <p className="mt-3 max-w-md text-white/75">
              List your products in minutes, manage orders from one dashboard, and get paid in CAD. Built for makers, retailers and global sellers.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:justify-end">
            <Link to="/become-a-vendor" className="rounded-md bg-electric px-6 py-3 text-sm font-bold text-electric-foreground shadow-glow hover:opacity-90">
              Apply to sell
            </Link>
            <Link to="/vendor-pricing" className="rounded-md border border-white/30 px-6 py-3 text-sm font-semibold hover:bg-white/10">
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
