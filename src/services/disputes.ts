import { supabase } from "@/integrations/supabase/client";
import {
  openDispute as openDisputeFn,
  postDisputeMessage as postMessageFn,
  adminDisputeAction as adminActionFn,
  processApprovedRefund as processRefundFn,
  type DisputeStatus,
  type RefundStatus,
  type ActionResult,
  type DisputeResult,
  type RefundProcessResult,
} from "@/lib/disputes.functions";

export type { DisputeStatus, RefundStatus, ActionResult, DisputeResult, RefundProcessResult };

export type DisputeRecord = {
  id: string;
  order_id: string;
  vendor_order_id: string | null;
  customer_id: string | null;
  vendor_id: string;
  reason: string;
  description: string | null;
  status: DisputeStatus;
  requested_refund_amount: number;
  approved_refund_amount: number;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type DisputeMessageRecord = {
  id: string;
  dispute_id: string;
  sender_user_id: string | null;
  sender_role: string;
  message: string;
  attachment_url: string | null;
  internal_only: boolean;
  created_at: string;
};

export type RefundRecord = {
  id: string;
  order_id: string;
  vendor_order_id: string | null;
  dispute_id: string | null;
  amount: number;
  currency: string;
  reason: string | null;
  status: RefundStatus;
  stripe_refund_id: string | null;
  failure_reason: string | null;
  approved_at: string | null;
  processed_at: string | null;
  created_at: string;
};

export const DISPUTE_STATUSES: DisputeStatus[] = [
  "open",
  "under_review",
  "waiting_customer",
  "waiting_vendor",
  "resolved_customer",
  "resolved_vendor",
  "rejected",
  "cancelled",
];

export const DISPUTE_REASONS = [
  "Item not received",
  "Damaged item",
  "Wrong item",
  "Not as described",
  "Missing item",
  "Late delivery",
  "Other",
];

export function disputeStatusLabel(status: DisputeStatus) {
  return status.replace(/_/g, " ");
}

export function disputeStatusClass(status: DisputeStatus) {
  switch (status) {
    case "resolved_customer":
    case "resolved_vendor":
      return "bg-success/10 text-success";
    case "rejected":
    case "cancelled":
      return "bg-muted text-muted-foreground";
    case "open":
      return "bg-deal/10 text-deal";
    default:
      return "bg-electric/10 text-electric";
  }
}

export function refundStatusClass(status: RefundStatus) {
  switch (status) {
    case "refunded":
      return "bg-success/10 text-success";
    case "failed":
      return "bg-destructive/10 text-destructive";
    case "cancelled":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-electric/10 text-electric";
  }
}

// ---------------- Reads (RLS decides what each role can see) ----------------

export async function listDisputesForCustomer(orderId: string): Promise<DisputeRecord[]> {
  const { data } = await supabase
    .from("disputes")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as DisputeRecord[];
}

export async function listVendorDisputes(vendorId: string): Promise<DisputeRecord[]> {
  const { data } = await supabase
    .from("disputes")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as DisputeRecord[];
}

export async function listAllDisputes(): Promise<
  Array<DisputeRecord & { orders: { order_number: string; total: number } | null }>
> {
  const { data } = await supabase
    .from("disputes")
    .select("*, orders(order_number, total)")
    .order("created_at", { ascending: false })
    .limit(300);
  return (data ?? []) as unknown as Array<
    DisputeRecord & { orders: { order_number: string; total: number } | null }
  >;
}

export async function getDispute(id: string): Promise<DisputeRecord | null> {
  const { data } = await supabase.from("disputes").select("*").eq("id", id).maybeSingle();
  return (data ?? null) as unknown as DisputeRecord | null;
}

/** Internal notes are filtered out by RLS for non-admins. */
export async function listDisputeMessages(disputeId: string): Promise<DisputeMessageRecord[]> {
  const { data } = await supabase
    .from("dispute_messages")
    .select("*")
    .eq("dispute_id", disputeId)
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as DisputeMessageRecord[];
}

export async function listRefundsForDispute(disputeId: string): Promise<RefundRecord[]> {
  const { data } = await supabase
    .from("refund_records")
    .select("*")
    .eq("dispute_id", disputeId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as RefundRecord[];
}

export async function listAllRefunds(): Promise<RefundRecord[]> {
  const { data } = await supabase
    .from("refund_records")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  return (data ?? []) as unknown as RefundRecord[];
}

export async function listVendorSplitsForOrder(orderId: string) {
  const { data } = await supabase
    .from("vendor_orders")
    .select("id, vendor_id, subtotal, status, vendors(store_name)")
    .eq("order_id", orderId);
  return (data ?? []) as unknown as Array<{
    id: string;
    vendor_id: string;
    subtotal: number;
    status: string;
    vendors: { store_name: string } | null;
  }>;
}

// ---------------- Writes (server functions, safe fallbacks) ----------------

export async function createDispute(input: {
  orderId: string;
  vendorOrderId: string;
  reason: string;
  description: string;
  requestedAmount: number;
}): Promise<DisputeResult> {
  try {
    return await openDisputeFn({ data: input });
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Could not open dispute" };
  }
}

export async function sendDisputeMessage(
  disputeId: string,
  message: string,
  internalOnly = false,
): Promise<ActionResult> {
  try {
    return await postMessageFn({ data: { disputeId, message, internalOnly } });
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Could not send message" };
  }
}

export async function runDisputeAction(input: {
  disputeId: string;
  action:
    | "set_status"
    | "place_hold"
    | "release_hold"
    | "approve_refund"
    | "reject"
    | "resolve_customer"
    | "resolve_vendor";
  status?: DisputeStatus;
  amount?: number;
  note?: string;
}): Promise<ActionResult> {
  try {
    return await adminActionFn({ data: input });
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Action failed" };
  }
}

export async function processRefund(refundId: string): Promise<RefundProcessResult> {
  try {
    return await processRefundFn({ data: { refundId } });
  } catch (err) {
    return {
      ok: false,
      status: "approved",
      setupRequired: true,
      reason: err instanceof Error ? err.message : "Stripe setup required",
    };
  }
}
