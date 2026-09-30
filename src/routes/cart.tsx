import { createFileRoute, Link } from "@tanstack/react-router";
import { Trash2, ShoppingBag, ShieldCheck, Truck, RefreshCw, Ticket } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { EmptyState } from "@/components/EmptyState";
import { FreeShippingBar } from "@/components/FreeShippingBar";
import { useCart } from "@/hooks/use-cart";
import { formatCAD } from "@/lib/data";
import { calculateShipping } from "@/lib/canada-commerce";

export const Route = createFileRoute("/cart")({
  component: CartPage,
  head: () => ({ meta: [{ title: "Your cart — 1LV.CA" }] }),
});

function CartPage() {
  const { items, remove, setQty, subtotal, count } = useCart();
  const shipping = calculateShipping(subtotal);
  const beforeTaxTotal = +(subtotal + shipping).toFixed(2);

  const byVendor = items.reduce<Record<string, typeof items>>((acc, item) => {
    (acc[item.vendorSlug] ??= []).push(item);
    return acc;
  }, {});

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="font-display text-3xl font-extrabold text-navy">Your cart</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {count} {count === 1 ? "item" : "items"}
        </p>

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
            <div className="space-y-4">
              <FreeShippingBar subtotal={subtotal} />

              {Object.entries(byVendor).map(([vendorSlug, group]) => (
                <div key={vendorSlug} className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sold by</span>
                    <Link
                      to="/store/$slug"
                      params={{ slug: vendorSlug }}
                      className="text-sm font-semibold capitalize text-electric hover:underline"
                    >
                      {vendorSlug.replace(/-/g, " ")}
                    </Link>
                  </div>

                  <ul className="divide-y divide-border">
                    {group.map((item) => (
                      <li key={item.productId} className="flex gap-4 p-4">
                        <Link to="/product/$slug" params={{ slug: item.slug }}>
                          <img
                            src={item.image}
                            alt={item.title}
                            className="h-24 w-24 rounded-lg bg-muted object-cover"
                            loading="lazy"
                          />
                        </Link>

                        <div className="flex min-w-0 flex-1 flex-col">
                          <Link
                            to="/product/$slug"
                            params={{ slug: item.slug }}
                            className="line-clamp-2 font-semibold text-navy hover:text-electric"
                          >
                            {item.title}
                          </Link>

                          {item.variant && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {Object.entries(item.variant)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join(" · ")}
                            </p>
                          )}

                          <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                            <div className="flex items-center gap-2">
                              <label className="sr-only" htmlFor={`qty-${item.productId}`}>
                                Quantity for {item.title}
                              </label>
                              <input
                                id={`qty-${item.productId}`}
                                type="number"
                                min={1}
                                value={item.qty}
                                onChange={(event) => setQty(item.productId, Number(event.target.value) || 1)}
                                className="w-16 rounded-md border border-border px-2 py-1 text-sm"
                              />
                              <button
                                onClick={() => remove(item.productId)}
                                className="rounded-md p-1 text-muted-foreground transition hover:bg-destructive/5 hover:text-destructive"
                                aria-label={`Remove ${item.title}`}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                            <span className="text-base font-bold text-navy">{formatCAD(item.price * item.qty)}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <aside className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-card lg:sticky lg:top-28 lg:self-start">
              <h3 className="font-bold text-navy">Order summary</h3>

              <div className="flex items-start gap-2 rounded-lg border border-electric/15 bg-electric/5 p-3 text-xs text-navy">
                <Ticket size={15} className="mt-0.5 shrink-0 text-electric" />
                <div>
                  <p className="font-semibold">Promotions are verified before payment</p>
                  <p className="mt-0.5 text-muted-foreground">
                    Only server-validated promotions will reduce the final order total.
                  </p>
                </div>
              </div>

              <dl className="space-y-1.5 border-y border-border py-3 text-sm">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd className="font-medium">{formatCAD(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Shipping (Canada)</dt>
                  <dd className="font-medium">{shipping === 0 ? "Free" : formatCAD(shipping)}</dd>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <dt>Sales tax</dt>
                  <dd>Calculated from ship-to province</dd>
                </div>
              </dl>

              <div className="flex items-baseline justify-between">
                <span className="font-bold text-navy">Before tax</span>
                <span className="text-xl font-extrabold text-navy">{formatCAD(beforeTaxTotal)}</span>
              </div>

              <Link
                to="/checkout"
                className="block w-full rounded-md bg-electric px-4 py-3 text-center text-sm font-bold text-electric-foreground shadow-glow transition hover:opacity-90"
              >
                Proceed to checkout
              </Link>

              <div className="grid grid-cols-3 gap-2 pt-2 text-[10px] text-muted-foreground">
                <div className="flex flex-col items-center gap-0.5 text-center">
                  <ShieldCheck size={14} className="text-success" /> Buyer protection
                </div>
                <div className="flex flex-col items-center gap-0.5 text-center">
                  <Truck size={14} className="text-electric" /> Canadian delivery
                </div>
                <div className="flex flex-col items-center gap-0.5 text-center">
                  <RefreshCw size={14} className="text-electric" /> 30-day returns
                </div>
              </div>

              <p className="text-center text-[11px] text-muted-foreground">Secure checkout · CAD</p>
            </aside>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
