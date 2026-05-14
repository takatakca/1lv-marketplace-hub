import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getMyVendor, upsertMyVendor } from "@/services/vendors";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

const FIELDS: [keyof FormState, string][] = [
  ["store_name", "Store name"],
  ["business_name", "Business name"],
  ["contact_email", "Contact email"],
  ["phone", "Phone"],
  ["address", "Address"],
  ["city", "City"],
  ["province", "Province"],
  ["postal_code", "Postal code"],
];

type FormState = {
  store_name: string; business_name: string; contact_email: string; phone: string;
  address: string; city: string; province: string; postal_code: string;
  description: string; shipping_policy: string; return_policy: string;
};

const empty: FormState = {
  store_name: "", business_name: "", contact_email: "", phone: "",
  address: "", city: "", province: "", postal_code: "",
  description: "", shipping_policy: "", return_policy: "",
};

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [form, setForm] = useState<FormState>(empty);
  const [loading, setLoading] = useState(!demo);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (demo) return;
    getMyVendor(user!.id)
      .then((v) => {
        if (v) setForm({
          store_name: v.store_name ?? "",
          business_name: v.business_name ?? "",
          contact_email: v.contact_email ?? user!.email ?? "",
          phone: v.phone ?? "",
          address: v.address ?? "",
          city: v.city ?? "",
          province: v.province ?? "",
          postal_code: v.postal_code ?? "",
          description: v.description ?? "",
          shipping_policy: v.shipping_policy ?? "",
          return_policy: v.return_policy ?? "",
        });
      })
      .finally(() => setLoading(false));
  }, [demo, user]);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (demo) { toast.success("Application submitted (demo)"); return; }
    if (!form.store_name.trim()) { toast.error("Store name is required"); return; }
    setSaving(true);
    try {
      await upsertMyVendor(user!.id, form);
      toast.success("Vendor profile saved. Pending admin review.");
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        {demo ? <DemoBanner label="Preview mode" /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Vendor onboarding</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tell us about your store</p>
      </div>
      {demo ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm">
          <PreviewModeNotice />
          <Link to="/login" className="inline-flex rounded-md bg-electric px-4 py-2 font-semibold text-electric-foreground">
            Sign in to start onboarding
          </Link>
        </div>
      ) : loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <form onSubmit={submit} className="space-y-5 rounded-xl border border-border bg-card p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map(([k, l]) => (
              <label key={k} className="block text-sm">
                <span className="mb-1 block font-medium text-navy">{l}</span>
                <input value={form[k]} onChange={set(k)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </label>
            ))}
          </div>
          {([["description", "Store description"], ["shipping_policy", "Shipping policy"], ["return_policy", "Return policy"]] as const).map(([k, l]) => (
            <label key={k} className="block text-sm">
              <span className="mb-1 block font-medium text-navy">{l}</span>
              <textarea value={form[k]} onChange={set(k)} rows={3} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </label>
          ))}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Logo upload (placeholder)</div>
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Banner upload (placeholder)</div>
          </div>
          <button type="submit" disabled={saving} className="rounded-md bg-electric px-5 py-2.5 text-sm font-semibold text-electric-foreground disabled:opacity-50">
            {saving ? "Saving…" : "Save vendor profile"}
          </button>
        </form>
      )}
    </div>
  );
}

export const Route = createFileRoute("/vendor/onboarding")({ component: Page });
