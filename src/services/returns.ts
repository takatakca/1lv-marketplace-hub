import { supabase } from "@/integrations/supabase/client";
import { approveReturnRefund as approveReturnRefundFn } from "@/lib/returns.functions";

export type ReturnStatus =
  | "requested"
  | "approved"
  | "label_issued"
  | "in_transit"
  | "received"
  | "inspecting"
  | "refund_approved"
  | "refunded"
  | "rejected"
  | "cancelled"
  | "closed";

export type ReturnReason =
  | "damaged"
  | "defective"
  | "wrong_item"
  | "not_as_described"
  | "missing_parts"
  | "size_fit"
  | "unwanted"
  | "other";

export type ReturnSummary = {
  id: string;
  order_id: string;
  vendor_order_id: string;
  vendor_id: string;
  customer_id?: string;
  status: ReturnStatus;
  reason: ReturnReason;
  requested_at: string;
  updated_at: string;
};

export type ReturnDetail = {
  id: string;
  order_id: string;
  vendor_order_id: string;
  customer_id: string;
  vendor_id: string;
  status: ReturnStatus;
  reason: ReturnReason;
  description: string | null;
  return_carrier: string | null;
  return_tracking_number: string | null;
  return_label_url: string | null;
  inspection_note: string | null;
  refund_record_id: string | null;
  requested_at: string;
  approved_at: string | null;
  shipped_at: string | null;
  received_at: string | null;
  inspected_at: string | null;
  closed_at: string | null;
  items: Array<{
    id: string;
    order_item_id: string;
    quantity: number;
    title: string;
    unit_price: number;
    variant_id: string | null;
    variant_sku: string | null;
    variant_options: Record<string, string> | null;
  }>;
  events: Array<{
    id: string;
    actor_role: "customer" | "vendor" | "admin" | "system";
    from_status: ReturnStatus | null;
    to_status: ReturnStatus;
    note: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
};

export async function createReturnRequest(input: {
  orderId: string;
  reason: ReturnReason;
  description?: string | null;
  items: Array<{ orderItemId: string; quantity: number }>;
}) {
  const { data, error } = await supabase.rpc(
    "create_return_request" as never,
    {
      _order_id: input.orderId,
      _reason: input.reason,
      _description: input.description?.trim() || null,
      _items: input.items.map((item) => ({
        order_item_id: item.orderItemId,
        quantity: item.quantity,
      })),
    } as never,
  );
  if (error) throw error;
  return data as unknown as {
    ok: true;
    return_request_id: string;
    status: "requested";
    return_window_days: 30;
  };
}

export async function cancelReturnRequest(
  returnRequestId: string,
  note?: string | null,
) {
  const { data, error } = await supabase.rpc(
    "cancel_return_request" as never,
    {
      _return_request_id: returnRequestId,
      _note: note?.trim() || null,
    } as never,
  );
  if (error) throw error;
  return data === true;
}

export async function transitionReturnRequest(input: {
  returnRequestId: string;
  nextStatus: ReturnStatus;
  note?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  labelUrl?: string | null;
}) {
  const { data, error } = await supabase.rpc(
    "transition_return_request" as never,
    {
      _return_request_id: input.returnRequestId,
      _next_status: input.nextStatus,
      _note: input.note?.trim() || null,
      _carrier: input.carrier?.trim() || null,
      _tracking_number: input.trackingNumber?.trim() || null,
      _label_url: input.labelUrl?.trim() || null,
    } as never,
  );
  if (error) throw error;
  return data as unknown as {
    ok: true;
    return_request_id: string;
    status: ReturnStatus;
  };
}

export async function getReturnRequest(
  returnRequestId: string,
): Promise<ReturnDetail | null> {
  const { data, error } = await supabase.rpc(
    "get_return_request" as never,
    { _return_request_id: returnRequestId } as never,
  );
  if (error) throw error;
  return (data as unknown as ReturnDetail | null) ?? null;
}

export async function listMyReturnRequests(
  limit = 100,
): Promise<ReturnSummary[]> {
  const { data, error } = await supabase.rpc(
    "list_my_return_requests" as never,
    { _limit: limit } as never,
  );
  if (error) throw error;
  return (data ?? []) as unknown as ReturnSummary[];
}

export async function listVendorReturnRequests(
  vendorId: string,
  limit = 100,
): Promise<ReturnSummary[]> {
  const { data, error } = await supabase.rpc(
    "list_vendor_return_requests" as never,
    { _vendor_id: vendorId, _limit: limit } as never,
  );
  if (error) throw error;
  return (data ?? []) as unknown as ReturnSummary[];
}

export async function approveReturnRefund(input: {
  returnRequestId: string;
  amount: number;
  note?: string | null;
}) {
  return approveReturnRefundFn({ data: input });
}
