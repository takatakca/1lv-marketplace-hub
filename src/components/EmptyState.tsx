import { type LucideIcon, Inbox } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  to,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  to?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-electric/10 text-electric">
        <Icon size={26} />
      </div>
      <h3 className="text-lg font-bold text-navy">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {actionLabel && to && (
        <Link
          to={to}
          className="mt-5 inline-flex items-center justify-center rounded-md bg-electric px-4 py-2 text-sm font-semibold text-electric-foreground transition hover:opacity-90"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
