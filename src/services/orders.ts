import { supabase } from "@/integrations/supabase/client";

export type OrderRecord = {
  id: string;
  order_number: string;
  customer_id: string;
  total: number;
  status: string;
  payment_status: string;
  shipping_address: Record<string, unknown> | null;
  created_at: string;
};

export type OrderItemRecord = {
  id: string;
  order_id: string;
  product_id: string | null;
  vendor_id: string;
  title: string;
  quantity: number;
  unit_price: number;
  status: string;
  tracking_number: string | null;
  carrier: string | null;
};

export type VendorOrderStatus =
  | "pending"
  | "accepted"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type VendorOrderRecord = {
  id: string;
  order_id: string;
  vendor_id: string;
  subtotal: number;
  commission_amount: number;
  vendor_payout_amount: number;
  status: VendorOrderStatus;
  tracking_number: string | null;
  carrier: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- Vendor-facing: vendor_orders ----------

export async function listVendorOrders(vendorId: string) {
  const { data, error } = await supabase
    .from("vendor_orders" as never)
    .select("*, orders!inner(id, order_number, payment_status, total, customer_email, created_at)")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<
    VendorOrderRecord & {
      orders: { id: string; order_number: string; payment_status: string; total: number; customer_email: string | null; created_at: string };
    }
  >;
}

export async function getVendorOrder(vendorOrderId: string) {
  const { data, error } = await supabase
    .from("vendor_orders" as never)
    .select("*, orders!inner(*)")
    .eq("id", vendorOrderId)
    .maybeSingle();
  if (error) throw error;
  return data as
    | (VendorOrderRecord & { orders: Record<string, unknown> })
    | null;
}

export async function updateVendorOrder(
  id: string,
  patch: Partial<Pick<VendorOrderRecord, "status" | "tracking_number" | "carrier">>,
) {
  const { error } = await supabase
    .from("vendor_orders" as never)
    .update(patch as never)
    .eq("id", id);
  if (error) throw error;
}

// ---------- Order items (still used to show per-line products) ----------

export async function listItemsForVendorOrder(orderId: string, vendorId: string) {
  const { data, error } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId)
    .eq("vendor_id", vendorId);
  if (error) throw error;
  return data ?? [];
}

// ---------- Legacy helpers kept for compatibility ----------

export async function getOrderForVendor(orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type FulfillmentStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled";
export async function updateOrderItem(
  itemId: string,
  patch: { status?: FulfillmentStatus; tracking_number?: string | null; carrier?: string | null },
) {
  const { error } = await supabase.from("order_items").update(patch).eq("id", itemId);
  if (error) throw error;
}

// ---------- Admin ----------

export async function listAllOrdersWithSplits() {
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, total, status, payment_status, customer_email, created_at, vendor_orders(id, vendor_id, subtotal, commission_amount, vendor_payout_amount, status)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    order_number: string;
    total: number;
    status: string;
    payment_status: string;
    customer_email: string | null;
    created_at: string;
    vendor_orders: Array<{
      id: string; vendor_id: string; subtotal: number;
      commission_amount: number; vendor_payout_amount: number; status: string;
    }>;
  }>;
}

/**
 * Admin-only: create vendor_orders for any orders that have order_items but
 * no vendor_orders rows yet. Uses vendor.commission_rate (default 10%).
 */
export async function backfillVendorOrders(): Promise<{ created: number; skipped: number }> {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_items(vendor_id, quantity, unit_price), vendor_orders(id)");
  if (error) throw error;

  let created = 0;
  let skipped = 0;
  for (const o of (orders ?? []) as Array<{
    id: string;
    order_items: Array<{ vendor_id: string; quantity: number; unit_price: number }>;
    vendor_orders: Array<{ id: string }>;
  }>) {
    if ((o.vendor_orders ?? []).length > 0 || (o.order_items ?? []).length === 0) {
      skipped++;
      continue;
    }
    const byVendor = new Map<string, number>();
    for (const it of o.order_items) {
      byVendor.set(it.vendor_id, (byVendor.get(it.vendor_id) ?? 0) + Number(it.unit_price) * it.quantity);
    }
    const vendorIds = Array.from(byVendor.keys());
    const { data: vs } = await supabase
      .from("vendors").select("id, commission_rate").in("id", vendorIds);
    const rateBy = new Map<string, number>(
      (vs ?? []).map((r) => [r.id, Number((r as { commission_rate?: number }).commission_rate ?? 0.1)]),
    );
    const rows = vendorIds.map((vid) => {
      const sub = byVendor.get(vid)!;
      const rate = rateBy.get(vid) ?? 0.1;
      const commission = +(sub * rate).toFixed(2);
      return {
        order_id: o.id, vendor_id: vid, subtotal: sub,
        commission_amount: commission, vendor_payout_amount: +(sub - commission).toFixed(2),
        status: "pending" as const,
      };
    });
    const { error: insErr } = await supabase.from("vendor_orders" as never).insert(rows as never);
    if (insErr) throw insErr;
    created += rows.length;
  }
  return { created, skipped };
}
