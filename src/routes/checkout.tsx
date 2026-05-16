import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCart } from "@/hooks/use-cart";
import { formatCAD } from "@/lib/data";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { createOrder, type Address } from "@/services/checkout";
import { createPaymentIntent, isStripeConfigured } from "@/services/payments";

export const Route = createFileRoute("/checkout")({
  component: Checkout,
  head: () => ({ meta: [{ title: "Checkout — 1LV.CA" }] }),
});

function Field({ label, name, ...props }: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-navy">{label}</span>
      <input
        name={name}
        {...props}
        className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-electric"
      />
    </label>
  );
}

function Checkout() {
  const { items, subtotal, clear } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const shipping = subtotal === 0 || subtotal >= 49 ? 0 : 7.99;
  const taxes = +(subtotal * 0.14975).toFixed(2);
  const total = +(subtotal + shipping + taxes).toFixed(2);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (items.length === 0) return;
    setSubmitting(true);
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");

    const shipping_address: Address = {
      first_name: get("first_name"),
      last_name: get("last_name"),
      address: get("address"),
      city: get("city"),
      province: get("province"),
      postal_code: get("postal_code"),
      country: "Canada",
    };

    try {
      const result = await createOrder({
        items,
        email: get("email"),
        phone: get("phone"),
        shipping_address,
        customer_id: user?.id ?? null,
        subtotal,
        shipping_total: shipping,
        tax_total: taxes,
        total,
      });

      // Prepare payment intent (Stripe placeholder)
      const intent = await createPaymentIntent(result.order_id, total);
      if (!isStripeConfigured() || intent.pending) {
        toast.success(
          result.demo
            ? "Demo order placed — Stripe setup required for live payment."
            : "Order created — pending payment (Stripe setup required).",
        );
      } else {
        toast.success("Order placed!");
      }

      clear();
      nav({
        to: "/order-confirmation",
        search: { order: result.order_number, demo: result.demo ? 1 : 0 } as never,
      });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not place order");
    } finally {
      setSubmitting(false);
    }
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
                <Field label="Email" name="email" type="email" required defaultValue={user?.email ?? ""} placeholder="you@example.com" />
                <Field label="Phone" name="phone" required placeholder="+1 514 555 0123" />
              </div>
              {!user && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Checking out as guest. <a className="text-electric hover:underline" href="/login">Sign in</a> to save your orders.
                </p>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-bold text-navy">Shipping address</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name" name="first_name" required />
                <Field label="Last name" name="last_name" required />
                <Field label="Address" name="address" required className="sm:col-span-2" />
                <Field label="City" name="city" required />
                <Field label="Province" name="province" required defaultValue="QC" />
                <Field label="Postal code" name="postal_code" required placeholder="H2X 1Y4" />
                <Field label="Country" name="country" defaultValue="Canada" readOnly />
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-bold text-navy">Payment</h2>
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                <Lock size={12} /> {isStripeConfigured() ? "Stripe-ready · Test mode" : "Stripe setup required — orders will be created in pending-payment mode"}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Card number" name="card" placeholder="4242 4242 4242 4242" className="sm:col-span-2" />
                <Field label="Expiry" name="exp" placeholder="12/28" />
                <Field label="CVC" name="cvc" placeholder="123" />
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
