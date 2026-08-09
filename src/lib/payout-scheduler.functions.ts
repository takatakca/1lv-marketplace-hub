import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Payout scheduler, transfer retry and Stripe reconciliation. Admin only.
 * All runtime logic lives in ./payout-scheduler.server (loaded inside handlers).
 */

export type SchedulerRunStatus = "running" | "completed" | "partial" | "failed" | "skipped_locked";

export type SchedulerRunResult = {
  ok: boolean;
  status: SchedulerRunStatus;
  runId?: string;
  periodStart?: string;
  periodEnd?: string;
  created: number;
  processed: number;
  failed: number;
  reason?: string;
};

export type RetryResult = {
  ok: boolean;
  status: string;
  attempt?: number;
  setupRequired?: boolean;
  reason?: string;
};

export type ReconcileOneResult = {
  payoutId: string;
  classification:
    | "matched"
    | "missing_transfer"
    | "amount_mismatch"
    | "currency_mismatch"
    | "destination_mismatch"
    | "failed"
    | "unknown";
  note: string;
  checkedAt: string;
  setupRequired?: boolean;
};

export type ReconcileSummary = {
  ok: boolean;
  checked: number;
  counts: Record<string, number>;
  setupRequired?: boolean;
  reason?: string;
};

/** Generate the current weekly payouts under a lock. Never transfers unless explicitly enabled. */
export const runWeeklyPayoutScheduler = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { periodStart?: string; periodEnd?: string }) => data ?? {})
  .handler(async ({ data, context }): Promise<SchedulerRunResult> => {
    const s = await import("./payout-scheduler.server");
    await s.assertAdmin(context);
    const db = await s.adminDb();
    const settings = await s.readSettings(db);

    const period =
      data.periodStart && data.periodEnd
        ? { periodStart: data.periodStart, periodEnd: data.periodEnd }
        : s.currentPayoutPeriod();

    const locked = await s.acquireLock(db, s.PAYOUT_LOCK, context.userId);
    if (!locked) {
      await db.from("payout_scheduler_runs").insert({
        status: "skipped_locked",
        trigger_source: "manual",
        period_start: period.periodStart,
        period_end: period.periodEnd,
        completed_at: new Date().toISOString(),
        error_message: "Another scheduler run is already in progress.",
      });
      return {
        ok: false,
        status: "skipped_locked",
        created: 0,
        processed: 0,
        failed: 0,
        reason: "Another scheduler run is already in progress.",
      };
    }

    const { data: runRow } = await db
      .from("payout_scheduler_runs")
      .insert({
        status: "running",
        trigger_source: "manual",
        period_start: period.periodStart,
        period_end: period.periodEnd,
        metadata: { auto_process_transfers: settings.autoProcessTransfers },
      })
      .select("id")
      .single();
    const runId = (runRow as { id: string } | null)?.id;

    let created = 0;
    let processed = 0;
    let failed = 0;
    let status: SchedulerRunStatus = "completed";
    let errorMessage: string | null = null;

    try {
      if (!settings.autoGenerate) {
        errorMessage = "Automatic payout generation is disabled in settings.";
        status = "skipped_locked";
      } else {
        const gen = await s.generatePayoutsCore(db, period.periodStart, period.periodEnd);
        created = gen.created;

        // Automatic transfers are OFF by default and only ever touch approved payouts.
        if (settings.autoProcessTransfers) {
          const { data: approved } = await db
            .from("payouts")
            .select("id")
            .eq("status", "approved")
            .is("stripe_transfer_id", null)
            .gt("net_amount", 0);
          for (const row of (approved ?? []) as Array<{ id: string }>) {
            const out = await s.executeTransfer(db, row.id);
            if (out.ok) processed++;
            else failed++;
          }
          if (failed > 0) status = "partial";
        }
      }
    } catch (err) {
      status = "failed";
      errorMessage = err instanceof Error ? err.message : "Scheduler run failed";
      await s.notifyAdmins(db, "payout_generation_failed", "Payout generation failed", errorMessage);
    } finally {
      if (runId) {
        await db
          .from("payout_scheduler_runs")
          .update({
            status,
            completed_at: new Date().toISOString(),
            payouts_created: created,
            payouts_processed: processed,
            payouts_failed: failed,
            error_message: errorMessage,
          })
          .eq("id", runId);
      }
      await s.releaseLock(db, s.PAYOUT_LOCK);
    }

    return {
      ok: status === "completed" || status === "partial",
      status,
      runId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      created,
      processed,
      failed,
      reason: errorMessage ?? undefined,
    };
  });

/** Retry a failed transfer. Admin only, capped by payout_settings.max_transfer_attempts. */
export const retryFailedPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { payoutId: string }) => data)
  .handler(async ({ data, context }): Promise<RetryResult> => {
    const s = await import("./payout-scheduler.server");
    await s.assertAdmin(context);
    const db = await s.adminDb();
    const settings = await s.readSettings(db);

    const { data: row } = await db
      .from("payouts")
      .select("id, status, stripe_transfer_id, transfer_attempt_count, vendor_id")
      .eq("id", data.payoutId)
      .maybeSingle();
    const payout = row as {
      status: string;
      stripe_transfer_id: string | null;
      transfer_attempt_count: number | null;
      vendor_id: string;
    } | null;

    if (!payout) return { ok: false, status: "draft", reason: "Payout not found" };
    if (payout.status !== "failed") return { ok: false, status: payout.status, reason: "Only failed payouts can be retried." };
    if (payout.stripe_transfer_id) {
      return { ok: false, status: payout.status, reason: "A transfer already exists for this payout." };
    }
    const attempts = Number(payout.transfer_attempt_count ?? 0);
    if (attempts >= settings.maxTransferAttempts) {
      return {
        ok: false,
        status: payout.status,
        attempt: attempts,
        reason: `Retry limit reached (${settings.maxTransferAttempts}). Investigate before retrying again.`,
      };
    }

    const out = await s.executeTransfer(db, data.payoutId);
    return { ...out, attempt: attempts + 1 };
  });

/** Compare one payout against its Stripe transfer. Admin only. */
export const reconcileStripePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { payoutId: string }) => data)
  .handler(async ({ data, context }): Promise<ReconcileOneResult> => {
    const s = await import("./payout-scheduler.server");
    await s.assertAdmin(context);
    const db = await s.adminDb();
    return (await s.reconcileOne(db, data.payoutId)) as ReconcileOneResult;
  });

/** Reconcile every recent paid/processing/failed payout. Admin only. */
export const reconcileRecentPayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { days?: number }) => ({ days: Math.min(Math.max(data?.days ?? 30, 1), 180) }))
  .handler(async ({ data, context }): Promise<ReconcileSummary> => {
    const s = await import("./payout-scheduler.server");
    await s.assertAdmin(context);
    const db = await s.adminDb();

    const since = new Date(Date.now() - data.days * 24 * 3600_000).toISOString();
    const { data: rows } = await db
      .from("payouts")
      .select("id")
      .in("status", ["paid", "processing", "failed"])
      .gte("created_at", since)
      .limit(200);

    const counts: Record<string, number> = {};
    let checked = 0;
    let setupRequired = false;
    for (const r of (rows ?? []) as Array<{ id: string }>) {
      const res = await s.reconcileOne(db, r.id);
      counts[res.classification] = (counts[res.classification] ?? 0) + 1;
      if (res.setupRequired) setupRequired = true;
      checked++;
    }
    return { ok: true, checked, counts, setupRequired: setupRequired || undefined };
  });
