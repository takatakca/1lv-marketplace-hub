export type SearchIntent = {
  query: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  freeShipping?: boolean;
  canadian?: boolean;
  rating?: number;
  sale?: boolean;
  sort?: "relevance" | "price-asc" | "price-desc" | "rating" | "sold";
  vendor?: string;
};

const CATEGORY_HINTS: Record<string, string[]> = {
  electronics: ["headphone", "headphones", "earbuds", "phone", "laptop", "electronic", "charger", "camera", "tv"],
  fashion: ["shoe", "shoes", "shirt", "dress", "jacket", "clothing", "fashion", "sneaker", "hoodie"],
  home: ["home", "kitchen", "furniture", "decor", "lamp", "bedding", "sofa"],
  beauty: ["beauty", "makeup", "skincare", "perfume", "cosmetic"],
  sports: ["sport", "fitness", "camping", "tent", "bike", "yoga", "outdoor", "hiking"],
  toys: ["toy", "toys", "kids", "game", "lego", "puzzle"],
  auto: ["car", "auto", "tire", "motor"],
  pets: ["pet", "dog", "cat"],
};

const STOP_PHRASES = [
  "gift for mom", "gift for dad", "gift for her", "gift for him",
];

const NOISE_WORDS = new Set([
  "cheap", "cheapest", "best", "top", "good", "nice", "the", "a", "an", "some",
  "show", "me", "find", "want", "need", "buy", "please", "with", "and", "for",
  "from", "in", "on", "of", "shipped", "shipping", "free", "sale", "deal",
  "deals", "discount", "discounted", "under", "below", "over", "above", "max",
  "min", "maximum", "minimum", "than", "less", "more", "canada", "canadian",
  "star", "stars", "rating", "rated", "price", "priced", "cost", "up", "to",
  "new", "newest", "popular", "trending", "seller", "sellers", "store", "stores",
]);

