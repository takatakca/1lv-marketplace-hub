import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import {
  createPromotion,
  listAdminPromotions,
  setPromotionActive,
  type AdminPromotion,
  type PromotionInput,
} from "@/services/promotions";

const emptyForm: PromotionInput = {
  code: "",
  name: "",
  description: "",
  discountType: "percent",
  discountValue: 10,
  maxDiscount: null,
  minOrder: 0,
  active: false,
  publiclyListed: false,
  startsAt: null,
  endsAt: null,
  globalUsageLimit: null,
  perCustomerLimit: 1,
  firstOrderOnly: false,
};

function Page() {
  const [promotions, setPromotions] = useState<AdminPromotion[]>([]);
  const [form, setForm] = useState<PromotionInput>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    try {
      setPromotions(await listAdminPromotions());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load promotions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await createPromotion(form);
      toast.success("Promotion created");
      setForm(emptyForm);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create promotion");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (promotion: AdminPromotion) => {
    try {
      await setPromotionActive(promotion.id, !promotion.active);
      toast.success(promotion.active ? "Promotion disabled" : "Promotion activated");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update promotion");
    }
  };

  const rows = promotions.map((promotion) => {
    const redemptions = promotion.promotion_redemptions ?? [];
    const used = redemptions.filter((r) => r.status === "redeemed").length;
    const reserved = redemptions.filter((r) => r.status === "reserved").length;
    const value =
      promotion.discount_type === "free_shipping"
        ? "Free shipping"
        : promotion.discount_type === "percent"
          ? `${Number(promotion.discount_value)}%`
          : `$${Number(promotion.discount_value).toFixed(2)}`;

    return {
      code: <span className="font-mono font-bold">{promotion.code}</span>,
      name: promotion.name,
      value,
      min: Number(promotion.min_order) > 0 ? `$${Number(promotion.min_order).toFixed(2)}` : "—",
      usage: `${used} redeemed · ${reserved} reserved`,
      public: promotion.publicly_listed ? "Listed" : "Private",
      window: `${promotion.starts_at ? new Date(promotion.starts_at).toLocaleDateString("en-CA") : "Now"} → ${promotion.ends_at ? new Date(promotion.ends_at).toLocaleDateString("en-CA") : "No end"}`,
      status: (
        <button
          type="button"
          onClick={() => void toggle(promotion)}
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${promotion.active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
        >
          {promotion.active ? "Active" : "Inactive"}
        </button>
      ),
    };
  });

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Promotions</h1>
        <p className="text-sm text-muted-foreground">
          Server-validated codes. Activating a promotion makes it eligible for checkout; public listing is controlled separately.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading promotions…</div>
      ) : (
        <DataTable
          columns={[
            { key: "code", label: "Code" },
            { key: "name", label: "Name" },
            { key: "value", label: "Value" },
            { key: "min", label: "Min order" },
            { key: "usage", label: "Usage" },
            { key: "public", label: "Public" },
            { key: "window", label: "Window" },
            { key: "status", label: "Status" },
          ]}
          rows={rows}
        />
      )}

      <form onSubmit={create} className="mt-8 grid gap-3 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
        <h3 className="text-sm font-semibold text-navy md:col-span-3">Create promotion</h3>
        <input required placeholder="CODE" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className={inp} />
        <input required placeholder="Promotion name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} />
        <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as PromotionInput["discountType"], discountValue: e.target.value === "free_shipping" ? 0 : form.discountValue || 10 })} className={inp}>
          <option value="percent">Percent off</option>
          <option value="fixed">Fixed $ off</option>
          <option value="free_shipping">Free shipping</option>
        </select>
        <input type="number" min="0" step="0.01" disabled={form.discountType === "free_shipping"} placeholder="Value" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })} className={inp} />
        <input type="number" min="0" step="0.01" placeholder="Min order $" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: Number(e.target.value) })} className={inp} />
        <input type="number" min="1" placeholder="Global usage limit (optional)" value={form.globalUsageLimit ?? ""} onChange={(e) => setForm({ ...form, globalUsageLimit: e.target.value ? Number(e.target.value) : null })} className={inp} />
        <input type="number" min="1" placeholder="Per customer limit" value={form.perCustomerLimit ?? ""} onChange={(e) => setForm({ ...form, perCustomerLimit: e.target.value ? Number(e.target.value) : null })} className={inp} />
        <input type="datetime-local" value={form.startsAt ?? ""} onChange={(e) => setForm({ ...form, startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} className={inp} />
        <input type="datetime-local" value={form.endsAt ?? ""} onChange={(e) => setForm({ ...form, endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} className={inp} />
        <textarea placeholder="Description (optional)" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${inp} md:col-span-3 min-h-20`} />
        <label className="flex items-center gap-2 text-xs text-navy">
          <input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => setForm({ ...form, firstOrderOnly: e.target.checked })} /> First paid order only
        </label>
        <label className="flex items-center gap-2 text-xs text-navy">
          <input type="checkbox" checked={form.publiclyListed} onChange={(e) => setForm({ ...form, publiclyListed: e.target.checked })} /> Show in public savings center
        </label>
        <label className="flex items-center gap-2 text-xs text-navy">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Activate immediately
        </label>
        <button disabled={saving} className="rounded-md bg-electric px-3 py-2 text-sm font-semibold text-electric-foreground disabled:opacity-60 md:col-span-3">
          {saving ? "Creating…" : "Create promotion"}
        </button>
      </form>

      <p className="mt-4 rounded-lg border border-dashed border-electric/30 bg-electric/5 p-3 text-xs text-navy">
        Checkout recalculates eligibility, limits, item scope and the payable discount inside PostgreSQL. The browser never supplies a discount amount.
      </p>
    </>
  );
}

const inp = "rounded-md border border-border bg-background px-3 py-2 text-sm";
export const Route = createFileRoute("/admin/coupons")({ component: Page });
