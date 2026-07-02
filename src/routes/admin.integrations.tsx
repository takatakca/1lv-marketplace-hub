import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import { listIntegrations, listImportJobs, type ImportJob, type SupplierIntegration } from "@/services/imports";

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
  { group: "Suppliers", name: "CSV upload", desc: "Vendor-facing CSV imports write draft products only.", state: "configured" },
  { group: "Suppliers", name: "AliExpress (manual)", desc: "Vendors can tag products with AliExpress source URL. Auto-sync coming soon.", state: "setup_required" },
  { group: "Suppliers", name: "CJdropshipping API", desc: "Live API disabled until credentials are securely stored server-side.", state: "coming_soon" },
  { group: "Suppliers", name: "Custom supplier API", desc: "Placeholder — configure via server-side edge function.", state: "coming_soon" },
  { group: "Email", name: "Transactional SMTP", desc: "Order receipts, vendor notifications.", state: "setup_required" },
];

const stateBadge: Record<State, { text: string; cls: string }> = {
  configured: { text: "Configured", cls: "bg-success/10 text-success" },
  setup_required: { text: "Setup required", cls: "bg-deal/10 text-deal" },
  coming_soon: { text: "Coming soon", cls: "bg-muted text-muted-foreground" },
};

function Page() {
  const groups = Array.from(new Set(items.map((i) => i.group)));
  const [integrations, setIntegrations] = useState<SupplierIntegration[]>([]);
  const [jobs, setJobs] = useState<ImportJob[]>([]);

  useEffect(() => {
    listIntegrations().then(setIntegrations).catch(() => setIntegrations([]));
    listImportJobs(25).then(setJobs).catch(() => setJobs([]));
  }, []);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Secret keys are never displayed here. Credentials live in backend secrets.
        </p>
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

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Supplier integrations ({integrations.length})
        </h2>
        {integrations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No vendor supplier integrations yet.
          </p>
        ) : (
          <DataTable
            columns={[
              { key: "provider_name", label: "Name" },
              { key: "provider_type", label: "Type" },
              { key: "status", label: "Status" },
              { key: "created_at", label: "Created", render: (r) => new Date(r.created_at as string).toLocaleDateString() },
            ]}
            rows={integrations as unknown as Record<string, unknown>[]}
          />
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-2 flex items-center justify-between text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent import jobs
          <button
            onClick={() => toast.info("Retry queue coming soon")}
            className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-navy normal-case"
          >
            Retry failed
          </button>
        </h2>
        {jobs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No import jobs yet.
          </p>
        ) : (
          <DataTable
            columns={[
              { key: "created_at", label: "Date", render: (r) => new Date(r.created_at as string).toLocaleString() },
              { key: "provider_type", label: "Source" },
              { key: "source_filename", label: "File" },
              { key: "total_rows", label: "Rows" },
              { key: "success_rows", label: "OK" },
              { key: "failed_rows", label: "Failed" },
              { key: "status", label: "Status" },
            ]}
            rows={jobs as unknown as Record<string, unknown>[]}
          />
        )}
      </section>

      <p className="mt-2 rounded-lg border border-dashed border-deal/40 bg-deal/5 p-4 text-xs text-deal">
        Security: supplier credentials are never stored in the frontend. Live supplier APIs remain disabled until
        credentials are stored in the backend secrets vault and accessed only via server-side edge functions.
      </p>
    </>
  );
}

export const Route = createFileRoute("/admin/integrations")({ component: Page });
