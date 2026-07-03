import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { Wallet, Clock, DollarSign, AlertTriangle, Info } from "lucide-react";
import { formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { getMyVendor, type VendorRecord } from "@/services/vendors";
import { getVendorStats, getPayoutPeriods, type VendorStats, type PayoutPeriod } from "@/services/vendor-stats";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

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
  const [loading, setLoading] = useState(!demo);

  useEffect(() => {
    if (demo) return;
    (async () => {
      try {
        const v = await getMyVendor(user!.id);
        setVendor(v);
        if (v) {
          const [s, p] = await Promise.all([getVendorStats(v.id), getPayoutPeriods(v.id)]);
          setStats(s); setPeriods(p);
        }
      } finally { setLoading(false); }
    })();
  }, [demo, user]);

  const useDemo = demo || !stats;
  const s = useDemo
    ? { payoutAvailable: 845.2, payoutPending: 312.4, payoutLifetime: 18420, commission: 1840, gmv: 12480 }
    : stats!;
  const rows: PayoutPeriod[] = useDemo || !periods || periods.length === 0 ? buildDemoPeriods() : periods;

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
          <h2 className="text-lg font-bold text-navy">Payout history (weekly)</h2>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Info size={12} /> Stripe transfers not connected yet.
          </span>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
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
          </div>
        )}
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-lg font-bold text-navy">Stripe Connect</h2>
        <p className="text-sm text-muted-foreground">
          Status: <span className="font-semibold capitalize text-navy">
            {!vendor?.stripe_connect_account_id
              ? "not connected"
              : !vendor.charges_enabled
                ? "connected — charges disabled"
                : vendor.payouts_enabled
                  ? "payouts enabled"
                  : "connected — payouts pending"}
          </span>
        </p>
        <button
          type="button"
          onClick={() => alert("Stripe Connect onboarding will be enabled once server keys are configured.")}
          className="mt-3 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white"
        >
          {vendor?.stripe_connect_account_id ? "Manage payout account" : "Connect payout account"}
        </button>
        <p className="mt-2 text-xs text-muted-foreground">Payout activation requires Stripe Connect Express onboarding (server-side).</p>
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Commission rate: <span className="font-semibold text-navy">{vendor ? `${Math.round(Number(vendor.commission_rate) * 100)}%` : "10%"}</span> of GMV ({formatCAD(s.gmv)} lifetime).
      </div>
    </div>
  );
}

export const Route = createFileRoute("/vendor/payouts")({ component: Page });
