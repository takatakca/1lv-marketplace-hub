import { useQuery } from "@tanstack/react-query";
import { categories as demoCategories } from "@/lib/data";
import { usePublicMarketplaceSettings } from "@/hooks/use-marketplace-settings";
import {
  listPublicCategories,
  type PublicCategoryRecord,
} from "@/services/public-categories";

const EMPTY_CATEGORIES: PublicCategoryRecord[] = [];

const DEMO_CATEGORIES: PublicCategoryRecord[] = demoCategories.map(
  (category, index) => ({
    slug: category.slug,
    name_en: category.name,
    name_fr: null,
    parent_slug: null,
    position: index,
  }),
);

export function usePublicCategories() {
  const { settings, loading: settingsLoading } =
    usePublicMarketplaceSettings();
  const query = useQuery({
    queryKey: ["public-marketplace-categories"],
    queryFn: listPublicCategories,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const liveCategories = query.data ?? EMPTY_CATEGORIES;
  const demo = Boolean(
    settings?.demo_mode &&
      !query.isPending &&
      liveCategories.length === 0,
  );

  return {
    categories: demo ? DEMO_CATEGORIES : liveCategories,
    demo,
    loading: settingsLoading || query.isPending,
    error:
      query.error instanceof Error
        ? query.error.message
        : query.error
          ? "Could not load marketplace categories."
          : null,
  };
}
