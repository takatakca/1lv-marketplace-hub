import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, MapPin, Mail, Phone, Package } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { getVendorBySlug, type VendorRecord } from "@/services/vendors";
import { listVendorProducts, type ProductRecord } from "@/services/products";
import { resolveAssetUrl } from "@/services/vendor-assets";
import { formatCAD } from "@/lib/data";

export const Route = createFileRoute("/store/$slug")({
  loader: async ({ params }) => {
    const vendor = await getVendorBySlug(params.slug);
    if (!vendor) throw notFound();
    const products = await listVendorProducts(vendor.id);
    return { vendor, products: products.filter((p) => p.status === "active") };
  },
  errorComponent: ({ error }) => (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-navy">Couldn't load this store</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </AppLayout>
  ),
  notFoundComponent: () => (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-electric">Store not found</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-navy">This store doesn't exist</h1>
        <p className="mt-2 text-sm text-muted-foreground">It may have been removed or the link is incorrect.</p>
        <Link to="/categories" className="mt-6 inline-flex rounded-md bg-electric px-5 py-2.5 text-sm font-semibold text-white">Browse marketplace</Link>
      </div>
    </AppLayout>
  ),
  component: StorePage,
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.vendor.store_name} — 1LV.CA` },
          { name: "description", content: loaderData.vendor.description ?? `Shop products from ${loaderData.vendor.store_name} on 1LV.CA.` },
          { property: "og:title", content: `${loaderData.vendor.store_name} — 1LV.CA` },
          { property: "og:description", content: loaderData.vendor.description ?? "" },
        ]
      : [],
  }),
});

function StorePage() {
  const { vendor, products } = Route.useLoaderData() as { vendor: VendorRecord; products: ProductRecord[] };
  const [logo, setLogo] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    resolveAssetUrl(vendor.logo_url).then(setLogo);
    resolveAssetUrl(vendor.banner_url).then(setBanner);
  }, [vendor.logo_url, vendor.banner_url]);

  const verified = vendor.status === "active";
  const suspended = vendor.status === "suspended" || vendor.status === "rejected";

  return (
    <AppLayout>
      <div className="relative h-40 w-full overflow-hidden bg-gradient-hero md:h-56">
        {banner && <img src={banner} alt="" className="h-full w-full object-cover opacity-90" />}
      </div>
      <div className="mx-auto -mt-12 max-w-6xl px-4">
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-elevated sm:flex-row sm:items-center">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-electric text-2xl font-extrabold text-white">
            {logo ? <img src={logo} alt={vendor.store_name} className="h-full w-full object-cover" /> : vendor.store_name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-extrabold text-navy">{vendor.store_name}</h1>
              {verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-bold text-success">
                  <ShieldCheck size={12} /> Verified vendor
                </span>
              )}
              {suspended && (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive">Currently unavailable</span>
              )}
              {!verified && !suspended && (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-bold text-warning">Pending approval</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {(vendor.city || vendor.country) && (
                <span className="inline-flex items-center gap-1"><MapPin size={11} /> {[vendor.city, vendor.province, vendor.country].filter(Boolean).join(", ")}</span>
              )}
              <span className="inline-flex items-center gap-1"><Package size={11} /> {products.length} product{products.length === 1 ? "" : "s"}</span>
            </div>
            {vendor.description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{vendor.description}</p>}
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            {vendor.contact_email && (
              <a href={`mailto:${vendor.contact_email}`} className="inline-flex items-center gap-1.5 rounded-md bg-electric px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
                <Mail size={12} /> Contact store
              </a>
            )}
            {vendor.phone && (
              <a href={`tel:${vendor.phone}`} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-semibold text-navy hover:border-electric">
                <Phone size={12} /> {vendor.phone}
              </a>
            )}
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_280px]">
          <section>
            <h2 className="mb-4 font-display text-xl font-bold text-navy">Products</h2>
            {products.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
                This store hasn't published any products yet.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {products.map((p) => (
                  <div key={p.id} className="group overflow-hidden rounded-xl border border-border bg-card transition hover:border-electric/40 hover:shadow-elevated">
                    <div className="aspect-square overflow-hidden bg-muted">
                      {p.images?.[0] ? (
                        <img src={p.images[0]} alt={p.title} className="h-full w-full object-cover transition group-hover:scale-105" />
                      ) : (
                        <div className="grid h-full place-items-center text-xs text-muted-foreground">No image</div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="line-clamp-2 text-sm font-semibold text-navy">{p.title}</div>
                      <div className="mt-1 text-sm font-bold text-electric">{formatCAD(Number(p.price))}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-4">
            {vendor.shipping_policy && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-bold text-navy">Shipping</h3>
                <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{vendor.shipping_policy}</p>
              </div>
            )}
            {vendor.return_policy && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-bold text-navy">Returns</h3>
                <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{vendor.return_policy}</p>
              </div>
            )}
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
              Vendor on 1LV.CA since {new Date(vendor.created_at).toLocaleDateString("en-CA", { month: "short", year: "numeric" })}.
            </div>
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}
