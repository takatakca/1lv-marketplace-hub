import { supabase } from "@/integrations/supabase/client";
import {
  cartLineId,
  isLiveProductId,
  normalizeCartVariant,
  type CartItem,
} from "@/lib/cart-model";

type AccountCartRow = {
  product_id: string;
  variant_id: string | null;
  slug: string;
  title: string;
  vendor_slug: string;
  unit_price: number | string;
  image_url: string | null;
  variant_sku: string | null;
  variant_options: Record<string, string> | null;
  quantity: number;
  available: boolean;
  max_quantity: number;
};

export async function listAccountCartItems(): Promise<CartItem[]> {
  const { data, error } = await supabase.rpc("list_my_cart_items" as never);
  if (error) throw error;
  return ((data ?? []) as unknown as AccountCartRow[])
    .filter((row) =>
      row && isLiveProductId(row.product_id) &&
      typeof row.slug === "string" && typeof row.title === "string" &&
      typeof row.vendor_slug === "string" &&
      Number.isFinite(Number(row.unit_price)) && Number(row.unit_price) >= 0,
    )
    .map((row) => {
      const variantId = row.variant_id ?? undefined;
      const variant = normalizeCartVariant(row.variant_options ?? undefined);
      return {
        lineId: cartLineId(row.product_id, variant, variantId),
        productId: row.product_id,
        variantId,
        variantSku: row.variant_sku ?? undefined,
        variant,
        slug: row.slug,
        title: row.title,
        vendorSlug: row.vendor_slug,
        image: row.image_url ?? "",
        price: Number(row.unit_price),
        qty: row.quantity,
        available: row.available,
        maxQty: row.max_quantity,
      };
    });
}

/** Only live UUID products are eligible for the database merge. */
export async function mergeGuestCartIntoAccount(items: CartItem[]): Promise<void> {
  const guestLines = items
    .filter((i) => isLiveProductId(i.productId) && (!i.variantId || isLiveProductId(i.variantId)))
    .slice(0, 100)
    .map((i) => ({
      product_id: i.productId,
      variant_id: i.variantId ?? null,
      quantity: i.qty,
    }));
  if (!guestLines.length) return;
  const { error } = await supabase.rpc("merge_guest_cart" as never, {
    _items: guestLines,
  } as never);
  if (error) throw error;
}

export async function setAccountCartItem(
  item: Pick<CartItem, "productId" | "variantId">,
  quantity: number,
): Promise<number> {
  if (!isLiveProductId(item.productId)) return quantity;
  const { data, error } = await supabase.rpc("set_my_cart_item" as never, {
    _product_id: item.productId,
    _variant_id: item.variantId ?? null,
    _quantity: quantity,
  } as never);
  if (error) throw error;
  const result = data as unknown as { quantity?: number } | null;
  return Number(result?.quantity ?? quantity);
}

export async function clearAccountCart(): Promise<void> {
  const { error } = await supabase.rpc("clear_my_cart" as never);
  if (error) throw error;
}
