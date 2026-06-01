import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import { products as demoProducts, formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { getMyVendor } from "@/services/vendors";
import { listVendorOrders, updateVendorOrder, type VendorOrderStatus } from "@/services/orders";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

const STATUSES: (VendorOrderStatus | "all")[] = ["all", "pending", "accepted", "processing", "shipped", "delivered", "cancelled"];

function statusBadge(s: string) {
  const m: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    accepted: "bg-electric/10 text-electric",
    processing: "bg-deal/10 text-deal",
    shipped: "bg-success/10 text-success",
    delivered: "bg-success/20 text-success",
    cancelled: "bg-destructive/10 text-destructive",
  };
  return <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize " + (m[s] || "bg-muted")}>{s}</span>;
}

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [items, setItems] = useState<Awaited<ReturnType<typeof listVendorOrders>> | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<VendorOrderStatus | "all">("all");
  const [vendorId, setVendorId] = useState<string | null>(null);

  const reload = async (vid: string) => setItems(await listVendorOrders(vid));

  useEffect(() => {
    if (demo) return;
    (async () => {
      try {
        const v = await getMyVendor(user!.id);
        if (!v) { setItems([]); return; }
        setVendorId(v.id);
        await reload(v.id);
      } finally { setLoading(false); }
    })();
  }, [demo, user]);

  const useDemo = demo || (items && items.length === 0);

  const baseRows = useMemo(() => {
    if (useDemo) {
      return demoProducts.slice(0, 10).map((p, i) => ({
        id: "demo-" + i,
        order: "1LV-" + (10240 + i),
        customer: ["jane@example.ca","marc@example.ca","sarah@example.ca","liam@example.ca","noor@example.ca"][i % 5],
        date: new Date(2026, 4, 11 - i).toLocaleDateString("en-CA"),
        subtotal: p.price,
        commission: +(p.price * 0.1).toFixed(2),
        payout: +(p.price * 0.9).toFixed(2),
        fulfillment: (["pending","accepted","processing","shipped","delivered"] as const)[i % 5] as VendorOrderStatus,
        payment: "paid",
        tracking: i > 1 ? "1Z999AA" + i : "",
      }));
    }
    return (items ?? []).map((vo) => ({
      id: vo.id,
      order: vo.orders.order_number,
      customer: vo.orders.customer_email ?? "—",
      date: new Date(vo.orders.created_at).toLocaleDateString("en-CA"),
      subtotal: Number(vo.subtotal),
      commission: Number(vo.commission_amount),
      payout: Number(vo.vendor_payout_amount),
      fulfillment: vo.status,
      payment: vo.orders.payment_status,
      tracking: vo.tracking_number ?? "",
    }));
  }, [items, useDemo]);

  const rows = baseRows.filter((r) => {
    if (status !== "all" && r.fulfillment !== status) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!r.order.toLowerCase().includes(q) && !String(r.customer).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const quickUpdate = async (id: string, next: VendorOrderStatus) => {
    if (useDemo) { toast.message("Demo mode — update simulated"); return; }
    try {
      await updateVendorOrder(id, { status: next });
      toast.success(`Marked ${next}`);
      if (vendorId) await reload(vendorId);
    } catch (err) { toast.error((err as Error).message); }
  };

  const nextStep = (s: VendorOrderStatus): VendorOrderStatus | null => {
    if (s === "pending") return "accepted";
    if (s === "accepted") return "processing";
    if (s === "processing") return "shipped";
    if (s === "shipped") return "delivered";
    return null;
  };

  return (
    <div>
      <div className="mb-6">
        {useDemo ? <DemoBanner label={demo ? "Preview mode" : "No orders yet"} /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Orders</h1>
      </div>
      {demo && <PreviewModeNotice />}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input placeholder="Search order # or customer…" value={query} onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[220px] rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <select value={status} onChange={(e) => setStatus(e.target.value as VendorOrderStatus | "all")}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
        <DataTable
          columns={[
            { key: "order", label: "Order" },
            { key: "customer", label: "Customer" },
            { key: "date", label: "Date" },
            { key: "subtotal", label: "Subtotal", render: (r) => formatCAD(Number(r.subtotal)) },
            { key: "commission", label: "Commission", render: (r) => "− " + formatCAD(Number(r.commission)) },
            { key: "payout", label: "Payout", render: (r) => formatCAD(Number(r.payout)) },
            { key: "fulfillment", label: "Fulfillment", render: (r) => statusBadge(r.fulfillment as string) },
            { key: "payment", label: "Payment" },
            { key: "tracking", label: "Tracking", render: (r) => r.tracking || "—" },
            { key: "actions", label: "", render: (r) => {
              const n = nextStep(r.fulfillment as VendorOrderStatus);
              return (
                <div className="flex items-center gap-2">
                  {n && <button onClick={() => quickUpdate(r.id as string, n)} className="text-xs font-semibold text-electric capitalize">{n}</button>}
                  <Link to="/vendor/orders/$id" params={{ id: r.id as string }} className="text-xs font-semibold text-muted-foreground">View</Link>
                </div>
              );
            } },
          ]}
          rows={rows}
        />
      )}
    </div>
  );
}

export const Route = createFileRoute("/vendor/orders/")({ component: Page });
