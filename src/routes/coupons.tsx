import { createFileRoute, Link } from "@tanstack/react-router";
import { Ticket, Check } from "lucide-react";
import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { toast } from "sonner";

export const Route = createFileRoute("/coupons")({
  component: CouponsPage,
  head: () => ({
    meta: [
      { title: "Coupons & promo codes — 1LV.CA" },
      { name: "description", content: "Active coupons, promo codes and shopping discounts on 1LV.CA. Save more on every order." },
    ],
  }),
});

const COUPONS = [
  { code: "WELCOME10", label: "10% off your first order", details: "No minimum. New shoppers only.", expires: "Always on" },
  { code: "FREESHIP", label: "Free Canada-wide shipping", details: "Minimum $35 order.", expires: "Limited time" },
  { code: "SAVE20", label: "$20 off orders $100+", details: "Excludes already-discounted items.", expires: "Ends Sunday" },
  { code: "FLASH5", label: "Extra 5% off Flash Deals", details: "Stacks with daily deals.", expires: "Today only" },
  { code: "LOCAL15", label: "15% off Canadian vendors", details: "Featured local sellers.", expires: "This week" },
  { code: "BUNDLE25", label: "$25 off bundles of 3+", details: "Auto-applies in cart.", expires: "Ongoing" },
];

function CouponsPage() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      toast.success(`Copied ${code}`);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Could not copy code");
    }
  };

  return (
    <AppLayout>
      <section className="bg-gradient-deal text-white">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <p className="text-xs font-bold uppercase tracking-widest text-white/80">Coupon center</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-3xl font-extrabold">
            <Ticket size={26} /> Active coupons
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/85">Tap to copy a code, then paste it at checkout to save.</p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {COUPONS.map((c) => (
            <div key={c.code} className="rounded-xl border-2 border-dashed border-deal/40 bg-deal/5 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-deal">{c.expires}</div>
              <div className="mt-1 text-lg font-extrabold text-navy">{c.label}</div>
              <p className="mt-1 text-xs text-muted-foreground">{c.details}</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="flex-1 rounded-md border border-dashed border-deal bg-white px-3 py-2 text-center font-mono text-sm font-bold text-deal">
                  {c.code}
                </span>
                <button
                  onClick={() => copy(c.code)}
                  className="rounded-md bg-deal px-3 py-2 text-xs font-bold text-deal-foreground hover:opacity-90"
                >
                  {copied === c.code ? <Check size={14} /> : "Copy"}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-border bg-card p-5 text-sm">
          <p className="font-semibold text-navy">How to use coupons</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Copy a code above.</li>
            <li>Add eligible items to your <Link to="/cart" className="text-electric hover:underline">cart</Link>.</li>
            <li>Paste the code in the coupon field at checkout.</li>
          </ol>
        </div>
      </section>
    </AppLayout>
  );
}
