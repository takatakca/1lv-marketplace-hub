import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  clearSavedList,
  getDefaultWishlistIds,
  mergeGuestWishlist,
  toggleSavedProduct,
} from "@/services/saved-lists";

const KEY = "1lvca:wishlist:v1";

type Ctx = {
  ids: string[];
  toggle: (id: string) => void;
  has: (id: string) => boolean;
  clear: () => void;
};

const WishlistContext = createContext<Ctx | undefined>(undefined);

function readGuestIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        ),
      ),
    ].slice(0, 250);
  } catch {
    return [];
  }
}

function persistGuestIds(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 250)));
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [ids, setIds] = useState<string[]>([]);

  const reloadAccountWishlist = useCallback(async () => {
    const next = await getDefaultWishlistIds();
    setIds(next);
    await queryClient.invalidateQueries({ queryKey: ["saved-products"] });
  }, [queryClient]);

  useEffect(() => {
    if (authLoading) return;

    let active = true;

    if (!user) {
      setIds(readGuestIds());
      return () => {
        active = false;
      };
    }

    void (async () => {
      const guestIds = readGuestIds();

      try {
        if (guestIds.length > 0) {
          await mergeGuestWishlist(guestIds);
        }

        const accountIds = await getDefaultWishlistIds();
        if (!active) return;

        setIds(accountIds);
        window.localStorage.removeItem(KEY);
        await queryClient.invalidateQueries({ queryKey: ["saved-products"] });
      } catch {
        if (!active) return;
        setIds(guestIds);
      }
    })();

    return () => {
      active = false;
    };
  }, [authLoading, queryClient, user?.id]);

  useEffect(() => {
    if (authLoading || user) return;
    persistGuestIds(ids);
  }, [authLoading, ids, user]);

  const toggle = useCallback(
    (productId: string) => {
      if (!productId) return;

      if (!user) {
        setIds((previous) =>
          previous.includes(productId)
            ? previous.filter((id) => id !== productId)
            : [...previous, productId].slice(0, 250),
        );
        return;
      }

      const wasSaved = ids.includes(productId);
      setIds((previous) =>
        wasSaved
          ? previous.filter((id) => id !== productId)
          : [...previous, productId],
      );

      void toggleSavedProduct(productId)
        .then(async (result) => {
          setIds((previous) => {
            const contains = previous.includes(productId);
            if (result.saved && !contains) return [...previous, productId];
            if (!result.saved && contains) {
              return previous.filter((id) => id !== productId);
            }
            return previous;
          });
          await queryClient.invalidateQueries({ queryKey: ["saved-products"] });
        })
        .catch(() => {
          void reloadAccountWishlist();
        });
    },
    [ids, queryClient, reloadAccountWishlist, user],
  );

  const has = useCallback((productId: string) => ids.includes(productId), [ids]);

  const clear = useCallback(() => {
    if (!user) {
      setIds([]);
      return;
    }

    const previous = ids;
    setIds([]);
    void clearSavedList()
      .then(async () => {
        await queryClient.invalidateQueries({ queryKey: ["saved-products"] });
      })
      .catch(() => {
        setIds(previous);
        void reloadAccountWishlist();
      });
  }, [ids, queryClient, reloadAccountWishlist, user]);

  return (
    <WishlistContext.Provider value={{ ids, toggle, has, clear }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) {
    throw new Error("useWishlist must be used inside WishlistProvider");
  }
  return ctx;
}
