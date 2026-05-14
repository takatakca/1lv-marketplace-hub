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

export async function listVendorOrders(vendorId: string) {
  const { data, error } = await supabase
    .from("order_items")
    .select("id, order_id, title, quantity, unit_price, status, tracking_number, carrier, orders!inner(id, order_number, total, status, payment_status, created_at)")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false, referencedTable: "orders" });
  if (error) throw error;
  return data ?? [];
}

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
