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

type Db = { from: (t: string) => any };

const STRIPE_API = "https://api.stripe.com/v1";

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export async function adminDb(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
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

export async function generatePayoutsCore(
  db: Db,
  periodStart: string,
  periodEnd: string,
): Promise<GenerateResult> {
  const settings = await readSettings(db);
  const cutoff = new Date(Date.now() - settings.holdDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: vos, error } = await db
    .from("vendor_orders")
    .select(
      "id, vendor_id, subtotal, commission_amount, vendor_payout_amount, refund_amount, dispute_hold_amount, delivered_at, order_id",
    )
    .eq("status", "delivered")
    .not("delivered_at", "is", null)
    .lte("delivered_at", cutoff)
    .gte("delivered_at", `${periodStart}T00:00:00.000Z`)
    .lte("delivered_at", `${periodEnd}T23:59:59.999Z`);
  if (error) throw new Error(error.message);

  const rows = (vos ?? []) as EligibleRow[];
  if (rows.length === 0) return { ok: true, created: 0, skipped: 0, vendors: 0 };

  const { data: taken } = await db
    .from("payout_items")
    .select("vendor_order_id")
    .in("vendor_order_id", rows.map((r) => r.id));
  const takenSet = new Set(((taken ?? []) as Array<{ vendor_order_id: string }>).map((t) => t.vendor_order_id));

  const { data: orders } = await db
    .from("orders")
    .select("id, payment_status")
    .in("id", Array.from(new Set(rows.map((r) => r.order_id))));
  const paidOrders = new Set(
    ((orders ?? []) as Array<{ id: string; payment_status: string }>)
      .filter((o) => o.payment_status === "paid")
      .map((o) => o.id),
  );

  const { data: vendors } = await db
    .from("vendors")
    .select("id, payouts_enabled")
    .in("id", Array.from(new Set(rows.map((r) => r.vendor_id))));
  const payable = new Set(
    ((vendors ?? []) as Array<{ id: string; payouts_enabled: boolean }>)
      .filter((v) => v.payouts_enabled)
      .map((v) => v.id),
  );

  const groups = new Map<string, EligibleRow[]>();
  let skipped = 0;
  for (const r of rows) {
    const eligible =
      !takenSet.has(r.id) &&
      paidOrders.has(r.order_id) &&
      payable.has(r.vendor_id) &&
      Number(r.dispute_hold_amount ?? 0) === 0;
    if (!eligible) {
      skipped++;
      continue;
    }
    const list = groups.get(r.vendor_id) ?? [];
    list.push(r);
    groups.set(r.vendor_id, list);
  }

  let created = 0;
  for (const [vendorId, items] of groups) {
    const gross = round2(items.reduce((s, i) => s + Number(i.subtotal ?? 0), 0));
    const commission = round2(items.reduce((s, i) => s + Number(i.commission_amount ?? 0), 0));
    const refunds = round2(items.reduce((s, i) => s + Number(i.refund_amount ?? 0), 0));
    const holds = round2(items.reduce((s, i) => s + Number(i.dispute_hold_amount ?? 0), 0));

    const { data: adj } = await db
      .from("payout_adjustments")
      .select("id, amount")
      .eq("vendor_id", vendorId)
      .is("applied_payout_id", null);
    const adjustments = round2(
      ((adj ?? []) as Array<{ amount: number }>).reduce((s, a) => s + Number(a.amount ?? 0), 0),
    );

    const net = round2(
      items.reduce((s, i) => s + Number(i.vendor_payout_amount ?? 0), 0) - refunds - holds + adjustments,
    );

    const { data: payout, error: pErr } = await db
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
    if (pErr || !payout) {
      skipped += items.length;
      continue;
    }
    const payoutId = (payout as { id: string }).id;

    const { error: iErr } = await db.from("payout_items").insert(
      items.map((i) => ({
        payout_id: payoutId,
        vendor_order_id: i.id,
        gross_amount: Number(i.subtotal ?? 0),
        commission_amount: Number(i.commission_amount ?? 0),
        refund_amount: Number(i.refund_amount ?? 0),
        net_amount: Number(i.vendor_payout_amount ?? 0) - Number(i.refund_amount ?? 0),
      })),
    );
    if (iErr) {
      // Unique-index violation means one of these orders is already in a payout.
      await db.from("payouts").delete().eq("id", payoutId);
      skipped += items.length;
      continue;
    }

    if (adjustments !== 0) {
      await db
        .from("payout_adjustments")
        .update({ applied_payout_id: payoutId })
        .eq("vendor_id", vendorId)
        .is("applied_payout_id", null);
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
    status: string;
    net_amount: number;
    currency: string;
    stripe_transfer_id: string | null;
    period_start: string;
    period_end: string;
    transfer_attempt_count: number | null;
  } | null;

  if (!payout) return { ok: false, status: "draft", reason: "Payout not found" };
  if (payout.stripe_transfer_id) {
    return { ok: false, status: payout.status, reason: "A transfer already exists for this payout." };
  }
  if (Number(payout.net_amount) <= 0) {
    return { ok: false, status: payout.status, reason: "Net amount must be greater than zero." };
  }

  const { data: vRow } = await db
    .from("vendors")
    .select("id, payouts_enabled, stripe_connect_account_id")
    .eq("id", payout.vendor_id)
    .maybeSingle();
  const vendor = vRow as { payouts_enabled: boolean; stripe_connect_account_id: string | null } | null;
  if (!vendor?.payouts_enabled || !vendor.stripe_connect_account_id) {
    return { ok: false, status: payout.status, reason: "Vendor payout account is not ready." };
  }

  if (!stripeConfigured()) {
    return { ok: false, status: payout.status, setupRequired: true, reason: "Stripe setup required" };
  }

  const attempt = Number(payout.transfer_attempt_count ?? 0) + 1;
  await db
    .from("payouts")
    .update({
      status: "processing",
      failure_reason: null,
      transfer_attempt_count: attempt,
      last_transfer_attempt_at: new Date().toISOString(),
      next_retry_at: null,
    })
    .eq("id", payout.id);

  try {
    const key = process.env.STRIPE_SECRET_KEY!;
    const res = await fetch(`${STRIPE_API}/transfers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
        // Idempotent per payout+attempt: a network retry cannot double-send.
        "Idempotency-Key": `payout_${payout.id}_${attempt}`,
      },
      body: new URLSearchParams({
        amount: String(Math.round(Number(payout.net_amount) * 100)),
        currency: (payout.currency ?? "CAD").toLowerCase(),
        destination: vendor.stripe_connect_account_id,
        "metadata[payout_id]": payout.id,
        "metadata[vendor_id]": payout.vendor_id,
        "metadata[period_start]": payout.period_start,
        "metadata[period_end]": payout.period_end,
      }).toString(),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error((json.error as { message?: string } | undefined)?.message ?? "Stripe error");
    }
    await db
      .from("payouts")
      .update({
        status: "paid",
        stripe_transfer_id: json.id as string,
        paid_at: new Date().toISOString(),
        failure_reason: null,
        next_retry_at: null,
      })
      .eq("id", payout.id);
    return { ok: true, status: "paid" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Transfer failed";
    const settings = await readSettings(db);
    const exhausted = attempt >= settings.maxTransferAttempts;
    await db
      .from("payouts")
      .update({
        status: "failed",
        failure_reason: reason,
        next_retry_at: exhausted ? null : nextRetryAt(attempt),
      })
      .eq("id", payout.id);
    await notifyAdmins(
      db,
      exhausted ? "payout_retry_exhausted" : "payout_transfer_failed",
      exhausted ? "Payout transfer failed after all retries" : "Payout transfer failed",
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
export async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || data !== true) throw new Error("Forbidden");
}
