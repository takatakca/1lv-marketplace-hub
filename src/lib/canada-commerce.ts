/**
 * Canada-first commerce defaults for 1LV.CA.
 *
 * Tax rates are general consumer retail estimates for taxable goods shipped to a
 * Canadian province/territory. Product taxability, marketplace-facilitator rules,
 * registration status, exemptions, and place-of-supply rules can change the final
 * amount. Keep this module as the single storefront estimate source until a
 * dedicated tax engine is introduced.
 */

export type CanadianProvinceCode =
  | "AB"
  | "BC"
  | "MB"
  | "NB"
  | "NL"
  | "NT"
  | "NS"
  | "NU"
  | "ON"
  | "PE"
  | "QC"
  | "SK"
  | "YT";

export type CanadianProvince = {
  code: CanadianProvinceCode;
  name: string;
  federalRate: number;
  provincialRate: number;
  combinedRate: number;
  taxLabel: string;
};

export const FREE_SHIPPING_THRESHOLD_CAD = 49;
export const STANDARD_SHIPPING_FEE_CAD = 7.99;

export type ShippingPricing = {
  freeShippingThresholdCad: number;
  standardShippingFeeCad: number;
};

const DEFAULT_SHIPPING_PRICING: ShippingPricing = {
  freeShippingThresholdCad: FREE_SHIPPING_THRESHOLD_CAD,
  standardShippingFeeCad: STANDARD_SHIPPING_FEE_CAD,
};

export const CANADIAN_PROVINCES: CanadianProvince[] = [
  { code: "AB", name: "Alberta", federalRate: 0.05, provincialRate: 0, combinedRate: 0.05, taxLabel: "GST" },
  { code: "BC", name: "British Columbia", federalRate: 0.05, provincialRate: 0.07, combinedRate: 0.12, taxLabel: "GST + PST" },
  { code: "MB", name: "Manitoba", federalRate: 0.05, provincialRate: 0.07, combinedRate: 0.12, taxLabel: "GST + RST" },
  { code: "NB", name: "New Brunswick", federalRate: 0.15, provincialRate: 0, combinedRate: 0.15, taxLabel: "HST" },
  { code: "NL", name: "Newfoundland and Labrador", federalRate: 0.15, provincialRate: 0, combinedRate: 0.15, taxLabel: "HST" },
  { code: "NT", name: "Northwest Territories", federalRate: 0.05, provincialRate: 0, combinedRate: 0.05, taxLabel: "GST" },
  { code: "NS", name: "Nova Scotia", federalRate: 0.14, provincialRate: 0, combinedRate: 0.14, taxLabel: "HST" },
  { code: "NU", name: "Nunavut", federalRate: 0.05, provincialRate: 0, combinedRate: 0.05, taxLabel: "GST" },
  { code: "ON", name: "Ontario", federalRate: 0.13, provincialRate: 0, combinedRate: 0.13, taxLabel: "HST" },
  { code: "PE", name: "Prince Edward Island", federalRate: 0.15, provincialRate: 0, combinedRate: 0.15, taxLabel: "HST" },
  { code: "QC", name: "Québec", federalRate: 0.05, provincialRate: 0.09975, combinedRate: 0.14975, taxLabel: "GST + QST" },
  { code: "SK", name: "Saskatchewan", federalRate: 0.05, provincialRate: 0.06, combinedRate: 0.11, taxLabel: "GST + PST" },
  { code: "YT", name: "Yukon", federalRate: 0.05, provincialRate: 0, combinedRate: 0.05, taxLabel: "GST" },
];

const BY_CODE = new Map(CANADIAN_PROVINCES.map((province) => [province.code, province]));
const BY_NAME = new Map(CANADIAN_PROVINCES.map((province) => [province.name.toLowerCase(), province]));

export function normalizeProvinceCode(value: string | null | undefined): CanadianProvinceCode {
  const raw = String(value ?? "").trim();
  const upper = raw.toUpperCase() as CanadianProvinceCode;
  if (BY_CODE.has(upper)) return upper;

  const byName = BY_NAME.get(raw.toLowerCase());
  return byName?.code ?? "QC";
}

export function getProvinceTaxProfile(value: string | null | undefined): CanadianProvince {
  return BY_CODE.get(normalizeProvinceCode(value)) ?? BY_CODE.get("QC")!;
}

export function calculateShipping(
  subtotal: number,
  pricing: ShippingPricing = DEFAULT_SHIPPING_PRICING,
): number {
  const safeSubtotal = Math.max(0, Number.isFinite(subtotal) ? subtotal : 0);
  const threshold = Math.max(
    0,
    Number.isFinite(pricing.freeShippingThresholdCad)
      ? pricing.freeShippingThresholdCad
      : FREE_SHIPPING_THRESHOLD_CAD,
  );
  const fee = Math.max(
    0,
    Number.isFinite(pricing.standardShippingFeeCad)
      ? pricing.standardShippingFeeCad
      : STANDARD_SHIPPING_FEE_CAD,
  );

  if (safeSubtotal <= 0 || safeSubtotal >= threshold) return 0;
  return fee;
}

export function calculateEstimatedTax(taxableAmount: number, province: string | null | undefined): number {
  const safeAmount = Math.max(0, Number.isFinite(taxableAmount) ? taxableAmount : 0);
  const rate = getProvinceTaxProfile(province).combinedRate;
  return +(safeAmount * rate).toFixed(2);
}

export function calculateCanadianOrderTotals(input: {
  subtotal: number;
  discountTotal?: number;
  province: string | null | undefined;
  shipping?: ShippingPricing;
}) {
  const subtotal = Math.max(0, input.subtotal);
  const discountTotal = Math.min(Math.max(0, input.discountTotal ?? 0), subtotal);
  const discountedSubtotal = +(subtotal - discountTotal).toFixed(2);
  const shippingTotal = calculateShipping(discountedSubtotal, input.shipping);
  const taxTotal = calculateEstimatedTax(discountedSubtotal, input.province);
  const total = +(discountedSubtotal + shippingTotal + taxTotal).toFixed(2);
  const taxProfile = getProvinceTaxProfile(input.province);

  return {
    subtotal,
    discountTotal,
    discountedSubtotal,
    shippingTotal,
    taxTotal,
    total,
    taxProfile,
  };
}
