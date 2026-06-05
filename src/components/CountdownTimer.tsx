import { useEffect, useState } from "react";

function endOfDay() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function CountdownTimer({ label = "Ends in" }: { label?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, endOfDay() - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="inline-flex items-center gap-2 text-xs font-bold text-deal">
      <span className="uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="rounded bg-deal px-1.5 py-0.5 font-mono text-deal-foreground">{pad(h)}</span>:
      <span className="rounded bg-deal px-1.5 py-0.5 font-mono text-deal-foreground">{pad(m)}</span>:
      <span className="rounded bg-deal px-1.5 py-0.5 font-mono text-deal-foreground">{pad(s)}</span>
    </div>
  );
}
