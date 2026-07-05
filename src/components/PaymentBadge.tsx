type Status = "pending" | "paid" | "failed" | "refunded" | string;

const MAP: Record<string, { label: string; cls: string }> = {
  pending: { label: "Payment pending", cls: "bg-deal/10 text-deal" },
  paid: { label: "Paid", cls: "bg-success/10 text-success" },
  failed: { label: "Payment failed", cls: "bg-destructive/10 text-destructive" },
  refunded: { label: "Refunded", cls: "bg-muted text-muted-foreground" },
};

export function PaymentBadge({ status }: { status: Status }) {
  const s = MAP[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>;
}

export function isUnpaid(status: string) {
  return status === "pending" || status === "failed";
}
