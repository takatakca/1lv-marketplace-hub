import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { DollarSign, Wallet, Clock, AlertTriangle } from "lucide-react";
import { formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";
import {
  listAllPayouts,
  listPayoutItems,
  generatePayouts,
  updatePayoutStatus,
  processPayout,
  reconcilePayouts,
  payoutStatusLabel,
  payoutStatusClass,
  getPayoutSettings,
  PAYOUT_STATUSES,
  type PayoutRecord,
  type PayoutItemRecord,
  type PayoutStatus,
} from "@/services/payouts";
import { supabase } from "@/integrations/supabase/client";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function defaultPeriod() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return { start: isoDate(start), end: isoDate(end) };
}

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [vendorNames, setVendorNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [holdDays, setHoldDays] = useState(7);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | PayoutStatus>("all");
  const [period, setPeriod] = useState(defaultPeriod());
  const [detail, setDetail] = useState<PayoutRecord | null>(null);
  const [items, setItems] = useState<PayoutItemRecord[] | null>(null);

  const load = async () => {
    const rows = await listAllPayouts();
    setPayouts(rows);
    const ids = Array.from(new Set(rows.map((r) => r.vendor_id)));
    if (ids.length) {
      const { data } = await supabase.from("vendors").select("id, store_name").in("id", ids);
      const map: Record<string, string> = {};
      for (const v of (data ?? []) as Array<{ id: string; store_name: string }>) map[v.id] = v.store_name;
      setVendorNames(map);
    }
  };

  useEffect(() => {
    if (demo) return;
    (async () => {
      try {
        const [, settings] = await Promise.all([load(), getPayoutSettings()]);
        setHoldDays(settings.holdDays);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);

  const reconciled = useMemo(() => reconcilePayouts(payouts), [payouts]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return reconciled.filter(({ payout }) => {
      if (status !== "all" && payout.status !== status) return false;
      if (!needle) return true;
      const name = (vendorNames[payout.vendor_id] ?? "").toLowerCase();
      return name.includes(needle) || payout.period_start.includes(needle) || payout.period_end.includes(needle);
    });
  }, [reconciled, q, status, vendorNames]);

  const totals = useMemo(() => {
    let net = 0, pending = 0, paid = 0, flagged = 0;
    for (const r of reconciled) {
      net += Number(r.payout.net_amount);
      if (r.payout.status === "pending_review" || r.payout.status === "held") pending += Number(r.payout.net_amount);
      if (r.payout.status === "paid") paid += Number(r.payout.net_amount);
      if (r.severity === "error") flagged++;
    }
    return { net, pending, paid, flagged };
  }, [reconciled]);

  const guard = () => {
    if (demo) {
      toast.info("Preview mode — sign in as an admin to manage payouts.");
      return true;
    }
    return false;
  };

  const handleGenerate = async () => {
    if (guard()) return;
    setBusy(true);
    try {
      const r = await generatePayouts(period.start, period.end);
      if (!r.ok) toast.error(r.reason ?? "Generation failed");
      else if (r.created === 0) toast.info(`No eligible orders. ${r.skipped} skipped.`);
      else toast.success(`Created ${r.created} payout(s) for ${r.vendors} vendor(s). ${r.skipped} skipped.`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleAction = async (id: string, action: "approve" | "hold" | "cancel" | "reopen") => {
    if (guard()) return;
    setBusy(true);
    try {
      const r = await updatePayoutStatus(id, action);
      if (r.ok) toast.success(`Payout ${payoutStatusLabel(r.status).toLowerCase()}`);
      else toast.error(r.reason ?? "Action failed");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleTransfer = async (id: string) => {
    if (guard()) return;
    setBusy(true);
    try {
      const r = await processPayout(id);
      if (r.ok) toast.success("Transfer created");
      else if (r.setupRequired) toast.info(r.reason ?? "Stripe setup required");
      else toast.error(r.reason ?? "Transfer refused");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (p: PayoutRecord) => {
    setDetail(p);
    setItems(null);
    setItems(await listPayoutItems(p.id));
  };

  return (
    <div>
      <div className="mb-6">
        {demo ? <DemoBanner label="Preview mode" /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Payouts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate, review and manually release vendor payouts. Automatic transfers are disabled.
        </p>
      </div>
      {demo && <PreviewModeNotice />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total net" value={formatCAD(totals.net)} icon={DollarSign} />
        <StatCard label="Awaiting review" value={formatCAD(totals.pending)} icon={Clock} accent="deal" />
        <StatCard label="Paid" value={formatCAD(totals.paid)} icon={Wallet} accent="success" />
        <StatCard label="Reconciliation flags" value={String(totals.flagged)} icon={AlertTriangle} accent="deal" />
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold text-navy">Generate payouts</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Includes delivered vendor orders on paid orders, past the {holdDays}-day hold, with payouts enabled and no
          dispute hold. Created as <strong>pending review</strong> — no money moves.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            From
            <input
              type="date" value={period.start}
              onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
              className="mt-1 block rounded-md border border-border px-2 py-1.5 text-sm text-navy"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            To
            <input
              type="date" value={period.end}
              onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
              className="mt-1 block rounded-md border border-border px-2 py-1.5 text-sm text-navy"
            />
          </label>
          <button
            type="button" onClick={handleGenerate} disabled={busy}
            className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Working…" : "Generate payouts"}
          </button>
          <button
            type="button" onClick={() => void load()} disabled={busy || demo}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-semibold text-navy disabled:opacity-60"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendor or period…"
          className="min-w-[220px] flex-1 rounded-md border border-border px-3 py-2 text-sm"
        />
        <select
          value={status} onChange={(e) => setStatus(e.target.value as "all" | PayoutStatus)}
          className="rounded-md border border-border px-3 py-2 text-sm text-navy"
        >
          <option value="all">All statuses</option>
          {PAYOUT_STATUSES.map((s) => (
            <option key={s} value={s}>{payoutStatusLabel(s)}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No payouts yet. Generate a period above once vendor orders are delivered and paid.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2 text-right">Gross</th>
                <th className="px-3 py-2 text-right">Commission</th>
                <th className="px-3 py-2 text-right">Refunds</th>
                <th className="px-3 py-2 text-right">Holds</th>
                <th className="px-3 py-2 text-right">Net</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Reconciliation</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ payout: p, label, severity }) => (
                <tr key={p.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 font-medium text-navy">
                    <button type="button" className="underline-offset-2 hover:underline" onClick={() => void openDetail(p)}>
                      {vendorNames[p.vendor_id] ?? "Vendor"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{p.period_start} → {p.period_end}</td>
                  <td className="px-3 py-2 text-right">{formatCAD(Number(p.gross_amount))}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{formatCAD(Number(p.commission_amount))}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{formatCAD(Number(p.refund_amount))}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{formatCAD(Number(p.dispute_hold_amount))}</td>
                  <td className="px-3 py-2 text-right font-semibold text-navy">{formatCAD(Number(p.net_amount))}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${payoutStatusClass(p.status)}`}>
                      {payoutStatusLabel(p.status)}
                    </span>
                    {p.failure_reason && <p className="mt-1 text-[10px] text-destructive">{p.failure_reason}</p>}
                  </td>
                  <td className={`px-3 py-2 ${severity === "error" ? "text-destructive" : severity === "warn" ? "text-deal" : "text-success"}`}>
                    {label}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      {(p.status === "pending_review" || p.status === "held") && (
                        <button type="button" disabled={busy} onClick={() => void handleAction(p.id, "approve")}
                          className="rounded border border-success/40 px-2 py-1 font-semibold text-success disabled:opacity-50">Approve</button>
                      )}
                      {p.status !== "held" && p.status !== "paid" && p.status !== "cancelled" && (
                        <button type="button" disabled={busy} onClick={() => void handleAction(p.id, "hold")}
                          className="rounded border border-deal/40 px-2 py-1 font-semibold text-deal disabled:opacity-50">Hold</button>
                      )}
                      {p.status === "approved" && (
                        <button type="button" disabled={busy} onClick={() => void handleTransfer(p.id)}
                          className="rounded bg-navy px-2 py-1 font-semibold text-white disabled:opacity-50">Send transfer</button>
                      )}
                      {p.status === "failed" && (
                        <button type="button" disabled={busy} onClick={() => void handleAction(p.id, "reopen")}
                          className="rounded border border-border px-2 py-1 font-semibold text-navy disabled:opacity-50">Reopen</button>
                      )}
                      {p.status !== "paid" && p.status !== "cancelled" && (
                        <button type="button" disabled={busy} onClick={() => void handleAction(p.id, "cancel")}
                          className="rounded border border-border px-2 py-1 font-semibold text-muted-foreground disabled:opacity-50">Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" onClick={() => setDetail(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-xl bg-card p-5 sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-navy">{vendorNames[detail.vendor_id] ?? "Vendor"}</h3>
                <p className="text-xs text-muted-foreground">{detail.period_start} → {detail.period_end} · {detail.currency}</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="text-sm text-muted-foreground">Close</button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <div>Gross<p className="font-semibold text-navy">{formatCAD(Number(detail.gross_amount))}</p></div>
              <div>Commission<p className="font-semibold text-navy">{formatCAD(Number(detail.commission_amount))}</p></div>
              <div>Refunds<p className="font-semibold text-navy">{formatCAD(Number(detail.refund_amount))}</p></div>
              <div>Dispute holds<p className="font-semibold text-navy">{formatCAD(Number(detail.dispute_hold_amount))}</p></div>
              <div>Net<p className="font-semibold text-navy">{formatCAD(Number(detail.net_amount))}</p></div>
              <div>Paid at<p className="font-semibold text-navy">{detail.paid_at ? new Date(detail.paid_at).toLocaleDateString() : "—"}</p></div>
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground">
              <ShieldAlert size={14} className="mt-0.5 shrink-0" />
              Stripe account identifiers are never shown here. Transfers are manual and one payout at a time.
            </div>
            <h4 className="mt-5 text-sm font-bold text-navy">Included vendor orders ({items?.length ?? 0})</h4>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-1">Vendor order</th>
                    <th className="py-1 text-right">Gross</th>
                    <th className="py-1 text-right">Commission</th>
                    <th className="py-1 text-right">Refund</th>
                    <th className="py-1 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {(items ?? []).map((i) => (
                    <tr key={i.id} className="border-b border-border/50">
                      <td className="py-1 font-mono text-navy">{i.vendor_order_id.slice(0, 8)}</td>
                      <td className="py-1 text-right">{formatCAD(Number(i.gross_amount))}</td>
                      <td className="py-1 text-right">{formatCAD(Number(i.commission_amount))}</td>
                      <td className="py-1 text-right">{formatCAD(Number(i.refund_amount))}</td>
                      <td className="py-1 text-right font-semibold text-navy">{formatCAD(Number(i.net_amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items === null && <p className="py-2 text-xs text-muted-foreground">Loading…</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/admin/payouts")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Payouts — 1LV.CA Admin" },
      { name: "description", content: "Generate, review and release vendor payouts for the 1LV.CA marketplace." },
      { property: "og:title", content: "Payouts — 1LV.CA Admin" },
      { property: "og:description", content: "Vendor payout generation, approval and reconciliation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
