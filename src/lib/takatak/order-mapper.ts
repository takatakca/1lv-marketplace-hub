import { SOURCE_APPLICATION, SOURCE_VERTICAL, type TakatakOrderPayload } from "./types";

export type LocalOrderInput = {
  id: string;
  order_number: string;
  customer_id?: string | null;
  total: number | string;
  currency?: string | null;
  payment_status: string;
  status: string;
  created_at: string;
  vendor_orders?: Array<{ vendor_id: string; subtotal: number | string; status: string }> | null;
};

/**
 * Map a 1LV marketplace order to TAKATAK commerce lifecycle metadata.
 * A single parent marketplace order can involve MULTIPLE merchants, so the
 * vendor splits travel with it. No payment card data is ever included.
 */
export function mapOrder(order: LocalOrderInput): TakatakOrderPayload {
  const splits = (order.vendor_orders ?? []).map((v) => ({
    vendor_local_id: v.vendor_id,
    subtotal: Number(v.subtotal ?? 0),
    status: v.status,
  }));
  return {
    source_application: SOURCE_APPLICATION,
    source_vertical: SOURCE_VERTICAL,
    local_order_id: order.id,
    order_number: order.order_number,
    customer_local_id: order.customer_id ?? null,
    guest_reference: order.customer_id ? null : `order:${order.order_number}`,
    merchant_local_ids: Array.from(new Set(splits.map((s) => s.vendor_local_id))),
    splits,
    total: Number(order.total ?? 0),
    currency: order.currency ?? "CAD",
    payment_status: order.payment_status,
    fulfillment_status: order.status,
    created_at: order.created_at,
  };
}
