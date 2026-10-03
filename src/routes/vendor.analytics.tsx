import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";
import { StatCard } from "@/components/StatCard";
import { formatCAD } from "@/lib/data";
import { isDemoMode } from "@/lib/demo-mode";
import { useAuth } from "@/hooks/use-auth";
import { getMyVendor } from "@/services/vendors";
import {
  getVendorDailyPerformance,
  getVendorPerformanceDashboard,
  getVendorTopProducts,
  type VendorDailyPerformance,
  type VendorPerformanceDashboard,
  type VendorTopProduct,
} from "@/services/vendor-stats";
import {
  Clock3,
  DollarSign,
  PackageCheck,
  RotateCcw,
  ShoppingBag,
  Truck,
} from "lucide-react";

function demoDashboard(): VendorPerformanceDashboard {
  return {
    period_days: 30,
    period_start: new Date(Date.now() - 29 * 86400000).toISOString(),
    products: {
      total: 24,
      draft: 3,
      pending: 2,
      active: 18,
      rejected: 1,
      archived: 0,
    },
    orders: {
      total: 132,
      pending: 7,
      accepted: 4,
      processing: 9,
      shipped: 21,
      delivered: 86,
      cancelled: 5,
    },
    financials: {
      gross_merchandise: 12480,
      refunds: 286.45,
      commission: 1248,
      payout_estimate: 10945.55,
      payouts_paid: 9120,
    },
    fulfillment: {
      shipments: 116,
      on_time_shipments: 109,
      on_time_ship_rate: 93.97,
      delivered_shipments: 86,
      on_time_deliveries: 79,
      on_time_delivery_rate: 91.86,
      exceptions: 3,
      average_handling_hours: 18.4,
    },
    returns: {
      total: 7,
      open: 2,
      returned_units: 8,
      delivered_units: 151,
      unit_return_rate: 5.3,
    },
  };
}

function demoDaily(): VendorDailyPerformance[] {
  const rows: VendorDailyPerformance[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const orders = 4 + ((i * 3) % 6);
    const gross = orders * (60 + ((i * 17) % 40));
    rows.push({
      sale_date: date.toISOString().slice(0, 10),
      orders,
      gross_merchandise: gross,
      refunds: i % 3 === 0 ? 24.99 : 0,
      commission: +(gross * 0.1).toFixed(2),
      payout_estimate: +(gross * 0.9).toFixed(2),
    });
  }
  return rows;
}

