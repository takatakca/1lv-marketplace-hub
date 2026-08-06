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
 */

const STRIPE_API = "https://api.stripe.com/v1";

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

function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function stripeCall(path: string, body: Record<string, string>) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe not configured");
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((json.error as { message?: string } | undefined)?.message ?? "Stripe error");
  }
  return json;
}

/** Throws unless the caller holds the admin role (checked through RLS-scoped client). */
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || data !== true) throw new Error("Forbidden");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any; rpc: (...a: unknown[]) => any };
}

async function holdDays(db: { from: (t: string) => any }): Promise<number> {
  const { data } = await db.from("payout_settings").select("hold_days").eq("id", true).maybeSingle();
  return Number((data as { hold_days?: number } | null)?.hold_days ?? 7);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

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

/**
 * Generate grouped payouts for a period. Admin only. Creates nothing in Stripe.
 */
export const generateVendorPayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { periodStart: string; periodEnd: string }) => data)
  .handler(async ({ data, context }): Promise<GenerateResult> => {
    await assertAdmin(context);
    const db = await admin();
    const hold = await holdDays(db);
    const cutoff = new Date(Date.now() - hold * 24 * 60 * 60 * 1000).toISOString();

    const { data: vos, error } = await db
      .from("vendor_orders")
      .select(
        "id, vendor_id, subtotal, commission_amount, vendor_payout_amount, refund_amount, dispute_hold_amount, delivered_at, order_id",
      )
      .eq("status", "delivered")
      .not("delivered_at", "is", null)
      .lte("delivered_at", cutoff)
      .gte("delivered_at", `${data.periodStart}T00:00:00.000Z`)
      .lte("delivered_at", `${data.periodEnd}T23:59:59.999Z`);
    if (error) throw new Error(error.message);

    const rows = (vos ?? []) as EligibleRow[];
    if (rows.length === 0) return { ok: true, created: 0, skipped: 0, vendors: 0 };

    // Already-paid vendor_orders are excluded (unique index also enforces this).
    const { data: taken } = await db
      .from("payout_items")
      .select("vendor_order_id")
      .in("vendor_order_id", rows.map((r) => r.id));
    const takenSet = new Set(((taken ?? []) as Array<{ vendor_order_id: string }>).map((t) => t.vendor_order_id));

    // Parent order must be paid.
    const { data: orders } = await db
      .from("orders")
      .select("id, payment_status")
      .in("id", Array.from(new Set(rows.map((r) => r.order_id))));
    const paidOrders = new Set(
      ((orders ?? []) as Array<{ id: string; payment_status: string }>)
        .filter((o) => o.payment_status === "paid")
        .map((o) => o.id),
    );

    // Vendor must have payouts enabled.
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

      // Carry-forward negative adjustments (refunds on already-paid payouts).
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
          period_start: data.periodStart,
          period_end: data.periodEnd,
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
        // Unique-index violation means one of these orders was already paid.
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
  });

/** Approve / hold / cancel a payout. Admin only. Never touches Stripe. */
export const setPayoutStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { payoutId: string; action: "approve" | "hold" | "cancel" | "reopen" }) => data)
  .handler(async ({ data, context }): Promise<{ ok: boolean; status: PayoutStatus; reason?: string }> => {
    await assertAdmin(context);
    const db = await admin();
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
    await assertAdmin(context);
    const db = await admin();

    const { data: row } = await db
      .from("payouts")
      .select("id, vendor_id, status, net_amount, currency, stripe_transfer_id, period_start, period_end")
      .eq("id", data.payoutId)
      .maybeSingle();
    const payout = row as {
      id: string;
      vendor_id: string;
      status: PayoutStatus;
      net_amount: number;
      currency: string;
      stripe_transfer_id: string | null;
      period_start: string;
      period_end: string;
    } | null;

    if (!payout) return { ok: false, status: "draft", reason: "Payout not found" };
    if (payout.status !== "approved") {
      return { ok: false, status: payout.status, reason: "Payout must be approved first." };
    }
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
      // Leave the payout untouched — setup required, not a failure.
      return { ok: false, status: payout.status, setupRequired: true, reason: "Stripe setup required" };
    }

    await db.from("payouts").update({ status: "processing", failure_reason: null }).eq("id", payout.id);

    try {
      const transfer = await stripeCall("/transfers", {
        amount: String(Math.round(Number(payout.net_amount) * 100)),
        currency: (payout.currency ?? "CAD").toLowerCase(),
        destination: vendor.stripe_connect_account_id,
        "metadata[payout_id]": payout.id,
        "metadata[vendor_id]": payout.vendor_id,
        "metadata[period_start]": payout.period_start,
        "metadata[period_end]": payout.period_end,
      });
      await db
        .from("payouts")
        .update({
          status: "paid",
          stripe_transfer_id: transfer.id as string,
          paid_at: new Date().toISOString(),
          failure_reason: null,
        })
        .eq("id", payout.id);
      return { ok: true, status: "paid" };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Transfer failed";
      await db.from("payouts").update({ status: "failed", failure_reason: reason }).eq("id", payout.id);
      return { ok: false, status: "failed", reason };
    }
  });
