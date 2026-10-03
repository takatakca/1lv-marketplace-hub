import { supabase } from "@/integrations/supabase/client";

export type ProductVariantOptionValue = {
  id: string;
  value: string;
  position: number;
};

export type ProductVariantOption = {
  id: string;
  name: string;
  position: number;
  values: ProductVariantOptionValue[];
};

export type PublicProductVariant = {
  id: string;
  sku: string;
  price: number;
  compare_at_price: number | null;
  available: boolean;
  low_stock: boolean;
  image_url: string | null;
  weight_grams: number | null;
  position: number;
  attributes: Record<string, string>;
};

export type VendorProductVariant = PublicProductVariant & {
  barcode: string | null;
  cost: number | null;
  inventory_quantity: number;
  track_inventory: boolean;
  active: boolean;
};

export type PublicProductVariantMatrix = {
  options: ProductVariantOption[];
  variants: PublicProductVariant[];
};

export type VendorProductVariantMatrix = {
  options: ProductVariantOption[];
  variants: VendorProductVariant[];
};

function normalizeMatrix<TVariant>(
  raw: unknown,
): { options: ProductVariantOption[]; variants: TVariant[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { options: [], variants: [] };
  }
  const value = raw as {
    options?: ProductVariantOption[];
    variants?: TVariant[];
  };
  return {
    options: Array.isArray(value.options) ? value.options : [],
    variants: Array.isArray(value.variants) ? value.variants : [],
  };
}

export async function getPublicProductVariantMatrix(
  productId: string,
): Promise<PublicProductVariantMatrix> {
  const { data, error } = await supabase.rpc(
    "get_public_product_variant_matrix" as never,
    { _product_id: productId } as never,
  );
  if (error) throw error;
  return normalizeMatrix<PublicProductVariant>(data);
}

export async function getVendorProductVariantMatrix(
  productId: string,
): Promise<VendorProductVariantMatrix> {
  const { data, error } = await supabase.rpc(
    "get_vendor_product_variant_matrix" as never,
    { _product_id: productId } as never,
  );
  if (error) throw error;
  return normalizeMatrix<VendorProductVariant>(data);
}

export async function saveProductOption(input: {
  productId: string;
  optionId?: string | null;
  name: string;
  position?: number;
}) {
  const { data, error } = await supabase.rpc(
    "upsert_vendor_product_option" as never,
    {
      _product_id: input.productId,
      _option_id: input.optionId ?? null,
      _name: input.name,
      _position: input.position ?? 0,
    } as never,
  );
  if (error) throw error;
  return data as unknown as string;
}

export async function saveProductOptionValue(input: {
  optionId: string;
  valueId?: string | null;
  value: string;
  position?: number;
}) {
  const { data, error } = await supabase.rpc(
    "upsert_vendor_product_option_value" as never,
    {
      _option_id: input.optionId,
      _value_id: input.valueId ?? null,
      _value: input.value,
      _position: input.position ?? 0,
    } as never,
  );
  if (error) throw error;
  return data as unknown as string;
}

export async function saveProductVariant(input: {
  productId: string;
  variantId?: string | null;
  sku: string;
  price: number;
  compareAtPrice?: number | null;
  cost?: number | null;
  inventoryQuantity: number;
  trackInventory: boolean;
  active: boolean;
  optionValueIds: string[];
  barcode?: string | null;
  imageUrl?: string | null;
  weightGrams?: number | null;
  position?: number;
}) {
  const { data, error } = await supabase.rpc(
    "upsert_vendor_product_variant" as never,
    {
      _product_id: input.productId,
      _variant_id: input.variantId ?? null,
      _sku: input.sku,
      _price: input.price,
      _compare_at_price: input.compareAtPrice ?? null,
      _cost: input.cost ?? null,
      _inventory_quantity: input.inventoryQuantity,
      _track_inventory: input.trackInventory,
      _active: input.active,
      _option_value_ids: input.optionValueIds,
      _barcode: input.barcode ?? null,
      _image_url: input.imageUrl ?? null,
      _weight_grams: input.weightGrams ?? null,
      _position: input.position ?? 0,
    } as never,
  );
  if (error) throw error;
  return data as unknown as {
    ok: true;
    variant_id: string;
    product_id: string;
    sku: string;
    option_signature: string;
  };
}

export async function archiveProductVariant(variantId: string) {
  const { data, error } = await supabase.rpc(
    "archive_vendor_product_variant" as never,
    { _variant_id: variantId } as never,
  );
  if (error) throw error;
  return data === true;
}
