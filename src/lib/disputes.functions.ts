import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  adminDb,
  adminUserIds,
  assertAdmin,
  notify,
  OPEN_STATUSES,
  remainingRefundable,
  round2,
  setVendorOrderHold,
  stripeCall,
  stripeConfigured,
  stripeGet,
  vendorOwnerId,
  type DisputeStatus,
  type RefundStatus,
} from "./disputes.server";

export type { DisputeStatus, RefundStatus };

export type DisputeResult = { ok: boolean; disputeId?: string; reason?: string };
export type ActionResult = { ok: boolean; reason?: string; refundId?: string; adjustment?: boolean };
export type RefundProcessResult = {
  ok: boolean;
  status: RefundStatus;
  setupRequired?: boolean;
  reason?: string;
};

/** Customer opens a dispute on one vendor split of their own paid order. */
export const openDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      orderId: string;
      vendorOrderId: string;
      reason: string;
      description: string;
      requestedAmount: number;
    }) => data,
  )
  .handler(async ({ data, context }): Promise<DisputeResult> => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id, order_number, customer_id, payment_status, total")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !order) return { ok: false, reason: "Order not found or access denied" };
    if (order.customer_id !== context.userId) return { ok: false, reason: "Forbidden" };
    if (!["paid", "partially_refunded"].includes(order.payment_status as string)) {
      return { ok: false, reason: "Only paid orders can be disputed." };
    }

    const db = await adminDb();
    const { data: vo } = await db
      .from("vendor_orders")
      .select("id, order_id, vendor_id, vendor_payout_amount, subtotal")
      .eq("id", data.vendorOrderId)
      .maybeSingle();
    const split = vo as
      | { id: string; order_id: string; vendor_id: string; vendor_payout_amount: number; subtotal: number }
      | null;
    if (!split || split.order_id !== order.id) {
      return { ok: false, reason: "That vendor split does not belong to this order." };
    }

    const { data: existing } = await db
      .from("disputes")
      .select("id, status")
      .eq("vendor_order_id", split.id)
      .in("status", OPEN_STATUSES);
    if (((existing ?? []) as unknown[]).length > 0) {
      return { ok: false, reason: "There is already an open dispute for this vendor." };
    }

    const requested = round2(Math.max(0, Math.min(Number(data.requestedAmount) || 0, Number(split.subtotal))));

    const { data: created, error: insErr } = await db
      .from("disputes")
      .insert({
        order_id: order.id,
        vendor_order_id: split.id,
        customer_id: context.userId,
        vendor_id: split.vendor_id,
        reason: data.reason,
        description: data.description,
        requested_refund_amount: requested,
        status: "open",
      })
      .select("id")
      .single();
    if (insErr || !created) {
      return {
        ok: false,
        reason:
          insErr?.code === "23505"
            ? "There is already an open dispute for this vendor."
            : insErr?.message ?? "Could not open dispute",
      };
    }
    const disputeId = (created as { id: string }).id;

    if (data.description?.trim()) {
      await db.from("dispute_messages").insert({
        dispute_id: disputeId,
        sender_user_id: context.userId,
        sender_role: "customer",
        message: data.description.trim(),
      });
    }

    // Hold the vendor's money while the dispute is live.
    await setVendorOrderHold(db, split.id, Math.min(requested, Number(split.vendor_payout_amount ?? 0)));

    const owner = await vendorOwnerId(db, split.vendor_id);
    await notify(db, [owner, ...(await adminUserIds(db))], {
      kind: "dispute_opened",
      title: `Dispute opened on order ${order.order_number}`,
      body: data.reason,
      link: `/vendor/disputes/${disputeId}`,
      disputeId,
    });

    try {
      const { queueDisputeRelationshipEvent } = await import("./takatak/outbox.server");
      await queueDisputeRelationshipEvent(disputeId);
    } catch {
      /* master sync never blocks a dispute */
    }

    return { ok: true, disputeId };
  });

