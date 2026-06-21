import { createFileRoute } from "@tanstack/react-router";

type State = "configured" | "setup_required" | "coming_soon";
type Item = { name: string; desc: string; state: State; group: string };

const items: Item[] = [
  { group: "Core", name: "Lovable Cloud (database, auth, storage)", desc: "Postgres, RLS, Storage, Auth providers.", state: "configured" },
  { group: "Auth", name: "Email / password", desc: "Built-in. Verified working.", state: "configured" },
  { group: "Auth", name: "Google OAuth", desc: "Enable Google provider in Cloud auth settings.", state: "setup_required" },
  { group: "Auth", name: "Phone OTP / SMS (Twilio)", desc: "Provider + Twilio credentials must be configured.", state: "setup_required" },
  { group: "Payments", name: "Stripe — Checkout", desc: "Customer payments and order capture.", state: "setup_required" },
  { group: "Payments", name: "Stripe — Subscriptions", desc: "Vendor plans (Starter / Growth / Scale).", state: "setup_required" },
  { group: "Payments", name: "Stripe Connect — Payouts", desc: "Vendor onboarding, transfers, payout splits.", state: "setup_required" },
  { group: "Suppliers", name: "AliExpress import", desc: "Product sync API integration.", state: "coming_soon" },
  { group: "Suppliers", name: "CJDropshipping import", desc: "Product sync API integration.", state: "coming_soon" },
  { group: "Suppliers", name: "CSV upload", desc: "Bulk product import for admins.", state: "coming_soon" },
  { group: "Email", name: "Transactional SMTP", desc: "Order receipts, vendor notifications.", state: "setup_required" },
];

const stateBadge: Record<State, { text: string; cls: string }> = {
  configured: { text: "Configured", cls: "bg-success/10 text-success" },
  setup_required: { text: "Setup required", cls: "bg-deal/10 text-deal" },
  coming_soon: { text: "Coming soon", cls: "bg-muted text-muted-foreground" },
};

function Page() {
  const groups = Array.from(new Set(items.map((i) => i.group)));
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Integrations</h1>
        <p className="text-sm text-muted-foreground">Secret keys are never displayed here. Credentials live in backend secrets.</p>
      </div>

      {groups.map((g) => (
        <section key={g} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {items.filter((i) => i.group === g).map((it) => {
              const b = stateBadge[it.state];
              return (
                <div key={it.name} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-navy">{it.name}</h3>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}>{b.text}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{it.desc}</p>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="mt-2 rounded-lg border border-dashed border-deal/40 bg-deal/5 p-4 text-xs text-deal">
        Security: secret keys must never be stored in the frontend. Manage them in the backend secrets vault only.
      </p>
    </>
  );
}

export const Route = createFileRoute("/admin/integrations")({ component: Page });
