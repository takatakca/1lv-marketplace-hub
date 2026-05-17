import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { products as demoProducts, formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { getMyVendor } from "@/services/vendors";
import { listVendorOrders } from "@/services/orders";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [items, setItems] = useState<Awaited<ReturnType<typeof listVendorOrders>> | null>(null);
  const [loading, setLoading] = useState(!demo);

  useEffect(() => {
    if (demo) return;
    (async () => {
      try {
        const v = await getMyVendor(user!.id);
        if (!v) { setItems([]); return; }
        setItems(await listVendorOrders(v.id));
      } finally { setLoading(false); }
    })();
  }, [demo, user]);

  const useDemo = demo || (items && items.length === 0);
  const rows = useDemo
    ? demoProducts.slice(0, 10).map((p, i) => ({
        id: "demo-" + i, order: "1LV-" + (10240 + i),
        customer: ["Jane D.", "Marc P.", "Sarah K.", "Liam B.", "Noor A."][i % 5],
        date: new Date(2026, 4, 11 - i).toLocaleDateString("en-CA"),
        total: formatCAD(p.price), fulfillment: ["pending", "accepted", "processing", "shipped", "delivered"][i % 5],
        payment: "paid", tracking: i > 1 ? "1Z999AA" + i : "—",
      }))
    : (items ?? []).map((vo) => ({
        id: vo.id,
        order: vo.orders.order_number,
        customer: vo.orders.customer_email ?? "—",
        date: new Date(vo.orders.created_at).toLocaleDateString("en-CA"),
        total: formatCAD(Number(vo.subtotal)),
        fulfillment: vo.status,
        payment: vo.orders.payment_status,
        tracking: vo.tracking_number ?? "—",
      }));

  return (
    <div>
      <div className="mb-6">
        {useDemo ? <DemoBanner label={demo ? "Preview mode" : "No orders yet"} /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Orders</h1>
      </div>
      {demo && <PreviewModeNotice />}
      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
        <DataTable
          columns={[
            { key: "order", label: "Order" },
            { key: "customer", label: "Customer" },
            { key: "date", label: "Date" },
            { key: "total", label: "Subtotal" },
            { key: "fulfillment", label: "Fulfillment" },
            { key: "payment", label: "Payment" },
            { key: "tracking", label: "Tracking" },
            { key: "actions", label: "", render: (r) => (
              <Link to="/vendor/orders/$id" params={{ id: r.id as string }} className="text-xs font-semibold text-electric">View</Link>
            ) },
          ]}
          rows={rows}
        />
      )}
    </div>
  );
}

export const Route = createFileRoute("/vendor/orders/")({ component: Page });
