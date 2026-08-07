import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import { DisputeThread } from "@/components/DisputeThread";
import {
  DISPUTE_STATUSES,
  disputeStatusClass,
  disputeStatusLabel,
  getDispute,
  listAllDisputes,
  listRefundsForDispute,
  processRefund,
  refundStatusClass,
  runDisputeAction,
  type DisputeRecord,
  type DisputeStatus,
  type RefundRecord,
} from "@/services/disputes";
import { formatCAD } from "@/lib/data";

type Row = DisputeRecord & { orders: { order_number: string; total: number } | null };

function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | DisputeStatus>("all");
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    listAllDisputes()
      .then(setRows)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((d) => {
      if (status !== "all" && d.status !== status) return false;
      if (!term) return true;
      return (
        d.reason.toLowerCase().includes(term) ||
        (d.orders?.order_number ?? "").toLowerCase().includes(term) ||
        d.id.toLowerCase().includes(term)
      );
    });
  }, [rows, q, status]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Disputes</h1>
        <p className="text-sm text-muted-foreground">
          Open → under review → waiting customer/vendor → resolved or rejected. Approving a refund holds or claws back
          the vendor payout automatically.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search order number, reason or id…"
          className="w-64 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "all" | DisputeStatus)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          {DISPUTE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {disputeStatusLabel(s)}
            </option>
          ))}
        </select>
        <button onClick={load} className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-navy">
          Refresh
        </button>
        <span className="ml-auto text-xs text-muted-foreground">{visible.length} disputes</span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No disputes match these filters.
        </div>
      ) : (
        <DataTable
          columns={[
            { key: "order", label: "Order" },
            { key: "reason", label: "Reason" },
            { key: "status", label: "Status" },
            { key: "requested", label: "Requested" },
            { key: "approved", label: "Approved" },
            { key: "updated", label: "Updated" },
            { key: "actions", label: "" },
          ]}
          rows={visible.map((d) => ({
            id: d.id,
            order: d.orders?.order_number ?? "—",
            reason: d.reason,
            status: (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${disputeStatusClass(d.status)}`}>
                {disputeStatusLabel(d.status)}
              </span>
            ),
            requested: formatCAD(Number(d.requested_refund_amount)),
            approved: formatCAD(Number(d.approved_refund_amount)),
            updated: new Date(d.updated_at).toLocaleDateString("en-CA"),
            actions: (
              <button onClick={() => setActiveId(d.id)} className="text-xs font-semibold text-electric">
                Review
              </button>
            ),
          }))}
        />
      )}

      {activeId && (
        <DisputeDrawer
          disputeId={activeId}
          onClose={() => setActiveId(null)}
          onChanged={load}
        />
      )}
    </>
  );
}

function DisputeDrawer({
  disputeId,
  onClose,
  onChanged,
}: {
  disputeId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [dispute, setDispute] = useState<DisputeRecord | null>(null);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = () => {
    Promise.all([getDispute(disputeId), listRefundsForDispute(disputeId)]).then(([d, r]) => {
      setDispute(d);
      setRefunds(r);
      if (d && !amount) setAmount(String(d.approved_refund_amount || d.requested_refund_amount || ""));
    });
  };

  useEffect(reload, [disputeId]);

  const act = async (
    action: Parameters<typeof runDisputeAction>[0]["action"],
    extra?: { status?: DisputeStatus; amount?: number },
  ) => {
    setBusy(true);
    const res = await runDisputeAction({ disputeId, action, note: note || undefined, ...extra });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.reason ?? "Action failed");
      return;
    }
    toast.success(res.adjustment ? "Done — negative adjustment queued for the next payout" : "Dispute updated");
    reload();
    onChanged();
  };

  const runRefund = async (refundId: string) => {
    setBusy(true);
    const res = await processRefund(refundId);
    setBusy(false);
    if (res.ok) toast.success("Refund processed");
    else if (res.setupRequired) toast.message("Stripe setup required", { description: res.reason });
    else toast.error(res.reason ?? "Refund failed");
    reload();
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-2xl rounded-xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
        {!dispute ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-bold text-navy">{dispute.reason}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${disputeStatusClass(dispute.status)}`}>
                {disputeStatusLabel(dispute.status)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Requested {formatCAD(Number(dispute.requested_refund_amount))} · Approved{" "}
              {formatCAD(Number(dispute.approved_refund_amount))}
            </p>
            {dispute.description && <p className="mt-3 whitespace-pre-wrap text-sm">{dispute.description}</p>}

            <div className="mt-4">
              <label className="block text-xs font-semibold text-navy">Status</label>
              <select
                value={dispute.status}
                onChange={(e) => act("set_status", { status: e.target.value as DisputeStatus })}
                disabled={busy}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {DISPUTE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {disputeStatusLabel(s)}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-navy">Refund amount (CAD)</label>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy">Resolution note</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                disabled={busy}
                onClick={() => act("approve_refund", { amount: Number(amount) || 0 })}
                className="rounded-md bg-electric px-3 py-2 text-xs font-semibold text-electric-foreground disabled:opacity-60"
              >
                Approve refund
              </button>
              <button disabled={busy} onClick={() => act("place_hold", { amount: Number(amount) || 0 })} className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-navy">
                Place payout hold
              </button>
              <button disabled={busy} onClick={() => act("release_hold")} className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-navy">
                Release hold
              </button>
              <button disabled={busy} onClick={() => act("resolve_vendor")} className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-navy">
                Resolve for vendor
              </button>
              <button disabled={busy} onClick={() => act("reject")} className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-destructive">
                Reject dispute
              </button>
            </div>

            {refunds.length > 0 && (
              <div className="mt-5 rounded-lg border border-border p-3">
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Refund records</h4>
                <ul className="space-y-2 text-sm">
                  {refunds.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-navy">{formatCAD(Number(r.amount))}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${refundStatusClass(r.status)}`}>
                        {r.status}
                      </span>
                      {r.failure_reason && <span className="text-xs text-destructive">{r.failure_reason}</span>}
                      {r.status === "approved" && (
                        <button
                          disabled={busy}
                          onClick={() => runRefund(r.id)}
                          className="ml-auto rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-navy-foreground disabled:opacity-60"
                        >
                          Process refund
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Conversation</h4>
              <DisputeThread disputeId={dispute.id} allowInternal placeholder="Reply to participants…" />
            </div>

            <div className="mt-5 flex">
              <button onClick={onClose} className="ml-auto rounded-md border border-border px-3 py-2 text-xs font-semibold text-navy">
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/admin/disputes")({ component: Page });
