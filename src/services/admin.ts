import { supabase } from "@/integrations/supabase/client";

// ---------------- Categories ----------------

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
  position?: number;
}) {
  const { error } = await supabase.from("categories").upsert(input, { onConflict: "slug" });
  if (error) throw error;
}

export async function deleteCategory(slug: string) {
  const { error } = await supabase.from("categories").delete().eq("slug", slug);
  if (error) throw error;
}

// ---------------- Overview ----------------

export type AdminOverview = {
  gmv: number;
  orderCount: number;
  pendingVendors: number;
  activeVendors: number;
  pendingProducts: number;
  activeProducts: number;
  unpaidVendors: number;
  commissionRevenue: number;
  payoutLiability: number;
  hasData: boolean;
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const [orders, vendors, products, splits] = await Promise.all([
    supabase.from("orders").select("total, payment_status").limit(1000),
    supabase.from("vendors").select("status, subscription_status").limit(1000),
    supabase.from("products").select("status").limit(2000),
    supabase
      .from("vendor_orders" as never)
      .select("commission_amount, vendor_payout_amount, status")
      .limit(2000),
  ]);

  const oRows = (orders.data ?? []) as Array<{ total: number; payment_status: string }>;
  const vRows = (vendors.data ?? []) as Array<{ status: string; subscription_status: string }>;
  const pRows = (products.data ?? []) as Array<{ status: string }>;
  const sRows = (splits.data ?? []) as Array<{
    commission_amount: number;
    vendor_payout_amount: number;
    status: string;
  }>;

  const gmv = oRows
    .filter((o) => o.payment_status === "paid")
    .reduce((s, o) => s + Number(o.total ?? 0), 0);

  return {
    gmv,
    orderCount: oRows.length,
    pendingVendors: vRows.filter((v) => v.status === "pending").length,
    activeVendors: vRows.filter((v) => v.status === "active").length,
    pendingProducts: pRows.filter((p) => p.status === "pending_review").length,
    activeProducts: pRows.filter((p) => p.status === "active").length,
    unpaidVendors: vRows.filter(
      (v) => v.subscription_status === "past_due" || v.subscription_status === "unpaid",
    ).length,
    commissionRevenue: sRows.reduce((s, r) => s + Number(r.commission_amount ?? 0), 0),
    payoutLiability: sRows
      .filter((r) => r.status !== "delivered" && r.status !== "cancelled")
      .reduce((s, r) => s + Number(r.vendor_payout_amount ?? 0), 0),
    hasData: oRows.length + vRows.length + pRows.length > 0,
  };
}
