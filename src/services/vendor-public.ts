import { supabase } from "@/integrations/supabase/client";
import type { VendorRecord } from "./vendors";
import type { ProductRecord } from "./products";

export async function getVendorBySlug(slug: string): Promise<VendorRecord | null> {
  const { data, error } = await supabase.from("vendors").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data as VendorRecord | null;
}

export async function getActiveProductsByVendor(vendorId: string): Promise<ProductRecord[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("vendor_id", vendorId)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ProductRecord[];
}
