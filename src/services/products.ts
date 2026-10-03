import { supabase } from "@/integrations/supabase/client";

export type ProductStatus = "draft" | "pending_review" | "active" | "rejected" | "archived";

export type ProductRecord = {
  id: string;
  vendor_id: string;
  slug: string;
  title: string;
  description: string | null;
  short_description: string | null;
  category_slug: string | null;
  price: number;
  compare_at_price: number | null;
  cost: number | null;
  sku: string | null;
  inventory_quantity: number;
  track_inventory: boolean;
  images: string[];
  supplier_source: string | null;
  supplier_product_id: string | null;
  supplier_url: string | null;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
};

export type ProductInput = Omit<
  ProductRecord,
  "id" | "vendor_id" | "slug" | "created_at" | "updated_at" | "images"
> & { images?: string[]; slug?: string };

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "product";

export async function listVendorProducts(vendorId: string) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ProductRecord[];
}

export async function getProduct(id: string) {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as unknown as ProductRecord | null;
}

export async function createProduct(vendorId: string, input: ProductInput) {
  const slug = (input.slug || slugify(input.title)) + "-" + Date.now().toString(36);
  const { data, error } = await supabase
    .from("products")
    .insert({
      vendor_id: vendorId,
      slug,
      title: input.title,
      description: input.description,
      short_description: input.short_description,
      category_slug: input.category_slug,
      price: input.price,
      compare_at_price: input.compare_at_price,
      cost: input.cost,
      sku: input.sku,
      inventory_quantity: input.inventory_quantity,
      track_inventory: input.track_inventory,
      images: input.images ?? [],
      supplier_source: input.supplier_source,
      supplier_product_id: input.supplier_product_id,
      supplier_url: input.supplier_url,
      status: input.status ?? "draft",
    })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as ProductRecord;
}

export async function updateProduct(id: string, patch: Partial<ProductInput>) {
  const { data, error } = await supabase.from("products").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as unknown as ProductRecord;
}

export async function setProductStatus(id: string, status: ProductStatus) {
  const { error } = await supabase.from("products").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function listAllProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as ProductRecord[];
}


export type BulkInventoryOperation = {
  productId: string;
  variantId?: string | null;
  mode: "set" | "delta";
  quantity: number;
};

export async function bulkSetVendorProductStatus(
  vendorId: string,
  productIds: string[],
  status: Extract<ProductStatus, "draft" | "pending_review" | "archived">,
) {
  const ids = [...new Set(productIds)];
  if (ids.length < 1 || ids.length > 500) {
    throw new Error("Select between 1 and 500 products.");
  }

  const { data, error } = await supabase.rpc(
    "bulk_set_vendor_product_status" as never,
    {
      _vendor_id: vendorId,
      _product_ids: ids,
      _requested_status: status,
    } as never,
  );
  if (error) throw error;
  return data as unknown as {
    ok: true;
    vendor_id: string;
    requested_status: ProductStatus;
    effective_status: ProductStatus;
    affected_count: number;
  };
}

export async function bulkAdjustVendorInventory(
  vendorId: string,
  operations: BulkInventoryOperation[],
) {
  if (operations.length < 1 || operations.length > 1000) {
    throw new Error("Inventory batch must contain 1 to 1000 operations.");
  }

  const { data, error } = await supabase.rpc(
    "bulk_adjust_vendor_inventory" as never,
    {
      _vendor_id: vendorId,
      _operations: operations.map((operation) => ({
        product_id: operation.productId,
        variant_id: operation.variantId ?? null,
        mode: operation.mode,
        quantity: operation.quantity,
      })),
    } as never,
  );
  if (error) throw error;
  return data as unknown as {
    ok: true;
    vendor_id: string;
    affected_count: number;
    parent_products: number;
    variants: number;
  };
}

export async function getVendorInventorySnapshot(
  vendorId: string,
  limit = 500,
  offset = 0,
) {
  const { data, error } = await supabase.rpc(
    "get_vendor_inventory_snapshot" as never,
    {
      _vendor_id: vendorId,
      _limit: limit,
      _offset: offset,
    } as never,
  );
  if (error) throw error;
  return (data ?? []) as unknown as Array<{
    product_id: string;
    product_title: string;
    product_status: ProductStatus;
    variant_id: string | null;
    sku: string | null;
    inventory_quantity: number;
    track_inventory: boolean;
    variant_active: boolean;
    updated_at: string;
  }>;
}

export async function listVendorCatalogAuditEvents(
  vendorId: string,
  limit = 100,
) {
  const { data, error } = await supabase.rpc(
    "list_vendor_catalog_audit_events" as never,
    {
      _vendor_id: vendorId,
      _limit: limit,
    } as never,
  );
  if (error) throw error;
  return (data ?? []) as unknown as Array<{
    id: string;
    kind: "bulk_status" | "bulk_inventory";
    affected_count: number;
    request_payload: Record<string, unknown>;
    result_payload: Record<string, unknown>;
    created_at: string;
  }>;
}
