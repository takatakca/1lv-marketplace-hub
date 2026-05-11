import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";

export const Route = createFileRoute("/vendor-pricing")({
  component: VendorPricing,
  head: () => ({ meta: [{ title: "Vendor pricing — 1LV.CA" }] }),
});

const tiers = [
  { name: "Starter", price: "Free", desc: "Perfect to test the waters.", features: ["Up to 25 products", "8% commission", "Standard support"], featured: false },
  { name: "Growth", price: "$29 / mo", desc: "For growing brands.", features: ["Up to 500 products", "5% commission", "Priority support", "Promotion tools"], featured: true },
  { name: "Scale", price: "$99 / mo", desc: "High-volume sellers.", features: ["Unlimited products", "3% commission", "Dedicated manager", "API access"], featured: false },
];

function VendorPricing() {
  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-16">
        <div className="text-center">
          <h1 className="font-display text-4xl font-extrabold text-navy">Simple, fair pricing.</h1>
          <p className="mt-2 text-muted-foreground">Pick a plan. Cancel anytime. CAD pricing.</p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {tiers.map((t) => (
            <div key={t.name} className={`relative flex flex-col rounded-2xl border bg-card p-6 ${t.featured ? "border-electric shadow-elevated" : "border-border"}`}>
              {t.featured && <span className="absolute -top-3 left-6 rounded-full bg-electric px-3 py-1 text-[10px] font-bold uppercase text-electric-foreground">Most popular</span>}
              <h3 className="font-display text-xl font-extrabold text-navy">{t.name}</h3>
              <p className="text-sm text-muted-foreground">{t.desc}</p>
              <p className="mt-4 text-3xl font-extrabold text-navy">{t.price}</p>
              <ul className="mt-5 space-y-2 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-navy"><Check size={16} className="text-success" /> {f}</li>
                ))}
              </ul>
              <Link to="/signup" className={`mt-6 rounded-md px-4 py-2.5 text-center text-sm font-bold ${t.featured ? "bg-electric text-electric-foreground" : "bg-navy text-navy-foreground"} hover:opacity-90`}>
                Get started
              </Link>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
