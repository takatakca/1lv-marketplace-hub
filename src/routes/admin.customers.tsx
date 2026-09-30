import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { formatCAD } from "@/lib/data";
import {
  listAdminCustomers,
  type AdminCustomerSummary,
} from "@/lib/admin-marketplace.functions";

function Page() {
  const [customers, setCustomers] = useState<AdminCustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listAdminCustomers()
      .then((rows) => {
        if (!active) return;
        setCustomers(rows);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load customers.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const rows = customers.map((customer) => ({
    key: customer.key,
    name: customer.name,
    email: customer.email,
    type: customer.accountType === "registered" ? "Registered" : "Guest",
    orders: customer.orders,
    spend: formatCAD(customer.paidSpend),
    first: new Date(customer.firstOrderAt).toLocaleDateString("en-CA"),
    last: new Date(customer.lastOrderAt).toLocaleDateString("en-CA"),
  }));

  return (
    <>
      <div className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-success">
          Live marketplace data
        </div>
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          1LV-scoped customer activity reconstructed from real marketplace orders. TAKATAK remains the master cross-vertical CRM.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : loading ? (
        <div className="text-sm text-muted-foreground">Loading customers…</div>
      ) : (
        <DataTable
          columns={[
            { key: "name", label: "Customer" },
            { key: "email", label: "Email" },
            { key: "type", label: "Account" },
            { key: "orders", label: "Orders" },
            { key: "spend", label: "Paid spend" },
            { key: "first", label: "First order" },
            { key: "last", label: "Last order" },
          ]}
          rows={rows}
          empty="No marketplace customers yet. Real customer activity will appear after orders are created."
        />
      )}
    </>
  );
}

export const Route = createFileRoute("/admin/customers")({ component: Page });
