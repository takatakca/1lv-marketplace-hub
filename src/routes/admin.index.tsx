import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { DataTable } from "@/components/DataTable";
import {
  AlertTriangle,
  CreditCard,
  DollarSign,
  Package,
  ShieldCheck,
  ShoppingBag,
  Store,
  Wallet,
} from "lucide-react";
import { products, formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoBanner } from "@/components/DemoBanner";
import {
  getAdminDashboardSummary,
  type AdminDashboardSummary,
} from "@/lib/admin-marketplace.functions";

const demoRecent = products.slice(0, 6).map((product, index) => ({
  order: "1LV-" + (10240 + index),
  customer: ["Jane", "Marc", "Sarah", "Liam", "Noor", "Ava"][index],
  total: formatCAD(product.price),
  payment: ["Paid", "Paid", "Refunded", "Paid", "Paid", "Pending"][index],
  fulfillment: ["Processing", "Shipped", "Cancelled", "Delivered", "Processing", "Pending"][index],
  date: "Preview",
}));

const demoSummary: AdminDashboardSummary = {
  gmv: 184220,
  orderCount: 2841,
  pendingVendors: 6,
  activeVendors: 42,
  pendingProducts: 18,
  activeProducts: 312,
  unpaidVendors: 4,
  openDisputes: 3,
  commissionRevenue: 16580,
  payoutLiability: 38420,
  recentOrders: [],
};

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(
    demo ? demoSummary : null,
  );
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo) {
      setSummary(demoSummary);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    void getAdminDashboardSummary()
      .then((result) => {
        if (active) setSummary(result);
      })
      .catch((err) => {
        if (!active) return;
        setSummary(null);
        setError(
          err instanceof Error
            ? err.message
            : "Could not load marketplace overview.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [demo]);

  const recentRows = useMemo(() => {
    if (demo) return demoRecent;
    return (summary?.recentOrders ?? []).map((order) => ({
      order: order.orderNumber,
      customer: order.customerEmail ?? "Guest / unavailable",
      total: formatCAD(order.total),
      payment: order.paymentStatus,
      fulfillment: order.fulfillmentStatus,
      date: new Date(order.createdAt).toLocaleDateString("en-CA"),
    }));
  }, [demo, summary]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading marketplace overview…</div>;
  }

  if (error || !summary) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">
        {error ?? "Marketplace overview is unavailable."}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        {demo ? <DemoBanner label="Preview mode" /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">
          Marketplace overview
        </h1>
        <p className="text-sm text-muted-foreground">
          {demo
            ? "Preview metrics only. Sign in as an administrator for live marketplace operations."
            : "Live marketplace operational health, revenue, moderation queues and disputes."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total GMV"
          value={formatCAD(summary.gmv)}
          icon={DollarSign}
          accent="success"
        />
        <StatCard label="Total orders" value={summary.orderCount} icon={ShoppingBag} />
        <StatCard
          label="Active vendors"
          value={summary.activeVendors}
          icon={Store}
          accent="electric"
        />
        <StatCard
          label="Pending vendors"
          value={summary.pendingVendors}
          icon={ShieldCheck}
          accent="deal"
        />
        <StatCard
          label="Active products"
          value={summary.activeProducts}
          icon={Package}
          accent="electric"
        />
        <StatCard
          label="Pending products"
          value={summary.pendingProducts}
          icon={ShieldCheck}
          accent="deal"
        />
        <StatCard
          label="Unpaid / past_due"
          value={summary.unpaidVendors}
          icon={CreditCard}
          accent="deal"
        />
        <StatCard
          label="Open disputes"
          value={summary.openDisputes}
          icon={AlertTriangle}
          accent="deal"
        />
        <StatCard
          label="Commission revenue"
          value={formatCAD(summary.commissionRevenue)}
          icon={DollarSign}
          accent="success"
        />
        <StatCard
          label="Payout liability"
          value={formatCAD(summary.payoutLiability)}
          icon={Wallet}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-bold text-navy">Recent orders</h2>
          <DataTable
            columns={[
              { key: "order", label: "Order" },
              { key: "customer", label: "Customer" },
              { key: "total", label: "Total" },
              { key: "payment", label: "Payment" },
              { key: "fulfillment", label: "Fulfillment" },
              { key: "date", label: "Date" },
            ]}
            rows={recentRows}
            empty={
              demo
                ? "Preview orders are unavailable."
                : "No marketplace orders yet. Real orders will appear here after checkout."
            }
          />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-navy">Queues</h2>
          <ul className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
            <li className="flex justify-between">
              <span>Vendor applications waiting</span>
              <span className="font-semibold text-navy">{summary.pendingVendors}</span>
            </li>
            <li className="flex justify-between">
              <span>Product submissions waiting</span>
              <span className="font-semibold text-navy">{summary.pendingProducts}</span>
            </li>
            <li className="flex justify-between">
              <span>Vendors with billing issues</span>
              <span className="font-semibold text-deal">{summary.unpaidVendors}</span>
            </li>
            <li className="flex justify-between">
              <span>Open disputes</span>
              <span className="font-semibold text-deal">{summary.openDisputes}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/admin/")({ component: Page });
