import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  accent = "electric",
}: {
  label: string;
  value: string | number;
  delta?: string;
  icon: LucideIcon;
  accent?: "electric" | "deal" | "success";
}) {
  const accentBg =
    accent === "deal" ? "bg-deal/10 text-deal" : accent === "success" ? "bg-success/10 text-success" : "bg-electric/10 text-electric";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold text-navy">{value}</div>
          {delta && <div className="mt-1 text-xs font-medium text-success">{delta}</div>}
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-lg ${accentBg}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}
