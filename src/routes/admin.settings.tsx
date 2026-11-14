import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getMarketplaceSettings,
  saveMarketplaceSettings,
  type MarketplaceSettings,
} from "@/lib/marketplace-settings.functions";

function Page() {
  const [settings, setSettings] = useState<MarketplaceSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getMarketplaceSettings()
      .then(setSettings)
      .catch((error) => toast.error(error instanceof Error ? error.message : "Could not load settings."));
  }, []);

  if (!settings) {
    return <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading marketplace settings…</div>;
  }

  const set = <K extends keyof MarketplaceSettings>(key: K, value: MarketplaceSettings[K]) =>
    setSettings((current) => current ? { ...current, [key]: value } : current);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await saveMarketplaceSettings({ data: settings });
      setSettings(saved);
      toast.success("Marketplace settings saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Marketplace settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Persistent operational settings. Changes are versioned and audited in the marketplace database.
        </p>
      </div>

      <section className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-navy">Marketplace name</span>
          <input value={settings.marketplace_name} onChange={(e) => set("marketplace_name", e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-navy">Support email</span>
          <input type="email" value={settings.support_email} onChange={(e) => set("support_email", e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-navy">Default commission (%)</span>
          <input type="number" min="0" max="100" step="0.1" value={settings.default_commission_rate * 100}
            onChange={(e) => set("default_commission_rate", Number(e.target.value) / 100)}
            className="w-full rounded-md border border-border bg-background px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-navy">Free shipping threshold (CAD)</span>
          <input type="number" min="0" step="0.01" value={settings.free_shipping_threshold}
            onChange={(e) => set("free_shipping_threshold", Number(e.target.value))}
            className="w-full rounded-md border border-border bg-background px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-navy">Standard shipping fee (CAD)</span>
          <input type="number" min="0" step="0.01" value={settings.standard_shipping_fee}
            onChange={(e) => set("standard_shipping_fee", Number(e.target.value))}
            className="w-full rounded-md border border-border bg-background px-3 py-2" />
        </label>
        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          Version <strong className="text-foreground">{settings.version}</strong><br />
          Last database update {new Date(settings.updated_at).toLocaleString()}
        </div>
      </section>

      <section className="grid gap-3 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        {([
          ["require_vendor_approval", "Require vendor approval", "New vendor applications remain pending until reviewed."],
          ["require_product_approval", "Require product approval", "Submitted products require marketplace moderation."],
          ["allow_guest_checkout", "Allow guest checkout", "Customers may buy without creating an account."],
          ["demo_mode", "Demo mode", "Permit demo fallbacks on supported non-financial screens."],
        ] as const).map(([key, label, description]) => (
          <label key={key} className="flex items-start gap-3 rounded-md border border-border bg-background p-3">
            <input type="checkbox" checked={settings[key]} onChange={(e) => set(key, e.target.checked)} className="mt-1" />
            <span>
              <span className="block text-sm font-medium text-navy">{label}</span>
              <span className="block text-xs text-muted-foreground">{description}</span>
            </span>
          </label>
        ))}
      </section>

      <button disabled={saving} className="rounded-md bg-electric px-5 py-2 text-sm font-semibold text-electric-foreground disabled:opacity-50">
        {saving ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

export const Route = createFileRoute("/admin/settings")({ component: Page });
