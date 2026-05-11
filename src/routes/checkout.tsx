import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCart } from "@/hooks/use-cart";
import { formatCAD } from "@/lib/data";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout")({
  component: Checkout,
  head: () => ({ meta: [{ title: "Checkout — 1LV.CA" }] }),
});

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-navy">{label}</span>
      <input
        {...props}
        className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-electric"
      />
    </label>
  );
}

function Checkout() {
  const { items, subtotal, clear } = useCart();
  const nav = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const shipping = subtotal === 0 || subtotal >= 49 ? 0 : 7.99;
  const taxes = subtotal * 0.14975;
  const total = subtotal + shipping + taxes;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      clear();
      toast.success("Order placed!");
      nav({ to: "/order-confirmation" });
    }, 700);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="font-display text-3xl font-extrabold text-navy">Checkout</h1>
        <form onSubmit={onSubmit} className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-bold text-navy">Contact</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email" type="email" required placeholder="you@example.com" />
                <Field label="Phone" required placeholder="+1 514 555 0123" />
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-bold text-navy">Shipping address</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name" required />
                <Field label="Last name" required />
                <Field label="Address" required className="sm:col-span-2" />
                <Field label="City" required />
                <Field label="Province" required defaultValue="QC" />
                <Field label="Postal code" required placeholder="H2X 1Y4" />
                <Field label="Country" defaultValue="Canada" readOnly />
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-bold text-navy">Payment</h2>
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                <Lock size={12} /> Stripe-ready · Test mode
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Card number" placeholder="4242 4242 4242 4242" className="sm:col-span-2" />
                <Field label="Expiry" placeholder="12/28" />
                <Field label="CVC" placeholder="123" />
              </div>
            </section>
          </div>

          <aside className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-card lg:sticky lg:top-28 lg:self-start">
            <h3 className="font-bold text-navy">Order summary</h3>
            <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
              {items.map((it) => (
                <li key={it.productId} className="flex gap-3">
                  <img src={it.image} alt="" className="h-12 w-12 rounded object-cover" />
                  <div className="flex-1 text-xs">
                    <p className="line-clamp-2 font-medium text-navy">{it.title}</p>
                    <p className="text-muted-foreground">Qty {it.qty}</p>
                  </div>
                  <span className="text-sm font-semibold">{formatCAD(it.price * it.qty)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-y border-border py-3 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatCAD(subtotal)}</dd></div>
              <div className="flex justify-between"><dt>Shipping</dt><dd>{shipping === 0 ? "Free" : formatCAD(shipping)}</dd></div>
              <div className="flex justify-between"><dt>Tax (QC)</dt><dd>{formatCAD(taxes)}</dd></div>
            </dl>
            <div className="flex items-baseline justify-between">
              <span className="font-bold text-navy">Total</span>
              <span className="text-xl font-extrabold text-navy">{formatCAD(total)}</span>
            </div>
            <button
              type="submit"
              disabled={submitting || items.length === 0}
              className="w-full rounded-md bg-electric px-4 py-3 text-sm font-bold text-electric-foreground shadow-glow hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Processing…" : `Pay ${formatCAD(total)}`}
            </button>
          </aside>
        </form>
      </div>
    </AppLayout>
  );
}
