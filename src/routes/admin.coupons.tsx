import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgePercent, Eye, EyeOff, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import {
  createPromotion,
  listAdminPromotions,
  setPromotionActive,
  type PromotionInput,
} from "@/lib/promotions.functions";

type PromotionRow = {
  id: string;
  code: string;
  name: string;
  discount_type: "percent" | "fixed" | "free_shipping";
  discount_value: number;
  max_discount: number | null;
  min_order: number;
  active: boolean;
  publicly_listed: boolean;
  starts_at: string | null;
  ends_at: string | null;
  global_usage_limit: number | null;
  per_customer_limit: number | null;
  first_order_only: boolean;
  promotion_redemptions?: Array<{ id: string; status: string }>;
};

const EMPTY: PromotionInput = {
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
  const [promotions, setPromotions] = useState<PromotionRow[]>([]);
  const [form, setForm] = useState<PromotionInput>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listAdminPromotions();
      setPromotions(rows as unknown as PromotionRow[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load promotions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () =>
      promotions.map((promotion) => {
        const redemptions = promotion.promotion_redemptions ?? [];
        const used = redemptions.filter((r) => r.status === "redeemed").length;
        const reserved = redemptions.filter((r) => r.status === "reserved").length;
        const value =
          promotion.discount_type === "percent"
            ? `${promotion.discount_value}%`
            : promotion.discount_type === "fixed"
              ? `$${Number(promotion.discount_value).toFixed(2)}`
              : "Free shipping";
        return {
          code: (
            <div>
              <div className="font-mono font-bold text-navy">{promotion.code}</div>
              <div className="text-[11px] text-muted-foreground">{promotion.name}</div>
            </div>
          ),
          type: promotion.discount_type.replace("_", " "),
          value,
          min: promotion.min_order
            ? `$${Number(promotion.min_order).toFixed(2)}`
            : "—",
          usage: `${used} used · ${reserved} reserved`,
          window: `${promotion.starts_at ? new Date(promotion.starts_at).toLocaleDateString("en-CA") : "Now"} → ${promotion.ends_at ? new Date(promotion.ends_at).toLocaleDateString("en-CA") : "No end"}`,
          visibility: promotion.publicly_listed ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
              <Eye size={13} /> Public
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <EyeOff size={13} /> Hidden
            </span>
          ),
          status: (
            <button
              type="button"
              onClick={async () => {
                try {
                  await setPromotionActive({
                    data: {
                      promotionId: promotion.id,
                      active: !promotion.active,
                    },
                  });
                  toast.success(
                    promotion.active ? "Promotion paused." : "Promotion activated.",
                  );
                  await load();
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not update promotion.",
                  );
                }
              }}
              className={
                promotion.active
                  ? "inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-xs font-bold text-success"
                  : "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"
              }
            >
              {promotion.active ? <Power size={12} /> : <PowerOff size={12} />}
              {promotion.active ? "Active" : "Paused"}
            </button>
          ),
        };
      }),
    [load, promotions],
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await createPromotion({ data: form });
      toast.success("Promotion created.");
      setForm(EMPTY);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create promotion.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-wider text-electric">
          Commerce control
        </p>
        <h1 className="text-2xl font-bold text-navy md:text-3xl">
          Promotions
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Codes are persisted in the database and recalculated inside the trusted
          checkout transaction. Nothing entered in the browser can set the final
          discount amount.
        </p>
      </div>

      <DataTable
        columns={[
          { key: "code", label: "Code" },
          { key: "type", label: "Type" },
          { key: "value", label: "Value" },
          { key: "min", label: "Minimum" },
          { key: "usage", label: "Usage" },
          { key: "window", label: "Window" },
          { key: "visibility", label: "Visibility" },
          { key: "status", label: "Status" },
        ]}
        rows={rows}
        empty={
          loading
            ? "Loading promotions…"
            : "No promotions yet. Create the first verified offer below."
        }
      />

      <form
        onSubmit={submit}
        className="mt-8 grid gap-3 rounded-xl border border-border bg-card p-5 shadow-sm md:grid-cols-3"
      >
        <div className="md:col-span-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-navy">
            <BadgePercent size={16} className="text-electric" />
            Create promotion
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            New promotions start paused unless you explicitly activate them.
          </p>
        </div>

        <input
          placeholder="CODE"
          maxLength={32}
          value={form.code}
          onChange={(e) =>
            setForm({ ...form, code: e.target.value.toUpperCase() })
          }
          className={inp}
          required
        />
        <input
          placeholder="Internal/public name"
          maxLength={120}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={inp}
          required
        />
        <select
          value={form.discountType}
          onChange={(e) => {
            const discountType = e.target.value as PromotionInput["discountType"];
            setForm({
              ...form,
              discountType,
              discountValue:
                discountType === "free_shipping" ? 0 : form.discountValue || 10,
            });
          }}
          className={inp}
        >
          <option value="percent">Percent off</option>
          <option value="fixed">Fixed CAD off</option>
          <option value="free_shipping">Free shipping</option>
        </select>

        <input
          type="number"
          min={0}
          step="0.01"
          disabled={form.discountType === "free_shipping"}
          value={form.discountValue}
          onChange={(e) =>
            setForm({ ...form, discountValue: Number(e.target.value) })
          }
          className={inp}
          aria-label="Discount value"
        />
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="Minimum order CAD"
          value={form.minOrder}
          onChange={(e) =>
            setForm({ ...form, minOrder: Number(e.target.value) })
          }
          className={inp}
        />
        <input
          type="number"
          min={1}
          placeholder="Global usage limit"
          value={form.globalUsageLimit ?? ""}
          onChange={(e) =>
            setForm({
              ...form,
              globalUsageLimit: e.target.value ? Number(e.target.value) : null,
            })
          }
          className={inp}
        />

        <input
          type="number"
          min={1}
          placeholder="Per-customer limit"
          value={form.perCustomerLimit ?? ""}
          onChange={(e) =>
            setForm({
              ...form,
              perCustomerLimit: e.target.value
                ? Number(e.target.value)
                : null,
            })
          }
          className={inp}
        />
        <input
          type="datetime-local"
          value={form.startsAt ?? ""}
          onChange={(e) =>
            setForm({ ...form, startsAt: e.target.value || null })
          }
          className={inp}
          aria-label="Start date"
        />
        <input
          type="datetime-local"
          value={form.endsAt ?? ""}
          onChange={(e) =>
            setForm({ ...form, endsAt: e.target.value || null })
          }
          className={inp}
          aria-label="End date"
        />

        <textarea
          placeholder="Customer-facing description (optional)"
          value={form.description ?? ""}
          onChange={(e) =>
            setForm({ ...form, description: e.target.value })
          }
          className={`${inp} min-h-20 md:col-span-3`}
        />

        <label className="flex items-center gap-2 text-xs font-medium text-navy">
          <input
            type="checkbox"
            checked={form.firstOrderOnly}
            onChange={(e) =>
              setForm({ ...form, firstOrderOnly: e.target.checked })
            }
          />
          First paid order only
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-navy">
          <input
            type="checkbox"
            checked={form.publiclyListed}
            onChange={(e) =>
              setForm({ ...form, publiclyListed: e.target.checked })
            }
          />
          Show in public Savings Center
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-navy">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Activate immediately
        </label>

        <button
          disabled={saving}
          className="rounded-md bg-electric px-3 py-2 text-sm font-bold text-electric-foreground disabled:opacity-60 md:col-span-3"
        >
          {saving ? "Creating…" : "Create verified promotion"}
        </button>
      </form>
    </>
  );
}

const inp =
  "rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-electric focus:ring-2 focus:ring-electric/10";

export const Route = createFileRoute("/admin/coupons")({ component: Page });
