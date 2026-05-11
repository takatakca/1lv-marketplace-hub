import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const KEY = "1lvca:wishlist:v1";
type Ctx = { ids: string[]; toggle: (id: string) => void; has: (id: string) => boolean; clear: () => void };
const WishlistContext = createContext<Ctx | undefined>(undefined);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setIds(JSON.parse(raw));
    } catch {/* noop */}
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY, JSON.stringify(ids));
  }, [ids]);
  const toggle = (id: string) => setIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const has = (id: string) => ids.includes(id);
  const clear = () => setIds([]);
  return <WishlistContext.Provider value={{ ids, toggle, has, clear }}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used inside WishlistProvider");
  return ctx;
}
