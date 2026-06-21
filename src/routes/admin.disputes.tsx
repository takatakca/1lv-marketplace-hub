import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";

type DisputeStatus = "open" | "under_review" | "waiting_customer" | "waiting_vendor" | "resolved" | "rejected";

type Dispute = {
  id: string;
  order: string;
  customer: string;
  vendor: string;
  reason: string;
  status: DisputeStatus;
  updated: string;
  notes: string;
};

const seed: Dispute[] = Array.from({ length: 5 }).map((_, i) => ({
  id: "DSP-" + (820 + i),
  order: "1LV-" + (10240 + i),
  customer: ["Jane", "Marc", "Sarah", "Liam", "Noor"][i],
  vendor: ["northstar-tech", "maple-home", "atlantic-style", "boreal-outfitters", "pacific-pets"][i],
  reason: ["Item not received", "Damaged item", "Wrong item", "Not as described", "Late delivery"][i],
  status: (["open", "under_review", "waiting_customer", "resolved", "waiting_vendor"][i]) as DisputeStatus,
  updated: new Date(2026, 4, 10 - i).toLocaleDateString("en-CA"),
  notes: "",
}));

const STATUSES: DisputeStatus[] = ["open", "under_review", "waiting_customer", "waiting_vendor", "resolved", "rejected"];

function tone(s: DisputeStatus) {
  if (s === "resolved") return "bg-success/10 text-success";
  if (s === "rejected") return "bg-muted text-muted-foreground";
  if (s === "open") return "bg-deal/10 text-deal";
  return "bg-electric/10 text-electric";
}

function Page() {
  const [items, setItems] = useState<Dispute[]>(seed);
  const [active, setActive] = useState<Dispute | null>(null);

  const setStatus = (id: string, status: DisputeStatus) => {
    setItems((arr) => arr.map((d) => (d.id === id ? { ...d, status, updated: new Date().toLocaleDateString("en-CA") } : d)));
    toast.success("Status updated (local)");
  };

  const rows = items.map((d) => ({
    id: d.id,
    order: d.order,
    customer: d.customer,
    vendor: d.vendor,
    reason: d.reason,
    status: <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone(d.status)}`}>{d.status}</span>,
    updated: d.updated,
    actions: (
      <button onClick={() => setActive(d)} className="text-xs font-semibold text-electric">Review</button>
    ),
  }));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Disputes</h1>
        <p className="text-sm text-muted-foreground">Workflow: open → under_review → waiting_* → resolved/rejected. Stripe refunds will land in the payments phase.</p>
      </div>

      <DataTable
        columns={[
          { key: "id", label: "Dispute" },
          { key: "order", label: "Order" },
          { key: "customer", label: "Customer" },
          { key: "vendor", label: "Vendor" },
          { key: "reason", label: "Reason" },
          { key: "status", label: "Status" },
          { key: "updated", label: "Updated" },
          { key: "actions", label: "" },
        ]}
        rows={rows}
      />

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setActive(null)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-navy">{active.id}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{active.order} · {active.customer} ↔ {active.vendor}</p>
            <p className="mt-3 text-sm"><b>Reason:</b> {active.reason}</p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-navy">Status</label>
              <select value={active.status} onChange={(e) => { const s = e.target.value as DisputeStatus; setStatus(active.id, s); setActive({ ...active, status: s }); }}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-navy">Internal admin notes</label>
              <textarea rows={3} placeholder="Visible to admins only" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-navy">Message to participant</label>
              <textarea rows={2} placeholder="Customer / vendor messaging (coming soon)" className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button disabled className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground" title="Stripe not connected yet">
                Issue refund (Stripe pending)
              </button>
              <button onClick={() => setActive(null)} className="ml-auto rounded-md bg-electric px-3 py-2 text-xs font-semibold text-electric-foreground">Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export const Route = createFileRoute("/admin/disputes")({ component: Page });
