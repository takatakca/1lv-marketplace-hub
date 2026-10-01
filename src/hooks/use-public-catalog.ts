import { useEffect, useMemo, useState } from "react";
import {
  products as demoProducts,
  vendors as demoVendors,
  type Product,
  type Vendor,
} from "@/lib/data";
import { usePublicMarketplaceSettings } from "@/hooks/use-marketplace-settings";
import {
  listPublicCatalogProducts,
  listPublicCatalogVendors,
} from "@/services/public-catalog";

export function usePublicCatalog() {
  const { settings, loading: settingsLoading } = usePublicMarketplaceSettings();
  const [liveProducts, setLiveProducts] = useState<Product[] | null>(null);
  const [liveVendors, setLiveVendors] = useState<Vendor[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void Promise.all([
      listPublicCatalogProducts(),
      listPublicCatalogVendors(),
    ])
      .then(([products, vendors]) => {
        if (!active) return;
        setLiveProducts(products);
        setLiveVendors(vendors);
        setError(null);
      })
      .catch((cause) => {
        if (!active) return;
        setLiveProducts([]);
        setLiveVendors([]);
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load the live marketplace catalog.",
        );
      });

    return () => {
      active = false;
    };
  }, []);

  const demo = Boolean(
    settings?.demo_mode &&
      liveProducts?.length === 0 &&
      liveVendors?.length === 0,
  );

  const products = useMemo(
    () => (demo ? demoProducts : liveProducts ?? []),
    [demo, liveProducts],
  );
  const vendors = useMemo(
    () => (demo ? demoVendors : liveVendors ?? []),
    [demo, liveVendors],
  );

  return {
    products,
    vendors,
    demo,
    error,
    loading:
      settingsLoading ||
      liveProducts == null ||
      liveVendors == null,
  };
}
