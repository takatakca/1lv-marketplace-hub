import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getMyVendor } from "@/services/vendors";
import {
  listVendorDisputes,
  disputeStatusClass,
  disputeStatusLabel,
  type DisputeRecord,
} from "@/services/disputes";
import { DataTable } from "@/components/DataTable";
import { formatCAD } from "@/lib/data";

function Page() {
  const { user } = useAuth();
  const [rows, setRows] = useState<DisputeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        if (!user) return;
        const vendor = await getMyVendor(user.id);
        if (!vendor || cancel) return;
        const list = await listVendorDisputes(vendor.id);
        if (!cancel) setRows(list);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [user]);

  const visible = filter === "all" ? rows : rows.filter((d) => d.status === filter);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy md:text-3xl">Disputes</h1>
        <p className="text-sm text-muted-foreground">
          Customer claims on your orders. Reply with evidence — refunds are issued by the marketplace team only.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "open", "under_review", "waiting_vendor", "resolved_customer", "resolved_vendor", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
              filter === s ? "border-electric bg-electric/10 text-electric" : "border-border text-muted-foreground"
            }`}
          >
            {s.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {user ? "No disputes yet — nice work." : "Sign in as a vendor to see your disputes."}
        </div>
      ) : (
        <DataTable
          columns={[
            { key: "reason", label: "Reason" },
            { key: "status", label: "Status" },
            { key: "requested", label: "Requested" },
            { key: "approved", label: "Approved" },
            { key: "created", label: "Opened" },
            { key: "actions", label: "" },
          ]}
          rows={visible.map((d) => ({
            id: d.id,
            reason: d.reason,
            status: (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${disputeStatusClass(d.status)}`}>
                {disputeStatusLabel(d.status)}
              </span>
            ),
            requested: formatCAD(Number(d.requested_refund_amount)),
            approved: formatCAD(Number(d.approved_refund_amount)),
            created: new Date(d.created_at).toLocaleDateString("en-CA"),
            actions: (
              <Link to="/vendor/disputes/$id" params={{ id: d.id }} className="text-xs font-semibold text-electric">
                Open
              </Link>
            ),
          }))}
        />
      )}
    </>
  );
}

export const Route = createFileRoute("/vendor/disputes/")({ component: Page });
