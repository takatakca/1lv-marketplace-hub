import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Payout scheduler / retry / reconciliation internals. Server-only.
 *
 * SAFETY RULES
 * - Automatic Stripe transfers stay OFF unless payout_settings.auto_process_transfers
 *   is explicitly true. Generation alone never touches Stripe.
 * - The scheduler takes a named lock; a second concurrent run exits as skipped_locked.
 * - payout_items.vendor_order_id is unique, so repeated runs can never pay a
 *   vendor order twice, even if a lock were bypassed.
 * - Stripe secrets and connected-account ids never leave the server.
 */

type Db = SupabaseClient<Database>;
type PayoutDbStatus = Database["public"]["Enums"]["payout_status"];

const STRIPE_API = "https://api.stripe.com/v1";

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export async function adminDb(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function stripeGet(path: string): Promise<Record<string, unknown>> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe not configured");
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((json.error as { message?: string } | undefined)?.message ?? "Stripe error");
  }
  return json;
}

// ---------------- settings ----------------

export type SchedulerSettings = {
  holdDays: number;
  frequency: string;
  payoutDay: number;
  payoutHourUtc: number;
  autoGenerate: boolean;
  autoProcessTransfers: boolean;
  retryFailedTransfers: boolean;
  maxTransferAttempts: number;
};

export async function readSettings(db: Db): Promise<SchedulerSettings> {
  const { data } = await db.from("payout_settings").select("*").eq("id", true).maybeSingle();
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    holdDays: Number(r.hold_days ?? 7),
    frequency: String(r.payout_frequency ?? "weekly"),
    payoutDay: Number(r.payout_day ?? 1),
    payoutHourUtc: Number(r.payout_hour_utc ?? 7),
    autoGenerate: r.auto_generate_payouts !== false,
    autoProcessTransfers: r.auto_process_transfers === true,
    retryFailedTransfers: r.retry_failed_transfers === true,
    maxTransferAttempts: Number(r.max_transfer_attempts ?? 3),
  };
}

// ---------------- locking ----------------

export const PAYOUT_LOCK = "weekly_vendor_payout_generation";

/** Returns true when the lock was acquired. Expired locks are reclaimed. */
export async function acquireLock(db: Db, name: string, owner: string, minutes = 30): Promise<boolean> {
  const now = new Date();
  const expires = new Date(now.getTime() + minutes * 60_000).toISOString();

  const { error } = await db
    .from("scheduler_locks")
    .insert({ lock_name: name, locked_at: now.toISOString(), locked_by: owner, expires_at: expires });
  if (!error) return true;

  // Existing lock — reclaim only if expired.
  const { data } = await db
    .from("scheduler_locks")
    .update({ locked_at: now.toISOString(), locked_by: owner, expires_at: expires })
    .eq("lock_name", name)
    .lt("expires_at", now.toISOString())
    .select("lock_name");
  return Array.isArray(data) && data.length > 0;
}

export async function releaseLock(db: Db, name: string) {
  await db.from("scheduler_locks").delete().eq("lock_name", name);
}

// ---------------- period ----------------

/** Inclusive [start, end] date strings for the most recent completed week. */
export function currentPayoutPeriod(now = new Date()): { periodStart: string; periodEnd: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { periodStart: fmt(start), periodEnd: fmt(end) };
}

// ---------------- notifications ----------------

export async function notifyAdmins(
  db: Db,
  kind: string,
  title: string,
  body?: string,
  link?: string,
): Promise<void> {
  try {
    const { data } = await db.from("user_roles").select("user_id").eq("role", "admin");
    const admins = ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
    if (admins.length === 0) return;
    await db.from("notifications").insert(
      admins.map((user_id) => ({
        user_id,
        kind,
        title,
        body: body ?? null,
        link: link ?? "/admin/payouts",
      })),
    );
  } catch {
    // Notifications are best-effort; never fail the job because of them.
  }
}

// ---------------- payout generation core ----------------

export type GenerateResult = {
  ok: boolean;
  created: number;
  skipped: number;
  vendors: number;
  reason?: string;
};

type EligibleRow = {
  id: string;
  vendor_id: string;
  subtotal: number;
  commission_amount: number;
  vendor_payout_amount: number;
  refund_amount: number;
  dispute_hold_amount: number;
  delivered_at: string | null;
  order_id: string;
};