function demoTop(): VendorTopProduct[] {
  return [
    { product_id: "demo-1", title: "Wireless Headphones", units_sold: 38, gross_merchandise: 3419.62, order_count: 34 },
    { product_id: "demo-2", title: "Travel Backpack", units_sold: 27, gross_merchandise: 2159.73, order_count: 25 },
    { product_id: "demo-3", title: "Smart Desk Lamp", units_sold: 19, gross_merchandise: 1519.81, order_count: 18 },
  ];
}

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [dashboard, setDashboard] = useState<VendorPerformanceDashboard | null>(
    demo ? demoDashboard() : null,
  );
  const [daily, setDaily] = useState<VendorDailyPerformance[]>(
    demo ? demoDaily() : [],
  );
  const [top, setTop] = useState<VendorTopProduct[]>(
    demo ? demoTop() : [],
  );
  const [loading, setLoading] = useState(!demo);

  useEffect(() => {
    if (demo || !user) return;

    let active = true;
    void (async () => {
      try {
        const vendor = await getMyVendor(user.id);
        if (!vendor || !active) return;

        const [nextDashboard, nextDaily, nextTop] = await Promise.all([
          getVendorPerformanceDashboard(vendor.id, 30),
          getVendorDailyPerformance(vendor.id, 7),
          getVendorTopProducts(vendor.id, 30, 10),
        ]);

        if (!active) return;
        setDashboard(nextDashboard);
        setDaily(nextDaily);
        setTop(nextTop);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [demo, user]);

  const value = dashboard;
  const maxGross = Math.max(
    1,
    ...daily.map((row) => row.gross_merchandise),
  );

  return (
    <div>
      <div className="mb-6">
        {demo ? <DemoBanner label="Preview mode" /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">
          Analytics
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          30-day commerce, fulfillment and return performance from 1LV records
        </p>
      </div>

      {demo ? <PreviewModeNotice /> : null}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : null}

      {value ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Gross merchandise"
              value={formatCAD(value.financials.gross_merchandise)}
              icon={DollarSign}
              accent="success"
            />
            <StatCard
              label="Refunds"
              value={formatCAD(value.financials.refunds)}
              icon={RotateCcw}
              accent="deal"
            />
            <StatCard
              label="Net payout estimate"
              value={formatCAD(value.financials.payout_estimate)}
              icon={PackageCheck}
            />
            <StatCard
              label="Paid orders"
              value={value.orders.total}
              icon={ShoppingBag}
            />
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <StatCard
              label="On-time ship rate"
              value={`${value.fulfillment.on_time_ship_rate.toFixed(1)}%`}
              icon={Truck}
              accent="success"
            />
            <StatCard
              label="On-time delivery"
              value={`${value.fulfillment.on_time_delivery_rate.toFixed(1)}%`}
              icon={PackageCheck}
              accent="success"
            />
            <StatCard
              label="Avg. handling"
              value={`${value.fulfillment.average_handling_hours.toFixed(1)}h`}
              icon={Clock3}
            />
            <StatCard
              label="Unit return rate"
              value={`${value.returns.unit_return_rate.toFixed(1)}%`}
              icon={RotateCcw}
              accent="deal"
            />
          </div>

          <div className="mt-8 rounded-xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-navy">
                  Orders by status
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {value.fulfillment.exceptions} shipment exception(s) ·{" "}
                  {value.returns.open} open return(s)
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                Paid payouts: {formatCAD(value.financials.payouts_paid)}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
              {(
                [
                  "pending",
                  "accepted",
                  "processing",
                  "shipped",
                  "delivered",
                  "cancelled",
                ] as const
              ).map((key) => (
                <div
                  key={key}
                  className="rounded-md border border-border p-3 text-center"
                >
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {key}
                  </div>
                  <div className="mt-1 text-lg font-bold text-navy">
                    {value.orders[key]}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-border bg-card p-6">
            <div className="flex items-end justify-between">
              <h3 className="text-sm font-semibold text-navy">
                Gross merchandise — last 7 days
              </h3>
              <span className="text-xs text-muted-foreground">
                {demo ? "Demo data" : "Live 1LV data"}
              </span>
            </div>
            <div className="mt-4 flex h-40 items-end gap-2">
              {daily.map((row) => {
                const height = Math.max(
                  4,
                  Math.round((row.gross_merchandise / maxGross) * 140),
                );
                return (
                  <div
                    key={row.sale_date}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <div
                      className="w-full rounded-t bg-electric/80 transition hover:bg-electric"
                      style={{ height: `${height}px` }}
                      title={`${row.sale_date}: ${formatCAD(row.gross_merchandise)}`}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {row.sale_date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 text-left font-medium">Date</th>
                    <th className="py-2 text-right font-medium">Orders</th>
                    <th className="py-2 text-right font-medium">Gross</th>
                    <th className="py-2 text-right font-medium">Refunds</th>
                    <th className="py-2 text-right font-medium">Payout est.</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.map((row) => (
                    <tr
                      key={row.sale_date}
                      className="border-b border-border/50"
                    >
                      <td className="py-2 font-medium text-navy">
                        {row.sale_date}
                      </td>
                      <td className="py-2 text-right">{row.orders}</td>
                      <td className="py-2 text-right">
                        {formatCAD(row.gross_merchandise)}
                      </td>
                      <td className="py-2 text-right">
                        {formatCAD(row.refunds)}
                      </td>
                      <td className="py-2 text-right font-semibold text-navy">
                        {formatCAD(row.payout_estimate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-8">
            <h3 className="mb-3 text-lg font-bold text-navy">
              Top products — real paid order items
            </h3>
            <DataTable
              columns={[
                { key: "title", label: "Product" },
                { key: "units", label: "Units" },
                { key: "orders", label: "Orders" },
                { key: "gross", label: "Gross" },
              ]}
              rows={top.map((product) => ({
                title: product.title,
                units: String(product.units_sold),
                orders: String(product.order_count),
                gross: formatCAD(product.gross_merchandise),
              }))}
              empty="No paid product sales in this period."
            />
          </div>
        </>
      ) : !loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No live performance data is available for this vendor yet.
        </div>
      ) : null}
    </div>
  );
}

export const Route = createFileRoute("/vendor/analytics")({
  component: Page,
});
