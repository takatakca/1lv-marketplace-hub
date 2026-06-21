import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import { vendors as demoVendors } from "@/lib/data";
import { listAllVendors, setVendorStatus, type VendorRecord, type VendorStatus } from "@/services/vendors";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

const STATUS = ["all", "pending", "active", "suspended", "rejected"] as const;
const SUBS = ["all", "none", "active", "trialing", "past_due", "unpaid", "canceled"] as const;

function badge(text: string, tone: "success" | "deal" | "muted" | "destructive" = "muted") {
  const map = {
    success: "bg-success/10 text-success",
    deal: "bg-deal/10 text-deal",
    destructive: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[tone]}`}>{text}</span>;
}

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [rows, setRows] = useState<VendorRecord[] | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<(typeof STATUS)[number]>("all");
  const [sub, setSub] = useState<(typeof SUBS)[number]>("all");
  const [payoutOnly, setPayoutOnly] = useState(false);

  const refresh = async () => {
    try { setRows(await listAllVendors()); } finally { setLoading(false); }
  };
  useEffect(() => { if (!demo) refresh(); }, [demo]);

  const act = async (id: string, s: VendorStatus) => {
    try { await setVendorStatus(id, s); toast.success("Vendor " + s); await refresh(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const useDemo = demo || (rows && rows.length === 0);
  const source: VendorRecord[] = useDemo
    ? demoVendors.map((v, i) => ({
        id: "demo-" + i, user_id: "u-" + i, store_name: v.name, slug: v.slug,
        description: null, business_name: v.name, contact_email: v.slug + "@1lv.ca",
        phone: null, address: null, city: null, province: null, postal_code: null, country: "CA",
        shipping_policy: null, return_policy: null, logo_url: null, banner_url: null,
        status: (["active", "active", "pending", "active", "suspended", "active"][i % 6]) as string,
        subscription_status: (["active", "active", "none", "past_due", "active", "trialing"][i % 6]) as string,
        subscription_plan: ["Growth", "Scale", "Starter", "Growth", "Scale", "Growth"][i % 6],
        stripe_customer_id: null, stripe_subscription_id: null, stripe_connect_account_id: null,
        payouts_enabled: i % 2 === 0, charges_enabled: i % 2 === 0,
        commission_rate: 0.1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }))
    : rows ?? [];

  const filtered = useMemo(() => {
    return source.filter((v) => {
      if (status !== "all" && v.status !== status) return false;
      if (sub !== "all" && v.subscription_status !== sub) return false;
      if (payoutOnly && !v.payouts_enabled) return false;
      if (q.trim()) {
        const t = q.toLowerCase();
        if (!v.store_name.toLowerCase().includes(t) && !(v.contact_email ?? "").toLowerCase().includes(t)) return false;
      }
      return true;
    });
  }, [source, status, sub, payoutOnly, q]);

  const display = filtered.map((v) => {
    const missing: string[] = [];
    if (!v.business_name) missing.push("business");
    if (!v.contact_email) missing.push("email");
    if (!v.address) missing.push("address");
    return {
      id: v.id,
      slug: v.slug,
      store: (
        <div>
          <div className="font-medium text-navy">{v.store_name}</div>
          <div className="text-xs text-muted-foreground">{v.contact_email ?? "no email"}</div>
        </div>
      ),
      status: badge(
        v.status,
        v.status === "active" ? "success" : v.status === "pending" ? "deal" : "destructive",
      ),
      sub: badge(
        v.subscription_status,
        v.subscription_status === "active" || v.subscription_status === "trialing"
          ? "success"
          : v.subscription_status === "past_due" || v.subscription_status === "unpaid"
            ? "destructive"
            : "muted",
      ),
      payout: v.payouts_enabled ? badge("ready", "success") : badge("not connected", "muted"),
      missing: missing.length ? badge(`${missing.length} missing`, "deal") : badge("complete", "success"),
      links: (
        <div className="flex gap-2 text-xs">
          <Link to="/store/$slug" params={{ slug: v.slug }} className="text-electric hover:underline">Store</Link>
        </div>
      ),
      actions: (
        <div className="flex gap-2 text-xs">
          <button onClick={() => act(v.id, "active")} className="text-success">Approve</button>
          <button onClick={() => act(v.id, "rejected")} className="text-destructive">Reject</button>
          <button onClick={() => act(v.id, "suspended")} className="text-destructive/80">Suspend</button>
          <button onClick={() => act(v.id, "pending")} className="text-muted-foreground">Reset</button>
        </div>
      ),
    };
  });

  return (
    <>
      <div className="mb-6">
        {useDemo ? <DemoBanner label={demo ? "Preview mode" : "No vendors yet"} /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Vendors</h1>
        <p className="text-sm text-muted-foreground">Search, filter, approve and moderate marketplace sellers.</p>
      </div>
      {demo && <PreviewModeNotice />}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search store or email"
          className="min-w-[220px] rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as (typeof STATUS)[number])} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          {STATUS.map((s) => <option key={s} value={s}>Status: {s}</option>)}
        </select>
        <select value={sub} onChange={(e) => setSub(e.target.value as (typeof SUBS)[number])} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          {SUBS.map((s) => <option key={s} value={s}>Plan: {s}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-navy">
          <input type="checkbox" checked={payoutOnly} onChange={(e) => setPayoutOnly(e.target.checked)} /> Payouts ready
        </label>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} of {source.length}</span>
      </div>

      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
        <DataTable
          columns={[
            { key: "store", label: "Store" },
            { key: "status", label: "Status" },
            { key: "sub", label: "Plan" },
            { key: "payout", label: "Payouts" },
            { key: "missing", label: "Profile" },
            { key: "links", label: "Public" },
            { key: "actions", label: "" },
          ]}
          rows={display}
        />
      )}
    </>
  );
}

export const Route = createFileRoute("/admin/vendors")({ component: Page });
