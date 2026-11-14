import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, CreditCard, DollarSign } from "lucide-react";
import { DataTable } from "@/components/DataTable";
import { StatCard } from "@/components/StatCard";
import { formatCAD } from "@/lib/data";
import {
  getAdminSubscriptions,
  type AdminSubscriptionSummary,
} from "@/lib/admin-marketplace.functions";

function Page() {
  const [data, setData] = useState<AdminSubscriptionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getAdminSubscriptions()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load subscriptions.");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <div className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-success">
          Live subscription state
        </div>
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Subscriptions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vendor subscription status is synchronized from Stripe webhooks. No billing date is invented when Stripe has not supplied one.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : !data ? (
        <div className="text-sm text-muted-foreground">Loading subscriptions…</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Estimated monthly recurring" value={formatCAD(data.monthlyRecurringCad)} icon={DollarSign} accent="success" />
            <StatCard label="Active" value={data.activeSubscriptions} icon={CreditCard} accent="electric" />
            <StatCard label="Trialing" value={data.trialingSubscriptions} icon={CreditCard} />
            <StatCard label="Past due / unpaid" value={data.pastDueSubscriptions} icon={AlertTriangle} accent="deal" />
          </div>

          <div className="mt-8">
            <DataTable
              columns={[
                { key: "vendor", label: "Vendor" },
                { key: "plan", label: "Plan" },
                { key: "status", label: "Status" },
                { key: "monthly", label: "Monthly CAD" },
                { key: "commission", label: "Commission" },
                { key: "stripe", label: "Stripe billing" },
                { key: "joined", label: "Vendor since" },
              ]}
              rows={data.vendors.map((vendor) => ({
                vendor: vendor.storeName,
                plan: vendor.plan,
                status: vendor.status,
                monthly: vendor.monthlyCad == null ? "Not mapped" : formatCAD(vendor.monthlyCad),
                commission:
                  vendor.commissionRate == null
                    ? "Not mapped"
                    : `${(vendor.commissionRate * 100).toFixed(2)}%`,
                stripe: vendor.billingConnected ? "Connected" : "No subscription reference",
                joined: new Date(vendor.createdAt).toLocaleDateString("en-CA"),
              }))}
              empty="No vendor subscriptions yet."
            />
          </div>
        </>
      )}
    </>
  );
}

export const Route = createFileRoute("/admin/subscriptions")({ component: Page });
