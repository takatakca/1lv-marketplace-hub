import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";

export const Route = createFileRoute("/orders/$id")({ component: OrderDetail });

function OrderDetail() {
  const { id } = Route.useParams();
  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-display text-2xl font-extrabold text-navy">Order {id}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tracking, items, invoice and support actions will appear here.</p>
        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-semibold text-electric">Shipped</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tracking</span><span className="font-semibold text-navy">CP1234567CA</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Carrier</span><span>Canada Post</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">ETA</span><span>3-5 business days</span></div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
