import { cartQuantity, isLiveProductId, type CartItem } from "@/lib/cart-model";

/**
 * A single durable merge attempt survives lost RPC acknowledgements and reloads.
 * Browser data is purchase intent, never identity or payment authority.
 */
export type MergeLine = {
  lineId: string;
  productId: string;
  variantId?: string;
  qty: number;
};
export type GuestMergeAttempt = {
  version: 1;
  accountId: string;
  mergeId: string;
  lines: MergeLine[];
};
export const GUEST_MERGE_STORAGE_KEY = "1lvca:guest-merge:v1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validUuid = (id: string) => UUID_RE.test(id);

export function makeGuestMergeAttempt(
  accountId: string,
  items: CartItem[],
  mergeId: string,
): GuestMergeAttempt {
  if (!validUuid(accountId) || !validUuid(mergeId)) throw new Error("Invalid account merge identity");
  const lines = items.filter(
    (item) => validUuid(item.productId) && (!item.variantId || validUuid(item.variantId)),
  ).slice(0, 100).map((item) => ({
    lineId: item.lineId,
    productId: item.productId,
    ...(item.variantId ? { variantId: item.variantId } : {}),
    qty: cartQuantity(item.qty),
  }));
  return { version: 1, accountId, mergeId, lines };
}

export function parseGuestMergeAttempt(raw: unknown): GuestMergeAttempt | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Partial<GuestMergeAttempt>;
  if (obj.version !== 1 || typeof obj.accountId !== "string" ||
      typeof obj.mergeId !== "string" || !validUuid(obj.accountId) ||
      !validUuid(obj.mergeId) || !Array.isArray(obj.lines) ||
      obj.lines.length < 1 || obj.lines.length > 100) return null;
  const seen = new Set<string>();
  for (const line of obj.lines) {
    if (!line || typeof line.lineId !== "string" || !line.lineId ||
        typeof line.productId !== "string" || !validUuid(line.productId) ||
        (line.variantId !== undefined && (typeof line.variantId !== "string" ||
         !validUuid(line.variantId))) ||
        typeof line.qty !== "number" || !Number.isInteger(line.qty) ||
        line.qty < 1 || line.qty > 99 || seen.has(line.lineId)) return null;
    seen.add(line.lineId);
  }
  return obj as GuestMergeAttempt;
}

export function mergePayload(attempt: GuestMergeAttempt) {
  return attempt.lines.map((line) => ({
    product_id: line.productId,
    variant_id: line.variantId ?? null,
    quantity: line.qty,
  }));
}

export function remainingGuestLines(
  current: CartItem[],
  attempt: GuestMergeAttempt,
): CartItem[] {
  const consumed = new Map(attempt.lines.map((line) => [line.lineId, line.qty]));
  return current.flatMap((item) => {
    const remaining = item.qty - (consumed.get(item.lineId) ?? 0);
    return remaining > 0 ? [{ ...item, qty: remaining }] : [];
  });
}
