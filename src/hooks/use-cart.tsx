import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Product } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import {
  applyCartChange,
  cartLineId,
  cartQuantity,
  CART_STORAGE_KEY,
  isLiveProductId,
  normalizeCartVariant,
  restoreCartItems,
  type CartChange,
  type CartItem,
} from "@/lib/cart-model";
import {
  clearAccountCart,
  listAccountCartItems,
  mergeGuestCartIntoAccount,
  setAccountCartItem,
} from "@/services/account-cart";

export type { CartItem } from "@/lib/cart-model";
type SyncStatus = "syncing" | "ready" | "error";

type CartContextValue = {
  items: CartItem[];
  add: (
    p: Product,
    qty?: number,
    variant?: Record<string, string>,
    variantIdentity?: {
      id: string;
      sku?: string;
      price?: number;
      image?: string;
    },
  ) => void;
  remove: (lineId: string) => void;
  setQty: (lineId: string, qty: number) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  syncStatus: SyncStatus;
  retrySync: () => void;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);

function readGuestCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    return raw ? restoreCartItems(JSON.parse(raw) as unknown) : [];
  } catch {
    return [];
  }
}

function writeGuestCart(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    if (items.length === 0) window.localStorage.removeItem(CART_STORAGE_KEY);
    else window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Private browsing may deny localStorage. Shopping remains available in memory.
  }
}

function replayCartChanges(items: CartItem[], changes: CartChange[]): CartItem[] {
  return changes.reduce(applyCartChange, items);
}

