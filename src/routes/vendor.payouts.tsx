import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { Wallet, Clock, DollarSign, AlertTriangle } from "lucide-react";
import { formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { getMyVendor, type VendorRecord } from "@/services/vendors";
import { getVendorStats, getVendorPayoutHistory, type VendorStats, type PayoutPeriod } from "@/services/vendor-stats";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [vendor, setVendor] = useState<VendorRecord | null>(null);
  const [stats, setStats] = useState<VendorStats | null>(null);
  const [history, setHistory] = useState<PayoutPeriod[]>([]);
  const [loading, setLoading] = useState(!demo);

  useEffect(() => {
    if (demo) return;
    (async () => {
      try {
        const v = await getMyVendor(user!.id);
        setVendor(v);
        if (v) {
          const [s, h] = await Promise.all([getVendorStats(v.id), getVendorPayoutHistory(v.id)]);
          setStats(s); setHistory(h);
        }
      } finally { setLoading(false); }
    })();
  }, [demo, user]);

  const useDemo = demo || !stats;
  const s = useDemo
    ? { payoutAvailable: 845.2, payoutPending: 312.4, payoutLifetime: 18420, commission: 1840, gmv: 12480 }
    : stats!;

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

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-lg font-bold text-navy">Payout history</h2>
          <p className="mb-3 text-[11px] text-muted-foreground">Weekly buckets from delivered vendor orders. Stripe transfers not connected yet — these are estimated payouts.</p>
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (() => {
            const rows: PayoutPeriod[] = (useDemo || history.length === 0)
              ? [
                  { period: "2026-05-25 → 2026-05-31", start: "2026-05-25", end: "2026-05-31", orders: 12, gross: 980, commission: 98, net: 882, status: "pending" },
                  { period: "2026-05-18 → 2026-05-24", start: "2026-05-18", end: "2026-05-24", orders: 9, gross: 720, commission: 72, net: 648, status: "pending" },
                  { period: "2026-05-11 → 2026-05-17", start: "2026-05-11", end: "2026-05-17", orders: 14, gross: 1140, commission: 114, net: 1026, status: "pending" },
                ]
              : history;
            return (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground"><tr className="border-b border-border"><th className="px-2 py-1 text-left">Period</th><th className="px-2 py-1 text-right">Orders</th><th className="px-2 py-1 text-right">Gross</th><th className="px-2 py-1 text-right">Commission</th><th className="px-2 py-1 text-right">Net</th><th className="px-2 py-1 text-right">Status</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.start} className="border-b border-border/50">
                        <td className="px-2 py-1.5">{r.period}</td>
                        <td className="px-2 py-1.5 text-right">{r.orders}</td>
                        <td className="px-2 py-1.5 text-right">{formatCAD(r.gross)}</td>
                        <td className="px-2 py-1.5 text-right">{formatCAD(r.commission)}</td>
                        <td className="px-2 py-1.5 text-right font-semibold text-navy">{formatCAD(r.net)}</td>
                        <td className="px-2 py-1.5 text-right capitalize"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.status === "paid" ? "bg-success/15 text-success" : "bg-deal/15 text-deal"}`}>{r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-lg font-bold text-navy">Stripe Connect</h2>
          <p className="text-sm text-muted-foreground">
            Status: <span className="font-semibold capitalize text-navy">
              {vendor?.stripe_connect_account_id ? (vendor.payouts_enabled ? "active" : "pending verification") : "not connected"}
            </span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Connect activation will be enabled in the payments phase.</p>
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Commission rate: <span className="font-semibold text-navy">{vendor ? `${Math.round(Number(vendor.commission_rate) * 100)}%` : "10%"}</span> of GMV ({formatCAD(s.gmv)} lifetime).
      </div>
    </div>
  );
}

export const Route = createFileRoute("/vendor/payouts")({ component: Page });
