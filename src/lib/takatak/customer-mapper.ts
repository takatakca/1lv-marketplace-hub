import { SOURCE_APPLICATION, type TakatakCustomerPayload } from "./types";

/**
 * Normalize a phone number to E.164-ish form for Canada/Québec defaults.
 * TAKATAK performs the authoritative normalization + identity resolution;
 * this is only a best-effort cleanup so the master platform receives a
 * consistent shape.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return v.length > 0 ? v : null;
}

export type LocalProfileInput = {
  id: string;
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
  locale?: string | null;
  country?: string | null;
  province?: string | null;
  created_at?: string | null;
};

/**
 * Map a signed-in 1LV customer to the normalized TAKATAK person input.
 * NEVER includes passwords, auth tokens, OTP codes or payment data.
 */
export function mapCustomer(profile: LocalProfileInput): TakatakCustomerPayload {
  return {
    source_application: SOURCE_APPLICATION,
    local_profile_id: profile.id,
    local_guest_reference: null,
    is_guest: false,
    email: normalizeEmail(profile.email),
    phone: normalizePhone(profile.phone),
    full_name: profile.display_name?.trim() || null,
    preferred_language: profile.locale ?? null,
    country: profile.country ?? null,
    province: profile.province ?? null,
    account_created_at: profile.created_at ?? null,
  };
}

export type GuestCustomerInput = {
  orderNumber: string;
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
  country?: string | null;
  province?: string | null;
  createdAt?: string | null;
};

/**
 * Guest checkout is TAKATAK-ready too: we send only what the guest supplied,
 * plus a local order reference. 1LV performs NO automatic merging — TAKATAK
 * decides later whether this guest matches an existing global person.
 */
export function mapGuestCustomer(input: GuestCustomerInput): TakatakCustomerPayload {
  return {
    source_application: SOURCE_APPLICATION,
    local_profile_id: null,
    local_guest_reference: `order:${input.orderNumber}`,
    is_guest: true,
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone),
    full_name: input.fullName?.trim() || null,
    preferred_language: null,
    country: input.country ?? null,
    province: input.province ?? null,
    account_created_at: input.createdAt ?? null,
  };
}