/** Any participant posts a message. Only admins may post internal notes. */
export const postDisputeMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { disputeId: string; message: string; internalOnly?: boolean }) => data)
  .handler(async ({ data, context }): Promise<ActionResult> => {
    const text = data.message.trim();
    if (!text) return { ok: false, reason: "Message is empty" };
    if (text.length > 4000) return { ok: false, reason: "Message is too long" };

    const { data: allowed } = await context.supabase.rpc("can_access_dispute", {
      _dispute_id: data.disputeId,
      _user_id: context.userId,
    });
    if (allowed !== true) return { ok: false, reason: "Forbidden" };

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const internal = Boolean(data.internalOnly) && isAdmin === true;

    const db = await adminDb();
    const { data: row } = await db
      .from("disputes")
      .select("id, customer_id, vendor_id, order_id")
      .eq("id", data.disputeId)
      .maybeSingle();
    const dispute = row as { customer_id: string | null; vendor_id: string; order_id: string } | null;
    if (!dispute) return { ok: false, reason: "Dispute not found" };

    const owner = await vendorOwnerId(db, dispute.vendor_id);
    const role =
      isAdmin === true ? "admin" : owner === context.userId ? "vendor" : "customer";

    await db.from("dispute_messages").insert({
      dispute_id: data.disputeId,
      sender_user_id: context.userId,
      sender_role: role,
      message: text,
      internal_only: internal,
    });

    if (!internal) {
      const recipients =
        role === "customer"
          ? [owner, ...(await adminUserIds(db))]
          : role === "vendor"
            ? [dispute.customer_id, ...(await adminUserIds(db))]
            : [dispute.customer_id, owner];
      await notify(db, recipients, {
        kind: role === "vendor" ? "dispute_vendor_replied" : role === "admin" ? "dispute_admin_replied" : "dispute_customer_replied",
        title: `New message on dispute`,
        body: text.slice(0, 140),
        link: `/admin/disputes`,
        disputeId: data.disputeId,
      });
    }
    return { ok: true };
  });

