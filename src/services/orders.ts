import { supabase } from "@/integrations/supabase/client";
import { signalVendorOrderDelivered } from "./takatak-sync";
import { auditMissingVendorOrdersServer } from "@/lib/admin-marketplace.functions";

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

export type VendorOrderListRecord = VendorOrderRecord & {
  orders: {
    id: string;
    order_number: string;
    payment_status: string;
    customer_email: string | null;
    created_at: string;
  };
};

export type VendorOrderDetailRecord = VendorOrderRecord & {
  orders: {
    id: string;
    order_number: string;
    payment_status: string;
    shipping_address: Record<string, unknown> | null;
    customer_email: string | null;
    customer_phone: string | null;
    created_at: string;
  };
};

export async function listVendorOrders(vendorId: string) {
  const { data, error } = await supabase.rpc(
    "list_vendor_orders_for_current_user",
    { _vendor_id: vendorId },
  );
  if (error) throw error;

  const rows = data as unknown;
  return (Array.isArray(rows) ? rows : []) as VendorOrderListRecord[];
}

export async function getVendorOrder(vendorOrderId: string) {
  const { data, error } = await supabase.rpc(
    "get_vendor_order_for_current_user",
    { _vendor_order_id: vendorOrderId },
  );
  if (error) throw error;

  const row = data as unknown;
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  return row as VendorOrderDetailRecord;
}

export async function updateVendorOrder(
  id: string,
  patch: Partial<Pick<VendorOrderRecord, "status" | "tracking_number" | "carrier">>,
) {
  if (!patch.status) {
    throw new Error("A fulfillment status is required.");
  }

  const { data, error } = await supabase.rpc(
    "update_vendor_order_fulfillment" as never,
    {
      _vendor_order_id: id,
      _next_status: patch.status,
      _tracking_number: patch.tracking_number ?? null,
      _carrier: patch.carrier ?? null,
    } as never,
  );

  if (error) throw error;

  const result = (data ?? {}) as unknown as {
    ok?: boolean;
    status?: VendorOrderStatus;
  };
  if (result.ok !== true) {
    throw new Error("Vendor fulfillment update was not accepted.");
  }

  if (result.status === "delivered") signalVendorOrderDelivered(id);
}

// ---------- Order items (still used to show per-line products) ----------

export async function listItemsForVendorOrder(orderId: string, vendorId: string) {
  const { data, error } = await supabase
    .from("order_items")
    .select(
      "id, order_id, product_id, vendor_id, title, quantity, unit_price, status, tracking_number, carrier, created_at, updated_at",
    )
    .eq("order_id", orderId)
    .eq("vendor_id", vendorId);
  if (error) throw error;
  return data ?? [];
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
 * Admin-only audit for legacy orders missing vendor splits.
 *
 * No financial rows are created because historical order items do not carry an
 * immutable commission-rate snapshot.
 */
export async function auditMissingVendorOrders() {
  return await auditMissingVendorOrdersServer();
}
