import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { categories as demoCategoryMeta } from "@/lib/data";
import { usePublicCategories } from "@/hooks/use-public-categories";

export const Route = createFileRoute("/categories")({
  component: AllCategories,
  head: () => ({
    meta: [
      { title: "All Categories — 1LV.CA" },
      { name: "description", content: "Browse all product categories on 1LV.CA — electronics, home, fashion, beauty, sports and more." },
    ],
  }),
});

function AllCategories() {
  const {
    categories,
    demo,
    loading,
    error,
  } = usePublicCategories();

  const rootCategories = categories.filter(
    (category) => category.parent_slug === null,
  );
  const displayCategories =
    rootCategories.length > 0 ? rootCategories : categories;

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="font-display text-3xl font-extrabold text-navy">All categories</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading
            ? "Loading live categories…"
            : demo
              ? `Browse ${displayCategories.length} preview categories.`
              : `Browse ${displayCategories.length} active marketplace categories.`}
        </p>

        {error && !demo ? (
          <div className="mt-6 rounded-xl border border-destructive/30 bg-card p-8 text-center text-sm text-destructive">
            Live categories could not be loaded. Please try again.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayCategories.map((category) => {
              const meta = demoCategoryMeta.find(
                (item) => item.slug === category.slug,
              );
              const liveChildren = categories
                .filter((item) => item.parent_slug === category.slug)
                .map((item) => item.name_en);
              const subcategories =
                demo && meta ? meta.subcategories : liveChildren;

              return (
                <Link
                  key={category.slug}
                  to="/category/$slug"
                  params={{ slug: category.slug }}
                  className="group flex gap-4 rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-electric hover:shadow-elevated"
                >
                  <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-electric/10 to-deal/10 text-4xl">
                    {meta?.emoji ?? "📦"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-navy group-hover:text-electric">
                      {category.name_en}
                    </h3>
                    {subcategories.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {subcategories.join(" · ")}
                      </p>
                    )}
                    <p className="mt-3 text-[11px] font-semibold text-electric">
                      Browse live products
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
