import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  getDispute,
  listRefundsForDispute,
  disputeStatusClass,
  disputeStatusLabel,
  refundStatusClass,
  type DisputeRecord,
  type RefundRecord,
} from "@/services/disputes";
import { DisputeThread } from "@/components/DisputeThread";
import { formatCAD } from "@/lib/data";

const CLOSED = ["resolved_customer", "resolved_vendor", "rejected", "cancelled"];

function Page() {
  const { id } = Route.useParams();
  const [dispute, setDispute] = useState<DisputeRecord | null>(null);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    Promise.all([getDispute(id), listRefundsForDispute(id)])
      .then(([d, r]) => {
        if (cancel) return;
        setDispute(d);
        setRefunds(r);
      })
      .catch(() => undefined)
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [id]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!dispute) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        This dispute is not available for your store.
      </div>
    );
  }

  const closed = CLOSED.includes(dispute.status);

  return (
    <>
      <Link to="/vendor/disputes" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-electric">
        <ArrowLeft size={14} /> All disputes
      </Link>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-navy">{dispute.reason}</h1>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${disputeStatusClass(dispute.status)}`}>
            {disputeStatusLabel(dispute.status)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Opened {new Date(dispute.created_at).toLocaleString("en-CA")}
        </p>
        {dispute.description && <p className="mt-3 whitespace-pre-wrap text-sm text-navy">{dispute.description}</p>}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Requested refund</p>
            <p className="text-lg font-bold text-navy">{formatCAD(Number(dispute.requested_refund_amount))}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Approved refund</p>
            <p className="text-lg font-bold text-navy">{formatCAD(Number(dispute.approved_refund_amount))}</p>
          </div>
        </div>

        {Number(dispute.requested_refund_amount) > 0 && !closed && (
          <p className="mt-3 rounded-md bg-deal/10 px-3 py-2 text-xs text-deal">
            A payout hold is in place for this order while the dispute is open. It is released automatically when the
            dispute is resolved in your favour.
          </p>
        )}
      </div>

      {refunds.length > 0 && (
        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <h2 className="mb-3 font-bold text-navy">Refunds</h2>
          <ul className="space-y-2 text-sm">
            {refunds.map((r) => (
              <li key={r.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                <span>{formatCAD(Number(r.amount))} · {r.reason ?? "—"}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${refundStatusClass(r.status)}`}>
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 font-bold text-navy">Conversation</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Share tracking numbers, photos links, or delivery evidence. You cannot issue refunds directly.
        </p>
        <DisputeThread
          disputeId={dispute.id}
          disabled={closed}
          placeholder="Add tracking numbers or evidence…"
        />
        {closed && <p className="mt-2 text-xs text-muted-foreground">This dispute is closed.</p>}
      </div>
    </>
  );
}

export const Route = createFileRoute("/vendor/disputes/$id")({ component: Page });
