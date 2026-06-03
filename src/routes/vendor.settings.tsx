import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getMyVendor, setVendorAssetUrl, upsertMyVendor, type VendorRecord } from "@/services/vendors";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";
import { VendorAssetUpload } from "@/components/VendorAssetUpload";

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

const REQUIRED: (keyof FormState)[] = ["store_name", "contact_email", "address", "city", "postal_code"];

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [form, setForm] = useState<FormState>(empty);
  const [loading, setLoading] = useState(!demo);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [vendor, setVendor] = useState<VendorRecord | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (demo) {
      setForm({
        ...empty,
        store_name: "Northstar Tech", business_name: "Northstar Tech Inc.",
        contact_email: "owner@northstar.ca", phone: "+1 514 555 0199",
        address: "123 Rue Sherbrooke", city: "Montréal", province: "QC", postal_code: "H2X 1Y9",
        shipping_policy: "Ships within 2 business days, Canada Post.",
        return_policy: "30-day returns on unopened items.",
      });
      return;
    }
    getMyVendor(user!.id)
      .then((v) => {
        if (v) {
          setVendor(v);
          setLogo(v.logo_url);
          setBanner(v.banner_url);
          setForm({
            store_name: v.store_name ?? "", business_name: v.business_name ?? "",
            contact_email: v.contact_email ?? "", phone: v.phone ?? "",
            address: v.address ?? "", city: v.city ?? "", province: v.province ?? "", postal_code: v.postal_code ?? "",
            description: v.description ?? "", shipping_policy: v.shipping_policy ?? "", return_policy: v.return_policy ?? "",
          });
          setLastSaved(v.updated_at);
        }
      })
      .finally(() => setLoading(false));
  }, [demo, user]);

  const handleAsset = async (field: "logo_url" | "banner_url", path: string | null) => {
    if (field === "logo_url") setLogo(path); else setBanner(path);
    if (demo || !vendor) return;
    try { await setVendorAssetUrl(vendor.id, field, path); }
    catch (e) { toast.error((e as Error).message); }
  };

  const validate = () => {
    const e: Partial<Record<keyof FormState, string>> = {};
    for (const k of REQUIRED) if (!form[k].trim()) e[k] = "Required";
    if (form.contact_email && !/^\S+@\S+\.\S+$/.test(form.contact_email)) e.contact_email = "Invalid email";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) { toast.error("Please fix required fields"); return; }
    if (demo) { toast.success("Settings saved (demo)"); setLastSaved(new Date().toISOString()); return; }
    setSaving(true);
    try {
      const v = await upsertMyVendor(user!.id, form);
      setLastSaved(v.updated_at);
      toast.success("Settings saved");
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const inputCls = (k: keyof FormState) =>
    "w-full rounded-md border bg-background px-3 py-2 text-sm " + (errors[k] ? "border-destructive" : "border-border");

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div>
          {demo ? <DemoBanner label="Preview mode" /> : null}
          <h1 className="text-2xl font-bold text-navy md:text-3xl">Store settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Configure your storefront</p>
        </div>
        {lastSaved && (
          <span className="text-xs text-muted-foreground">Last saved {new Date(lastSaved).toLocaleString("en-CA")}</span>
        )}
      </div>
      {demo && <PreviewModeNotice />}
      {!demo && loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <form onSubmit={submit} className="space-y-6 rounded-xl border border-border bg-card p-6">
          <section>
            <h3 className="mb-3 text-sm font-bold text-navy">Business info</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ["store_name", "Store name *"],
                ["business_name", "Legal business name"],
                ["contact_email", "Contact email *"],
                ["phone", "Phone"],
              ] as [keyof FormState, string][]).map(([k, l]) => (
                <label key={k} className="block text-sm">
                  <span className="mb-1 block font-medium text-navy">{l}</span>
                  <input value={form[k]} onChange={set(k)} className={inputCls(k)} />
                  {errors[k] && <span className="mt-1 block text-xs text-destructive">{errors[k]}</span>}
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-navy">Address</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ["address", "Street *"],
                ["city", "City *"],
                ["province", "Province"],
                ["postal_code", "Postal code *"],
              ] as [keyof FormState, string][]).map(([k, l]) => (
                <label key={k} className="block text-sm">
                  <span className="mb-1 block font-medium text-navy">{l}</span>
                  <input value={form[k]} onChange={set(k)} className={inputCls(k)} />
                  {errors[k] && <span className="mt-1 block text-xs text-destructive">{errors[k]}</span>}
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-navy">Public store profile</h3>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-navy">Description</span>
              <textarea value={form.description} onChange={set("description")} rows={3} className={inputCls("description")} />
            </label>
            <div className="mt-3 rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <strong className="text-navy">Preview:</strong> {form.store_name || "Your store"} — {form.description || "Add a short description so shoppers know who you are."}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-navy">Policies</h3>
            <div className="grid gap-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-navy">Shipping policy</span>
                <textarea value={form.shipping_policy} onChange={set("shipping_policy")} rows={3} className={inputCls("shipping_policy")} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-navy">Return policy</span>
                <textarea value={form.return_policy} onChange={set("return_policy")} rows={3} className={inputCls("return_policy")} />
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-bold text-navy">Branding</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Logo upload (coming soon)</div>
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Banner upload (coming soon)</div>
            </div>
          </section>

          <div className="flex gap-3 border-t border-border pt-4">
            <button type="submit" disabled={saving} className="rounded-md bg-electric px-5 py-2.5 text-sm font-semibold text-electric-foreground disabled:opacity-50">
              {saving ? "Saving…" : "Save settings"}
            </button>
            {!demo && <Link to="/vendor/onboarding" className="rounded-md border border-border px-4 py-2 text-sm font-semibold">Full onboarding</Link>}
          </div>
        </form>
      )}
    </div>
  );
}

export const Route = createFileRoute("/vendor/settings")({ component: Page });
