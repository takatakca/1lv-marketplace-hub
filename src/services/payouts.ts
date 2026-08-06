import { supabase } from "@/integrations/supabase/client";
import {
  generateVendorPayouts as generateFn,
  setPayoutStatus as setStatusFn,
  processApprovedPayout as processFn,
  type PayoutStatus,
  type GenerateResult,
  type TransferResult,
} from "@/lib/payouts.functions";

export type { PayoutStatus, GenerateResult, TransferResult };

export type PayoutRecord = {
  id: string;
  vendor_id: string;
  period_start: string;
  period_end: string;
  gross_amount: number;
  commission_amount: number;
  refund_amount: number;
  dispute_hold_amount: number;
  net_amount: number;
  currency: string;
  status: PayoutStatus;
  stripe_transfer_id: string | null;
  failure_reason: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
};

export type PayoutItemRecord = {
  id: string;
  payout_id: string;
  vendor_order_id: string;
  gross_amount: number;
  commission_amount: number;
  refund_amount: number;
  net_amount: number;
};

export const PAYOUT_STATUSES: PayoutStatus[] = [
  "draft",
  "pending_review",
  "approved",
  "processing",
  "paid",
  "failed",
  "held",
  "cancelled",
];

export function payoutStatusLabel(status: PayoutStatus): string {
  switch (status) {
    case "pending_review":
      return "Pending review";
    case "approved":
      return "Approved";
    case "processing":
      return "Processing";
    case "paid":
      return "Paid";
    case "failed":
      return "Failed";
    case "held":
      return "Held";
    case "cancelled":
      return "Cancelled";
    default:
      return "Draft";
  }
}

export function payoutStatusClass(status: PayoutStatus): string {
  switch (status) {
    case "paid":
      return "bg-success/10 text-success";
    case "approved":
    case "processing":
      return "bg-electric/10 text-electric";
    case "failed":
      return "bg-destructive/10 text-destructive";
    case "held":
      return "bg-deal/10 text-deal";
    case "cancelled":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-deal/10 text-deal";
  }
}

/** Vendor-scoped list (RLS restricts to the caller's own vendor rows). */
export async function listVendorPayouts(vendorId: string): Promise<PayoutRecord[]> {
  const { data } = await supabase
    .from("payouts" as never)
    .select("*")
    .eq("vendor_id", vendorId)
    .order("period_start", { ascending: false });
  return (data ?? []) as unknown as PayoutRecord[];
}

/** Admin list — RLS still applies; non-admins simply see only their own rows. */
export async function listAllPayouts(): Promise<PayoutRecord[]> {
  const { data } = await supabase
    .from("payouts" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []) as unknown as PayoutRecord[];
}

export async function listPayoutItems(payoutId: string): Promise<PayoutItemRecord[]> {
  const { data } = await supabase
    .from("payout_items" as never)
    .select("*")
    .eq("payout_id", payoutId);
  return (data ?? []) as unknown as PayoutItemRecord[];
}

export async function getPayoutSettings(): Promise<{ holdDays: number; autoTransfers: boolean }> {
  const { data } = await supabase
    .from("payout_settings" as never)
    .select("hold_days, auto_transfers_enabled")
    .maybeSingle();
  const row = data as unknown as { hold_days?: number; auto_transfers_enabled?: boolean } | null;
  return { holdDays: Number(row?.hold_days ?? 7), autoTransfers: Boolean(row?.auto_transfers_enabled) };
}

// ---------------- Admin actions (server functions) ----------------

export async function generatePayouts(periodStart: string, periodEnd: string): Promise<GenerateResult> {
  try {
    return await generateFn({ data: { periodStart, periodEnd } });
  } catch (err) {
    return {
      ok: false,
      created: 0,
      skipped: 0,
      vendors: 0,
      reason: err instanceof Error ? err.message : "Payout generation failed",
    };
  }
}

export async function updatePayoutStatus(
  payoutId: string,
  action: "approve" | "hold" | "cancel" | "reopen",
): Promise<{ ok: boolean; status: PayoutStatus; reason?: string }> {
  try {
    return await setStatusFn({ data: { payoutId, action } });
  } catch (err) {
    return { ok: false, status: "draft", reason: err instanceof Error ? err.message : "Action failed" };
  }
}

export async function processPayout(payoutId: string): Promise<TransferResult> {
  try {
    return await processFn({ data: { payoutId } });
  } catch (err) {
    return {
      ok: false,
      status: "approved",
      setupRequired: true,
      reason: err instanceof Error ? err.message : "Stripe setup required",
    };
  }
}

// ---------------- Reconciliation ----------------

export type ReconciliationFlag =
  | "ok"
  | "missing_transfer"
  | "amount_invalid"
  | "failed_transfer"
  | "paid_missing_timestamp"
  | "duplicate_transfer"
  | "awaiting_approval";

export type ReconciliationRow = {
  payout: PayoutRecord;
  flag: ReconciliationFlag;
  label: string;
  severity: "ok" | "warn" | "error";
};

const FLAG_META: Record<ReconciliationFlag, { label: string; severity: "ok" | "warn" | "error" }> = {
  ok: { label: "Reconciled", severity: "ok" },
  missing_transfer: { label: "Paid but no transfer reference", severity: "error" },
  amount_invalid: { label: "Net amount is zero or negative", severity: "warn" },
  failed_transfer: { label: "Transfer failed", severity: "error" },
  paid_missing_timestamp: { label: "Paid but missing paid date", severity: "warn" },
  duplicate_transfer: { label: "Duplicate transfer reference", severity: "error" },
  awaiting_approval: { label: "Awaiting review", severity: "warn" },
};

/**
 * Compare local payout state against the recorded Stripe transfer reference.
 * Purely defensive labelling — never mutates anything.
 */
export function reconcilePayouts(payouts: PayoutRecord[]): ReconciliationRow[] {
  const transferCounts = new Map<string, number>();
  for (const p of payouts) {
    if (p.stripe_transfer_id) {
      transferCounts.set(p.stripe_transfer_id, (transferCounts.get(p.stripe_transfer_id) ?? 0) + 1);
    }
  }

  return payouts.map((payout) => {
    let flag: ReconciliationFlag = "ok";
    if (payout.stripe_transfer_id && (transferCounts.get(payout.stripe_transfer_id) ?? 0) > 1) {
      flag = "duplicate_transfer";
    } else if (payout.status === "failed") {
      flag = "failed_transfer";
    } else if (payout.status === "paid" && !payout.stripe_transfer_id) {
      flag = "missing_transfer";
    } else if (payout.status === "paid" && !payout.paid_at) {
      flag = "paid_missing_timestamp";
    } else if (Number(payout.net_amount) <= 0 && payout.status !== "cancelled") {
      flag = "amount_invalid";
    } else if (payout.status === "pending_review" || payout.status === "held") {
      flag = "awaiting_approval";
    }
    const meta = FLAG_META[flag];
    return { payout, flag, label: meta.label, severity: meta.severity };
  });
}
