import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useState, useMemo, useEffect } from "react";
import { Filter, Search as SearchIcon, SlidersHorizontal, X, Sparkles } from "lucide-react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { AppLayout } from "@/components/AppLayout";
import { AISearchBar } from "@/components/AISearchBar";
import { ProductGrid } from "@/components/ProductGrid";
import { EmptyState } from "@/components/EmptyState";
import { products, vendors, categories } from "@/lib/data";
import { QUICK_CHIPS } from "@/services/ai-search";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  raw: z.string().optional(),
  category: fallback(z.string(), "").default(""),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  freeShipping: fallback(z.boolean(), false).default(false),
  canadian: fallback(z.boolean(), false).default(false),
  rating: fallback(z.number(), 0).default(0),
  sale: fallback(z.boolean(), false).default(false),
  sort: fallback(z.string(), "relevance").default("relevance"),
});

export const Route = createFileRoute("/search")({
  validateSearch: zodValidator(searchSchema),
  component: SearchPage,
  head: () => ({
    meta: [
      { title: "Search products — 1LV.CA Marketplace" },
      { name: "description", content: "Search 1LV.CA with smart filters and voice search: price, free shipping, Canadian sellers, ratings and deals." },
      { property: "og:title", content: "Search products — 1LV.CA" },
      { property: "og:description", content: "Smart, voice-enabled product search across Canadian and global vendors." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Sort = "relevance" | "price-asc" | "price-desc" | "rating" | "sold";
const SORTS: Sort[] = ["relevance", "price-asc", "price-desc", "rating", "sold"];
const PRICE_CEILING = 2000;

function SearchPage() {
  const sp = Route.useSearch();
  const navigate = Route.useNavigate();
  const term = (sp.q ?? "").trim().toLowerCase();

  const safeSort: Sort = SORTS.includes(sp.sort as Sort) ? (sp.sort as Sort) : "relevance";
  const smartCategory = categories.some((c) => c.slug === sp.category) ? sp.category : "";

  const [sort, setSort] = useState<Sort>(safeSort);
  const [maxPrice, setMaxPrice] = useState<number>(
    sp.maxPrice !== undefined ? Math.max(10, Math.min(PRICE_CEILING, sp.maxPrice)) : PRICE_CEILING,
  );
  const [minPrice, setMinPrice] = useState<number>(sp.minPrice !== undefined ? Math.max(0, sp.minPrice) : 0);
  const [freeShip, setFreeShip] = useState(sp.freeShipping);
  const [minRating, setMinRating] = useState(Math.max(0, Math.min(5, sp.rating)));
  const [caOnly, setCaOnly] = useState(sp.canadian);
  const [saleOnly, setSaleOnly] = useState(sp.sale);
  const [category, setCategory] = useState(smartCategory);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Re-sync when the URL changes (new search submitted from the header).
  useEffect(() => {
    setSort(safeSort);
    setMaxPrice(sp.maxPrice !== undefined ? Math.max(10, Math.min(PRICE_CEILING, sp.maxPrice)) : PRICE_CEILING);
    setMinPrice(sp.minPrice !== undefined ? Math.max(0, sp.minPrice) : 0);
    setFreeShip(sp.freeShipping);
    setMinRating(Math.max(0, Math.min(5, sp.rating)));
    setCaOnly(sp.canadian);
    setSaleOnly(sp.sale);
    setCategory(smartCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.q, sp.raw, sp.category, sp.minPrice, sp.maxPrice, sp.freeShipping, sp.canadian, sp.rating, sp.sale, sp.sort]);

  const results = useMemo(() => {
    let r = term
      ? products.filter((p) => p.title.toLowerCase().includes(term) || p.category.includes(term))
      : products;
    if (category) r = r.filter((p) => p.category === category);
    if (freeShip) r = r.filter((p) => p.shipping === "free" || p.shipping === "fast");
    if (minRating > 0) r = r.filter((p) => p.rating >= minRating);
    if (saleOnly) r = r.filter((p) => p.compareAt && p.compareAt > p.price);
    if (caOnly) {
      const caVendors = new Set(vendors.filter((v) => v.country === "CA").map((v) => v.slug));
      r = r.filter((p) => caVendors.has(p.vendorSlug));
    }
    r = r.filter((p) => p.price <= maxPrice && p.price >= minPrice);

    switch (sort) {
      case "price-asc": r = [...r].sort((a, b) => a.price - b.price); break;
      case "price-desc": r = [...r].sort((a, b) => b.price - a.price); break;
      case "rating": r = [...r].sort((a, b) => b.rating - a.rating); break;
      case "sold": r = [...r].sort((a, b) => b.sold - a.sold); break;
    }
    return r;
  }, [term, sort, maxPrice, minPrice, freeShip, minRating, caOnly, saleOnly, category]);

  const smartBits = [
    sp.q ? sp.q : null,
    smartCategory ? `in ${categories.find((c) => c.slug === smartCategory)?.name}` : null,
    sp.minPrice !== undefined && sp.maxPrice !== undefined
      ? `between $${sp.minPrice} and $${sp.maxPrice}`
      : sp.maxPrice !== undefined
        ? `under $${sp.maxPrice}`
        : sp.minPrice !== undefined
          ? `over $${sp.minPrice}`
          : null,
    sp.freeShipping ? "with free shipping" : null,
    sp.canadian ? "from Canadian sellers" : null,
    sp.rating ? `rated ${sp.rating}+ stars` : null,
    sp.sale ? "on sale" : null,
  ].filter(Boolean);

  const hasSmart =
    sp.maxPrice !== undefined ||
    sp.minPrice !== undefined ||
    sp.freeShipping ||
    sp.canadian ||
    sp.sale ||
    sp.rating > 0 ||
    !!smartCategory;

  const clearSmart = () =>
    navigate({ search: { q: sp.q, sort: "relevance", category: "", freeShipping: false, canadian: false, sale: false, rating: 0 } as any });

  const FilterPanel = () => (
    <div className="space-y-5 text-sm">
      <div>
        <p className="mb-2 font-semibold text-navy">Category</p>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs text-navy outline-none focus:border-electric"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <p className="mb-2 font-semibold text-navy">Max price: ${maxPrice}</p>
        <input
          type="range"
          min={10}
          max={PRICE_CEILING}
          step={10}
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          className="w-full"
          aria-label="Maximum price"
        />
      </div>
      <div className="space-y-2">
        <p className="font-semibold text-navy">Shipping</p>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={freeShip} onChange={(e) => setFreeShip(e.target.checked)} />
          Free / fast shipping
        </label>
      </div>
      <div className="space-y-2">
        <p className="font-semibold text-navy">Rating</p>
        {[0, 3, 4, 4.5].map((r) => (
          <label key={r} className="flex items-center gap-2 text-xs">
            <input type="radio" name="rating" checked={minRating === r} onChange={() => setMinRating(r)} />
            {r === 0 ? "Any" : `${r}+ stars`}
          </label>
        ))}
      </div>
      <div className="space-y-2">
        <p className="font-semibold text-navy">Vendor</p>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={caOnly} onChange={(e) => setCaOnly(e.target.checked)} />
          🇨🇦 Canadian vendors only
        </label>
      </div>
      <div className="space-y-2">
        <p className="font-semibold text-navy">Promotions</p>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={saleOnly} onChange={(e) => setSaleOnly(e.target.checked)} />
          On sale only
        </label>
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="sticky top-16 z-30 -mx-4 mb-4 bg-background/95 px-4 py-2 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 md:py-0">
          <AISearchBar initialQuery={sp.raw ?? sp.q} compact />
        </div>

        <h1 className="font-display text-2xl font-extrabold text-navy">
          {sp.q ? <>Results for "<span className="text-electric">{sp.q}</span>"</> : "Browse all products"}
        </h1>

        {hasSmart && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-electric/30 bg-electric/5 px-3 py-2 text-xs text-navy">
            <Sparkles size={14} className="text-electric" />
            <span>Showing {smartBits.join(" ")}</span>
            <button onClick={clearSmart} className="ml-auto font-semibold text-electric hover:underline">
              Clear smart filters
            </button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {QUICK_CHIPS.map((chip) => (
            <Link
              key={chip.label}
              to="/search"
              search={chip.search as any}
              className="rounded-full border border-border bg-white px-2.5 py-1 text-xs text-navy hover:border-electric hover:text-electric"
            >
              {chip.label}
            </Link>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{results.length} products</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy lg:hidden"
            >
              <SlidersHorizontal size={14} /> Filters
            </button>
            <label className="inline-flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Sort:</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="rounded-md border border-border bg-white px-2 py-1.5 text-xs font-medium text-navy outline-none focus:border-electric"
              >
                <option value="relevance">Relevance</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="rating">Top rated</option>
                <option value="sold">Best sellers</option>
              </select>
            </label>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-28 rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                <Filter size={14} /> Filters
              </h2>
              <FilterPanel />
            </div>
          </aside>

          <div>
            {results.length > 0 ? (
              <ProductGrid products={results} cols={6} />
            ) : (
              <EmptyState
                icon={SearchIcon}
                title="No results"
                description="Try a different keyword or browse our categories."
                actionLabel="Browse categories"
                to="/categories"
              />
            )}
          </div>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-80 max-w-[85vw] overflow-y-auto bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-navy">Filters</h3>
              <button onClick={() => setDrawerOpen(false)} className="rounded-md p-1.5 hover:bg-muted">
                <X size={20} />
              </button>
            </div>
            <FilterPanel />
            <button
              onClick={() => setDrawerOpen(false)}
              className="mt-6 w-full rounded-md bg-electric px-4 py-2.5 text-sm font-bold text-electric-foreground"
            >
              Show {results.length} results
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
