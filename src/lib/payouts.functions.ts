import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Payout engine server functions (admin only).
 *
 * SAFETY RULES
 * - No automatic transfers. Payouts are generated in `pending_review` and a
 *   human must approve before `processApprovedPayout` may run.
 * - Stripe secrets never leave the server; the client receives status payloads
 *   only (never account ids or transfer objects).
 * - A vendor_order can only ever belong to one payout (unique index on
 *   payout_items.vendor_order_id) — double-payment is impossible at the DB level.
 * - Shared runtime logic lives in ./payout-scheduler.server.
 */

export type PayoutStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "processing"
  | "paid"
  | "failed"
  | "held"
  | "cancelled";

export type GenerateResult = {
  ok: boolean;
  created: number;
  skipped: number;
  vendors: number;
  reason?: string;
};

export type TransferResult = {
  ok: boolean;
  status: PayoutStatus;
  setupRequired?: boolean;
  reason?: string;
};

/** Generate grouped payouts for a period. Admin only. Creates nothing in Stripe. */
export const generateVendorPayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { periodStart: string; periodEnd: string }) => data)
  .handler(async ({ data, context }): Promise<GenerateResult> => {
    const s = await import("./payout-scheduler.server");
    await s.assertAdmin(context);
    const db = await s.adminDb();
    return await s.generatePayoutsCore(db, data.periodStart, data.periodEnd);
  });

/** Approve / hold / cancel a payout. Admin only. Never touches Stripe. */
export const setPayoutStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { payoutId: string; action: "approve" | "hold" | "cancel" | "reopen" }) => data)
  .handler(async ({ data, context }): Promise<{ ok: boolean; status: PayoutStatus; reason?: string }> => {
    const s = await import("./payout-scheduler.server");
    await s.assertAdmin(context);
    const db = await s.adminDb();

    const { data: row } = await db.from("payouts").select("id, status").eq("id", data.payoutId).maybeSingle();
    const current = (row as { status: PayoutStatus } | null)?.status;
    if (!current) return { ok: false, status: "draft", reason: "Payout not found" };
    if (current === "paid" || current === "processing") {
      return { ok: false, status: current, reason: "Paid or in-flight payouts cannot be changed." };
    }

    const next: PayoutStatus =
      data.action === "approve"
        ? "approved"
        : data.action === "hold"
          ? "held"
          : data.action === "cancel"
            ? "cancelled"
            : "pending_review";

    const patch: Record<string, unknown> = { status: next, failure_reason: null };
    if (next === "approved") {
      patch.approved_by = context.userId;
      patch.approved_at = new Date().toISOString();
    } else {
      patch.approved_by = null;
      patch.approved_at = null;
    }
    const { error } = await db.from("payouts").update(patch).eq("id", data.payoutId);
    if (error) return { ok: false, status: current, reason: error.message };
    return { ok: true, status: next };
  });

/**
 * Manual, one-payout-at-a-time Stripe transfer. Admin only.
 * Refuses anything that is not an approved, positive, un-transferred payout.
 */
export const processApprovedPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { payoutId: string }) => data)
  .handler(async ({ data, context }): Promise<TransferResult> => {
    const s = await import("./payout-scheduler.server");
    await s.assertAdmin(context);
    const db = await s.adminDb();

    const { data: row } = await db.from("payouts").select("status").eq("id", data.payoutId).maybeSingle();
    const current = (row as { status: PayoutStatus } | null)?.status;
    if (!current) return { ok: false, status: "draft", reason: "Payout not found" };
    if (current !== "approved") {
      return { ok: false, status: current, reason: "Payout must be approved first." };
    }

    const out = await s.executeTransfer(db, data.payoutId);
    return { ...out, status: out.status as PayoutStatus };
  });
