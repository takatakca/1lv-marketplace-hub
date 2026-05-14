import { supabase } from "@/integrations/supabase/client";

export async function listCategoriesAdmin() {
  const { data, error } = await supabase.from("categories").select("*").order("position");
  if (error) throw error;
  return data ?? [];
}

export async function upsertCategory(input: {
  slug: string;
  name_en: string;
  name_fr?: string | null;
  parent_slug?: string | null;
  active?: boolean;
}) {
  const { error } = await supabase.from("categories").upsert(input, { onConflict: "slug" });
  if (error) throw error;
}
