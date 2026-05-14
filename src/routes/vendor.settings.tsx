import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getMyVendor, upsertMyVendor } from "@/services/vendors";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

type FormState = {
  store_name: string; contact_email: string; phone: string; address: string;
  shipping_policy: string; return_policy: string;
};

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [form, setForm] = useState<FormState>({
    store_name: "", contact_email: "", phone: "", address: "",
    shipping_policy: "", return_policy: "",
  });
  const [loading, setLoading] = useState(!demo);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (demo) {
      setForm({
        store_name: "Northstar Tech", contact_email: "owner@northstar.ca",
        phone: "+1 514 555 0199", address: "123 Rue Sherbrooke, Montréal, QC",
        shipping_policy: "Ships within 2 business days, Canada Post.",
        return_policy: "30-day returns on unopened items.",
      });
      return;
    }
    getMyVendor(user!.id)
      .then((v) => {
        if (v) setForm({
          store_name: v.store_name ?? "",
          contact_email: v.contact_email ?? "",
          phone: v.phone ?? "",
          address: v.address ?? "",
          shipping_policy: v.shipping_policy ?? "",
          return_policy: v.return_policy ?? "",
        });
      })
      .finally(() => setLoading(false));
  }, [demo, user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (demo) { toast.success("Settings saved (demo)"); return; }
    setSaving(true);
    try { await upsertMyVendor(user!.id, form); toast.success("Settings saved"); }
    catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        {demo ? <DemoBanner label="Preview mode" /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Store settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure your storefront</p>
      </div>
      {demo && <PreviewModeNotice />}
      {demo ? null : loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : null}
      <form onSubmit={submit} className="space-y-5 rounded-xl border border-border bg-card p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Logo placeholder</div>
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Banner placeholder</div>
        </div>
        {(Object.entries(form) as [keyof FormState, string][]).map(([k, v]) => (
          <label key={k} className="block text-sm">
            <span className="mb-1 block font-medium capitalize text-navy">{k.replaceAll("_", " ")}</span>
            {k === "shipping_policy" || k === "return_policy" ? (
              <textarea rows={3} value={v} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            ) : (
              <input value={v} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            )}
          </label>
        ))}
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="rounded-md bg-electric px-5 py-2.5 text-sm font-semibold text-electric-foreground disabled:opacity-50">
            {saving ? "Saving…" : "Save settings"}
          </button>
          {!demo && <Link to="/vendor/onboarding" className="rounded-md border border-border px-4 py-2 text-sm font-semibold">Full onboarding</Link>}
        </div>
      </form>
    </div>
  );
}

export const Route = createFileRoute("/vendor/settings")({ component: Page });
