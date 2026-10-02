import { SOURCE_APPLICATION, SOURCE_VERTICAL, type TakatakOrderPayload } from "./types";

export type LocalOrderInput = {
  id: string;
  order_number: string;
  customer_id?: string | null;
  status: string;
  created_at: string;
  vendor_orders?: Array<{ vendor_id: string; status: string }> | null;
};

/**
 * Build non-financial operational references only.
 * Monetary amounts, payment state, refunds, payouts and Stripe data remain
 * exclusively inside 1LV and must never be projected into GROUPE TAKATAK.
 */
export function mapOrder(order: LocalOrderInput): TakatakOrderPayload {
  const splits = (order.vendor_orders ?? []).map((v) => ({
    vendor_local_id: v.vendor_id,
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
    fulfillment_status: order.status,
    created_at: order.created_at,
  };
}
