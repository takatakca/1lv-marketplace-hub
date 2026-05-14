import { supabase } from "@/integrations/supabase/client";

export type VendorRecord = {
  id: string;
  user_id: string;
  store_name: string;
  slug: string;
  description: string | null;
  business_name: string | null;
  contact_email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string;
  shipping_policy: string | null;
  return_policy: string | null;
  logo_url: string | null;
  banner_url: string | null;
  status: string;
  subscription_status: string;
  created_at: string;
  updated_at: string;
};

export async function getMyVendor(userId: string): Promise<VendorRecord | null> {
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as VendorRecord | null;
}

export type VendorUpsert = {
  store_name: string;
  business_name?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  description?: string | null;
  shipping_policy?: string | null;
  return_policy?: string | null;
};

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "store";

export async function upsertMyVendor(userId: string, input: VendorUpsert) {
  const existing = await getMyVendor(userId);
  if (existing) {
    const { data, error } = await supabase
      .from("vendors")
      .update(input)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data as VendorRecord;
  }
  const { data, error } = await supabase
    .from("vendors")
    .insert({
      ...input,
      user_id: userId,
      store_name: input.store_name,
      slug: slugify(input.store_name) + "-" + userId.slice(0, 6),
      country: "CA",
      status: "pending" as const,
      subscription_status: "none",
    })
    .select()
    .single();
  if (error) throw error;
  return data as VendorRecord;
}

export async function listAllVendors(): Promise<VendorRecord[]> {
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as VendorRecord[];
}

export type VendorStatus = "pending" | "active" | "suspended";
export async function setVendorStatus(id: string, status: VendorStatus) {
  const { error } = await supabase.from("vendors").update({ status }).eq("id", id);
  if (error) throw error;
}
