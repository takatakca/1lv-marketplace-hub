/**
 * Shared, dependency-free cart rules. The account cart is stored in Supabase;
 * this model contains only browser purchase intent (not authoritative prices).
 */
export type CartItem = {
  lineId: string;
  productId: string;
  slug: string;
  title: string;
  price: number;
  image: string;
  vendorSlug: string;
  qty: number;
  variantId?: string;
  variantSku?: string;
  variant?: Record<string, string>;
  available?: boolean;
  maxQty?: number;
};

export type CartChange =
  | { kind: "add"; item: CartItem }
  | { kind: "set"; lineId: string; qty: number }
  | { kind: "remove"; lineId: string }
  | { kind: "clear" };

export const CART_STORAGE_KEY = "1lvca:cart:v1";
export const CART_LIMIT = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isLiveProductId = (id: string) => UUID.test(id);
export const cartQuantity = (n: number) =>
  Number.isFinite(n) ? Math.max(1, Math.min(99, Math.floor(n))) : 1;

export function normalizeCartVariant(
  input?: Record<string, string>,
): Record<string, string> | undefined {
  if (!input || Array.isArray(input) || typeof input !== "object") return undefined;
  const entries = Object.entries(input)
    .filter(([key, value]) => typeof key === "string" && typeof value === "string")
    .map(([key, value]) => [key.trim(), value.trim()] as const)
    .filter(([key, value]) => key.length > 0 && value.length > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function cartLineId(
  productId: string,
  variant?: Record<string, string>,
  variantId?: string,
): string {
  if (variantId?.trim()) return productId + "::variant:" + variantId.trim();
  const normalized = normalizeCartVariant(variant);
  if (!normalized) return productId;
  return productId + "::" + Object.entries(normalized)
    .map(([key, value]) => encodeURIComponent(key) + "=" + encodeURIComponent(value))
    .join("&");
}

export function restoreCartItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  const merged = new Map<string, CartItem>();
  for (const candidate of value.slice(0, CART_LIMIT)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const raw = candidate as Partial<CartItem>;
    if (
      typeof raw.productId !== "string" || !raw.productId.trim() ||
      typeof raw.slug !== "string" || typeof raw.title !== "string" ||
      typeof raw.image !== "string" || typeof raw.vendorSlug !== "string" ||
      typeof raw.price !== "number" || !Number.isFinite(raw.price) || raw.price < 0 ||
      typeof raw.qty !== "number" || !Number.isFinite(raw.qty)
    ) continue;
    const variant = raw.variant && normalizeCartVariant(raw.variant);
    const variantId = typeof raw.variantId === "string" && raw.variantId.trim()
      ? raw.variantId.trim() : undefined;
    const lineId = cartLineId(raw.productId, variant, variantId);
    const item: CartItem = {
      lineId,
      productId: raw.productId,
      slug: raw.slug,
      title: raw.title,
      image: raw.image,
      vendorSlug: raw.vendorSlug,
      price: raw.price,
      qty: cartQuantity(raw.qty),
      ...(variantId ? { variantId } : {}),
      ...(typeof raw.variantSku === "string" ? { variantSku: raw.variantSku } : {}),
      ...(variant ? { variant } : {}),
    };
    const previous = merged.get(lineId);
    merged.set(lineId, previous
      ? { ...previous, qty: Math.min(99, previous.qty + item.qty) }
      : item);
  }
  return [...merged.values()];
}

export function applyCartChange(items: CartItem[], change: CartChange): CartItem[] {
  if (change.kind === "clear") return [];
  if (change.kind === "remove") return items.filter((i) => i.lineId !== change.lineId);
  if (change.kind === "set") {
    return items.map((i) => i.lineId === change.lineId
      ? { ...i, qty: Math.min(cartQuantity(change.qty), i.maxQty ?? 99) }
      : i);
  }
  const item = change.item;
  const existing = items.find((i) => i.lineId === item.lineId);
  if (existing) {
    return items.map((i) => i.lineId === item.lineId
      ? { ...i, qty: Math.min(99, i.maxQty ?? 99, i.qty + cartQuantity(item.qty)) }
      : i);
  }
  return [...items, { ...item, qty: Math.min(cartQuantity(item.qty), item.maxQty ?? 99) }].slice(0, CART_LIMIT);
}
