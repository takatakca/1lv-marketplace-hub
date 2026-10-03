import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { usePublicMarketplaceSettings } from "@/hooks/use-marketplace-settings";
import {
  getMyVendor,
  setVendorAssetUrl,
  upsertMyVendor,
  type VendorRecord,
} from "@/services/vendors";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";
import { VendorAssetUpload } from "@/components/VendorAssetUpload";

const FIELDS: [keyof FormState, string][] = [
  ["store_name", "Store name"],
  ["business_name", "Legal business name"],
  ["contact_email", "Contact email"],
  ["phone", "Phone"],
  ["address", "Street address"],
  ["city", "City"],
  ["province", "Province / territory"],
  ["postal_code", "Postal code"],
];

type FormState = {
  store_name: string;
  business_name: string;
  contact_email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  description: string;
  shipping_policy: string;
  return_policy: string;
};

const empty: FormState = {
  store_name: "",
  business_name: "",
  contact_email: "",
  phone: "",
  address: "",
  city: "",
  province: "",
  postal_code: "",
  description: "",
  shipping_policy: "",
  return_policy: "",
};

function Page() {
  const { user } = useAuth();
  const { settings: marketplaceSettings } = usePublicMarketplaceSettings();
  const demo = isDemoMode(user);
  const [form, setForm] = useState<FormState>(empty);
  const [loading, setLoading] = useState(!demo);
  const [saving, setSaving] = useState(false);
  const [vendor, setVendor] = useState<VendorRecord | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    getMyVendor(user!.id)
      .then((record) => {
        if (!record) return;
        setVendor(record);
        setLogo(record.logo_url);
        setBanner(record.banner_url);
        setForm({
          store_name: record.store_name ?? "",
          business_name: record.business_name ?? "",
          contact_email: record.contact_email ?? user!.email ?? "",
          phone: record.phone ?? "",
          address: record.address ?? "",
          city: record.city ?? "",
          province: record.province ?? "",
          postal_code: record.postal_code ?? "",
          description: record.description ?? "",
          shipping_policy: record.shipping_policy ?? "",
          return_policy: record.return_policy ?? "",
        });
      })
      .finally(() => setLoading(false));
  }, [demo, user]);

  const set = (key: keyof FormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [key]: event.target.value });

  const handleAsset = async (
    field: "logo_url" | "banner_url",
    path: string | null,
  ) => {
    if (field === "logo_url") setLogo(path);
    else setBanner(path);

    if (demo || !vendor) return;
    try {
      await setVendorAssetUrl(vendor.id, field, path);
      setVendor({
        ...vendor,
        [field]: path,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update store asset.");
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (demo) {
      toast.success("Application submitted (demo)");
      return;
    }
    if (!form.store_name.trim()) {
      toast.error("Store name is required");
      return;
    }
    if (!form.contact_email.trim()) {
      toast.error("Contact email is required");
      return;
    }
    if (form.contact_email && !/^\S+@\S+\.\S+$/.test(form.contact_email)) {
      toast.error("Enter a valid contact email");
      return;
    }

    setSaving(true);
    try {
      const saved = await upsertMyVendor(user!.id, {
        ...form,
        postal_code: form.postal_code.trim().toUpperCase(),
      });
      setVendor(saved);
      setLogo(saved.logo_url);
      setBanner(saved.banner_url);
      toast.success(
        saved.status === "active"
          ? marketplaceSettings?.require_vendor_approval === false
            ? "Vendor profile saved and activated."
            : "Vendor profile updated."
          : "Vendor profile saved. Pending admin review.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save vendor profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        {demo ? <DemoBanner label="Preview mode" /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Vendor onboarding</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build the business profile customers and marketplace operations will rely on.
        </p>
      </div>

      {demo ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm">
          <PreviewModeNotice />
          <Link
            to="/login"
            className="inline-flex rounded-md bg-electric px-4 py-2 font-semibold text-electric-foreground"
          >
            Sign in to start onboarding
          </Link>
        </div>
      ) : loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <form onSubmit={submit} className="space-y-6 rounded-xl border border-border bg-card p-6">
          <section>
            <h2 className="mb-3 text-sm font-bold text-navy">Business information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map(([key, label]) => (
                <label key={key} className="block text-sm">
                  <span className="mb-1 block font-medium text-navy">{label}</span>
                  <input
                    value={form[key]}
                    onChange={set(key)}
                    autoComplete={
                      key === "contact_email"
                        ? "email"
                        : key === "phone"
                          ? "tel"
                          : key === "postal_code"
                            ? "postal-code"
                            : undefined
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-bold text-navy">Storefront profile</h2>
            {([
              ["description", "Store description"],
              ["shipping_policy", "Shipping policy"],
              ["return_policy", "Return policy"],
            ] as const).map(([key, label]) => (
              <label key={key} className="mb-4 block text-sm last:mb-0">
                <span className="mb-1 block font-medium text-navy">{label}</span>
                <textarea
                  value={form[key]}
                  onChange={set(key)}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
            ))}
          </section>

          <section>
            <h2 className="mb-1 text-sm font-bold text-navy">Branding</h2>
            {!vendor && (
              <p className="mb-3 text-xs text-muted-foreground">
                Save the business profile once to create your marketplace store, then upload the logo and banner.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <VendorAssetUpload
                kind="logo"
                label="Logo"
                userId={user?.id}
                value={logo}
                onChange={(path) => handleAsset("logo_url", path)}
                aspect="square"
                disabled={!vendor}
              />
              <VendorAssetUpload
                kind="banner"
                label="Banner"
                userId={user?.id}
                value={banner}
                onChange={(path) => handleAsset("banner_url", path)}
                aspect="banner"
                disabled={!vendor}
              />
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-electric px-5 py-2.5 text-sm font-semibold text-electric-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : vendor ? "Update vendor profile" : "Create vendor profile"}
            </button>
            {vendor?.slug && (
              <Link
                to="/store/$slug"
                params={{ slug: vendor.slug }}
                className="rounded-md border border-border px-4 py-2.5 text-sm font-semibold text-navy"
              >
                Preview public store
              </Link>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

export const Route = createFileRoute("/vendor/onboarding")({ component: Page });
