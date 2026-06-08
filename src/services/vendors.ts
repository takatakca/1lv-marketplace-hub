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
  subscription_plan: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_connect_account_id: string | null;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  commission_rate: number;
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

export type VendorStatus = "pending" | "active" | "suspended" | "rejected";
export async function setVendorStatus(id: string, status: VendorStatus) {
  const { error } = await supabase.from("vendors").update({ status: status as never }).eq("id", id);
  if (error) throw error;
}

export async function setVendorAssetUrl(vendorId: string, field: "logo_url" | "banner_url", path: string | null) {
  const patch = (field === "logo_url" ? { logo_url: path } : { banner_url: path }) as never;
  const { error } = await supabase.from("vendors").update(patch).eq("id", vendorId);
  if (error) throw error;
}

export async function getVendorBySlug(slug: string): Promise<VendorRecord | null> {
  const { data, error } = await supabase.from("vendors").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data as VendorRecord | null;
}

/**
 * Public storefront vendor lookup — only returns safe, customer-facing fields.
 * Contact email, phone, address, Stripe IDs, and commission rate are intentionally
 * excluded; those live on the base `vendors` table and are only readable by
 * the vendor themselves or an admin.
 */
export type PublicVendorRecord = {
  id: string;
  user_id: string;
  slug: string;
  store_name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  return_policy: string | null;
  shipping_policy: string | null;
  country: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function getPublicVendorBySlug(slug: string): Promise<PublicVendorRecord | null> {
  const { data, error } = await supabase
    .from("public_vendors" as never)
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as PublicVendorRecord) ?? null;
}
