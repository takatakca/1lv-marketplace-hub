import { useQuery } from "@tanstack/react-query";
import {
  getPublicMarketplaceSettings,
  type PublicMarketplaceSettings,
} from "@/lib/public-marketplace-settings.functions";

const PUBLIC_MARKETPLACE_SETTINGS_QUERY_KEY = [
  "public-marketplace-settings",
] as const;

export function usePublicMarketplaceSettings() {
  const query = useQuery<PublicMarketplaceSettings>({
    queryKey: PUBLIC_MARKETPLACE_SETTINGS_QUERY_KEY,
    queryFn: () => getPublicMarketplaceSettings(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  return {
    settings: query.data ?? null,
    loading: query.isPending,
    error:
      query.error instanceof Error
        ? query.error.message
        : query.error
          ? "Could not load marketplace settings."
          : null,
  };
}
