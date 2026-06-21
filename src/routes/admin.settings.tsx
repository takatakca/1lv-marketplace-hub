import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Settings = {
  name: string;
  supportEmail: string;
  commissionRate: number;
  freeShippingThreshold: number;
  standardShippingFee: number;
  quebecTaxRate: number;
  productApproval: boolean;
  vendorApproval: boolean;
  guestCheckout: boolean;
  demoMode: boolean;
};

const DEFAULTS: Settings = {
  name: "1LV.CA",
  supportEmail: "support@1lv.ca",
  commissionRate: 10,
  freeShippingThreshold: 50,
  standardShippingFee: 9.99,
  quebecTaxRate: 14.975,
  productApproval: true,
  vendorApproval: true,
  guestCheckout: true,
  demoMode: false,
};

const STORAGE_KEY = "1lv_admin_settings";

function Page() {
  const [s, setS] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    try {
      const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (saved) setS({ ...DEFAULTS, ...JSON.parse(saved) });
    } catch { /* ignore */ }
  }, []);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      toast.success("Settings saved (backend wiring next phase)");
    } catch { toast.error("Could not save"); }
  };

  const num = (k: keyof Settings, label: string, step = "1") => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-navy">{label}</span>
      <input type="number" step={step} value={s[k] as number}
        onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
    </label>
  );

  const text = (k: keyof Settings, label: string) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-navy">{label}</span>
      <input value={s[k] as string}
        onChange={(e) => setS({ ...s, [k]: e.target.value })}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
    </label>
  );

  const toggle = (k: keyof Settings, label: string, desc: string) => (
    <label className="flex items-start gap-3 rounded-md border border-border bg-background p-3">
      <input type="checkbox" checked={s[k] as boolean} onChange={(e) => setS({ ...s, [k]: e.target.checked })} className="mt-1" />
      <div>
        <div className="text-sm font-medium text-navy">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </label>
  );

  return (
    <form onSubmit={save} className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Marketplace settings</h1>
        <p className="text-sm text-muted-foreground">Defaults applied across vendors, checkout and storefront.</p>
      </div>

      <section className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        {text("name", "Marketplace name")}
        {text("supportEmail", "Support email")}
        {num("commissionRate", "Default commission rate (%)", "0.1")}
        {num("quebecTaxRate", "Québec tax rate (%)", "0.001")}
        {num("freeShippingThreshold", "Free shipping threshold (CAD)", "1")}
        {num("standardShippingFee", "Standard shipping fee (CAD)", "0.01")}
      </section>

      <section className="grid gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        {toggle("vendorApproval", "Require vendor approval", "New vendor applications start as pending.")}
        {toggle("productApproval", "Require product approval", "Submitted products wait for admin review.")}
        {toggle("guestCheckout", "Allow guest checkout", "Customers can purchase without an account.")}
        {toggle("demoMode", "Demo mode enabled", "Backed pages show demo fallbacks when DB is empty.")}
      </section>

      <button className="rounded-md bg-electric px-5 py-2 text-sm font-semibold text-electric-foreground">Save settings</button>
    </form>
  );
}

export const Route = createFileRoute("/admin/settings")({ component: Page });
