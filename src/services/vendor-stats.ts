import { supabase } from "@/integrations/supabase/client";

export type VendorStats = {
  products: { total: number; draft: number; pending: number; active: number; rejected: number; archived: number };
  orders: { total: number; pending: number; accepted: number; processing: number; shipped: number; delivered: number; cancelled: number };
  gmv: number;
  commission: number;
  payoutPending: number;
  payoutAvailable: number;
  payoutLifetime: number;
};

export async function getVendorStats(vendorId: string): Promise<VendorStats> {
  const [{ data: prods }, { data: vos }] = await Promise.all([
    supabase.from("products").select("status").eq("vendor_id", vendorId),
    supabase.from("vendor_orders" as never).select("status, subtotal, commission_amount, vendor_payout_amount").eq("vendor_id", vendorId),
  ]);

  const products = { total: 0, draft: 0, pending: 0, active: 0, rejected: 0, archived: 0 };
  for (const p of (prods ?? []) as Array<{ status: string }>) {
    products.total++;
    const k = p.status === "pending_review" ? "pending" : p.status;
    if (k in products) (products as Record<string, number>)[k]++;
  }

  const orders = { total: 0, pending: 0, accepted: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
  let gmv = 0, commission = 0, payoutPending = 0, payoutAvailable = 0, payoutLifetime = 0;
  for (const v of (vos ?? []) as Array<{ status: string; subtotal: number; commission_amount: number; vendor_payout_amount: number }>) {
    orders.total++;
    if (v.status in orders) (orders as Record<string, number>)[v.status]++;
    const sub = Number(v.subtotal); const com = Number(v.commission_amount); const pay = Number(v.vendor_payout_amount);
    gmv += sub; commission += com;
    if (v.status === "delivered") { payoutAvailable += pay; payoutLifetime += pay; }
    else if (v.status !== "cancelled") { payoutPending += pay; }
  }
  return { products, orders, gmv, commission, payoutPending, payoutAvailable, payoutLifetime };
}