/**
 * Guest intent remains in browser storage; TAKATAK-authorized accounts use
 * the existing protected 1LV RPCs. We never copy another account's cart to
 * guest storage or let a client-supplied price reach financial checkout logic.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<CartItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("syncing");
  const [retryToken, setRetryToken] = useState(0);

  const itemsRef = useRef<CartItem[]>([]);
  const serverItemsRef = useRef<CartItem[]>([]);
  const pendingRef = useRef<CartChange[]>([]);
  const accountRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const readyRef = useRef(false);
  const flushingRef = useRef(false);

  const show = useCallback((next: CartItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const flushPending = useCallback(async () => {
    if (flushingRef.current || !readyRef.current || !accountRef.current) return;
    const generation = generationRef.current;
    flushingRef.current = true;

    try {
      while (pendingRef.current.length > 0) {
        if (generation !== generationRef.current || !accountRef.current) return;
        const change = pendingRef.current[0];
        if (change.kind === "clear") {
          await clearAccountCart();
          if (generation !== generationRef.current) return;
          serverItemsRef.current = [];
        } else {
          const next = applyCartChange(serverItemsRef.current, change);
          const target = change.kind === "add"
            ? change.item
            : serverItemsRef.current.find((item) => item.lineId === change.lineId);

          if (target && isLiveProductId(target.productId)) {
            const qty = change.kind === "remove"
              ? 0
              : next.find((item) => item.lineId === target.lineId)?.qty ?? 0;
            // Absolute quantities make retry safe if an HTTP response was lost.
            const savedQty = await setAccountCartItem(target, qty);
            if (generation !== generationRef.current) return;
            serverItemsRef.current = savedQty === 0
              ? next.filter((item) => item.lineId !== target.lineId)
              : next.map((item) => item.lineId === target.lineId
                ? { ...item, qty: savedQty }
                : item);
          } else {
            serverItemsRef.current = next;
          }
        }
        pendingRef.current.shift();
      }

      const canonical = await listAccountCartItems();
      if (generation !== generationRef.current) return;
      serverItemsRef.current = canonical;
      show(replayCartChanges(canonical, pendingRef.current));
      setSyncStatus("ready");
    } catch (error) {
      if (generation !== generationRef.current) return;
      console.error("[1LV cart] Account sync failed:", error);
      readyRef.current = false;
      setSyncStatus("error");
    } finally {
      flushingRef.current = false;
      if (generation === generationRef.current && readyRef.current &&
          pendingRef.current.length > 0) {
        void flushPending();
      }
    }
  }, [show]);

  useEffect(() => {
    const generation = ++generationRef.current;
    readyRef.current = false;

    if (authLoading) {
      setSyncStatus("syncing");
      return;
    }

    if (!userId) {
      // Explicitly discard the previous user's account cart from this tab.
      accountRef.current = null;
      serverItemsRef.current = [];
      pendingRef.current = [];
      show(readGuestCart());
      readyRef.current = true;
      setSyncStatus("ready");
      return;
    }

    if (accountRef.current !== userId) {
      accountRef.current = userId;
      pendingRef.current = [];
      serverItemsRef.current = [];
      show([]);
    }
    setSyncStatus("syncing");

    void (async () => {
      try {
        const guestItems = readGuestCart();
        const eligible = guestItems.filter((item) =>
          isLiveProductId(item.productId) &&
          (!item.variantId || isLiveProductId(item.variantId)),
        );
        if (eligible.length > 0) {
          await mergeGuestCartIntoAccount(eligible);
          // Do this immediately after successful RPC even if the auth epoch
          // changes; otherwise a refresh/logout can merge the same lines again.
          // Subtract only the quantities actually sent, preserving any later
          // browser-side additions rather than erasing them wholesale.
          const merged = new Map(eligible.map((item) => [item.lineId, item.qty]));
          const remaining = readGuestCart().flatMap((item) => {
            const delta = item.qty - (merged.get(item.lineId) ?? 0);
            return delta > 0 ? [{ ...item, qty: delta }] : [];
          });
          writeGuestCart(remaining);
          if (generation !== generationRef.current) return;
        }

        const canonical = await listAccountCartItems();
        if (generation !== generationRef.current) return;
        serverItemsRef.current = canonical;
        show(replayCartChanges(canonical, pendingRef.current));
        readyRef.current = true;
        setSyncStatus("ready");
        void flushPending();
      } catch (error) {
        if (generation !== generationRef.current) return;
        console.error("[1LV cart] Unable to load saved cart:", error);
        // Preserve guest intent for a later merge, never silently discard it.
        show(replayCartChanges(readGuestCart(), pendingRef.current));
        setSyncStatus("error");
      }
    })();
  }, [authLoading, userId, retryToken, show, flushPending]);

  const mutate = useCallback((change: CartChange) => {
    if (authLoading) return;
    const next = applyCartChange(itemsRef.current, change);
    show(next);

    if (!userId) {
      writeGuestCart(next);
      return;
    }

    pendingRef.current.push(change);
    if (readyRef.current) void flushPending();
  }, [authLoading, userId, show, flushPending]);

  const add: CartContextValue["add"] = (product, qty = 1, variantInput, variantIdentity) => {
    const variant = normalizeCartVariant(variantInput);
    const variantId = variantIdentity?.id?.trim() || undefined;
    const lineId = cartLineId(product.id, variant, variantId);
    mutate({
      kind: "add",
      item: {
        lineId,
        productId: product.id,
        slug: product.slug,
        title: product.title,
        price: typeof variantIdentity?.price === "number" &&
          Number.isFinite(variantIdentity.price)
          ? variantIdentity.price : product.price,
        image: variantIdentity?.image || product.images[0] || "",
        vendorSlug: product.vendorSlug,
        qty: cartQuantity(qty),
        ...(variantId ? { variantId } : {}),
        ...(variantIdentity?.sku ? { variantSku: variantIdentity.sku } : {}),
        ...(variant ? { variant } : {}),
      },
    });
  };

  const remove = (lineId: string) => mutate({ kind: "remove", lineId });
  const setQty = (lineId: string, qty: number) =>
    mutate({ kind: "set", lineId, qty });
  const clear = () => mutate({ kind: "clear" });

  const retrySync = useCallback(() => setRetryToken((n) => n + 1), []);
  const count = items.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <CartContext.Provider value={{
      items, add, remove, setQty, clear, count, subtotal, syncStatus, retrySync,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
