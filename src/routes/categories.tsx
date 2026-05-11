import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { categories, productsByCategory } from "@/lib/data";

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
  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="font-display text-3xl font-extrabold text-navy">All categories</h1>
        <p className="mt-1 text-sm text-muted-foreground">Find products from {categories.length} curated categories.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => {
            const sample = productsByCategory(c.slug).slice(0, 3);
            return (
              <Link
                key={c.slug}
                to="/category/$slug"
                params={{ slug: c.slug }}
                className="group flex gap-4 rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-electric hover:shadow-elevated"
              >
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-electric/10 to-deal/10 text-4xl">
                  {c.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-navy group-hover:text-electric">{c.name}</h3>
                  <p className="text-xs text-muted-foreground">{c.subcategories.join(" · ")}</p>
                  <div className="mt-3 flex gap-1.5">
                    {sample.map((p) => (
                      <img key={p.id} src={p.images[0]} alt="" className="h-9 w-9 rounded object-cover" />
                    ))}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
