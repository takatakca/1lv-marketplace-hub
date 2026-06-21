import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import { products, formatCAD } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { backfillVendorOrders, listAllOrdersWithSplits } from "@/services/orders";

const PAY = ["all", "pending", "paid", "refunded", "failed"] as const;
const FUL = ["all", "pending", "accepted", "processing", "shipped", "delivered", "cancelled"] as const;

function badge(text: string, tone: "success" | "deal" | "muted" | "destructive") {
  const map = {
    success: "bg-success/10 text-success",
    deal: "bg-deal/10 text-deal",
    destructive: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[tone]}`}>{text}</span>;
}

type Row = Awaited<ReturnType<typeof listAllOrdersWithSplits>>[number];

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [pay, setPay] = useState<(typeof PAY)[number]>("all");
  const [ful, setFul] = useState<(typeof FUL)[number]>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    if (demo) return;
    try { setRows(await listAllOrdersWithSplits()); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [demo]);

  const onBackfill = async () => {
    if (!confirm("Backfill vendor_orders for any orders missing them?")) return;
    setBusy(true);
    try {
      const r = await backfillVendorOrders();
      toast.success(`Backfill — ${r.created} created, ${r.skipped} skipped`);
      await load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const useDemo = demo || !rows || rows.length === 0;
  const filtered = useMemo(() => {
    if (useDemo) return [];
    return (rows ?? []).filter((o) => {
      if (pay !== "all" && o.payment_status !== pay) return false;
      if (ful !== "all" && !(o.vendor_orders ?? []).some((s) => s.status === ful) && o.status !== ful) return false;
      if (q.trim()) {
        const t = q.toLowerCase();
        if (!o.order_number.toLowerCase().includes(t) && !(o.customer_email ?? "").toLowerCase().includes(t)) return false;
      }
      return true;
    });
  }, [rows, pay, ful, q, useDemo]);

  const tableRows = useDemo
    ? products.slice(0, 12).map((p, i) => ({
        order: ("1LV-" + (10100 + i)) as unknown as React.ReactNode,
        customer: ["Jane", "Marc", "Sarah", "Liam", "Noor", "Ava"][i % 6],
        vendors: badge("1 vendor", "muted"),
        total: formatCAD(p.price),
        commission: formatCAD(p.price * 0.1),
        payout: formatCAD(p.price * 0.9),
        payment: badge("Paid", "success"),
        fulfillment: badge(["Pending", "Shipped", "Delivered", "Processing"][i % 4].toLowerCase(), "deal"),
        date: new Date(2026, 4, 10 - i).toLocaleDateString("en-CA"),
      }))
    : filtered.map((o) => {
        const splits = o.vendor_orders ?? [];
        const commission = splits.reduce((s, v) => s + Number(v.commission_amount), 0);
        const payout = splits.reduce((s, v) => s + Number(v.vendor_payout_amount), 0);
        const isOpen = expanded === o.id;
        return {
          order: (
            <button onClick={() => setExpanded(isOpen ? null : o.id)} className="text-left">
              <div className="font-medium text-navy underline-offset-2 hover:underline">{o.order_number}</div>
              {isOpen && (
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {splits.map((s) => (
                    <div key={s.id}>
                      vendor {s.vendor_id.slice(0, 8)} — sub {formatCAD(Number(s.subtotal))} — comm {formatCAD(Number(s.commission_amount))} — payout {formatCAD(Number(s.vendor_payout_amount))} — {s.status}
                    </div>
                  ))}
                </div>
              )}
            </button>
          ),
          customer: o.customer_email ?? "—",
          vendors: badge(`${splits.length} vendor${splits.length === 1 ? "" : "s"}`, "muted"),
          total: formatCAD(Number(o.total)),
          commission: formatCAD(commission),
          payout: formatCAD(payout),
          payment: badge(o.payment_status, o.payment_status === "paid" ? "success" : o.payment_status === "failed" ? "destructive" : "deal"),
          fulfillment: badge(
            Array.from(new Set(splits.map((s) => s.status))).join(", ") || o.status,
            "deal",
          ),
          date: new Date(o.created_at).toLocaleDateString("en-CA"),
        };
      });

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          {useDemo && <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div>}
          <h1 className="text-2xl font-bold text-navy md:text-3xl">All orders</h1>
          <p className="text-sm text-muted-foreground">Search, filter, and inspect vendor splits.</p>
        </div>
        <button onClick={onBackfill} disabled={demo || busy}
          className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-navy disabled:opacity-50">
          {busy ? "Working…" : "Backfill vendor orders"}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order number or email"
          className="min-w-[220px] rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <select value={pay} onChange={(e) => setPay(e.target.value as (typeof PAY)[number])} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          {PAY.map((s) => <option key={s} value={s}>Payment: {s}</option>)}
        </select>
        <select value={ful} onChange={(e) => setFul(e.target.value as (typeof FUL)[number])} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          {FUL.map((s) => <option key={s} value={s}>Fulfillment: {s}</option>)}
        </select>
        {!useDemo && <span className="ml-auto text-xs text-muted-foreground">{filtered.length} of {rows?.length ?? 0}</span>}
      </div>

      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
        <DataTable
          columns={[
            { key: "order", label: "Order" },
            { key: "customer", label: "Customer" },
            { key: "vendors", label: "Vendors" },
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
