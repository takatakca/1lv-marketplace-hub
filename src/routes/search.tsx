import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AppLayout } from "@/components/AppLayout";
import { ProductGrid } from "@/components/ProductGrid";
import { EmptyState } from "@/components/EmptyState";
import { products } from "@/lib/data";
import { Search as SearchIcon } from "lucide-react";

const searchSchema = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  component: SearchPage,
  head: () => ({ meta: [{ title: "Search — 1LV.CA" }] }),
});

function SearchPage() {
  const { q } = Route.useSearch();
  const term = (q ?? "").trim().toLowerCase();
  const results = term
    ? products.filter((p) => p.title.toLowerCase().includes(term) || p.category.includes(term))
    : products;

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="font-display text-2xl font-extrabold text-navy">
          {term ? <>Results for "<span className="text-electric">{q}</span>"</> : "Browse all products"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{results.length} products</p>
        <div className="mt-6">
          {results.length > 0 ? (
            <ProductGrid products={results} />
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
    </AppLayout>
  );
}
