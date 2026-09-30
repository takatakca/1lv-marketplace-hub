import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { Lock, MapPin } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCart } from "@/hooks/use-cart";
import { formatCAD } from "@/lib/data";
import {
  CANADIAN_PROVINCES,
  calculateCanadianOrderTotals,
  type CanadianProvinceCode,
} from "@/lib/canada-commerce";
import { toast } from "sonner";
import { createOrder, type Address } from "@/services/checkout";
import { createPaymentIntent, isStripeConfigured } from "@/services/payments";
import { StripePaymentForm } from "@/components/StripePaymentForm";
import { useAuth } from "@/hooks/use-auth";
import { saveGuestPaymentContext } from "@/services/guest-payment";

export const Route = createFileRoute("/checkout")({
  component: Checkout,
  head: () => ({
    meta: [
      { title: "Secure checkout — 1LV.CA" },
      {
        name: "description",
        content: "Secure Canadian checkout in CAD with province-based estimated sales tax and protected payments.",
      },
    ],
  }),
});

function Field({
  label,
  name,
  ...props
}: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-navy">{label}</span>
      <input
        name={name}
        {...props}
        className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/10"
      />
    </label>
  );
}

function ProvinceField({
  value,
  onChange,
}: {
  value: CanadianProvinceCode;
  onChange: (value: CanadianProvinceCode) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-navy">Province / territory</span>
      <select
        name="province"
        required
        value={value}
        onChange={(event) => onChange(event.target.value as CanadianProvinceCode)}
        className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/10"
      >
        {CANADIAN_PROVINCES.map((province) => (
          <option key={province.code} value={province.code}>
            {province.name}
          </option>
        ))}
      </select>
    </label>
  );
}

type PricingSnapshot = {
  subtotal: number;
  shipping: number;
  taxes: number;
  total: number;
  taxLabel: string;
};

type PaymentStep = {
  orderId: string;
  orderNumber: string;
  clientSecret: string;
  pricing: PricingSnapshot;
};

