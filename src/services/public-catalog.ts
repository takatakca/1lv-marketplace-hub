import { supabase } from "@/integrations/supabase/client";
import type { Product, Vendor } from "@/lib/data";

type PublicCatalogProductRow = {
  id: string;
  vendor_id: string;
  vendor_slug: string;
  vendor_name: string;
  vendor_country: string;
  slug: string;
  title: string;
  description: string | null;
  short_description: string | null;
  category_slug: string | null;
  price: number | string;
  compare_at_price: number | string | null;
  inventory_quantity: number;
  track_inventory: boolean;
  images: unknown;
  sold_count: number | string;
  created_at: string;
  updated_at: string;
};

type PublicCatalogVendorRow = {
  id: string;
  slug: string;
  store_name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  return_policy: string | null;
  shipping_policy: string | null;
  country: string;
  created_at: string;
};

function imageList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function productTags(
  row: PublicCatalogProductRow,
): Product["tags"] {
  const tags: Product["tags"] = [];
  const created = new Date(row.created_at).getTime();
  if (Number.isFinite(created) && Date.now() - created <= 30 * 24 * 60 * 60 * 1000) {
    tags.push("new");
  }
  if (row.vendor_country === "CA") tags.push("local");
  return tags;
}

export function mapPublicProduct(row: PublicCatalogProductRow): Product {
  const price = Number(row.price ?? 0);
  const compareAt =
    row.compare_at_price == null ? undefined : Number(row.compare_at_price);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category_slug ?? "uncategorized",
    vendorSlug: row.vendor_slug,
    vendorName: row.vendor_name,
    vendorCountry: row.vendor_country,
    price,
    ...(compareAt !== undefined && Number.isFinite(compareAt) && compareAt > 0
      ? { compareAt }
      : {}),
    rating: 0,
    reviews: 0,
    sold: Number(row.sold_count ?? 0),
    images: imageList(row.images),
    tags: productTags(row),
    shipping: "standard",
    description:
      row.description?.trim() ||
      row.short_description?.trim() ||
      "Product available from a verified 1LV.CA marketplace vendor.",
    createdAt: row.created_at,
    inventoryQuantity: row.inventory_quantity,
    trackInventory: row.track_inventory,
  };
}

export function mapPublicVendor(row: PublicCatalogVendorRow): Vendor {
  const created = new Date(row.created_at).getTime();
  const yearsActive = Number.isFinite(created)
    ? Math.max(0, Math.floor((Date.now() - created) / (365.25 * 24 * 60 * 60 * 1000)))
    : 0;

  return {
    id: row.id,
    slug: row.slug,
    name: row.store_name,
    rating: 0,
    city: "",
    country: row.country,
    yearsActive,
    description: row.description,
    logoUrl: row.logo_url,
    bannerUrl: row.banner_url,
    shippingPolicy: row.shipping_policy,
    returnPolicy: row.return_policy,
  };
}

export async function listPublicCatalogProducts(limit = 200): Promise<Product[]> {
  const { data, error } = await supabase.rpc(
    "list_public_catalog_products" as never,
    { _limit: limit } as never,
  );
  if (error) throw error;
  return ((data ?? []) as unknown as PublicCatalogProductRow[]).map(mapPublicProduct);
}

export type PublicCatalogSearchSort =
  | "relevance"
  | "price-asc"
  | "price-desc"
  | "sold"
  | "newest";

export type PublicCatalogSearchFilters = {
  query?: string;
  categorySlug?: string;
  minPrice?: number;
  maxPrice?: number;
  canadianOnly?: boolean;
  saleOnly?: boolean;
  sort?: PublicCatalogSearchSort;
  limit?: number;
};

export async function searchPublicCatalogProducts(
  filters: PublicCatalogSearchFilters,
): Promise<Product[]> {
  const { data, error } = await supabase.rpc(
    "search_public_catalog_products" as never,
    {
      _query: filters.query?.trim() || null,
      _category_slug: filters.categorySlug?.trim() || null,
      _min_price:
        typeof filters.minPrice === "number" ? filters.minPrice : null,
      _max_price:
        typeof filters.maxPrice === "number" ? filters.maxPrice : null,
      _canadian_only: Boolean(filters.canadianOnly),
      _sale_only: Boolean(filters.saleOnly),
      _sort: filters.sort ?? "relevance",
      _limit: filters.limit ?? 200,
    } as never,
  );
  if (error) throw error;
  return ((data ?? []) as unknown as PublicCatalogProductRow[]).map(
    mapPublicProduct,
  );
}

export async function listPublicCatalogProductsForVendor(
  vendorSlug: string,
  limit = 200,
): Promise<Product[]> {
  const { data, error } = await supabase.rpc(
    "list_public_catalog_products_for_vendor" as never,
    { _vendor_slug: vendorSlug, _limit: limit } as never,
  );
  if (error) throw error;
  return ((data ?? []) as unknown as PublicCatalogProductRow[]).map(mapPublicProduct);
}

export async function getPublicCatalogProductBySlug(
  slug: string,
): Promise<Product | null> {
  const { data, error } = await supabase.rpc(
    "get_public_catalog_product_by_slug" as never,
    { _slug: slug } as never,
  );
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapPublicProduct(row as unknown as PublicCatalogProductRow) : null;
}

export async function listPublicCatalogProductsForCategory(
  categorySlug: string,
  limit = 24,
): Promise<Product[]> {
  const { data, error } = await supabase.rpc(
    "list_public_catalog_products_for_category" as never,
    { _category_slug: categorySlug, _limit: limit } as never,
  );
  if (error) throw error;
  return ((data ?? []) as unknown as PublicCatalogProductRow[]).map(mapPublicProduct);
}

export async function getPublicCatalogVendorBySlug(
  slug: string,
): Promise<Vendor | null> {
  const { data, error } = await supabase.rpc(
    "get_public_vendor_by_slug" as never,
    { _slug: slug } as never,
  );
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapPublicVendor(row as unknown as PublicCatalogVendorRow) : null;
}

export async function listPublicCatalogVendors(limit = 200): Promise<Vendor[]> {
  const { data, error } = await supabase.rpc(
    "list_public_vendors" as never,
    { _limit: limit } as never,
  );
  if (error) throw error;
  return ((data ?? []) as unknown as PublicCatalogVendorRow[]).map(mapPublicVendor);
}
