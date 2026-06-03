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

export type DailySales = {
  date: string; // YYYY-MM-DD
  orders: number;
  gmv: number;
  commission: number;
  payout: number;
};

export type PayoutPeriod = {
  periodStart: string; // YYYY-MM-DD (Mon)
  periodEnd: string;
  orders: number;
  gross: number;
  commission: number;
  net: number;
  status: "available" | "pending";
};

type VORow = {
  status: string;
  subtotal: number;
  commission_amount: number;
  vendor_payout_amount: number;
  created_at: string;
};

async function fetchVendorOrders(vendorId: string): Promise<VORow[]> {
  const { data } = await supabase
    .from("vendor_orders" as never)
    .select("status, subtotal, commission_amount, vendor_payout_amount, created_at")
    .eq("vendor_id", vendorId);
  return (data ?? []) as unknown as VORow[];
}

export async function getVendorStats(vendorId: string): Promise<VendorStats> {
  const [{ data: prods }, vos] = await Promise.all([
    supabase.from("products").select("status").eq("vendor_id", vendorId),
    fetchVendorOrders(vendorId),
  ]);

  const products = { total: 0, draft: 0, pending: 0, active: 0, rejected: 0, archived: 0 };
  for (const p of (prods ?? []) as Array<{ status: string }>) {
    products.total++;
    const k = p.status === "pending_review" ? "pending" : p.status;
    if (k in products) (products as Record<string, number>)[k]++;
  }

  const orders = { total: 0, pending: 0, accepted: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
  let gmv = 0, commission = 0, payoutPending = 0, payoutAvailable = 0, payoutLifetime = 0;
  for (const v of vos) {
    orders.total++;
    if (v.status in orders) (orders as Record<string, number>)[v.status]++;
    const sub = Number(v.subtotal); const com = Number(v.commission_amount); const pay = Number(v.vendor_payout_amount);
    gmv += sub; commission += com;
    if (v.status === "delivered") { payoutAvailable += pay; payoutLifetime += pay; }
    else if (v.status !== "cancelled") { payoutPending += pay; }
  }
  return { products, orders, gmv, commission, payoutPending, payoutAvailable, payoutLifetime };
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export async function getDailySales(vendorId: string, days = 7): Promise<DailySales[]> {
  const vos = await fetchVendorOrders(vendorId);
  const buckets = new Map<string, DailySales>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const key = isoDate(d);
    buckets.set(key, { date: key, orders: 0, gmv: 0, commission: 0, payout: 0 });
  }
  for (const v of vos) {
    if (v.status === "cancelled") continue;
    const key = isoDate(new Date(v.created_at));
    const b = buckets.get(key);
    if (!b) continue;
    b.orders++;
    b.gmv += Number(v.subtotal);
    b.commission += Number(v.commission_amount);
    b.payout += Number(v.vendor_payout_amount);
  }
  return Array.from(buckets.values());
}

function weekStart(d: Date) {
  const out = new Date(d);
  const day = (out.getDay() + 6) % 7; // Monday = 0
  out.setDate(out.getDate() - day);
  out.setHours(0, 0, 0, 0);
  return out;
}

export async function getPayoutPeriods(vendorId: string): Promise<PayoutPeriod[]> {
  const vos = await fetchVendorOrders(vendorId);
  const buckets = new Map<string, PayoutPeriod>();
  for (const v of vos) {
    if (v.status === "cancelled") continue;
    const start = weekStart(new Date(v.created_at));
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const key = isoDate(start);
    let b = buckets.get(key);
    if (!b) {
      b = { periodStart: key, periodEnd: isoDate(end), orders: 0, gross: 0, commission: 0, net: 0, status: "pending" };
      buckets.set(key, b);
    }
    b.orders++;
    b.gross += Number(v.subtotal);
    b.commission += Number(v.commission_amount);
    if (v.status === "delivered") {
      b.net += Number(v.vendor_payout_amount);
      b.status = "available";
    }
  }
  return Array.from(buckets.values()).sort((a, b) => b.periodStart.localeCompare(a.periodStart));
}
