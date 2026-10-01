import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Product } from "@/lib/data";

export type CartItem = {
  lineId: string;
  productId: string;
  slug: string;
  title: string;
  price: number;
  image: string;
  vendorSlug: string;
  qty: number;
  variant?: Record<string, string>;
};

type CartContextValue = {
  items: CartItem[];
  add: (p: Product, qty?: number, variant?: Record<string, string>) => void;
  remove: (lineId: string) => void;
  setQty: (lineId: string, qty: number) => void;
  clear: () => void;
  count: number;
  subtotal: number;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);
const KEY = "1lvca:cart:v1";

function normalizeVariant(
  variant?: Record<string, string>,
): Record<string, string> | undefined {
  if (!variant) return undefined;

  const entries = Object.entries(variant)
    .map(([key, value]) => [key.trim(), value.trim()] as const)
    .filter(([key, value]) => key.length > 0 && value.length > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function createLineId(
  productId: string,
  variant?: Record<string, string>,
): string {
  const normalized = normalizeVariant(variant);
  if (!normalized) return productId;

  const variantKey = Object.entries(normalized)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");

  return `${productId}::${variantKey}`;
}

function restoreCartItem(value: unknown): CartItem | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Partial<CartItem>;
  if (
    typeof raw.productId !== "string" ||
    typeof raw.slug !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.price !== "number" ||
    !Number.isFinite(raw.price) ||
    typeof raw.image !== "string" ||
    typeof raw.vendorSlug !== "string" ||
    typeof raw.qty !== "number" ||
    !Number.isFinite(raw.qty)
  ) {
    return null;
  }

  const variant =
    raw.variant && typeof raw.variant === "object"
      ? normalizeVariant(raw.variant)
      : undefined;
  const qty = Math.max(1, Math.min(99, Math.floor(raw.qty)));
  const lineId =
    typeof raw.lineId === "string" && raw.lineId.trim()
      ? raw.lineId
      : createLineId(raw.productId, variant);

  return {
    lineId,
    productId: raw.productId,
    slug: raw.slug,
    title: raw.title,
    price: raw.price,
    image: raw.image,
    vendorSlug: raw.vendorSlug,
    qty,
    ...(variant ? { variant } : {}),
  };
}

function mergeRestoredItems(items: CartItem[]): CartItem[] {
  const merged = new Map<string, CartItem>();

  for (const item of items) {
    const existing = merged.get(item.lineId);
    if (existing) {
      merged.set(item.lineId, {
        ...existing,
        qty: Math.min(99, existing.qty + item.qty),
      });
    } else {
      merged.set(item.lineId, item);
    }
  }

  return [...merged.values()];
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;

      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      setItems(
        mergeRestoredItems(
          parsed
            .map(restoreCartItem)
            .filter((item): item is CartItem => item !== null),
        ),
      );
    } catch {
      /* Cart storage is optional. A malformed local cart must not block shopping. */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY, JSON.stringify(items));
  }, [items]);

  const add: CartContextValue["add"] = (product, qty = 1, variantInput) =>
    setItems((previous) => {
      const variant = normalizeVariant(variantInput);
      const lineId = createLineId(product.id, variant);
      const safeQty = Math.max(1, Math.min(99, Math.floor(qty)));
      const existing = previous.find((item) => item.lineId === lineId);

      if (existing) {
        return previous.map((item) =>
          item.lineId === lineId
            ? { ...item, qty: Math.min(99, item.qty + safeQty) }
            : item,
        );
      }

      return [
        ...previous,
        {
          lineId,
          productId: product.id,
          slug: product.slug,
          title: product.title,
          price: product.price,
          image: product.images[0] ?? "",
          vendorSlug: product.vendorSlug,
          qty: safeQty,
          ...(variant ? { variant } : {}),
        },
      ];
    });

  const remove = (lineId: string) =>
    setItems((previous) =>
      previous.filter((item) => item.lineId !== lineId),
    );

  const setQty = (lineId: string, qty: number) =>
    setItems((previous) =>
      previous.map((item) =>
        item.lineId === lineId
          ? {
              ...item,
              qty: Math.max(1, Math.min(99, Math.floor(qty))),
            }
          : item,
      ),
    );

  const clear = () => setItems([]);

  const count = items.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.qty,
    0,
  );

  return (
    <CartContext.Provider
      value={{ items, add, remove, setQty, clear, count, subtotal }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }
  return context;
}
