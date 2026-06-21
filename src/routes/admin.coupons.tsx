import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";

type Coupon = {
  code: string;
  type: "percent" | "fixed";
  value: number;
  minOrder: number;
  startsAt: string;
  endsAt: string;
  usage: number;
  usageLimit: number;
  vendorSlug: string | null;
  active: boolean;
};

const initial: Coupon[] = [
  { code: "WELCOME10", type: "percent", value: 10, minOrder: 0, startsAt: "2026-01-01", endsAt: "2026-12-31", usage: 120, usageLimit: 500, vendorSlug: null, active: true },
  { code: "FREESHIP", type: "fixed", value: 10, minOrder: 35, startsAt: "2026-04-01", endsAt: "2026-06-30", usage: 44, usageLimit: 200, vendorSlug: null, active: true },
  { code: "SUMMER25", type: "percent", value: 25, minOrder: 50, startsAt: "2026-06-15", endsAt: "2026-08-31", usage: 0, usageLimit: 1000, vendorSlug: null, active: false },
];

const codeRegex = /^[A-Z0-9_-]{3,24}$/;

function Page() {
  const [coupons, setCoupons] = useState<Coupon[]>(initial);
  const [form, setForm] = useState<Coupon>({
    code: "", type: "percent", value: 10, minOrder: 0,
    startsAt: "", endsAt: "", usage: 0, usageLimit: 100, vendorSlug: null, active: true,
  });

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const code = form.code.toUpperCase().trim();
    if (!codeRegex.test(code)) { toast.error("Code must be 3–24 chars (A-Z, 0-9, _, -)"); return; }
    if (coupons.some((c) => c.code === code)) { toast.error("Code already exists"); return; }
    if (form.value <= 0) { toast.error("Value must be > 0"); return; }
    setCoupons([{ ...form, code }, ...coupons]);
    toast.success("Coupon created (local — backend wiring pending)");
    setForm({ ...form, code: "", value: 10, minOrder: 0 });
  };

  const rows = coupons.map((c) => ({
    code: c.code,
    type: c.type,
    value: c.type === "percent" ? `${c.value}%` : `$${c.value.toFixed(2)}`,
    min: c.minOrder ? `$${c.minOrder.toFixed(2)}` : "—",
    scope: c.vendorSlug ? c.vendorSlug : "All vendors",
    usage: `${c.usage}/${c.usageLimit}`,
    window: `${c.startsAt || "—"} → ${c.endsAt || "—"}`,
    status: c.active ? "Active" : "Inactive",
  }));

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Coupons</h1>
        <p className="text-sm text-muted-foreground">Manage promo codes. Checkout integration is wired in the next phase.</p>
      </div>

      <DataTable
        columns={[
          { key: "code", label: "Code" },
          { key: "type", label: "Type" },
          { key: "value", label: "Value" },
          { key: "min", label: "Min order" },
          { key: "scope", label: "Scope" },
          { key: "usage", label: "Usage" },
          { key: "window", label: "Window" },
          { key: "status", label: "Status" },
        ]}
        rows={rows}
      />

      <form onSubmit={create} className="mt-8 grid gap-3 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
        <h3 className="md:col-span-3 text-sm font-semibold text-navy">Create coupon</h3>
        <input placeholder="CODE" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className={inp} />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Coupon["type"] })} className={inp}>
          <option value="percent">Percent off</option>
          <option value="fixed">Fixed $ off</option>
        </select>
        <input type="number" placeholder="Value" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} className={inp} />
        <input type="number" placeholder="Min order $" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: Number(e.target.value) })} className={inp} />
        <input type="number" placeholder="Usage limit" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: Number(e.target.value) })} className={inp} />
        <input placeholder="Vendor slug (optional)" value={form.vendorSlug ?? ""} onChange={(e) => setForm({ ...form, vendorSlug: e.target.value || null })} className={inp} />
        <input type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className={inp} />
        <input type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className={inp} />
        <label className="flex items-center gap-2 text-xs text-navy">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
        </label>
        <button className="md:col-span-3 rounded-md bg-electric px-3 py-2 text-sm font-semibold text-electric-foreground">Create coupon</button>
      </form>

      <p className="mt-4 rounded-lg border border-dashed border-electric/30 bg-electric/5 p-3 text-xs text-navy">
        Checkout will validate code, scope (all vendors or vendor-specific), min order, window and usage limits before applying discount.
      </p>
    </>
  );
}

const inp = "rounded-md border border-border bg-background px-3 py-2 text-sm";
export const Route = createFileRoute("/admin/coupons")({ component: Page });
