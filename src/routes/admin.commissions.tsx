import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DollarSign, Store } from "lucide-react";
import { DataTable } from "@/components/DataTable";
import { StatCard } from "@/components/StatCard";
import { formatCAD } from "@/lib/data";
import {
  getAdminCommissions,
  type AdminCommissionSummary,
} from "@/lib/admin-marketplace.functions";

function Page() {
  const [data, setData] = useState<AdminCommissionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getAdminCommissions()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load commissions.");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <div className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-success">
          Live financial data
        </div>
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Commissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Marketplace commission values are derived from stored vendor orders and current vendor rates.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : !data ? (
        <div className="text-sm text-muted-foreground">Loading commissions…</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Default rate" value={`${(data.defaultRate * 100).toFixed(1)}%`} icon={DollarSign} />
            <StatCard label="Commission revenue (30d)" value={formatCAD(data.revenue30d)} icon={DollarSign} accent="success" />
            <StatCard label="All-time commission" value={formatCAD(data.totalRevenue)} icon={DollarSign} />
            <StatCard label="Active vendors" value={data.activeVendors} icon={Store} accent="electric" />
          </div>

          <h2 className="mb-3 mt-8 text-lg font-bold text-navy">Vendor commission ledger</h2>
          <DataTable
            columns={[
              { key: "vendor", label: "Vendor" },
              { key: "plan", label: "Plan" },
              { key: "status", label: "Vendor status" },
              { key: "rate", label: "Commission" },
              { key: "recent", label: "30d revenue" },
              { key: "total", label: "All-time" },
            ]}
            rows={data.vendors.map((vendor) => ({
              vendor: vendor.storeName,
              plan: vendor.plan,
              status: vendor.status,
              rate: `${(vendor.rate * 100).toFixed(2)}%`,
              recent: formatCAD(vendor.commission30d),
              total: formatCAD(vendor.totalCommission),
            }))}
            empty="No vendors or commission records yet."
          />
        </>
      )}
    </>
  );
}

export const Route = createFileRoute("/admin/commissions")({ component: Page });