/** Admin-only lifecycle actions: status changes, holds, refund approval. */
export const adminDisputeAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
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
    }) => data,
  )
  .handler(async ({ data, context }): Promise<ActionResult> => {
    await assertAdmin(context);
    const db = await adminDb();

    const { data: row } = await db
      .from("disputes")
      .select("id, order_id, vendor_order_id, vendor_id, customer_id, requested_refund_amount, approved_refund_amount, status")
      .eq("id", data.disputeId)
      .maybeSingle();
    const dispute = row as
      | {
          id: string;
          order_id: string;
          vendor_order_id: string | null;
          vendor_id: string;
          customer_id: string | null;
          requested_refund_amount: number;
          approved_refund_amount: number;
          status: DisputeStatus;
        }
      | null;
    if (!dispute) return { ok: false, reason: "Dispute not found" };

    const owner = await vendorOwnerId(db, dispute.vendor_id);
    const patch: Record<string, unknown> = {};
    if (data.note !== undefined) patch.resolution_note = data.note;

    switch (data.action) {
      case "set_status": {
        if (!data.status) return { ok: false, reason: "Missing status" };
        patch.status = data.status;
        if (["resolved_customer", "resolved_vendor", "rejected", "cancelled"].includes(data.status)) {
          patch.resolved_at = new Date().toISOString();
        }
        break;
      }
      case "place_hold": {
        const amount = round2(Math.max(0, Number(data.amount ?? dispute.requested_refund_amount) || 0));
        await setVendorOrderHold(db, dispute.vendor_order_id ?? "", amount);
        patch.status = "under_review";
        break;
      }
      case "release_hold": {
        if (dispute.vendor_order_id) await setVendorOrderHold(db, dispute.vendor_order_id, 0);
        break;
      }
      case "reject":
      case "resolve_vendor": {
        if (dispute.vendor_order_id) await setVendorOrderHold(db, dispute.vendor_order_id, 0);
        patch.status = data.action === "reject" ? "rejected" : "resolved_vendor";
        patch.resolved_at = new Date().toISOString();
        break;
      }
      case "resolve_customer": {
        patch.status = "resolved_customer";
        patch.resolved_at = new Date().toISOString();
        break;
      }
      case "approve_refund": {
        const requested = round2(Math.max(0, Number(data.amount ?? dispute.requested_refund_amount) || 0));
        if (requested <= 0) return { ok: false, reason: "Refund amount must be greater than zero." };
        const remaining = await remainingRefundable(db, dispute.order_id);
        if (requested > remaining) {
          return { ok: false, reason: `Refund exceeds the remaining refundable amount (${remaining.toFixed(2)}).` };
        }

        let splitPayoutAmount = requested;
        if (dispute.vendor_order_id) {
          const { data: vendorOrder, error: vendorOrderError } = await db
            .from("vendor_orders")
            .select("vendor_payout_amount")
            .eq("id", dispute.vendor_order_id)
            .maybeSingle();
          if (vendorOrderError || !vendorOrder) {
            return { ok: false, reason: "Vendor split not found." };
          }
          splitPayoutAmount = Number(
            (vendorOrder as { vendor_payout_amount?: number })
              .vendor_payout_amount ?? requested,
          );
        }

        // Financial authority lives in PostgreSQL: the RPC locks the dispute
        // and order, re-computes order/split reservations, inserts the approved
        // refund, and resolves the dispute in one transaction. The preliminary
        // remainingRefundable() check above is UX only and is not trusted for
        // concurrency safety.
        const { data: reserved, error: reserveError } = await db.rpc(
          "reserve_dispute_refund",
          {
            _dispute_id: dispute.id,
            _amount: requested,
            _reason: data.note ?? "Dispute resolution",
            _actor: context.userId,
          },
        );

        if (reserveError) {
          return {
            ok: false,
            reason: "Could not reserve the refund safely.",
          };
        }

        const reservation = (reserved ?? {}) as Record<string, unknown>;
        if (reservation.ok !== true) {
          const reason = String(reservation.reason ?? "refund_reservation_failed");
          const remainingAmount = Number(reservation.remaining ?? NaN);
          if (
            (reason === "order_refund_limit" ||
              reason === "vendor_refund_limit") &&
            Number.isFinite(remainingAmount)
          ) {
            return {
              ok: false,
              reason: `Refund exceeds the remaining refundable amount (${remainingAmount.toFixed(2)}).`,
            };
          }
          if (reason === "refund_already_reserved") {
            return {
              ok: false,
              reason: "This dispute already has a reserved refund.",
            };
          }
          if (reason === "invalid_dispute_state") {
            return {
              ok: false,
              reason: "This dispute is no longer eligible for a new refund.",
            };
          }
          return {
            ok: false,
            reason: "Refund could not be reserved safely.",
          };
        }

        const refundId =
          typeof reservation.refund_id === "string"
            ? reservation.refund_id
            : "";
        if (!refundId) {
          return {
            ok: false,
            reason: "Refund reservation did not return a valid record.",
          };
        }

        if (dispute.vendor_order_id) {
          await setVendorOrderHold(
            db,
            dispute.vendor_order_id,
            Math.min(requested, splitPayoutAmount),
          );
        }

        await notify(db, [dispute.customer_id, owner], {
          kind: "refund_approved",
          title: "Refund approved",
          body: `A refund of ${requested.toFixed(2)} was approved and is awaiting Stripe processing.`,
          disputeId: dispute.id,
        });
        return {
          ok: true,
          refundId,
          adjustment: false,
        };
      }
    }

    if (Object.keys(patch).length > 0) {
      await db.from("disputes").update(patch).eq("id", dispute.id);
    }
    await notify(db, [dispute.customer_id, owner], {
      kind: "dispute_updated",
      title: "Dispute updated",
      body: String(patch.status ?? dispute.status),
      disputeId: dispute.id,
    });
    return { ok: true };
  });

/**
 * Admin-only Stripe refund. Refuses anything not approved, already processed,
 * or larger than the remaining refundable amount.
 */
