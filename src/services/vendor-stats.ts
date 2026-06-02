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

export type DayBucket = { date: string; orders: number; gmv: number; commission: number; payout: number };

export async function getVendorSalesByDay(vendorId: string, days = 7): Promise<DayBucket[]> {
  const since = new Date(); since.setDate(since.getDate() - (days - 1)); since.setHours(0, 0, 0, 0);
  const { data } = await supabase
    .from("vendor_orders" as never)
    .select("created_at, subtotal, commission_amount, vendor_payout_amount, status")
    .eq("vendor_id", vendorId)
    .gte("created_at", since.toISOString());

  const buckets = new Map<string, DayBucket>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since); d.setDate(since.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, orders: 0, gmv: 0, commission: 0, payout: 0 });
  }
  for (const row of (data ?? []) as Array<{ created_at: string; subtotal: number; commission_amount: number; vendor_payout_amount: number; status: string }>) {
    if (row.status === "cancelled") continue;
    const key = row.created_at.slice(0, 10);
    const b = buckets.get(key);
    if (!b) continue;
    b.orders++;
    b.gmv += Number(row.subtotal);
    b.commission += Number(row.commission_amount);
    b.payout += Number(row.vendor_payout_amount);
  }
  return Array.from(buckets.values());
}

export type PayoutPeriod = { period: string; start: string; end: string; orders: number; gross: number; commission: number; net: number; status: "pending" | "paid" };

export async function getVendorPayoutHistory(vendorId: string): Promise<PayoutPeriod[]> {
  const { data } = await supabase
    .from("vendor_orders" as never)
    .select("created_at, subtotal, commission_amount, vendor_payout_amount, status")
    .eq("vendor_id", vendorId)
    .eq("status", "delivered");

  const weeks = new Map<string, PayoutPeriod>();
  for (const row of (data ?? []) as Array<{ created_at: string; subtotal: number; commission_amount: number; vendor_payout_amount: number; status: string }>) {
    const d = new Date(row.created_at);
    const day = d.getUTCDay();
    const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7)); monday.setUTCHours(0, 0, 0, 0);
    const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
    const key = monday.toISOString().slice(0, 10);
    if (!weeks.has(key)) {
      weeks.set(key, {
        period: `${key} → ${sunday.toISOString().slice(0, 10)}`,
        start: key, end: sunday.toISOString().slice(0, 10),
        orders: 0, gross: 0, commission: 0, net: 0, status: "pending",
      });
    }
    const w = weeks.get(key)!;
    w.orders++;
    w.gross += Number(row.subtotal);
    w.commission += Number(row.commission_amount);
    w.net += Number(row.vendor_payout_amount);
  }
  return Array.from(weeks.values()).sort((a, b) => b.start.localeCompare(a.start));
}
