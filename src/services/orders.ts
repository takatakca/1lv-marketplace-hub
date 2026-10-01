import { supabase } from "@/integrations/supabase/client";
import { signalVendorOrderDelivered } from "./takatak-sync";
import { backfillVendorOrdersServer } from "@/lib/admin-marketplace.functions";

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
  if (patch.status === "delivered") signalVendorOrderDelivered(id);
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
  return await backfillVendorOrdersServer();
}
