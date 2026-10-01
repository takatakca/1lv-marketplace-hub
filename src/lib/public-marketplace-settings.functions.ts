import { createServerFn } from "@tanstack/react-start";
import {
  FREE_SHIPPING_THRESHOLD_CAD,
  STANDARD_SHIPPING_FEE_CAD,
} from "@/lib/canada-commerce";

export type PublicMarketplaceSettings = {
  marketplace_name: string;
  support_email: string;
  free_shipping_threshold: number;
  standard_shipping_fee: number;
  allow_guest_checkout: boolean;
  demo_mode: boolean;
  require_vendor_approval: boolean;
  require_product_approval: boolean;
};

export const PUBLIC_MARKETPLACE_DEFAULTS: PublicMarketplaceSettings = {
  marketplace_name: "1LV.CA",
  support_email: "support@1lv.ca",
  free_shipping_threshold: FREE_SHIPPING_THRESHOLD_CAD,
  standard_shipping_fee: STANDARD_SHIPPING_FEE_CAD,
  allow_guest_checkout: true,
  demo_mode: false,
  require_vendor_approval: true,
  require_product_approval: true,
};

export const getPublicMarketplaceSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicMarketplaceSettings> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin.rpc(
        "get_public_marketplace_settings" as never,
      );
      if (error) throw error;

      const raw = (Array.isArray(data) ? data[0] : data) as
        | Partial<PublicMarketplaceSettings>
        | null
        | undefined;
      if (!raw) return PUBLIC_MARKETPLACE_DEFAULTS;

      const threshold = Number(raw.free_shipping_threshold);
      const fee = Number(raw.standard_shipping_fee);

      return {
        marketplace_name:
          typeof raw.marketplace_name === "string" && raw.marketplace_name.trim()
            ? raw.marketplace_name.trim()
            : PUBLIC_MARKETPLACE_DEFAULTS.marketplace_name,
        support_email:
          typeof raw.support_email === "string" && raw.support_email.trim()
            ? raw.support_email.trim()
            : PUBLIC_MARKETPLACE_DEFAULTS.support_email,
        free_shipping_threshold:
          Number.isFinite(threshold) && threshold >= 0
            ? threshold
            : PUBLIC_MARKETPLACE_DEFAULTS.free_shipping_threshold,
        standard_shipping_fee:
          Number.isFinite(fee) && fee >= 0
            ? fee
            : PUBLIC_MARKETPLACE_DEFAULTS.standard_shipping_fee,
        allow_guest_checkout:
          typeof raw.allow_guest_checkout === "boolean"
            ? raw.allow_guest_checkout
            : PUBLIC_MARKETPLACE_DEFAULTS.allow_guest_checkout,
        demo_mode:
          typeof raw.demo_mode === "boolean"
            ? raw.demo_mode
            : PUBLIC_MARKETPLACE_DEFAULTS.demo_mode,
        require_vendor_approval:
          typeof raw.require_vendor_approval === "boolean"
            ? raw.require_vendor_approval
            : PUBLIC_MARKETPLACE_DEFAULTS.require_vendor_approval,
        require_product_approval:
          typeof raw.require_product_approval === "boolean"
            ? raw.require_product_approval
            : PUBLIC_MARKETPLACE_DEFAULTS.require_product_approval,
      };
    } catch (error) {
      console.warn(
        "[marketplace-settings] Public settings unavailable; using safe defaults:",
        error instanceof Error ? error.message : "unknown_error",
      );
      return PUBLIC_MARKETPLACE_DEFAULTS;
    }
  },
);
