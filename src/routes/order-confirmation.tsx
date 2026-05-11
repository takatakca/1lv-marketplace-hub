import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";

export const Route = createFileRoute("/order-confirmation")({
  component: Confirmation,
  head: () => ({ meta: [{ title: "Order confirmed — 1LV.CA" }] }),
});

function Confirmation() {
  const orderId = "1LV-" + Math.floor(100000 + Math.random() * 900000);
  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/10 text-success">
          <CheckCircle2 size={32} />
        </div>
        <h1 className="mt-5 font-display text-3xl font-extrabold text-navy">Thank you for your order!</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We've sent a confirmation to your email. Order <span className="font-semibold text-navy">{orderId}</span>.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link to="/orders" className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-navy-foreground hover:opacity-90">
            View my orders
          </Link>
          <Link to="/" className="rounded-md border border-border px-4 py-2.5 text-sm font-semibold text-navy hover:bg-muted">
            Continue shopping
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}
