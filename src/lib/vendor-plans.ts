export const VENDOR_PLANS = [
  {
    key: "starter",
    name: "Starter",
    monthlyCad: 0,
    productLimit: 10,
    productLimitLabel: "10 products",
    commissionRate: 0.12,
    commissionLabel: "12%",
    description: "Start selling with no monthly fee.",
    features: ["Basic analytics", "Email support"],
  },
  {
    key: "growth",
    name: "Growth",
    monthlyCad: 39,
    productLimit: 200,
    productLimitLabel: "200 products",
    commissionRate: 0.09,
    commissionLabel: "9%",
    description: "For growing Canadian marketplace sellers.",
    features: ["Advanced analytics", "Priority support", "CSV imports"],
  },
  {
    key: "scale",
    name: "Scale",
    monthlyCad: 119,
    productLimit: null,
    productLimitLabel: "Unlimited products",
    commissionRate: 0.06,
    commissionLabel: "6%",
    description: "For high-volume marketplace operations.",
    features: ["All Growth features", "Dedicated CSM", "API access"],
  },
] as const;

export type VendorPlanKey = (typeof VENDOR_PLANS)[number]["key"];

export function getVendorPlan(key: string | null | undefined) {
  const normalized = String(key ?? "").trim().toLowerCase();
  return VENDOR_PLANS.find((plan) => plan.key === normalized) ?? null;
}
