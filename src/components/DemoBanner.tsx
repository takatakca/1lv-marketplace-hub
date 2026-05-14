export function DemoBanner({ label = "Demo data" }: { label?: string }) {
  return (
    <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-electric/30 bg-electric/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-electric">
      {label}
    </div>
  );
}

export function PreviewModeNotice() {
  return (
    <div className="mb-6 rounded-lg border border-deal/30 bg-deal/5 p-3 text-xs text-deal-foreground">
      <strong className="text-deal">Preview mode.</strong>{" "}
      <span className="text-muted-foreground">
        You are not signed in. Showing demo data so you can explore. Sign in as a vendor or admin to manage real records.
      </span>
    </div>
  );
}
