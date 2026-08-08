import { parseSearchIntent, type SearchIntent } from "@/lib/search-intent";
import { categories, products, vendors } from "@/lib/data";

const RECENT_KEY = "1lvca:recent-searches:v1";
const MAX_RECENT = 8;

/* ---------------- Recent searches (localStorage for guests) ---------------- */

export function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function pushRecentSearch(term: string): string[] {
  const clean = (term ?? "").trim().slice(0, 120);
  if (!clean || typeof window === "undefined") return getRecentSearches();
  const next = [clean, ...getRecentSearches().filter((t) => t.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — search must still work */
  }
  return next;
}

export function clearRecentSearches(): string[] {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      /* noop */
    }
  }
  return [];
}

/**
 * Placeholder for future Supabase-backed history for signed-in users.
 * Intentionally a no-op today; search must never block on the database.
 */
export async function syncRecentSearches(_userId?: string | null): Promise<string[]> {
  return getRecentSearches();
}

/* ---------------- Intent enhancement ---------------- */

const AI_BACKEND_ENABLED = false;

/**
 * Returns the deterministic local parse today. When a server AI endpoint is
 * added later, enrich the local result here — never call an AI provider (or
 * hold an API key) from the browser.
 */
export async function enhanceSearchIntent(query: string): Promise<SearchIntent> {
  const local = parseSearchIntent(query);
  if (!AI_BACKEND_ENABLED) return local;
  return local;
}

/* ---------------- Suggestions ---------------- */

export type Suggestion =
  | { kind: "product"; id: string; label: string; slug: string; price: number; image?: string }
  | { kind: "category"; id: string; label: string; slug: string; emoji: string }
  | { kind: "store"; id: string; label: string; slug: string; country: string };

export const TRENDING_SEARCHES = [
  "wireless earbuds",
  "camping tent",
  "phone accessories",
  "running shoes",
  "kitchen gadgets",
  "gift under $25",
];

export type QuickChip = { label: string; search: Record<string, string | number | boolean> };

export const QUICK_CHIPS: QuickChip[] = [
  { label: "Deals under $10", search: { maxPrice: 10, sale: true } },
  { label: "Free shipping", search: { freeShipping: true } },
  { label: "Canadian sellers", search: { canadian: true } },
  { label: "Best sellers", search: { sort: "sold" } },
  { label: "Top rated", search: { rating: 4.5, sort: "rating" } },
  { label: "On sale", search: { sale: true } },
];

export function getSuggestions(term: string, limit = 8): Suggestion[] {
  const t = (term ?? "").trim().toLowerCase();
  if (!t) return [];

  const cats: Suggestion[] = categories
    .filter((c) => c.name.toLowerCase().includes(t) || c.slug.includes(t) || c.subcategories.some((s) => s.toLowerCase().includes(t)))
    .slice(0, 3)
    .map((c) => ({ kind: "category", id: `c-${c.slug}`, label: c.name, slug: c.slug, emoji: c.emoji }));

  const stores: Suggestion[] = vendors
    .filter((v) => v.name.toLowerCase().includes(t) || v.slug.includes(t))
    .slice(0, 3)
    .map((v) => ({ kind: "store", id: `v-${v.slug}`, label: v.name, slug: v.slug, country: v.country }));

  const prods: Suggestion[] = products
    .filter((p) => p.title.toLowerCase().includes(t))
    .slice(0, limit)
    .map((p) => ({ kind: "product", id: p.id, label: p.title, slug: p.slug, price: p.price, image: p.images[0] }));

  return [...cats, ...stores, ...prods].slice(0, limit + 4);
}