function dateOnlyUtc(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD format.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${label} is not a valid calendar date.`);
  }
  return date;
}

function batches<T>(values: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

export async function generatePayoutsCore(
  db: Db,
  periodStart: string,
  periodEnd: string,
): Promise<GenerateResult> {
  const startDate = dateOnlyUtc(periodStart, "Payout period start");
  const endDate = dateOnlyUtc(periodEnd, "Payout period end");
  if (startDate.getTime() > endDate.getTime()) {
    throw new Error("Payout period start must be on or before period end.");
  }

  const settings = await readSettings(db);
  const cutoffDate = new Date(
    Date.now() - settings.holdDays * 24 * 60 * 60 * 1000,
  );
  const requestedEnd = new Date(endDate);
  requestedEnd.setUTCHours(23, 59, 59, 999);
  const eligibleThrough = new Date(
    Math.min(cutoffDate.getTime(), requestedEnd.getTime()),
  ).toISOString();

  // Include eligible backlog from earlier cycles. A vendor that was on hold,
  // unpaid, or not payout-ready must not lose those earnings when the calendar
  // moves into the next payout period.
  const rows: EligibleRow[] = [];
  const pageSize = 500;
  let offset = 0;
  while (true) {
    const { data, error } = await db
      .from("vendor_orders")
      .select(
        "id, vendor_id, subtotal, commission_amount, vendor_payout_amount, refund_amount, dispute_hold_amount, delivered_at, order_id",
      )
      .eq("status", "delivered")
      .not("delivered_at", "is", null)
      .lte("delivered_at", eligibleThrough)
      .order("delivered_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);

    const page = (data ?? []) as EligibleRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  if (rows.length === 0) {
    return { ok: true, created: 0, skipped: 0, vendors: 0 };
  }

  const takenSet = new Set<string>();
  for (const ids of batches(rows.map((row) => row.id))) {
    const { data, error } = await db
      .from("payout_items")
      .select("vendor_order_id")
      .in("vendor_order_id", ids);
    if (error) throw new Error(error.message);
    for (const item of data ?? []) {
      takenSet.add(item.vendor_order_id);
    }
  }

  const paidOrders = new Set<string>();
  const orderIds = Array.from(new Set(rows.map((row) => row.order_id)));
  for (const ids of batches(orderIds)) {
    const { data, error } = await db
      .from("orders")
      .select("id, payment_status")
      .in("id", ids);
    if (error) throw new Error(error.message);
    for (const order of data ?? []) {
      if (["paid", "partially_refunded"].includes(order.payment_status)) {
        paidOrders.add(order.id);
      }
    }
  }

  const payable = new Set<string>();
  const vendorIds = Array.from(new Set(rows.map((row) => row.vendor_id)));
  for (const ids of batches(vendorIds)) {
    const { data, error } = await db
      .from("vendors")
      .select("id, payouts_enabled")
      .in("id", ids);
    if (error) throw new Error(error.message);
    for (const vendor of data ?? []) {
      if (vendor.payouts_enabled) payable.add(vendor.id);
    }
  }

  const groups = new Map<string, EligibleRow[]>();
  let skipped = 0;
  for (const row of rows) {
    const eligible =
      !takenSet.has(row.id) &&
      paidOrders.has(row.order_id) &&
      payable.has(row.vendor_id) &&
      Number(row.dispute_hold_amount ?? 0) === 0;

    if (!eligible) {
      skipped++;
      continue;
    }

    const list = groups.get(row.vendor_id) ?? [];
    list.push(row);
    groups.set(row.vendor_id, list);
  }

  let created = 0;
  for (const [vendorId, items] of groups) {
    const gross = round2(
      items.reduce((sum, item) => sum + Number(item.subtotal ?? 0), 0),
    );
    const commission = round2(
      items.reduce(
        (sum, item) => sum + Number(item.commission_amount ?? 0),
        0,
      ),
    );
    const refunds = round2(
      items.reduce((sum, item) => sum + Number(item.refund_amount ?? 0), 0),
    );
    const holds = round2(
      items.reduce(
        (sum, item) => sum + Number(item.dispute_hold_amount ?? 0),
        0,
      ),
    );

    const adjustmentRows: Array<{ id: string; amount: number }> = [];
    let adjustmentOffset = 0;
    while (true) {
      const { data, error } = await db
        .from("payout_adjustments")
        .select("id, amount")
        .eq("vendor_id", vendorId)
        .is("applied_payout_id", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(adjustmentOffset, adjustmentOffset + pageSize - 1);
      if (error) throw new Error(error.message);

      const page = (data ?? []) as Array<{ id: string; amount: number }>;
      adjustmentRows.push(...page);
      if (page.length < pageSize) break;
      adjustmentOffset += pageSize;
    }

    const adjustments = round2(
      adjustmentRows.reduce(
        (sum, adjustment) => sum + Number(adjustment.amount ?? 0),
        0,
      ),
    );
    const baseNet = round2(
      items.reduce(
        (sum, item) => sum + Number(item.vendor_payout_amount ?? 0),
        0,
      ) -
        refunds -
        holds,
    );
    const net = round2(baseNet + adjustments);

    // Do not consume earnings or clawbacks into a payout Stripe can never send.
    // Both remain unapplied and the backlog is reconsidered on the next cycle.
    if (net <= 0) {
      skipped += items.length;
      continue;
    }

    const { data: payout, error: payoutError } = await db
      .from("payouts")
      .insert({
        vendor_id: vendorId,
        period_start: periodStart,
        period_end: periodEnd,
        gross_amount: gross,
        commission_amount: commission,
        refund_amount: refunds,
        dispute_hold_amount: holds,
        net_amount: net,
        status: "pending_review",
      })
      .select("id")
      .single();

    if (payoutError || !payout) {
      skipped += items.length;
      continue;
    }

    const payoutId = payout.id;
    let itemInsertFailed = false;
    for (const chunk of batches(items, 250)) {
      const { error } = await db.from("payout_items").insert(
        chunk.map((item) => ({
          payout_id: payoutId,
          vendor_order_id: item.id,
          gross_amount: Number(item.subtotal ?? 0),
          commission_amount: Number(item.commission_amount ?? 0),
          refund_amount: Number(item.refund_amount ?? 0),
          net_amount:
            Number(item.vendor_payout_amount ?? 0) -
            Number(item.refund_amount ?? 0),
        })),
      );
      if (error) {
        itemInsertFailed = true;
        break;
      }
    }

    if (itemInsertFailed) {
      // Deleting the payout cascades any chunks inserted before a concurrent
      // uniqueness conflict or transient failure.
      await db.from("payouts").delete().eq("id", payoutId);
      skipped += items.length;
      continue;
    }

    if (adjustmentRows.length > 0) {
      const adjustmentIds = adjustmentRows.map((adjustment) => adjustment.id);
      let adjustmentFailed = false;
      for (const ids of batches(adjustmentIds)) {
        const { error } = await db
          .from("payout_adjustments")
          .update({ applied_payout_id: payoutId })
          .in("id", ids)
          .is("applied_payout_id", null);
        if (error) {
          adjustmentFailed = true;
          break;
        }
      }

      if (adjustmentFailed) {
        await db.from("payouts").delete().eq("id", payoutId);
        skipped += items.length;
        continue;
      }
    }

    created++;
  }

  return { ok: true, created, skipped, vendors: groups.size };
}

// ---------------- transfers + retry ----------------

export type TransferOutcome = { ok: boolean; status: string; setupRequired?: boolean; reason?: string };

const RETRY_BACKOFF_HOURS = [1, 6, 24, 72];

export function nextRetryAt(attempt: number, from = new Date()): string {
  const hours = RETRY_BACKOFF_HOURS[Math.min(attempt, RETRY_BACKOFF_HOURS.length - 1)] ?? 72;
  return new Date(from.getTime() + hours * 3600_000).toISOString();
}

/**
 * Executes the Stripe transfer for one payout. The caller is responsible for
 * authorising the request and for the status precondition (approved / failed-retry).
 */
export async function executeTransfer(db: Db, payoutId: string): Promise<TransferOutcome> {
  const { data: row } = await db
    .from("payouts")
    .select(
      "id, vendor_id, status, net_amount, currency, stripe_transfer_id, period_start, period_end, transfer_attempt_count",
    )
    .eq("id", payoutId)
    .maybeSingle();
  const payout = row as {
    id: string;
    vendor_id: string;
    status: PayoutDbStatus;
    net_amount: number;
    currency: string;
    stripe_transfer_id: string | null;
    period_start: string;
    period_end: string;
    transfer_attempt_count: number | null;
  } | null;

  if (!payout) {
    return { ok: false, status: "draft", reason: "Payout not found" };
  }
  if (payout.stripe_transfer_id) {
    return {
      ok: false,
      status: payout.status,
      reason: "A transfer already exists for this payout.",
    };
  }
  if (!["approved", "failed"].includes(payout.status)) {
    return {
      ok: false,
      status: payout.status,
      reason: "Payout is not eligible for transfer.",
    };
  }
  if (Number(payout.net_amount) <= 0) {
    return {
      ok: false,
      status: payout.status,
      reason: "Net amount must be greater than zero.",
    };
  }

  const { data: vRow } = await db
    .from("vendors")
    .select("id, payouts_enabled, stripe_connect_account_id")
    .eq("id", payout.vendor_id)
    .maybeSingle();
  const vendor = vRow as {
    payouts_enabled: boolean;
    stripe_connect_account_id: string | null;
  } | null;
  if (!vendor?.payouts_enabled || !vendor.stripe_connect_account_id) {
    return {
      ok: false,
      status: payout.status,
      reason: "Vendor payout account is not ready.",
    };
  }

  if (!stripeConfigured()) {
    return {
      ok: false,
      status: payout.status,
      setupRequired: true,
      reason: "Stripe setup required",
    };
  }

  const settings = await readSettings(db);
  const previousAttempts = Number(payout.transfer_attempt_count ?? 0);
  if (previousAttempts >= settings.maxTransferAttempts) {
    return {
      ok: false,
      status: payout.status,
      reason: `Transfer retry limit reached (${settings.maxTransferAttempts}).`,
    };
  }

  const attempt = previousAttempts + 1;
  const { data: claimed, error: claimError } = await db
    .from("payouts")
    .update({
      status: "processing",
      failure_reason: null,
      transfer_attempt_count: attempt,
      last_transfer_attempt_at: new Date().toISOString(),
      next_retry_at: null,
    })
    .eq("id", payout.id)
    .eq("status", payout.status)
    .is("stripe_transfer_id", null)
    .select("id")
    .maybeSingle();

  if (claimError) {
    return { ok: false, status: payout.status, reason: claimError.message };
  }
  if (!claimed) {
    return {
      ok: false,
      status: payout.status,
      reason: "Payout changed before the transfer could be claimed.",
    };
  }

  try {
    const key = process.env.STRIPE_SECRET_KEY!;
    const expectedAmount = Math.round(Number(payout.net_amount) * 100);
    const expectedCurrency = (payout.currency ?? "CAD").toLowerCase();
    const destination = vendor.stripe_connect_account_id;
    const res = await fetch(`${STRIPE_API}/transfers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
        // Stable for the lifetime of the payout: retries after a network or DB
        // failure resolve to the original Stripe transfer instead of sending twice.
        "Idempotency-Key": `1lv_payout_${payout.id}_v1`,
      },
      body: new URLSearchParams({
        amount: String(expectedAmount),
        currency: expectedCurrency,
        destination,
        "metadata[payout_id]": payout.id,
        "metadata[vendor_id]": payout.vendor_id,
        "metadata[period_start]": payout.period_start,
        "metadata[period_end]": payout.period_end,
      }).toString(),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(
        (json.error as { message?: string } | undefined)?.message ?? "Stripe error",
      );
    }

    const transferId =
      typeof json.id === "string" && json.id.startsWith("tr_") ? json.id : null;
    if (!transferId) {
      throw new Error("Stripe did not return a valid transfer id.");
    }

    const actualAmount = Number(json.amount ?? expectedAmount);
    const actualCurrency = String(json.currency ?? expectedCurrency).toLowerCase();
    const actualDestination =
      typeof json.destination === "string"
        ? json.destination
        : ((json.destination as { id?: string } | undefined)?.id ?? null);

    if (
      actualAmount !== expectedAmount ||
      actualCurrency !== expectedCurrency ||
      (actualDestination && actualDestination !== destination)
    ) {
      await db
        .from("payouts")
        .update({
          status: "failed",
          stripe_transfer_id: transferId,
          failure_reason: "Stripe transfer response does not match the approved payout.",
          next_retry_at: null,
        })
        .eq("id", payout.id)
        .eq("status", "processing");
      await notifyAdmins(
        db,
        "payout_transfer_mismatch",
        "Payout transfer mismatch",
        `Payout ${payout.id.slice(0, 8)} requires reconciliation before any retry.`,
      );
      return {
        ok: false,
        status: "failed",
        reason: "Stripe transfer response does not match the approved payout.",
      };
    }

    const { error: paidError } = await db
      .from("payouts")
      .update({
        status: "paid",
        stripe_transfer_id: transferId,
        paid_at: new Date().toISOString(),
        failure_reason: null,
        next_retry_at: null,
      })
      .eq("id", payout.id)
      .eq("status", "processing");

    if (paidError) throw new Error(paidError.message);
    return { ok: true, status: "paid" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Transfer failed";
    const exhausted = attempt >= settings.maxTransferAttempts;
    await db
      .from("payouts")
      .update({
        status: "failed",
        failure_reason: reason,
        next_retry_at: exhausted ? null : nextRetryAt(attempt),
      })
      .eq("id", payout.id)
      .eq("status", "processing")
      .is("stripe_transfer_id", null);
    await notifyAdmins(
      db,
      exhausted ? "payout_retry_exhausted" : "payout_transfer_failed",
      exhausted
        ? "Payout transfer failed after all retries"
        : "Payout transfer failed",
      `Payout ${payout.id.slice(0, 8)} — ${reason}`,
    );
    return { ok: false, status: "failed", reason };
  }
}

