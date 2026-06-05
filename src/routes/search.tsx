import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useState, useMemo } from "react";
import { Filter, Search as SearchIcon, SlidersHorizontal, X } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ProductGrid } from "@/components/ProductGrid";
import { EmptyState } from "@/components/EmptyState";
import { products, vendors } from "@/lib/data";

const searchSchema = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  component: SearchPage,
  head: () => ({ meta: [{ title: "Search — 1LV.CA" }] }),
});

type Sort = "relevance" | "price-asc" | "price-desc" | "rating" | "sold";

function SearchPage() {
  const { q } = Route.useSearch();
  const term = (q ?? "").trim().toLowerCase();

  const [sort, setSort] = useState<Sort>("relevance");
  const [maxPrice, setMaxPrice] = useState<number>(2000);
  const [freeShip, setFreeShip] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [caOnly, setCaOnly] = useState(false);
  const [saleOnly, setSaleOnly] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const results = useMemo(() => {
    let r = term
      ? products.filter((p) => p.title.toLowerCase().includes(term) || p.category.includes(term))
      : products;
    if (freeShip) r = r.filter((p) => p.shipping === "free" || p.shipping === "fast");
    if (minRating > 0) r = r.filter((p) => p.rating >= minRating);
    if (saleOnly) r = r.filter((p) => p.compareAt && p.compareAt > p.price);
    if (caOnly) {
      const caVendors = new Set(vendors.filter((v) => v.country === "CA").map((v) => v.slug));
      r = r.filter((p) => caVendors.has(p.vendorSlug));
    }
    r = r.filter((p) => p.price <= maxPrice);

    switch (sort) {
      case "price-asc": r = [...r].sort((a, b) => a.price - b.price); break;
      case "price-desc": r = [...r].sort((a, b) => b.price - a.price); break;
      case "rating": r = [...r].sort((a, b) => b.rating - a.rating); break;
      case "sold": r = [...r].sort((a, b) => b.sold - a.sold); break;
    }
    return r;
  }, [term, sort, maxPrice, freeShip, minRating, caOnly, saleOnly]);

  const FilterPanel = () => (
    <div className="space-y-5 text-sm">
      <div>
        <p className="mb-2 font-semibold text-navy">Max price: ${maxPrice}</p>
        <input
          type="range"
          min={10}
          max={2000}
          step={10}
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          className="w-full"
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
        <h1 className="font-display text-2xl font-extrabold text-navy">
          {term ? <>Results for "<span className="text-electric">{q}</span>"</> : "Browse all products"}
        </h1>

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
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                <Filter size={14} /> Filters
              </h3>
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
