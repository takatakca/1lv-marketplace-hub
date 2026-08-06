import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { StatCard } from "@/components/StatCard";
import { Wallet, Clock, DollarSign, AlertTriangle, Info } from "lucide-react";
import { formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { getMyVendor, type VendorRecord } from "@/services/vendors";
import { getVendorStats, getPayoutPeriods, type VendorStats, type PayoutPeriod } from "@/services/vendor-stats";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";
import {
  createConnectAccount,
  createConnectOnboardingLink,
  refreshConnectStatus,
  connectLabel,
  type ConnectStatus,
} from "@/services/connect";
import {
  listVendorPayouts,
  payoutStatusClass,
  payoutStatusLabel,
  type PayoutRecord,
} from "@/services/payouts";

function buildDemoPeriods(): PayoutPeriod[] {
  const out: PayoutPeriod[] = [];
  const today = new Date();
  for (let i = 0; i < 4; i++) {
    const start = new Date(today); start.setDate(today.getDate() - (i * 7) - ((today.getDay() + 6) % 7));
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const orders = 8 + i * 2;
    const gross = orders * 95;
    out.push({
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
      orders,
      gross,
      commission: +(gross * 0.1).toFixed(2),
      net: +(gross * 0.9).toFixed(2),
      status: i === 0 ? "pending" : "available",
    });
  }
  return out;
}

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [vendor, setVendor] = useState<VendorRecord | null>(null);
  const [stats, setStats] = useState<VendorStats | null>(null);
  const [periods, setPeriods] = useState<PayoutPeriod[] | null>(null);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>("not_connected");
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectNotice, setConnectNotice] = useState<string | null>(null);
  const search = useSearch({ strict: false }) as { connect?: string };

  useEffect(() => {
    if (demo) return;
    (async () => {
      try {
        const v = await getMyVendor(user!.id);
        setVendor(v);
        if (v) {
          const [s, p, po] = await Promise.all([
            getVendorStats(v.id),
            getPayoutPeriods(v.id),
            listVendorPayouts(v.id),
          ]);
          setStats(s); setPeriods(p); setPayouts(po);
          setConnectStatus((v.stripe_connect_status as ConnectStatus | undefined) ?? "not_connected");
        }
      } finally { setLoading(false); }
    })();
  }, [demo, user]);

  const useDemo = demo || !stats;
  const s = useDemo
    ? { payoutAvailable: 845.2, payoutPending: 312.4, payoutLifetime: 18420, commission: 1840, gmv: 12480 }
    : stats!;
  const rows: PayoutPeriod[] = useDemo || !periods || periods.length === 0 ? buildDemoPeriods() : periods;

  const effectiveStatus: ConnectStatus = demo ? "not_connected" : connectStatus;
  const readiness =
    effectiveStatus === "enabled"
      ? "This account is ready to receive payouts once transfer scheduling goes live."
      : effectiveStatus === "restricted"
        ? "Stripe still needs more information before charges or payouts can be enabled."
        : effectiveStatus === "onboarding"
          ? "Onboarding started but not submitted. Finish the Stripe form to continue."
          : "No payout account connected yet. Your store must be approved before onboarding.";

  const applyResult = (r: { status: ConnectStatus; pending: boolean; reason?: string }) => {
    setConnectStatus(r.status);
    setConnectNotice(r.pending ? (r.reason ?? "Stripe setup required") : null);
    if (!r.pending) toast.success("Stripe status updated");
    else if (r.reason) toast.info(r.reason);
  };

  const reloadVendor = async () => {
    if (!user) return;
    const v = await getMyVendor(user.id);
    setVendor(v);
  };

  const handleConnect = async () => {
    if (!vendor) { toast.error("Create your store profile first"); return; }
    setConnectBusy(true);
    try {
      const r = await createConnectAccount(vendor.id);
      applyResult(r);
      await reloadVendor();
      if (!r.pending) await handleOnboard();
    } finally { setConnectBusy(false); }
  };

  const handleOnboard = async () => {
    if (!vendor) return;
    setConnectBusy(true);
    try {
      const link = await createConnectOnboardingLink(vendor.id);
      if (link.url) window.location.href = link.url;
      else setConnectNotice(link.reason ?? "Stripe setup required");
    } finally { setConnectBusy(false); }
  };

  const handleRefresh = async () => {
    if (!vendor) return;
    setConnectBusy(true);
    try {
      applyResult(await refreshConnectStatus(vendor.id));
      await reloadVendor();
    } finally { setConnectBusy(false); }
  };

  return (
    <div>
      <div className="mb-6">
        {useDemo ? <DemoBanner label={demo ? "Preview mode" : "No data yet"} /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Payouts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your earnings from delivered orders</p>
      </div>
      {demo && <PreviewModeNotice />}

      {!useDemo && !vendor?.payouts_enabled && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-deal/40 bg-deal/5 p-3 text-xs">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-deal" />
          <div>
            <strong className="text-deal">Payout activation required.</strong>{" "}
            <span className="text-muted-foreground">Connect a payout account (Stripe Connect) before funds can be transferred. Available balance accrues meanwhile.</span>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Available" value={formatCAD(s.payoutAvailable)} icon={Wallet} accent="success" />
        <StatCard label="Pending" value={formatCAD(s.payoutPending)} icon={Clock} accent="deal" />
        <StatCard label="Lifetime paid" value={formatCAD(s.payoutLifetime)} icon={DollarSign} />
        <StatCard label="Commission paid" value={formatCAD(s.commission)} icon={DollarSign} />
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-navy">
            {payouts.length > 0 ? "Payout history" : "Payout history (estimated weekly)"}
          </h2>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Info size={12} />{" "}
            {payouts.length > 0 ? "Transfers are released manually by 1LV.CA." : "No payout records issued yet."}
          </span>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : payouts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 text-left font-medium">Period</th>
                  <th className="py-2 text-right font-medium">Gross</th>
                  <th className="py-2 text-right font-medium">Commission</th>
                  <th className="py-2 text-right font-medium">Refunds</th>
                  <th className="py-2 text-right font-medium">Holds</th>
                  <th className="py-2 text-right font-medium">Net</th>
                  <th className="py-2 text-right font-medium">Paid</th>
                  <th className="py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} className="border-b border-border/50">
                    <td className="py-2 font-medium text-navy">{p.period_start} → {p.period_end}</td>
                    <td className="py-2 text-right">{formatCAD(Number(p.gross_amount))}</td>
                    <td className="py-2 text-right text-muted-foreground">{formatCAD(Number(p.commission_amount))}</td>
                    <td className="py-2 text-right text-muted-foreground">{formatCAD(Number(p.refund_amount))}</td>
                    <td className="py-2 text-right text-muted-foreground">{formatCAD(Number(p.dispute_hold_amount))}</td>
                    <td className="py-2 text-right font-semibold text-navy">{formatCAD(Number(p.net_amount))}</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${payoutStatusClass(p.status)}`}>
                        {payoutStatusLabel(p.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 text-left font-medium">Period</th>
                  <th className="py-2 text-right font-medium">Orders</th>
                  <th className="py-2 text-right font-medium">Gross</th>
                  <th className="py-2 text-right font-medium">Commission</th>
                  <th className="py-2 text-right font-medium">Net</th>
                  <th className="py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.periodStart} className="border-b border-border/50">
                    <td className="py-2 font-medium text-navy">{r.periodStart} → {r.periodEnd}</td>
                    <td className="py-2 text-right">{r.orders}</td>
                    <td className="py-2 text-right">{formatCAD(r.gross)}</td>
                    <td className="py-2 text-right text-muted-foreground">{formatCAD(r.commission)}</td>
                    <td className="py-2 text-right font-semibold text-navy">{formatCAD(r.net)}</td>
                    <td className="py-2 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.status === "available" ? "bg-success/10 text-success" : "bg-deal/10 text-deal"}`}>
                        {r.status === "available" ? "Available" : "Pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Estimates only — based on delivered orders. Official payout records appear here once issued.
            </p>
          </div>
        )}
      </div>


      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 text-lg font-bold text-navy">Stripe Connect (Express)</h2>
        <p className="text-sm text-muted-foreground">
          Status:{" "}
          <span className="font-semibold text-navy">{connectLabel(effectiveStatus)}</span>
        </p>

        {search.connect === "success" && (
          <div className="mt-3 rounded-lg border border-success/40 bg-success/5 p-3 text-xs text-success">
            Onboarding submitted. Use “Refresh Stripe status” to pull the latest capability state.
          </div>
        )}
        {search.connect === "refresh" && (
          <div className="mt-3 rounded-lg border border-deal/40 bg-deal/5 p-3 text-xs text-deal">
            Onboarding was interrupted. Continue onboarding to finish verification.
          </div>
        )}

        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          <li>Details submitted: <span className="font-semibold text-navy">{vendor?.stripe_details_submitted ? "yes" : "no"}</span></li>
          <li>Charges enabled: <span className="font-semibold text-navy">{vendor?.charges_enabled ? "yes" : "no"}</span></li>
          <li>Payouts enabled: <span className="font-semibold text-navy">{vendor?.payouts_enabled ? "yes" : "no"}</span></li>
        </ul>

        <p className="mt-3 text-xs text-muted-foreground">{readiness}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {effectiveStatus === "not_connected" ? (
            <button
              type="button" disabled={connectBusy || demo} onClick={handleConnect}
              className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {connectBusy ? "Working…" : "Connect payout account"}
            </button>
          ) : (
            <button
              type="button" disabled={connectBusy || demo} onClick={handleOnboard}
              className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {connectBusy ? "Working…" : "Continue onboarding"}
            </button>
          )}
          <button
            type="button" disabled={connectBusy || demo} onClick={handleRefresh}
            className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-navy disabled:opacity-60"
          >
            Refresh Stripe status
          </button>
        </div>

        {connectNotice && <p className="mt-2 text-xs text-deal">{connectNotice}</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          Automatic transfers are not enabled yet — onboarding only prepares the payout account.
        </p>
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Commission rate: <span className="font-semibold text-navy">{vendor ? `${Math.round(Number(vendor.commission_rate) * 100)}%` : "10%"}</span> of GMV ({formatCAD(s.gmv)} lifetime).
      </div>
    </div>
  );
}

export const Route = createFileRoute("/vendor/payouts")({ component: Page });
