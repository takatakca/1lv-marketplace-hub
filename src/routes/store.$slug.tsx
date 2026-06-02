import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, Mail, AlertTriangle, Store as StoreIcon } from "lucide-react";
import { getVendorBySlug, getActiveProductsByVendor } from "@/services/vendor-public";
import type { VendorRecord } from "@/services/vendors";
import type { ProductRecord } from "@/services/products";
import { formatCAD } from "@/lib/data";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success/15 text-success",
    pending: "bg-deal/15 text-deal",
    suspended: "bg-destructive/15 text-destructive",
    rejected: "bg-muted text-muted-foreground",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${map[status] ?? "bg-muted"}`}>{status}</span>;
}

function Page() {
  const { slug } = Route.useParams();
  const [vendor, setVendor] = useState<VendorRecord | null>(null);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const v = await getVendorBySlug(slug);
        if (!v) { setMissing(true); return; }
        setVendor(v);
        setProducts(await getActiveProductsByVendor(v.id));
      } catch { setMissing(true); }
      finally { setLoading(false); }
    })();
  }, [slug]);

  if (loading) return <div className="mx-auto max-w-6xl p-6 text-sm text-muted-foreground">Loading store…</div>;

  if (missing || !vendor) {
    return (
      <div className="mx-auto max-w-2xl p-10 text-center">
        <AlertTriangle className="mx-auto mb-3 text-deal" />
        <h1 className="text-2xl font-bold text-navy">Store not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">The store “{slug}” doesn’t exist or is unavailable.</p>
        <Link to="/" className="mt-4 inline-block rounded-md bg-electric px-4 py-2 text-sm font-semibold text-electric-foreground">Back to home</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="relative h-40 w-full bg-gradient-to-r from-navy/80 to-electric/60 sm:h-56">
          {vendor.banner_url && <img src={vendor.banner_url} alt={`${vendor.store_name} banner`} className="h-full w-full object-cover" />}
        </div>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="h-20 w-20 shrink-0 -mt-12 overflow-hidden rounded-xl border-4 border-card bg-muted sm:h-24 sm:w-24">
            {vendor.logo_url
              ? <img src={vendor.logo_url} alt={vendor.store_name} className="h-full w-full object-cover" />
              : <div className="grid h-full w-full place-items-center text-muted-foreground"><StoreIcon /></div>}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-navy">{vendor.store_name}</h1>
              <StatusBadge status={vendor.status} />
              {vendor.status === "active" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-electric/10 px-2 py-0.5 text-[11px] font-semibold text-electric">
                  <ShieldCheck size={12} /> Verified
                </span>
              )}
            </div>
            {vendor.city && <p className="mt-1 text-xs text-muted-foreground">{[vendor.city, vendor.province, vendor.country].filter(Boolean).join(", ")}</p>}
            {vendor.description && <p className="mt-2 text-sm text-muted-foreground">{vendor.description}</p>}
          </div>
          {vendor.contact_email && (
            <a href={`mailto:${vendor.contact_email}`} className="inline-flex items-center gap-2 self-start rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
              <Mail size={14} /> Contact store
            </a>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section>
          <h2 className="mb-3 text-lg font-bold text-navy">Products ({products.length})</h2>
          {products.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No active products yet.</div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {products.map((p) => (
                <Link key={p.id} to="/product/$slug" params={{ slug: p.slug }} className="group rounded-lg border border-border bg-card overflow-hidden hover:border-electric/50">
                  <div className="aspect-square overflow-hidden bg-muted">
                    {p.images?.[0] && <img src={p.images[0]} alt={p.title} className="h-full w-full object-cover transition group-hover:scale-105" />}
                  </div>
                  <div className="p-3">
                    <div className="line-clamp-2 text-sm font-medium text-navy">{p.title}</div>
                    <div className="mt-1 text-sm font-bold text-electric">{formatCAD(Number(p.price))}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-bold text-navy">Shipping policy</h3>
            <p className="whitespace-pre-line text-xs text-muted-foreground">{vendor.shipping_policy || "Not specified."}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-bold text-navy">Return policy</h3>
            <p className="whitespace-pre-line text-xs text-muted-foreground">{vendor.return_policy || "Not specified."}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/store/$slug")({
  component: Page,
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} — Store on 1LV.CA` },
      { name: "description", content: `Browse products from ${params.slug} on 1LV.CA marketplace.` },
    ],
  }),
});