// ---------------- reconciliation ----------------

export type ReconClass =
  | "matched"
  | "missing_transfer"
  | "amount_mismatch"
  | "currency_mismatch"
  | "destination_mismatch"
  | "failed"
  | "unknown";

export type ReconResult = {
  payoutId: string;
  classification: ReconClass;
  note: string;
  checkedAt: string;
  setupRequired?: boolean;
};

export async function reconcileOne(db: Db, payoutId: string): Promise<ReconResult> {
  const checkedAt = new Date().toISOString();
  const { data: row } = await db
    .from("payouts")
    .select("id, vendor_id, status, net_amount, currency, stripe_transfer_id")
    .eq("id", payoutId)
    .maybeSingle();
  const payout = row as {
    id: string;
    vendor_id: string;
    status: string;
    net_amount: number;
    currency: string;
    stripe_transfer_id: string | null;
  } | null;

  if (!payout) return { payoutId, classification: "unknown", note: "Payout not found", checkedAt };

  const finish = async (classification: ReconClass, note: string): Promise<ReconResult> => {
    await db
      .from("payouts")
      .update({ reconciliation_status: classification, reconciliation_note: note, reconciled_at: checkedAt })
      .eq("id", payout.id);
    if (classification !== "matched" && classification !== "unknown") {
      await notifyAdmins(
        db,
        "payout_reconciliation_mismatch",
        "Payout reconciliation mismatch",
        `Payout ${payout.id.slice(0, 8)} — ${note}`,
      );
    }
    return { payoutId: payout.id, classification, note, checkedAt };
  };

  if (payout.status === "failed") return finish("failed", "Local payout is marked failed.");
  if (!payout.stripe_transfer_id) {
    if (payout.status === "paid") return finish("missing_transfer", "Marked paid but no transfer reference.");
    return { payoutId: payout.id, classification: "unknown", note: "No transfer to reconcile yet.", checkedAt };
  }
  if (!stripeConfigured()) {
    return {
      payoutId: payout.id,
      classification: "unknown",
      note: "Stripe is not configured in this environment.",
      checkedAt,
      setupRequired: true,
    };
  }

  let transfer: Record<string, unknown>;
  try {
    transfer = await stripeGet(`/transfers/${payout.stripe_transfer_id}`);
  } catch (err) {
    return finish("missing_transfer", err instanceof Error ? err.message : "Transfer not retrievable");
  }

  const expectedCents = Math.round(Number(payout.net_amount) * 100);
  const actualCents = Number(transfer.amount ?? 0);
  if (actualCents !== expectedCents) {
    return finish(
      "amount_mismatch",
      `Expected ${(expectedCents / 100).toFixed(2)}, Stripe reports ${(actualCents / 100).toFixed(2)}.`,
    );
  }
  const expectedCurrency = (payout.currency ?? "CAD").toLowerCase();
  if (String(transfer.currency ?? "").toLowerCase() !== expectedCurrency) {
    return finish("currency_mismatch", `Currency differs from ${expectedCurrency.toUpperCase()}.`);
  }

  const { data: vRow } = await db
    .from("vendors")
    .select("stripe_connect_account_id")
    .eq("id", payout.vendor_id)
    .maybeSingle();
  const destination = (vRow as { stripe_connect_account_id: string | null } | null)?.stripe_connect_account_id;
  const transferDest =
    typeof transfer.destination === "string"
      ? transfer.destination
      : ((transfer.destination as { id?: string } | undefined)?.id ?? null);
  if (destination && transferDest && destination !== transferDest) {
    // Never surface either account id.
    return finish("destination_mismatch", "Transfer destination does not match the vendor payout account.");
  }
  if (transfer.reversed === true) {
    return finish("failed", "Stripe reports this transfer as reversed.");
  }

  return finish("matched", "Local payout matches the Stripe transfer.");
}

// ---------------- authorisation ----------------

/** Throws unless the caller holds the admin role (checked through the RLS-scoped client). */
export async function assertAdmin(context: {
  supabase: SupabaseClient<Database>;
  userId: string;
}) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || data !== true) throw new Error("Forbidden");
}
