import { supabase } from "@/integrations/supabase/client";
import {
  cartLineId,
  isLiveProductId,
  normalizeCartVariant,
  type CartItem,
} from "@/lib/cart-model";
import {
  GUEST_MERGE_STORAGE_KEY,
  makeGuestMergeAttempt,
  mergePayload,
  parseGuestMergeAttempt,
  type GuestMergeAttempt,
} from "@/lib/cart-merge-intent";

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

/**
 * Never create a new merge key when the previous RPC response was lost.
 * A different account cannot claim another user's in-flight guest intention.
 * Local persistence failures abort before the database is modified.
 */
function storedGuestMergeAttempt(): GuestMergeAttempt | null {
  if (typeof window === "undefined") throw new Error("Guest merge requires a browser session.");
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(GUEST_MERGE_STORAGE_KEY);
  } catch {
    throw new Error("Browser storage unavailable; cart merge was not attempted.");
  }
  if (!raw) return null;
  try {
    const attempt = parseGuestMergeAttempt(JSON.parse(raw) as unknown);
    if (attempt) return attempt;
  } catch {
    // A damaged journal is not safe to reprocess under a fresh key.
  }
  throw new Error("Saved guest merge cannot be recovered safely. Contact support before retrying.");
}

export async function mergeGuestCartIntoAccount(
  items: CartItem[], accountId: string,
): Promise<GuestMergeAttempt | null> {
  let attempt = storedGuestMergeAttempt();
  if (attempt && attempt.accountId !== accountId) {
    throw new Error("An unfinished guest merge belongs to another signed-in account. Sign into that account to resolve it.");
  }
  if (!attempt) {
    attempt = makeGuestMergeAttempt(accountId, items, crypto.randomUUID());
    if (!attempt.lines.length) return null;
    try {
      window.localStorage.setItem(GUEST_MERGE_STORAGE_KEY, JSON.stringify(attempt));
    } catch {
      throw new Error("Cannot safely persist the guest merge attempt; cart was not sent.");
    }
  }
  const { error } = await supabase.rpc("merge_guest_cart" as never, {
    _items: mergePayload(attempt),
    _merge_key: attempt.mergeId,
  } as never);
  if (error) throw error;
  // Do NOT discard the journal here: the caller first must persist
  // guest-cart subtraction, or a crash could lose exactly-once recovery.
  return attempt;
}

/** Called synchronously only after guest-cart consumption is durably saved. */
export function completeGuestCartMerge(attempt: GuestMergeAttempt): void {
  const current = storedGuestMergeAttempt();
  if (!current || current.mergeId !== attempt.mergeId ||
      current.accountId !== attempt.accountId) {
    throw new Error("Guest merge journal changed during completion.");
  }
  try {
    window.localStorage.removeItem(GUEST_MERGE_STORAGE_KEY);
  } catch {
    throw new Error("Could not complete the guest merge journal cleanup.");
  }
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
