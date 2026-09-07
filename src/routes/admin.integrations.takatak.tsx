import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import { StatCard } from "@/components/StatCard";
import {
  drainTakatakOutboxNow,
  getTakatakIntegrationStatus,
  retryFailedTakatakEvents,
} from "@/lib/takatak.functions";

type Status = Awaited<ReturnType<typeof getTakatakIntegrationStatus>>;

const badge = (ok: boolean) =>
  ok ? "bg-success/10 text-success" : "bg-deal/10 text-deal";

const statusPill: Record<string, string> = {
  delivered: "bg-success/10 text-success",
  pending: "bg-muted text-muted-foreground",
  processing: "bg-electric/10 text-electric",
  failed: "bg-destructive/10 text-destructive",
};

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleString() : "Never";
}

function Page() {
  const [data, setData] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getTakatakIntegrationStatus());
    } catch {
      toast.error("Admin access required to view the master sync console.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const drain = async () => {
    setBusy(true);
    try {
      const res = await drainTakatakOutboxNow();
      if (!res.ok) toast.warning(res.reason ?? "Nothing to send.");
      else toast.success(`Processed ${res.processed} · delivered ${res.delivered} · failed ${res.failed}`);
      await load();
    } catch {
      toast.error("Could not run the queue.");
    }
    setBusy(false);
  };

  const retry = async () => {
    setBusy(true);
    try {
      const res = await retryFailedTakatakEvents();
      toast.success(`${res.requeued ?? 0} event(s) re-queued.`);
      await load();
    } catch {
      toast.error("Could not retry failed events.");
    }
    setBusy(false);
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/admin/integrations" className="text-xs font-semibold text-muted-foreground hover:underline">
            ← Integrations
          </Link>
          <h1 className="text-2xl font-bold text-navy md:text-3xl">TAKATAK Master Sync</h1>
          <p className="text-sm text-muted-foreground">
            1LV.CA publishes normalized identity and commerce events to the TAKATAK master platform. Keys and
            master identifiers are never shown here.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-navy hover:bg-muted"
          >
            Refresh
          </button>
          <button
            disabled={busy}
            onClick={() => void retry()}
            className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-navy hover:bg-muted disabled:opacity-50"
          >
            Retry failed
          </button>
          <button
            disabled={busy}
            onClick={() => void drain()}
            className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Drain queue
          </button>
        </div>
      </div>

      {!data ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <section className="mb-6 rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Connection status
            </h2>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className={`rounded-full px-2 py-0.5 ${badge(data.configured)}`}>
                {data.configured ? "Configured" : "Setup required"}
              </span>
              <span className={`rounded-full px-2 py-0.5 ${badge(data.api_url_configured)}`}>
                API URL {data.api_url_configured ? "set" : "missing"}
              </span>
              <span className={`rounded-full px-2 py-0.5 ${badge(data.api_key_configured)}`}>
                API key {data.api_key_configured ? "set" : "missing"}
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Last successful sync: <strong className="text-navy">{fmt(data.last_successful_sync)}</strong>
              {data.last_failure ? ` · last failure: ${fmt(data.last_failure)}` : ""}
            </p>
            {!data.configured && (
              <p className="mt-2 rounded-lg border border-dashed border-deal/40 bg-deal/5 p-3 text-xs text-deal">
                Master API not connected yet. Events keep queuing safely — checkout, signup and vendor flows are
                unaffected.
              </p>
            )}
          </section>

          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Queue</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Pending" value={String(data.pending)} />
              <StatCard label="Processing" value={String(data.processing)} />
              <StatCard label="Delivered" value={String(data.delivered)} />
              <StatCard label="Failed" value={String(data.failed)} />
            </div>
          </section>

          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sync totals</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Customers synced" value={String(data.synced_customers)} />
              <StatCard label="Merchants synced" value={String(data.synced_merchants)} />
              <StatCard label="Orders synced" value={String(data.synced_orders)} />
              <StatCard label="Relationships synced" value={String(data.synced_relationships)} />
            </div>
          </section>

          <section className="mb-8">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recent events
            </h2>
            <DataTable
              columns={[
                { key: "created_at", label: "Date", render: (r) => new Date(r["created_at"] as string).toLocaleString() },
                { key: "event_type", label: "Event" },
                {
                  key: "aggregate_ref",
                  label: "Aggregate",
                  render: (r) => `${r["aggregate_type"]} · ${r["aggregate_ref"]}`,
                },
                {
                  key: "status",
                  label: "Status",
                  render: (r) => (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        statusPill[r["status"] as string] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {String(r["status"])}
                    </span>
                  ),
                },
                { key: "attempt_count", label: "Attempts" },
                {
                  key: "delivered_at",
                  label: "Delivered",
                  render: (r) => (r["delivered_at"] ? new Date(r["delivered_at"] as string).toLocaleString() : "—"),
                },
                {
                  key: "error_summary",
                  label: "Error",
                  render: (r) => (r["error_summary"] as string) ?? "—",
                },
              ]}
              rows={data.recent as unknown as Record<string, unknown>[]}
              empty="No master sync events yet."
            />
          </section>
        </>
      )}
    </>
  );
}

export const Route = createFileRoute("/admin/integrations/takatak")({ component: Page });