function toNumber(raw: string): number | undefined {
  const n = Number(raw.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/** Deterministic, offline shopping-intent parser. Never throws. */
export function parseSearchIntent(input: string): SearchIntent {
  const original = (input ?? "").toString().slice(0, 200);
  const text = original.toLowerCase().trim();
  const intent: SearchIntent = { query: original.trim() };
  if (!text) return intent;

  let rest = text;

  // Price ranges: "between 20 and 50", "$20-$50"
  const between = rest.match(/between\s*\$?(\d+(?:\.\d+)?)\s*(?:and|-|to)\s*\$?(\d+(?:\.\d+)?)/);
  const dashRange = rest.match(/\$(\d+(?:\.\d+)?)\s*-\s*\$?(\d+(?:\.\d+)?)/);
  const range = between ?? dashRange;
  if (range) {
    const a = toNumber(range[1]);
    const b = toNumber(range[2]);
    if (a !== undefined && b !== undefined) {
      intent.minPrice = Math.min(a, b);
      intent.maxPrice = Math.max(a, b);
    }
    rest = rest.replace(range[0], " ");
  }

  if (intent.maxPrice === undefined) {
    const max = rest.match(/(?:under|below|less than|cheaper than|up to|max|maximum of)\s*\$?(\d+(?:\.\d+)?)/);
    if (max) {
      intent.maxPrice = toNumber(max[1]);
      rest = rest.replace(max[0], " ");
    }
  }
  if (intent.minPrice === undefined) {
    const min = rest.match(/(?:over|above|more than|at least|min|minimum of)\s*\$?(\d+(?:\.\d+)?)/);
    if (min) {
      intent.minPrice = toNumber(min[1]);
      rest = rest.replace(min[0], " ");
    }
  }

  if (/\bfree shipping\b|\bfree ship\b|\bships? free\b/.test(rest)) {
    intent.freeShipping = true;
    rest = rest.replace(/\bfree shipping\b|\bfree ship\b|\bships? free\b/g, " ");
  }
  if (/\bfast shipping\b|\bquick delivery\b/.test(rest)) {
    intent.freeShipping = true;
    rest = rest.replace(/\bfast shipping\b|\bquick delivery\b/g, " ");
  }

  if (/\bcanad(a|ian)\b|\bfrom canada\b|🇨🇦/.test(rest)) {
    intent.canadian = true;
    rest = rest.replace(/\bshipped from canada\b|\bfrom canada\b|\bcanadian sellers?\b|\bcanadian\b|\bcanada\b|🇨🇦/g, " ");
  }

  if (/\bon sale\b|\bdiscount(ed)?\b|\bdeals?\b|\bclearance\b/.test(rest)) {
    intent.sale = true;
    rest = rest.replace(/\bon sale\b|\bdiscounted\b|\bdiscount\b|\bdeals?\b|\bclearance\b/g, " ");
  }

  const rating = rest.match(/(\d(?:\.\d)?)\s*\+?\s*(?:star|stars)\b|\brated\s*(\d(?:\.\d)?)\+?/);
  if (rating) {
    const val = toNumber(rating[1] ?? rating[2] ?? "");
    if (val !== undefined && val > 0 && val <= 5) intent.rating = val;
    rest = rest.replace(rating[0], " ");
  }
  if (intent.rating === undefined && /\btop rated\b|\bhighly rated\b|\bbest rated\b/.test(rest)) {
    intent.rating = 4;
    intent.sort = "rating";
    rest = rest.replace(/\btop rated\b|\bhighly rated\b|\bbest rated\b/g, " ");
  }

  if (/\bcheapest\b|\bcheap\b|\blowest price\b|\bprice low to high\b/.test(rest)) intent.sort = intent.sort ?? "price-asc";
  if (/\bmost expensive\b|\bpremium\b|\bprice high to low\b/.test(rest)) intent.sort = "price-desc";
  if (/\bbest sell(er|ers|ing)\b|\bmost popular\b|\bpopular\b/.test(rest)) intent.sort = "sold";
  if (/\bnewest\b|\bnew arrivals?\b/.test(rest)) intent.sort = intent.sort ?? "relevance";

  // Category detection from remaining words
  for (const [slug, words] of Object.entries(CATEGORY_HINTS)) {
    if (words.some((w) => new RegExp(`\\b${w}\\b`).test(rest))) {
      intent.category = slug;
      break;
    }
  }

  // Keep meaningful keywords for the free-text query
  let keywordSource = rest;
  for (const phrase of STOP_PHRASES) {
    if (text.includes(phrase)) keywordSource = keywordSource.replace(phrase, " ");
  }
  const keywords = keywordSource
    .replace(/[^a-z0-9$+.\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[-.]+|[-.]+$/g, ""))
    .filter((w) => w.length > 1 && !NOISE_WORDS.has(w) && !/^\d+$/.test(w));

  intent.query = keywords.join(" ").trim() || (intent.category ? "" : original.trim());
  return intent;
}

/** Human-readable summary, e.g. "Showing wireless headphones under $50 with free shipping". */
export function describeIntent(intent: SearchIntent): string {
  const parts: string[] = [];
  parts.push(intent.query ? intent.query : "all products");
  if (intent.category) parts.push(`in ${intent.category}`);
  if (intent.minPrice !== undefined && intent.maxPrice !== undefined)
    parts.push(`between $${intent.minPrice} and $${intent.maxPrice}`);
  else if (intent.maxPrice !== undefined) parts.push(`under $${intent.maxPrice}`);
  else if (intent.minPrice !== undefined) parts.push(`over $${intent.minPrice}`);
  if (intent.freeShipping) parts.push("with free shipping");
  if (intent.canadian) parts.push("from Canadian sellers");
  if (intent.rating) parts.push(`rated ${intent.rating}+ stars`);
  if (intent.sale) parts.push("on sale");
  return `Showing ${parts.join(" ")}`;
}

/** Convert an intent into URL-safe /search params. */
export function intentToSearchParams(intent: SearchIntent) {
  const params: Record<string, string | number | boolean> = {};
  if (intent.query) params.q = intent.query;
  if (intent.category) params.category = intent.category;
  if (intent.minPrice !== undefined) params.minPrice = intent.minPrice;
  if (intent.maxPrice !== undefined) params.maxPrice = intent.maxPrice;
  if (intent.freeShipping) params.freeShipping = true;
  if (intent.canadian) params.canadian = true;
  if (intent.rating) params.rating = intent.rating;
  if (intent.sale) params.sale = true;
  if (intent.sort && intent.sort !== "relevance") params.sort = intent.sort;
  return params;
}
