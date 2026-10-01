import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

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
  .inputValidator(
    (data: {
      payoutId: string;
      action: "approve" | "hold" | "cancel" | "reopen";
    }) => data,
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: boolean; status: PayoutStatus; reason?: string }> => {
      const s = await import("./payout-scheduler.server");
      await s.assertAdmin(context);
      const db = await s.adminDb();

      const { data: row, error: readError } = await db
        .from("payouts")
        .select("id, status, net_amount, stripe_transfer_id")
        .eq("id", data.payoutId)
        .maybeSingle();
      if (readError) {
        return { ok: false, status: "draft", reason: readError.message };
      }

      const payout = row as
        | {
            status: PayoutStatus;
            net_amount: number;
            stripe_transfer_id: string | null;
          }
        | null;
      if (!payout) {
        return { ok: false, status: "draft", reason: "Payout not found" };
      }

      const current = payout.status;
      const allowed: Record<
        typeof data.action,
        ReadonlyArray<PayoutStatus>
      > = {
        approve: ["pending_review"],
        hold: ["draft", "pending_review", "approved", "failed"],
        cancel: ["draft", "pending_review", "approved", "failed", "held"],
        reopen: ["held", "cancelled", "failed"],
      };

      if (!allowed[data.action].includes(current)) {
        return {
          ok: false,
          status: current,
          reason: `Cannot ${data.action} a payout in ${current} state.`,
        };
      }

      if (payout.stripe_transfer_id) {
        return {
          ok: false,
          status: current,
          reason: "A payout with a Stripe transfer cannot be changed.",
        };
      }

      if (
        (data.action === "approve" || data.action === "reopen") &&
        Number(payout.net_amount) <= 0
      ) {
        return {
          ok: false,
          status: current,
          reason: "Payout net amount must be greater than zero.",
        };
      }

      if (data.action === "approve" || data.action === "reopen") {
        const vendorOrderIds: string[] = [];
        let offset = 0;
        while (true) {
          const { data: items, error } = await db
            .from("payout_items")
            .select("vendor_order_id")
            .eq("payout_id", data.payoutId)
            .range(offset, offset + 499);
          if (error) {
            return { ok: false, status: current, reason: error.message };
          }
          const page = items ?? [];
          vendorOrderIds.push(...page.map((item) => item.vendor_order_id));
          if (page.length < 500) break;
          offset += 500;
        }

        for (let i = 0; i < vendorOrderIds.length; i += 200) {
          const batch = vendorOrderIds.slice(i, i + 200);
          const { data: held, error } = await db
            .from("vendor_orders")
            .select("id")
            .in("id", batch)
            .gt("dispute_hold_amount", 0)
            .limit(1);
          if (error) {
            return { ok: false, status: current, reason: error.message };
          }
          if ((held ?? []).length > 0) {
            return {
              ok: false,
              status: current,
              reason: "Payout still contains one or more disputed vendor orders.",
            };
          }
        }
      }

      const next: PayoutStatus =
        data.action === "approve"
          ? "approved"
          : data.action === "hold"
            ? "held"
            : data.action === "cancel"
              ? "cancelled"
              : "pending_review";

      const patch: Database["public"]["Tables"]["payouts"]["Update"] = {
        status: next,
        failure_reason: null,
      };
      if (next === "approved") {
        patch.approved_by = context.userId;
        patch.approved_at = new Date().toISOString();
      } else {
        patch.approved_by = null;
        patch.approved_at = null;
      }

      const { data: updated, error } = await db
        .from("payouts")
        .update(patch)
        .eq("id", data.payoutId)
        .eq("status", current)
        .select("status")
        .maybeSingle();
      if (error) {
        return { ok: false, status: current, reason: error.message };
      }
      if (!updated) {
        return {
          ok: false,
          status: current,
          reason: "Payout changed before the action could be applied.",
        };
      }

      return { ok: true, status: updated.status as PayoutStatus };
    },
  );

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
