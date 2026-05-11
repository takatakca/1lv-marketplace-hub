import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Product } from "@/lib/data";

export type CartItem = {
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
  remove: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  clear: () => void;
  count: number;
  subtotal: number;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);
const KEY = "1lvca:cart:v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY, JSON.stringify(items));
  }, [items]);

  const add: CartContextValue["add"] = (p, qty = 1, variant) =>
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === p.id);
      if (existing) {
        return prev.map((i) => (i.productId === p.id ? { ...i, qty: i.qty + qty } : i));
      }
      return [
        ...prev,
        {
          productId: p.id,
          slug: p.slug,
          title: p.title,
          price: p.price,
          image: p.images[0],
          vendorSlug: p.vendorSlug,
          qty,
          variant,
        },
      ];
    });

  const remove = (productId: string) => setItems((p) => p.filter((i) => i.productId !== productId));
  const setQty = (productId: string, qty: number) =>
    setItems((p) => p.map((i) => (i.productId === productId ? { ...i, qty: Math.max(1, qty) } : i)));
  const clear = () => setItems([]);

  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <CartContext.Provider value={{ items, add, remove, setQty, clear, count, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
