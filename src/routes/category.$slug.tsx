import { createFileRoute, notFound } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { ProductGrid } from "@/components/ProductGrid";
import { getCategory, productsByCategory } from "@/lib/data";

export const Route = createFileRoute("/category/$slug")({
  component: CategoryPage,
  loader: ({ params }) => {
    const cat = getCategory(params.slug);
    if (!cat) throw notFound();
    return { cat };
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
  const items = productsByCategory(cat.slug);
  return (
    <AppLayout>
      <div className="border-b border-border bg-gradient-to-b from-muted/40 to-transparent">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <p className="text-xs font-bold uppercase tracking-widest text-electric">Category</p>
          <h1 className="mt-1 flex items-center gap-3 font-display text-3xl font-extrabold text-navy">
            <span className="text-4xl">{cat.emoji}</span> {cat.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{items.length} products from trusted vendors</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {cat.subcategories.map((s) => (
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
                  <input className="w-full rounded-md border border-border px-2 py-1 text-xs" placeholder="Min" />
                  <input className="w-full rounded-md border border-border px-2 py-1 text-xs" placeholder="Max" />
                </div>
              </div>
              <div>
                <p className="font-semibold text-navy">Shipping</p>
                <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" /> Free shipping</label>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" /> Fast (2-day)</label>
              </div>
              <div>
                <p className="font-semibold text-navy">Vendor</p>
                <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" /> 🇨🇦 Canadian only</label>
              </div>
            </div>
          </aside>
          <ProductGrid products={items} />
        </div>
      </div>
    </AppLayout>
  );
}
