import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { ProductGrid } from "@/components/ProductGrid";
import { getCategory as getDemoCategory } from "@/lib/data";
import { usePublicCatalog } from "@/hooks/use-public-catalog";
import { searchPublicCatalogProducts } from "@/services/public-catalog";
import { getPublicMarketplaceSettings } from "@/lib/public-marketplace-settings.functions";
import { getPublicCategoryBySlug, listPublicCategories } from "@/services/public-categories";

export const Route = createFileRoute("/category/$slug")({
  component: CategoryPage,
  loader: async ({ params }) => {
    const settings = await getPublicMarketplaceSettings().catch(() => null);
    let liveCategories: Awaited<ReturnType<typeof listPublicCategories>> = [];

    try {
      const [category, categories] = await Promise.all([
        getPublicCategoryBySlug(params.slug),
        listPublicCategories(),
      ]);
      liveCategories = categories;

      if (category) {
        const knownMeta = getDemoCategory(category.slug);
        return {
          cat: {
            slug: category.slug,
            name: category.name_en,
            emoji: knownMeta?.emoji ?? "📦",
            subcategories: categories
              .filter((item) => item.parent_slug === category.slug)
              .map((item) => item.name_en),
          },
        };
      }
    } catch (error) {
      if (!settings?.demo_mode) throw error;
    }

    if (settings?.demo_mode && liveCategories.length === 0) {
      const demoCategory = getDemoCategory(params.slug);
      if (demoCategory) return { cat: demoCategory };
    }

    throw notFound();
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.cat.name ?? "Category"} — 1LV.CA` },
      { name: "description", content: `Shop ${loaderData?.cat.name ?? "products"} on 1LV.CA from Canadian and global vendors.` },
    ],
  }),
});

function CategoryPage() {
  const { cat } = Route.useLoaderData();
  const { products, demo, loading: catalogLoading } = usePublicCatalog();
  const [minPriceInput, setMinPriceInput] = useState("");
  const [maxPriceInput, setMaxPriceInput] = useState("");
  const [caOnly, setCaOnly] = useState(false);
  const [freeShip, setFreeShip] = useState(false);
  const [fastShip, setFastShip] = useState(false);

  const minPrice =
    minPriceInput.trim() === "" || !Number.isFinite(Number(minPriceInput))
      ? undefined
      : Math.max(0, Number(minPriceInput));
  const maxPrice =
    maxPriceInput.trim() === "" || !Number.isFinite(Number(maxPriceInput))
      ? undefined
      : Math.max(0, Number(maxPriceInput));

  const liveCategoryQuery = useQuery({
    queryKey: [
      "public-marketplace-category",
      cat.slug,
      minPrice ?? null,
      maxPrice ?? null,
      caOnly,
    ],
    queryFn: () =>
      searchPublicCatalogProducts({
        categorySlug: cat.slug,
        minPrice,
        maxPrice,
        canadianOnly: caOnly,
        sort: "relevance",
        limit: 500,
      }),
    enabled: !demo && !catalogLoading,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const items = useMemo(() => {
    if (!demo) return liveCategoryQuery.data ?? [];

    let filtered = products.filter(
      (product) => product.category === cat.slug,
    );
    if (minPrice !== undefined) {
      filtered = filtered.filter((product) => product.price >= minPrice);
    }
    if (maxPrice !== undefined) {
      filtered = filtered.filter((product) => product.price <= maxPrice);
    }
    if (caOnly) {
      filtered = filtered.filter(
        (product) =>
          product.vendorCountry === "CA" || product.tags.includes("local"),
      );
    }
    if (freeShip) {
      filtered = filtered.filter((product) => product.shipping === "free");
    }
    if (fastShip) {
      filtered = filtered.filter((product) => product.shipping === "fast");
    }
    return filtered;
  }, [
    products,
    demo,
    liveCategoryQuery.data,
    cat.slug,
    minPrice,
    maxPrice,
    caOnly,
    freeShip,
    fastShip,
  ]);

  const loading =
    catalogLoading || (!demo && liveCategoryQuery.isPending);
  const loadError =
    !demo && liveCategoryQuery.error instanceof Error
      ? liveCategoryQuery.error.message
      : null;

  return (
    <AppLayout>
      <div className="border-b border-border bg-gradient-to-b from-muted/40 to-transparent">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <p className="text-xs font-bold uppercase tracking-widest text-electric">Category</p>
          <h1 className="mt-1 flex items-center gap-3 font-display text-3xl font-extrabold text-navy">
            <span className="text-4xl">{cat.emoji}</span> {cat.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{loading ? "Loading live products…" : `${items.length} products from trusted vendors`}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {cat.subcategories.map((s: string) => (
              <span key={s} className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-navy">
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <aside className="hidden lg:block">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Filters</h3>
            <div className="space-y-4 rounded-xl border border-border bg-card p-4 text-sm">
              <div>
                <p className="font-semibold text-navy">Price (CAD)</p>
                <div className="mt-2 flex gap-2">
                  <input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    value={minPriceInput}
                    onChange={(event) => setMinPriceInput(event.target.value)}
                    className="w-full rounded-md border border-border px-2 py-1 text-xs"
                    placeholder="Min"
                    aria-label="Minimum price"
                  />
                  <input
                    type="number"
                    min={0}
                    inputMode="decimal"
                    value={maxPriceInput}
                    onChange={(event) => setMaxPriceInput(event.target.value)}
                    className="w-full rounded-md border border-border px-2 py-1 text-xs"
                    placeholder="Max"
                    aria-label="Maximum price"
                  />
                </div>
              </div>
              {demo && (
                <div>
                  <p className="font-semibold text-navy">Shipping</p>
                  <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={freeShip} onChange={(event) => setFreeShip(event.target.checked)} /> Free shipping</label>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={fastShip} onChange={(event) => setFastShip(event.target.checked)} /> Fast (2-day)</label>
                </div>
              )}
              <div>
                <p className="font-semibold text-navy">Vendor</p>
                <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={caOnly} onChange={(event) => setCaOnly(event.target.checked)} /> 🇨🇦 Canadian only</label>
              </div>
            </div>
          </aside>
          {loading ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Loading the live category…
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-destructive/30 bg-card p-8 text-center text-sm text-destructive">
              Could not load this category. Please try again.
            </div>
          ) : (
            <ProductGrid products={items} />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
