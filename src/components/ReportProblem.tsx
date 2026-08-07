import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import {
  createDispute,
  DISPUTE_REASONS,
  disputeStatusClass,
  disputeStatusLabel,
  listDisputesForCustomer,
  listVendorSplitsForOrder,
  type DisputeRecord,
} from "@/services/disputes";
import { DisputeThread } from "@/components/DisputeThread";
import { useAuth } from "@/hooks/use-auth";
import { formatCAD } from "@/lib/data";

const OPEN = ["open", "under_review", "waiting_customer", "waiting_vendor"];

/** Customer-facing "Report a problem" panel on the order detail page. */
export function ReportProblem({
  orderId,
  paymentStatus,
}: {
  orderId: string;
  paymentStatus: string;
}) {
  const { user } = useAuth();
  const [splits, setSplits] = useState<Awaited<ReturnType<typeof listVendorSplitsForOrder>>>([]);
  const [disputes, setDisputes] = useState<DisputeRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [vendorOrderId, setVendorOrderId] = useState("");
  const [reason, setReason] = useState(DISPUTE_REASONS[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    listVendorSplitsForOrder(orderId).then((s) => {
      setSplits(s);
      if (s[0]) setVendorOrderId((v) => v || s[0].id);
    });
    listDisputesForCustomer(orderId).then(setDisputes).catch(() => undefined);
  };

  useEffect(load, [orderId]);

  if (!user) return null;
  const payable = ["paid", "partially_refunded"].includes(paymentStatus);

  const submit = async () => {
    if (!vendorOrderId) return;
    setBusy(true);
    const res = await createDispute({
      orderId,
      vendorOrderId,
      reason,
      description,
      requestedAmount: Number(amount) || 0,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.reason ?? "Could not open dispute");
      return;
    }
    toast.success("Dispute opened — our team will review it.");
    setOpen(false);
    setDescription("");
    setAmount("");
    load();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-navy">Problem with this order?</h2>
        {payable && !open && (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-navy hover:border-electric hover:text-electric"
          >
            <AlertTriangle size={14} /> Report a problem
          </button>
        )}
      </div>

      {!payable && (
        <p className="mt-2 text-xs text-muted-foreground">
          Disputes can be opened once the order is paid.
        </p>
      )}

      {open && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-navy">Which seller?</label>
            <select
              value={vendorOrderId}
              onChange={(e) => setVendorOrderId(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {splits.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.vendors?.store_name ?? "Seller"} · {formatCAD(Number(s.subtotal))}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-navy">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {DISPUTE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-navy">What happened?</label>
            <textarea
              rows={3}
              value={description}
              maxLength={2000}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-navy">Refund requested (CAD)</label>
            <input
              value={amount}
              inputMode="decimal"
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={busy || !vendorOrderId}
              className="rounded-md bg-electric px-4 py-2 text-sm font-bold text-electric-foreground disabled:opacity-60"
            >
              {busy ? "Submitting…" : "Submit dispute"}
            </button>
            <button onClick={() => setOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-navy">
              Cancel
            </button>
          </div>
        </div>
      )}

      {disputes.length > 0 && (
        <div className="mt-5 space-y-4">
          {disputes.map((d) => (
            <div key={d.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-navy">{d.reason}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${disputeStatusClass(d.status)}`}>
                  {disputeStatusLabel(d.status)}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  Requested {formatCAD(Number(d.requested_refund_amount))}
                  {Number(d.approved_refund_amount) > 0
                    ? ` · Approved ${formatCAD(Number(d.approved_refund_amount))}`
                    : ""}
                </span>
              </div>
              <div className="mt-3">
                <DisputeThread disputeId={d.id} disabled={!OPEN.includes(d.status)} placeholder="Reply to the seller or our team…" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
