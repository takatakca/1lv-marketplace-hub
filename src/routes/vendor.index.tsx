import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { DollarSign, Package, ShoppingBag, FileEdit, Crown, Wallet, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { getMyVendor, type VendorRecord } from "@/services/vendors";
import { getVendorStats, type VendorStats } from "@/services/vendor-stats";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-deal/40 bg-deal/5 p-3 text-xs text-deal-foreground">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-deal" />
      <div>{children}</div>
    </div>
  );
}

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [vendor, setVendor] = useState<VendorRecord | null>(null);
  const [stats, setStats] = useState<VendorStats | null>(null);
  const [loading, setLoading] = useState(!demo);

  useEffect(() => {
    if (demo) return;
    (async () => {
      try {
        const v = await getMyVendor(user!.id);
        setVendor(v);
        if (v) setStats(await getVendorStats(v.id));
      } finally { setLoading(false); }
    })();
  }, [demo, user]);

  if (demo) {
    return (
      <div>
        <DemoBanner label="Preview mode" />
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Vendor overview</h1>
        <PreviewModeNotice />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total sales" value={formatCAD(12480)} delta="+12.4%" icon={DollarSign} accent="success" />
          <StatCard label="Pending orders" value={7} icon={ShoppingBag} accent="deal" />
          <StatCard label="Active products" value={24} icon={Package} />
          <StatCard label="Subscription" value="Growth" icon={Crown} accent="electric" />
        </div>
      </div>
    );
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  if (!vendor) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <h2 className="text-lg font-bold text-navy">Welcome — finish onboarding</h2>
        <p className="mt-2 text-sm text-muted-foreground">Create your store profile to start selling.</p>
        <Link to="/vendor/onboarding" className="mt-4 inline-flex rounded-md bg-electric px-4 py-2 text-sm font-semibold text-electric-foreground">Start onboarding</Link>
      </div>
    );
  }

  const s = stats!;
  const subActive = vendor.subscription_status === "active" || vendor.subscription_status === "trialing";
  const profileComplete = !!(vendor.business_name && vendor.contact_email && vendor.address && vendor.city && vendor.postal_code);
  const checklist = [
    { label: "Store profile complete", done: profileComplete },
    { label: "Subscription active", done: subActive },
    { label: "Admin approved", done: vendor.status === "active" },
    { label: "First product uploaded", done: s.products.total > 0 },
    { label: "Shipping & return policies", done: !!(vendor.shipping_policy && vendor.return_policy) },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Vendor overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Status: <span className="font-semibold capitalize">{vendor.status}</span> · Subscription:{" "}
          <span className="font-semibold capitalize">{vendor.subscription_status}</span>
        </p>
      </div>

      <div className="mb-6 space-y-2">
        {vendor.status === "pending" && <Warning>Your vendor account is <strong>pending admin review</strong>. You can prepare drafts but cannot submit for review yet.</Warning>}
        {vendor.status === "suspended" && <Warning>Your account is <strong>suspended</strong>. Contact support to restore selling privileges.</Warning>}
        {vendor.status === "rejected" && <Warning>Your application was <strong>rejected</strong>. Update your profile and contact support.</Warning>}
        {!subActive && <Warning>You don't have an active subscription. Publish-for-review is locked until you subscribe.</Warning>}
        {!profileComplete && <Warning>Profile is incomplete — add business name, contact, and address to enable payouts.</Warning>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="GMV (lifetime)" value={formatCAD(s.gmv)} icon={DollarSign} accent="success" />
        <StatCard label="Pending orders" value={s.orders.pending + s.orders.accepted + s.orders.processing} icon={ShoppingBag} accent="deal" />
        <StatCard label="Active products" value={s.products.active} icon={Package} />
        <StatCard label="Draft products" value={s.products.draft} icon={FileEdit} />
        <StatCard label="Subscription" value={vendor.subscription_plan ?? "—"} icon={Crown} accent={subActive ? "electric" : undefined} />
        <StatCard label="Available payout" value={formatCAD(s.payoutAvailable)} icon={Wallet} accent="success" />
        <StatCard label="Pending payout" value={formatCAD(s.payoutPending)} icon={Wallet} accent="deal" />
        <StatCard label="Commission paid" value={formatCAD(s.commission)} icon={DollarSign} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-lg font-bold text-navy">Order pipeline</h2>
          <div className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
            {(["pending","accepted","processing","shipped","delivered","cancelled"] as const).map((k) => (
              <div key={k} className="rounded-md border border-border p-3 text-center">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
                <div className="mt-1 text-lg font-bold text-navy">{s.orders[k]}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-bold text-navy">Onboarding</h2>
          <ul className="space-y-3 rounded-xl border border-border bg-card p-5">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-3 text-sm">
                {c.done ? <CheckCircle2 size={18} className="text-success" /> : <Circle size={18} className="text-muted-foreground" />}
                <span className={c.done ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
              </li>
            ))}
            <Link to="/vendor/onboarding" className="mt-2 block rounded-md bg-electric px-3 py-2 text-center text-xs font-semibold text-electric-foreground">Complete onboarding</Link>
          </ul>
        </div>
      </div>
    </div>
  );
}
export const Route = createFileRoute("/vendor/")({ component: Page });
