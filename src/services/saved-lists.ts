import { supabase } from "@/integrations/supabase/client";
import {
  mapPublicProduct,
  type PublicCatalogProductRow,
} from "@/services/public-catalog";
import type { Product } from "@/lib/data";

export type SavedListSummary = {
  id: string;
  name: string;
  is_default: boolean;
  item_count: number | string;
  created_at: string;
  updated_at: string;
};

export async function getDefaultWishlistIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc(
    "get_my_default_wishlist_ids" as never,
  );
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{ product_id: string }>).map(
    (row) => row.product_id,
  );
}

export async function mergeGuestWishlist(productIds: string[]) {
  const unique = [...new Set(productIds)].slice(0, 250);
  if (unique.length === 0) {
    return { ok: true as const, added: 0 };
  }
  const { data, error } = await supabase.rpc(
    "merge_guest_wishlist" as never,
    { _product_ids: unique } as never,
  );
  if (error) throw error;
  return data as unknown as {
    ok: true;
    list_id: string;
    added: number;
  };
}

export async function toggleSavedProduct(
  productId: string,
  listId?: string | null,
) {
  const { data, error } = await supabase.rpc(
    "toggle_my_saved_product" as never,
    {
      _product_id: productId,
      _list_id: listId ?? null,
    } as never,
  );
  if (error) throw error;
  return data as unknown as {
    ok: true;
    list_id: string;
    product_id: string;
    saved: boolean;
  };
}

export async function clearSavedList(listId?: string | null) {
  const { data, error } = await supabase.rpc(
    "clear_my_saved_list" as never,
    { _list_id: listId ?? null } as never,
  );
  if (error) throw error;
  return Number(data ?? 0);
}

export async function listMySavedProducts(
  listId?: string | null,
  limit = 200,
): Promise<Product[]> {
  const { data, error } = await supabase.rpc(
    "list_my_saved_products" as never,
    {
      _list_id: listId ?? null,
      _limit: limit,
    } as never,
  );
  if (error) throw error;
  return ((data ?? []) as unknown as PublicCatalogProductRow[]).map(
    mapPublicProduct,
  );
}

export async function listMySavedLists(): Promise<SavedListSummary[]> {
  const { data, error } = await supabase.rpc(
    "list_my_saved_lists" as never,
  );
  if (error) throw error;
  return (data ?? []) as unknown as SavedListSummary[];
}

export async function createSavedList(name: string) {
  const { data, error } = await supabase.rpc(
    "create_my_saved_list" as never,
    { _name: name } as never,
  );
  if (error) throw error;
  return data as unknown as string;
}

export async function renameSavedList(listId: string, name: string) {
  const { data, error } = await supabase.rpc(
    "rename_my_saved_list" as never,
    { _list_id: listId, _name: name } as never,
  );
  if (error) throw error;
  return data === true;
}

export async function deleteSavedList(listId: string) {
  const { data, error } = await supabase.rpc(
    "delete_my_saved_list" as never,
    { _list_id: listId } as never,
  );
  if (error) throw error;
  return data === true;
}
