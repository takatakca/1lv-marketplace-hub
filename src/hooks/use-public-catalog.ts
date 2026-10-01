import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  products as demoProducts,
  vendors as demoVendors,
} from "@/lib/data";
import { usePublicMarketplaceSettings } from "@/hooks/use-marketplace-settings";
import {
  listPublicCatalogProducts,
  listPublicCatalogVendors,
} from "@/services/public-catalog";

const PUBLIC_CATALOG_QUERY_KEY = ["public-marketplace-catalog"] as const;

export function usePublicCatalog() {
  const { settings, loading: settingsLoading } = usePublicMarketplaceSettings();
  const catalogQuery = useQuery({
    queryKey: PUBLIC_CATALOG_QUERY_KEY,
    queryFn: async () => {
      const [products, vendors] = await Promise.all([
        listPublicCatalogProducts(),
        listPublicCatalogVendors(),
      ]);
      return { products, vendors };
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const liveProducts = catalogQuery.data?.products ?? [];
  const liveVendors = catalogQuery.data?.vendors ?? [];
  const demo = Boolean(
    settings?.demo_mode &&
      !catalogQuery.isPending &&
      liveProducts.length === 0 &&
      liveVendors.length === 0,
  );

  const products = useMemo(
    () => (demo ? demoProducts : liveProducts),
    [demo, liveProducts],
  );
  const vendors = useMemo(
    () => (demo ? demoVendors : liveVendors),
    [demo, liveVendors],
  );

  return {
    products,
    vendors,
    demo,
    error:
      catalogQuery.error instanceof Error
        ? catalogQuery.error.message
        : catalogQuery.error
          ? "Could not load the live marketplace catalog."
          : null,
    loading: settingsLoading || catalogQuery.isPending,
  };
}
