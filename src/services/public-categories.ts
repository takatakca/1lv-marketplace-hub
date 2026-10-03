import { supabase } from "@/integrations/supabase/client";

export type PublicCategoryRecord = {
  slug: string;
  name_en: string;
  name_fr: string | null;
  parent_slug: string | null;
  position: number;
};

export async function listPublicCategories(): Promise<PublicCategoryRecord[]> {
  const { data, error } = await supabase.rpc(
    "list_public_categories" as never,
  );
  if (error) throw error;
  return (data ?? []) as unknown as PublicCategoryRecord[];
}

export async function getPublicCategoryBySlug(
  slug: string,
): Promise<PublicCategoryRecord | null> {
  const { data, error } = await supabase.rpc(
    "get_public_category_by_slug" as never,
    { _slug: slug } as never,
  );
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return (row as unknown as PublicCategoryRecord | undefined) ?? null;
}
