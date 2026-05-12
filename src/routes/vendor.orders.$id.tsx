import { createFileRoute } from "@tanstack/react-router";
import { products, formatCAD } from "@/lib/data";
import { toast } from "sonner";
function Page() {
  const { id } = Route.useParams();
  const items = products.slice(0, 2);
  const total = items.reduce((s, p) => s + p.price, 0);
  const events = [
    { t: "Order placed", d: "2026-05-10 09:24" },
    { t: "Payment captured", d: "2026-05-10 09:24" },
    { t: "Awaiting vendor confirmation", d: "2026-05-10 09:25" },
  ];
  return (
    <div>
      <div className="mb-6"><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">Demo data</div><h1 className="text-2xl font-bold text-navy md:text-3xl">Order {id}</h1></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-navy">Items</h3>
            <ul className="mt-3 divide-y divide-border">
              {items.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3 text-sm"><span>{p.title}</span><span className="font-medium">{formatCAD(p.price)}</span></li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm font-bold"><span>Total</span><span>{formatCAD(total)}</span></div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-navy">Timeline</h3>
            <ol className="mt-3 space-y-3 text-sm">
              {events.map((e) => <li key={e.t} className="flex justify-between"><span>{e.t}</span><span className="text-muted-foreground">{e.d}</span></li>)}
            </ol>
          </div>
        </div>
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 text-sm">
            <h3 className="text-sm font-semibold text-navy">Shipping</h3>
            <p className="mt-2 text-muted-foreground">Jane Doe<br/>2200 Yonge St, Toronto, ON M4S 2C6<br/>Canada</p>
          </div>
          <div className="space-y-2 rounded-xl border border-border bg-card p-5">
            <button onClick={() => toast.success("Order accepted")} className="w-full rounded-md bg-electric px-3 py-2 text-sm font-semibold text-electric-foreground">Accept order</button>
            <button onClick={() => toast.message("Marked processing")} className="w-full rounded-md border border-border px-3 py-2 text-sm">Mark processing</button>
            <input placeholder="Tracking number" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            <input placeholder="Carrier" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            <button onClick={() => toast.success("Marked shipped")} className="w-full rounded-md bg-success px-3 py-2 text-sm font-semibold text-white">Mark shipped</button>
          </div>
        </div>
      </div>
    </div>
  );
}
export const Route = createFileRoute("/vendor/orders/$id")({ component: Page });
