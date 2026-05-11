import { createFileRoute, Link } from "@tanstack/react-router";
import { Trash2, ShoppingBag } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { EmptyState } from "@/components/EmptyState";
import { useCart } from "@/hooks/use-cart";
import { formatCAD } from "@/lib/data";

export const Route = createFileRoute("/cart")({
  component: CartPage,
  head: () => ({ meta: [{ title: "Your cart — 1LV.CA" }] }),
});

function CartPage() {
  const { items, remove, setQty, subtotal, count } = useCart();
  const shipping = subtotal === 0 || subtotal >= 49 ? 0 : 7.99;
  const taxes = subtotal * 0.14975; // example QC GST+QST
  const total = subtotal + shipping + taxes;

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="font-display text-3xl font-extrabold text-navy">Your cart</h1>
        <p className="mt-1 text-sm text-muted-foreground">{count} {count === 1 ? "item" : "items"}</p>

        {items.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={ShoppingBag}
              title="Your cart is empty"
              description="Looks like you haven't added anything yet. Browse our categories to get started."
              actionLabel="Start shopping"
              to="/categories"
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
            <ul className="space-y-3">
              {items.map((it) => (
                <li key={it.productId} className="flex gap-4 rounded-xl border border-border bg-card p-4">
                  <Link to="/product/$slug" params={{ slug: it.slug }}>
                    <img src={it.image} alt={it.title} className="h-24 w-24 rounded-lg object-cover" />
                  </Link>
                  <div className="flex flex-1 flex-col">
                    <Link to="/product/$slug" params={{ slug: it.slug }} className="font-semibold text-navy hover:text-electric">
                      {it.title}
                    </Link>
                    {it.variant && (
                      <p className="text-xs text-muted-foreground">
                        {Object.entries(it.variant).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={it.qty}
                          onChange={(e) => setQty(it.productId, Number(e.target.value) || 1)}
                          className="w-16 rounded-md border border-border px-2 py-1 text-sm"
                        />
                        <button onClick={() => remove(it.productId)} className="text-muted-foreground hover:text-destructive" aria-label="Remove">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <span className="text-base font-bold text-navy">{formatCAD(it.price * it.qty)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <aside className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-card lg:sticky lg:top-28 lg:self-start">
              <h3 className="font-bold text-navy">Order summary</h3>
              <dl className="space-y-1.5 border-y border-border py-3 text-sm">
                <div className="flex justify-between"><dt>Subtotal</dt><dd className="font-medium">{formatCAD(subtotal)}</dd></div>
                <div className="flex justify-between"><dt>Shipping (CA)</dt><dd className="font-medium">{shipping === 0 ? "Free" : formatCAD(shipping)}</dd></div>
                <div className="flex justify-between"><dt>Estimated tax (QC)</dt><dd className="font-medium">{formatCAD(taxes)}</dd></div>
              </dl>
              <div className="flex items-baseline justify-between">
                <span className="font-bold text-navy">Total</span>
                <span className="text-xl font-extrabold text-navy">{formatCAD(total)}</span>
              </div>
              <Link to="/checkout" className="block w-full rounded-md bg-electric px-4 py-3 text-center text-sm font-bold text-electric-foreground shadow-glow hover:opacity-90">
                Proceed to checkout
              </Link>
              <p className="text-center text-[11px] text-muted-foreground">Secure checkout · Stripe-ready · CAD</p>
            </aside>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