function Checkout() {
  const { items, subtotal, clear } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [province, setProvince] = useState<CanadianProvinceCode>("QC");
  const [paymentStep, setPaymentStep] = useState<PaymentStep | null>(null);
  const checkoutKeyRef = useRef<string | null>(null);

  const preview = useMemo(
    () => calculateCanadianOrderTotals({ subtotal, province }),
    [subtotal, province],
  );

  const previewPricing: PricingSnapshot = {
    subtotal: preview.subtotal,
    shipping: preview.shippingTotal,
    taxes: preview.taxTotal,
    total: preview.total,
    taxLabel: preview.taxProfile.taxLabel,
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (items.length === 0 || submitting || paymentStep) return;

    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const get = (key: string) => String(form.get(key) ?? "").trim();

    const shippingAddress: Address = {
      first_name: get("first_name"),
      last_name: get("last_name"),
      address: get("address"),
      city: get("city"),
      province,
      postal_code: get("postal_code").toUpperCase(),
      country: "Canada",
    };

    try {
      checkoutKeyRef.current ??= crypto.randomUUID();
      const result = await createOrder({
        items,
        email: get("email"),
        phone: get("phone"),
        shipping_address: shippingAddress,
        checkout_key: checkoutKeyRef.current,
      });

      if (
        !result.demo &&
        result.checkout_key &&
        result.guest_payment_token
      ) {
        saveGuestPaymentContext({
          orderId: result.order_id,
          orderNumber: result.order_number,
          checkoutKey: result.checkout_key,
          token: result.guest_payment_token,
          createdAt: new Date().toISOString(),
        });
      }

      const intent = await createPaymentIntent(
        result.order_id,
        result.guest_payment_token,
      );

      if (isStripeConfigured() && intent.clientSecret && !intent.pending && !result.demo) {
        setPaymentStep({
          orderId: result.order_id,
          orderNumber: result.order_number,
          clientSecret: intent.clientSecret,
          pricing: {
            subtotal: result.subtotal,
            shipping: result.shipping_total,
            taxes: result.tax_total,
            total: result.total,
            taxLabel: result.tax_label,
          },
        });
        setSubmitting(false);
        return;
      }

      toast.success(
        result.demo
          ? "Demo order placed — Stripe setup required for live payment."
          : "Order created — pending payment (Stripe setup required).",
      );
      clear();
      nav({
        to: "/order-confirmation",
        search: {
          order: result.order_number,
          demo: result.demo ? 1 : 0,
        } as never,
      });
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : "Could not place order";
      if (/checkout session expired/i.test(message)) {
        checkoutKeyRef.current = null;
      }
      toast.error(message);
      setSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-electric">Protected Canadian checkout</p>
            <h1 className="font-display text-3xl font-extrabold text-navy">Checkout</h1>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-success/20 bg-success/5 px-3 py-1.5 text-xs font-semibold text-success sm:flex">
            <Lock size={13} /> CAD · Secure payment
          </div>
        </div>

        {paymentStep ? (
          <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
            <section className="rounded-xl border border-border bg-card p-5 shadow-card">
              <h2 className="mb-1 font-bold text-navy">Complete your payment</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Order <span className="font-semibold text-navy">{paymentStep.orderNumber}</span>
              </p>
              <StripePaymentForm
                clientSecret={paymentStep.clientSecret}
                orderNumber={paymentStep.orderNumber}
                onCancel={() => {
                  clear();
                  nav({
                    to: "/order-confirmation",
                    search: {
                      order: paymentStep.orderNumber,
                      demo: 0,
                    } as never,
                  });
                }}
              />
            </section>
            <OrderSummary items={items} pricing={paymentStep.pricing} />
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="font-bold text-navy">Contact</h2>
                  <span className="text-[11px] font-medium text-muted-foreground">Receipt + delivery updates</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    defaultValue={user?.email ?? ""}
                    placeholder="you@example.com"
                  />
                  <Field
                    label="Phone"
                    name="phone"
                    type="tel"
                    required
                    autoComplete="tel"
                    placeholder="+1 514 555 0123"
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Signed-in customers keep this order in their account automatically. Guest checkout remains available.
                </p>
              </section>

              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <MapPin size={17} className="text-electric" />
                  <h2 className="font-bold text-navy">Shipping address</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="First name" name="first_name" required autoComplete="given-name" />
                  <Field label="Last name" name="last_name" required autoComplete="family-name" />
                  <div className="sm:col-span-2">
                    <Field label="Street address" name="address" required autoComplete="street-address" />
                  </div>
                  <Field label="City" name="city" required autoComplete="address-level2" />
                  <ProvinceField value={province} onChange={setProvince} />
                  <Field
                    label="Postal code"
                    name="postal_code"
                    required
                    autoComplete="postal-code"
                    pattern="[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d"
                    placeholder="H2X 1Y4"
                  />
                  <Field label="Country" name="country" defaultValue="Canada" readOnly />
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  Estimated sales tax updates from your selected ship-to province or territory. Final tax treatment can vary by product and applicable tax rules.
                </p>
              </section>

              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="mb-2 font-bold text-navy">Payment</h2>
                <p className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  <Lock size={12} />{" "}
                  {isStripeConfigured()
                    ? "You'll enter payment details securely in the next step."
                    : "Stripe setup required — orders will be created in pending-payment mode."}
                </p>
              </section>
            </div>

            <OrderSummary items={items} pricing={previewPricing}>
              <button
                type="submit"
                disabled={submitting || items.length === 0}
                className="w-full rounded-md bg-electric px-4 py-3 text-sm font-bold text-electric-foreground shadow-glow transition hover:opacity-90 disabled:opacity-60"
              >
                {submitting
                  ? "Processing…"
                  : isStripeConfigured()
                    ? `Continue to payment · ${formatCAD(preview.total)}`
                    : `Place order · ${formatCAD(preview.total)}`}
              </button>
            </OrderSummary>
          </form>
        )}
      </div>
    </AppLayout>
  );
}

function OrderSummary({
  items,
  pricing,
  children,
}: {
  items: ReturnType<typeof useCart>["items"];
  pricing: PricingSnapshot;
  children?: React.ReactNode;
}) {
  return (
    <aside className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-card lg:sticky lg:top-28 lg:self-start">
      <h3 className="font-bold text-navy">Order summary</h3>
      <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
        {items.map((item) => (
          <li key={item.productId} className="flex gap-3">
            <img src={item.image} alt={item.title} className="h-12 w-12 rounded-md object-cover" />
            <div className="flex-1 text-xs">
              <p className="line-clamp-2 font-medium text-navy">{item.title}</p>
              <p className="text-muted-foreground">Qty {item.qty}</p>
            </div>
            <span className="text-sm font-semibold">{formatCAD(item.price * item.qty)}</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-1.5 border-y border-border py-3 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd>{formatCAD(pricing.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Shipping</dt>
          <dd>{pricing.shipping === 0 ? "Free" : formatCAD(pricing.shipping)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Estimated tax ({pricing.taxLabel})</dt>
          <dd>{formatCAD(pricing.taxes)}</dd>
        </div>
      </dl>
      <div className="flex items-baseline justify-between">
        <span className="font-bold text-navy">Total</span>
        <span className="text-xl font-extrabold text-navy">{formatCAD(pricing.total)}</span>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        All amounts are in Canadian dollars. Shipping and estimated tax are confirmed before payment.
      </p>
      {children}
    </aside>
  );
}
