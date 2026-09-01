import { SOURCE_APPLICATION, SOURCE_VERTICAL, type TakatakMerchantPayload } from "./types";
import { normalizeEmail, normalizePhone } from "./customer-mapper";

export type LocalVendorInput = {
  id: string;
  user_id: string;
  store_name: string;
  slug: string;
  business_name?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  status: string;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  created_at?: string | null;
};

/**
 * Map a 1LV vendor to the normalized TAKATAK merchant input.
 * TAKATAK later decides whether this company already exists globally —
 * 1LV never claims two merchants are the same company.
 */
export function mapMerchant(vendor: LocalVendorInput): TakatakMerchantPayload {
  return {
    source_application: SOURCE_APPLICATION,
    vertical: SOURCE_VERTICAL,
    local_vendor_id: vendor.id,
    local_owner_user_id: vendor.user_id,
    store_name: vendor.store_name,
    store_slug: vendor.slug,
    legal_business_name: vendor.business_name?.trim() || null,
    contact_email: normalizeEmail(vendor.contact_email),
    contact_phone: normalizePhone(vendor.phone),
    address: {
      line1: vendor.address ?? null,
      city: vendor.city ?? null,
      province: vendor.province ?? null,
      postal_code: vendor.postal_code ?? null,
      country: vendor.country ?? null,
    },
    marketplace_status: vendor.status,
    subscription_status: vendor.subscription_status ?? "none",
    subscription_plan: vendor.subscription_plan ?? null,
    created_at: vendor.created_at ?? null,
  };
}
