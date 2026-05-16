import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DataTable } from "@/components/DataTable";
import { vendors as demoVendors } from "@/lib/data";
import { listAllVendors, setVendorStatus, type VendorRecord, type VendorStatus } from "@/services/vendors";
import { useAuth } from "@/hooks/use-auth";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoBanner, PreviewModeNotice } from "@/components/DemoBanner";

function Page() {
  const { user } = useAuth();
  const demo = isDemoMode(user);
  const [rows, setRows] = useState<VendorRecord[] | null>(null);
  const [loading, setLoading] = useState(!demo);

  const refresh = async () => {
    try { setRows(await listAllVendors()); } finally { setLoading(false); }
  };

  useEffect(() => { if (!demo) refresh(); }, [demo]);

  const act = async (id: string, status: VendorStatus) => {
    try { await setVendorStatus(id, status); toast.success("Vendor " + status); await refresh(); }
    catch (err) { toast.error((err as Error).message); }
  };

  const useDemo = demo || (rows && rows.length === 0);
  const display = useDemo
    ? demoVendors.map((v, i) => ({
        id: "demo-" + i, store: v.name, email: v.slug + "@1lv.ca",
        status: ["active", "active", "pending", "active", "suspended", "active"][i % 6],
        plan: ["Growth", "Scale", "Starter", "Growth", "Scale", "Growth"][i % 6],
      }))
    : (rows ?? []).map((v) => ({
        id: v.id, store: v.store_name, email: v.contact_email ?? "—",
        status: v.status, plan: v.subscription_status,
      }));

  return (
    <>
      <div className="mb-6">
        {useDemo ? <DemoBanner label={demo ? "Preview mode" : "No vendors yet"} /> : null}
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Vendors</h1>
      </div>
      {demo && <PreviewModeNotice />}
      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
        <DataTable
          columns={[
            { key: "store", label: "Store" },
            { key: "email", label: "Owner" },
            { key: "status", label: "Status" },
            { key: "plan", label: "Plan" },
            { key: "actions", label: "", render: (r) => (
              <div className="flex gap-2 text-xs">
                <button onClick={() => act(r.id as string, "active")} className="text-success">Approve</button>
                <button onClick={() => act(r.id as string, "rejected")} className="text-destructive">Reject</button>
                <button onClick={() => act(r.id as string, "suspended")} className="text-destructive/80">Suspend</button>
                <button onClick={() => act(r.id as string, "pending")} className="text-muted-foreground">Reset</button>
              </div>
            ) },
          ]}
          rows={display}
        />
      )}
    </>
  );
}

export const Route = createFileRoute("/admin/vendors")({ component: Page });
