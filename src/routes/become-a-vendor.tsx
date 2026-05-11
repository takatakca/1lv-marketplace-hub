import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { CheckCircle2, Globe2, ShieldCheck, Wallet } from "lucide-react";

export const Route = createFileRoute("/become-a-vendor")({
  component: BecomeVendor,
  head: () => ({ meta: [
    { title: "Sell on 1LV.CA — Become a vendor" },
    { name: "description", content: "Join 1LV.CA and reach Canadian shoppers. List products in minutes, manage orders, get paid in CAD." },
  ] }),
});

function BecomeVendor() {
  return (
    <AppLayout>
      <section className="bg-gradient-hero text-white">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center">
          <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">For vendors</span>
          <h1 className="mt-4 font-display text-4xl font-extrabold md:text-5xl">Sell on Canada's fastest-growing marketplace.</h1>
          <p className="mx-auto mt-3 max-w-xl text-white/80">List your products, manage orders from one dashboard, and get paid in CAD with low commissions.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/signup" className="rounded-md bg-electric px-6 py-3 text-sm font-bold text-electric-foreground shadow-glow hover:opacity-90">Apply now</Link>
            <Link to="/vendor-pricing" className="rounded-md border border-white/30 px-6 py-3 text-sm font-semibold hover:bg-white/10">See pricing</Link>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-6 px-4 py-16 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Globe2, title: "Reach all of Canada", body: "Get in front of millions of Canadian shoppers from day one." },
          { icon: Wallet, title: "Get paid in CAD", body: "Weekly payouts, transparent commissions, no hidden fees." },
          { icon: ShieldCheck, title: "Buyer protection", body: "We handle disputes and fraud — you focus on selling." },
          { icon: CheckCircle2, title: "Easy onboarding", body: "List your first product in under 10 minutes." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-border bg-card p-5">
            <f.icon className="text-electric" />
            <h3 className="mt-3 font-bold text-navy">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>
    </AppLayout>
  );
}