export const processApprovedRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { refundId: string }) => data)
  .handler(async ({ data, context }): Promise<RefundProcessResult> => {
    await assertAdmin(context);
    const db = await adminDb();

    const { data: row } = await db
      .from("refund_records")
      .select("id, order_id, dispute_id, amount, currency, status, stripe_refund_id")
      .eq("id", data.refundId)
      .maybeSingle();
    const refund = row as
      | {
          id: string;
          order_id: string;
          dispute_id: string | null;
          amount: number;
          currency: string;
          status: RefundStatus;
          stripe_refund_id: string | null;
        }
      | null;

    if (!refund) {
      return { ok: false, status: "requested", reason: "Refund not found" };
    }
    if (refund.status === "refunded") {
      return { ok: true, status: "refunded" };
    }
    if (!["approved", "processing", "failed"].includes(refund.status)) {
      return {
        ok: false,
        status: refund.status,
        reason: "Refund is not eligible for processing.",
      };
    }
    if (Number(refund.amount) <= 0) {
      return {
        ok: false,
        status: refund.status,
        reason: "Refund amount must be greater than zero.",
      };
    }

    const { data: oRow } = await db
      .from("orders")
      .select("id, payment_status, stripe_payment_intent_id, stripe_charge_id")
      .eq("id", refund.order_id)
      .maybeSingle();
    const order = oRow as
      | {
          payment_status: string;
          stripe_payment_intent_id: string | null;
          stripe_charge_id: string | null;
        }
      | null;

    if (!order) {
      return { ok: false, status: refund.status, reason: "Order not found" };
    }
    if (!["paid", "partially_refunded"].includes(order.payment_status)) {
      return { ok: false, status: refund.status, reason: "Order is not paid." };
    }

    const remaining = await remainingRefundable(db, refund.order_id, refund.id);
    if (Number(refund.amount) > remaining) {
      return {
        ok: false,
        status: refund.status,
        reason: "Refund exceeds the remaining refundable amount.",
      };
    }

    if (
      !stripeConfigured() ||
      (!order.stripe_payment_intent_id && !order.stripe_charge_id)
    ) {
      return {
        ok: false,
        status: refund.status,
        setupRequired: true,
        reason: "Stripe setup required — the refund stays approved and unprocessed.",
      };
    }

    await db
      .from("refund_records")
      .update({ status: "processing", failure_reason: null })
      .eq("id", refund.id);

    let stripeRefund: Record<string, unknown>;

    try {
      if (refund.stripe_refund_id) {
        stripeRefund = await stripeGet(
          `/refunds/${encodeURIComponent(refund.stripe_refund_id)}`,
        );
      } else {
        const body: Record<string, string> = {
          amount: String(Math.round(Number(refund.amount) * 100)),
          "metadata[refund_record_id]": refund.id,
          "metadata[order_id]": refund.order_id,
        };
        if (order.stripe_payment_intent_id) {
          body.payment_intent = order.stripe_payment_intent_id;
        } else if (order.stripe_charge_id) {
          body.charge = order.stripe_charge_id;
        }

        stripeRefund = await stripeCall(
          "/refunds",
          body,
          `1lv_refund_${refund.id}_v1`,
        );
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Refund failed";
      await db
        .from("refund_records")
        .update({ status: "failed", failure_reason: reason })
        .eq("id", refund.id);
      if (refund.dispute_id) {
        await notify(db, await adminUserIds(db), {
          kind: "refund_failed",
          title: "Refund failed",
          body: reason,
          disputeId: refund.dispute_id,
        });
      }
      return { ok: false, status: "failed", reason };
    }

    const stripeRefundId =
      typeof stripeRefund.id === "string" &&
      stripeRefund.id.startsWith("re_")
        ? stripeRefund.id
        : null;
    const stripeRefundStatus =
      typeof stripeRefund.status === "string"
        ? stripeRefund.status
        : "";
    const stripeRefundAmount = Number(stripeRefund.amount ?? NaN);
    const stripeRefundCurrency =
      typeof stripeRefund.currency === "string"
        ? stripeRefund.currency.toUpperCase()
        : "";
    const expectedRefundAmount = Math.round(Number(refund.amount) * 100);
    const expectedRefundCurrency = String(refund.currency ?? "CAD").toUpperCase();
    const stripeMetadata =
      stripeRefund.metadata &&
      typeof stripeRefund.metadata === "object" &&
      !Array.isArray(stripeRefund.metadata)
        ? (stripeRefund.metadata as Record<string, unknown>)
        : {};
    const stripeRecordId =
      typeof stripeMetadata["refund_record_id"] === "string"
        ? stripeMetadata["refund_record_id"]
        : "";
    const stripeOrderId =
      typeof stripeMetadata["order_id"] === "string"
        ? stripeMetadata["order_id"]
        : "";

    if (
      !stripeRefundId ||
      !Number.isSafeInteger(stripeRefundAmount) ||
      stripeRefundAmount !== expectedRefundAmount ||
      stripeRefundCurrency !== expectedRefundCurrency ||
      stripeRecordId !== refund.id ||
      stripeOrderId !== refund.order_id
    ) {
      const reason =
        "Stripe refund response does not match the approved 1LV refund.";
      await db
        .from("refund_records")
        .update({
          status: "processing",
          stripe_refund_id: stripeRefundId,
          failure_reason: reason,
        })
        .eq("id", refund.id);
      await notify(db, await adminUserIds(db), {
        kind: "refund_reconciliation_required",
        title: "Refund response needs reconciliation",
        body: `${reason} Refund ${refund.id}.`,
        disputeId: refund.dispute_id ?? undefined,
      });
      return { ok: false, status: "processing", reason };
    }

    await db
      .from("refund_records")
      .update({ stripe_refund_id: stripeRefundId })
      .eq("id", refund.id);

    if (
      stripeRefundStatus === "pending" ||
      stripeRefundStatus === "requires_action"
    ) {
      const reason =
        stripeRefundStatus === "requires_action"
          ? "Stripe requires additional action before the refund can complete. Review the refund in Stripe."
          : "Stripe accepted the refund and it is still pending.";
      await db
        .from("refund_records")
        .update({
          status: "processing",
          failure_reason: reason,
        })
        .eq("id", refund.id);
      await notify(db, await adminUserIds(db), {
        kind:
          stripeRefundStatus === "requires_action"
            ? "refund_action_required"
            : "refund_pending",
        title:
          stripeRefundStatus === "requires_action"
            ? "Stripe refund requires action"
            : "Stripe refund pending",
        body: `${reason} Refund ${refund.id}.`,
        disputeId: refund.dispute_id ?? undefined,
      });
      return { ok: false, status: "processing", reason };
    }

    if (
      stripeRefundStatus === "failed" ||
      stripeRefundStatus === "canceled"
    ) {
      const stripeFailure =
        typeof stripeRefund.failure_reason === "string"
          ? stripeRefund.failure_reason
          : stripeRefundStatus;
      const reason = `Stripe refund ${stripeRefundStatus}: ${stripeFailure}`;
      await db
        .from("refund_records")
        .update({
          status: "failed",
          failure_reason: reason.slice(0, 500),
        })
        .eq("id", refund.id);
      await notify(db, await adminUserIds(db), {
        kind: "refund_failed",
        title: "Refund failed",
        body: reason,
        disputeId: refund.dispute_id ?? undefined,
      });
      return { ok: false, status: "failed", reason };
    }

    if (stripeRefundStatus !== "succeeded") {
      const reason =
        "Stripe returned an unknown refund status. Automatic accounting was blocked.";
      await db
        .from("refund_records")
        .update({
          status: "processing",
          failure_reason: reason,
        })
        .eq("id", refund.id);
      await notify(db, await adminUserIds(db), {
        kind: "refund_reconciliation_required",
        title: "Unknown Stripe refund status",
        body: `${reason} Refund ${refund.id}.`,
        disputeId: refund.dispute_id ?? undefined,
      });
      return { ok: false, status: "processing", reason };
    }

    const { data: accounting, error: accountingError } = await db.rpc(
      "finalize_refund_accounting",
      {
        _refund_id: refund.id,
        _stripe_refund_id: stripeRefundId,
      },
    );

    if (accountingError) {
      const reason =
        "Stripe refunded the payment, but accounting finalization is pending. Retry this refund to reconcile safely.";
      await db
        .from("refund_records")
        .update({
          status: "processing",
          stripe_refund_id: stripeRefundId,
          failure_reason: accountingError.message.slice(0, 500),
        })
        .eq("id", refund.id);
      await notify(db, await adminUserIds(db), {
        kind: "refund_accounting_pending",
        title: "Refund accounting needs reconciliation",
        body: `${reason} Refund ${refund.id}.`,
        disputeId: refund.dispute_id ?? undefined,
      });
      return { ok: false, status: "processing", reason };
    }

    const result = (accounting ?? {}) as Record<string, unknown>;
    if (result.ok !== true) {
      return {
        ok: false,
        status: "processing",
        reason: "Refund accounting did not finalize.",
      };
    }

    try {
      const { queueOrderEvent } = await import("./takatak/outbox.server");
      await queueOrderEvent(refund.order_id, "order.refunded");
    } catch {
      /* master sync never blocks a refund */
    }

    if (refund.dispute_id) {
      const { data: d } = await db
        .from("disputes")
        .select("customer_id, vendor_id")
        .eq("id", refund.dispute_id)
        .maybeSingle();
      const dispute = d as
        | { customer_id: string | null; vendor_id: string }
        | null;
      if (dispute) {
        await notify(
          db,
          [dispute.customer_id, await vendorOwnerId(db, dispute.vendor_id)],
          {
            kind: "refund_processed",
            title: "Refund processed",
            body: `$${Number(refund.amount).toFixed(2)} has been refunded.`,
            disputeId: refund.dispute_id,
          },
        );
      }
    }

    return { ok: true, status: "refunded" };
  });
