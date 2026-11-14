import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MarketplaceSettings = {
  marketplace_name: string;
  support_email: string;
  default_commission_rate: number;
  free_shipping_threshold: number;
  standard_shipping_fee: number;
  require_product_approval: boolean;
  require_vendor_approval: boolean;
  allow_guest_checkout: boolean;
  demo_mode: boolean;
  version: number;
  updated_at: string;
};

function validateSettings(input: MarketplaceSettings): MarketplaceSettings {
  if (!input || typeof input !== "object") throw new Error("Invalid settings.");
  if (!input.marketplace_name?.trim() || input.marketplace_name.length > 80) throw new Error("Marketplace name is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.support_email ?? "")) throw new Error("Valid support email required.");
  if (!Number.isFinite(input.default_commission_rate) || input.default_commission_rate < 0 || input.default_commission_rate > 1) throw new Error("Commission must be between 0 and 100%.");
  if (!Number.isFinite(input.free_shipping_threshold) || input.free_shipping_threshold < 0) throw new Error("Invalid free-shipping threshold.");
  if (!Number.isFinite(input.standard_shipping_fee) || input.standard_shipping_fee < 0) throw new Error("Invalid shipping fee.");
  return input;
}

async function adminDb(context: {
  supabase: SupabaseClient<Database>;
  userId: string;
}) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || data !== true) throw new Error("Forbidden");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getMarketplaceSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
  const db = await adminDb(context);
  const { data, error } = await db
    .from("marketplace_settings" as never)
    .select("*")
    .eq("id", true)
    .single();
  if (error) throw new Error("Could not load marketplace settings.");
  return data as unknown as MarketplaceSettings;
});

export const saveMarketplaceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateSettings)
  .handler(async ({ data, context }) => {
    const db = await adminDb(context);
    const expectedVersion = data.version;
    const { data: saved, error } = await db
      .from("marketplace_settings" as never)
      .update({
        marketplace_name: data.marketplace_name.trim(),
        support_email: data.support_email.trim().toLowerCase(),
        default_commission_rate: data.default_commission_rate,
        free_shipping_threshold: data.free_shipping_threshold,
        standard_shipping_fee: data.standard_shipping_fee,
        require_product_approval: data.require_product_approval,
        require_vendor_approval: data.require_vendor_approval,
        allow_guest_checkout: data.allow_guest_checkout,
        demo_mode: data.demo_mode,
      } as never)
      .eq("id", true)
      .eq("version", expectedVersion)
      .select("*")
      .maybeSingle();

    if (error) throw new Error("Could not save marketplace settings.");
    if (!saved) throw new Error("Settings changed in another session. Refresh and try again.");
    return saved as unknown as MarketplaceSettings;
  });
