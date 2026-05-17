import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import { products, formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { backfillVendorOrders, listAllOrdersWithSplits } from "@/services/orders";

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listAllOrdersWithSplits>> | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (demo) return;
    try { setRows(await listAllOrdersWithSplits()); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [demo]);

  const onBackfill = async () => {
    if (!confirm("Backfill vendor_orders for any orders missing them? This is safe but irreversible.")) return;
    setBusy(true);
    try {
      const r = await backfillVendorOrders();
      toast.success(`Backfill complete — ${r.created} created, ${r.skipped} skipped`);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const useDemo = demo || !rows || rows.length === 0;
  const tableRows = useDemo
    ? products.slice(0, 12).map((p, i) => ({
        order: "1LV-" + (10100 + i),
        customer: ["Jane","Marc","Sarah","Liam","Noor","Ava"][i % 6],
        vendors: "1 vendor",
        total: formatCAD(p.price),
        commission: formatCAD(p.price * 0.1),
        payout: formatCAD(p.price * 0.9),
        payment: "Paid",
        fulfillment: ["Pending","Shipped","Delivered","Processing"][i % 4],
        date: new Date(2026, 4, 10 - i).toLocaleDateString("en-CA"),
      }))
    : rows!.map((o) => {
        const splits = o.vendor_orders ?? [];
        const commission = splits.reduce((s, v) => s + Number(v.commission_amount), 0);
        const payout = splits.reduce((s, v) => s + Number(v.vendor_payout_amount), 0);
        const statuses = Array.from(new Set(splits.map((s) => s.status)));
        return {
          order: o.order_number,
          customer: o.customer_email ?? "—",
          vendors: `${splits.length} vendor${splits.length === 1 ? "" : "s"}`,
          total: formatCAD(Number(o.total)),
          commission: formatCAD(commission),
          payout: formatCAD(payout),
          payment: o.payment_status,
          fulfillment: statuses.join(", ") || o.status,
          date: new Date(o.created_at).toLocaleDateString("en-CA"),
        };
      });

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          {useDemo && <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div>}
          <h1 className="text-2xl font-bold text-navy md:text-3xl">All orders</h1>
        </div>
        <button
          onClick={onBackfill}
          disabled={demo || busy}
          title="Create vendor_orders for any orders missing them"
          className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-navy disabled:opacity-50"
        >
          {busy ? "Working…" : "Backfill vendor orders"}
        </button>
      </div>
      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
        <DataTable
          columns={[
            { key: "order", label: "Order" },
            { key: "customer", label: "Customer" },
            { key: "vendors", label: "Vendor split" },
            { key: "total", label: "Total" },
            { key: "commission", label: "Commission" },
            { key: "payout", label: "Vendor payout" },
            { key: "payment", label: "Payment" },
            { key: "fulfillment", label: "Fulfillment" },
            { key: "date", label: "Date" },
          ]}
          rows={tableRows}
        />
      )}
    </>
  );
}

export const Route = createFileRoute("/admin/orders")({ component: Page });
