/**
 * Server-only helpers for the dispute / refund lifecycle.
 *
 * SAFETY RULES
 * - Stripe secrets never leave this module.
 * - Only admins may approve or process refunds.
 * - Refunds can never exceed the remaining refundable amount on the order.
 * - Nothing here starts an automatic payout.
 */

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_TIMEOUT_MS = 20_000;

export type DisputeStatus =
  | "open"
  | "under_review"
  | "waiting_customer"
  | "waiting_vendor"
  | "resolved_customer"
  | "resolved_vendor"
  | "rejected"
  | "cancelled";

export type RefundStatus =
  | "requested"
  | "approved"
  | "processing"
  | "refunded"
  | "failed"
  | "cancelled";

export const OPEN_STATUSES: DisputeStatus[] = [
  "open",
  "under_review",
  "waiting_customer",
  "waiting_vendor",
];

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export async function stripeGet(path: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe not configured");

  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${key}`,
    },
    signal: AbortSignal.timeout(STRIPE_TIMEOUT_MS),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      (json.error as { message?: string } | undefined)?.message ??
        "Stripe error",
    );
  }
  return json;
}

export async function stripeCall(
  path: string,
  body: Record<string, string>,
  idempotencyKey?: string,
) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe not configured");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers,
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(STRIPE_TIMEOUT_MS),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((json.error as { message?: string } | undefined)?.message ?? "Stripe error");
  }
  return json;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Db = { from: (t: string) => any; rpc: (...a: unknown[]) => any };

export async function adminDb(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

export async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || data !== true) throw new Error("Forbidden");
}

export async function notify(
  db: Db,
  userIds: Array<string | null | undefined>,
  payload: { kind: string; title: string; body?: string; link?: string; disputeId?: string },
) {
  const rows = Array.from(new Set(userIds.filter(Boolean) as string[])).map((user_id) => ({
    user_id,
    kind: payload.kind,
    title: payload.title,
    body: payload.body ?? null,
    link: payload.link ?? null,
    dispute_id: payload.disputeId ?? null,
  }));
  if (rows.length === 0) return;
  await db.from("notifications").insert(rows);
}

export async function adminUserIds(db: Db): Promise<string[]> {
  const { data } = await db.from("user_roles").select("user_id").eq("role", "admin");
  return ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
}

export async function vendorOwnerId(db: Db, vendorId: string): Promise<string | null> {
  const { data } = await db.from("vendors").select("user_id").eq("id", vendorId).maybeSingle();
  return (data as { user_id?: string } | null)?.user_id ?? null;
}

/** Amount still refundable on an order = order total minus already refunded/approved refunds. */
export async function remainingRefundable(db: Db, orderId: string, excludeRefundId?: string) {
  const { data: order } = await db.from("orders").select("total").eq("id", orderId).maybeSingle();
  const total = Number((order as { total?: number } | null)?.total ?? 0);
  const { data: refunds } = await db
    .from("refund_records")
    .select("id, amount, status")
    .eq("order_id", orderId);
  const used = ((refunds ?? []) as Array<{ id: string; amount: number; status: RefundStatus }>)
    .filter((r) => r.id !== excludeRefundId)
    .filter((r) => ["approved", "processing", "refunded"].includes(r.status))
    .reduce((s, r) => s + Number(r.amount ?? 0), 0);
  return round2(total - used);
}

/**
 * Apply or release a payout hold for a vendor_order.
 * - Not yet in a payout  -> only the vendor_order hold column changes; the
 *   generator already skips vendor_orders with a non-zero hold.
 * - In a payout that is not paid yet -> the payout is flagged `held`.
 * - In a payout already paid -> nothing here; a negative adjustment is created
 *   when a refund is actually approved.
 */
export async function setVendorOrderHold(
  db: Db,
  vendorOrderId: string,
  amount: number,
) {
  if (!vendorOrderId) return { payoutId: null as string | null, paid: false };

  const holdAmount = round2(Math.max(0, amount));
  const { error: holdError } = await db
    .from("vendor_orders")
    .update({ dispute_hold_amount: holdAmount })
    .eq("id", vendorOrderId);
  if (holdError) throw new Error(holdError.message);

  const { data: item, error: itemError } = await db
    .from("payout_items")
    .select("payout_id")
    .eq("vendor_order_id", vendorOrderId)
    .maybeSingle();
  if (itemError) throw new Error(itemError.message);

  const payoutId = (item as { payout_id?: string } | null)?.payout_id;
  if (!payoutId) return { payoutId: null as string | null, paid: false };

  const { data: payout, error: payoutError } = await db
    .from("payouts")
    .select("id, status")
    .eq("id", payoutId)
    .maybeSingle();
  if (payoutError) throw new Error(payoutError.message);

  const status = (payout as { status?: string } | null)?.status;
  if (!status) return { payoutId, paid: false };

  if (status === "paid" || status === "processing") {
    return { payoutId, paid: true };
  }

  if (holdAmount > 0) {
    if (status !== "held") {
      const { error } = await db
        .from("payouts")
        .update({ status: "held" })
        .eq("id", payoutId);
      if (error) throw new Error(error.message);
    }
    return { payoutId, paid: false };
  }

  if (status === "held") {
    const { data: payoutItems, error: payoutItemsError } = await db
      .from("payout_items")
      .select("vendor_order_id")
      .eq("payout_id", payoutId);
    if (payoutItemsError) throw new Error(payoutItemsError.message);

    const ids = ((payoutItems ?? []) as Array<{ vendor_order_id: string }>).map(
      (row) => row.vendor_order_id,
    );
    let anotherHoldExists = false;
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      const { data: held, error } = await db
        .from("vendor_orders")
        .select("id")
        .in("id", batch)
        .gt("dispute_hold_amount", 0)
        .limit(1);
      if (error) throw new Error(error.message);
      if ((held ?? []).length > 0) {
        anotherHoldExists = true;
        break;
      }
    }

    if (!anotherHoldExists) {
      const { error } = await db
        .from("payouts")
        .update({ status: "pending_review" })
        .eq("id", payoutId)
        .eq("status", "held");
      if (error) throw new Error(error.message);
    }
  }

  return { payoutId, paid: false };
}
