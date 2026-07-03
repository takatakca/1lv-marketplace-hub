import { useEffect, useState } from "react";

function endOfDay() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function CountdownTimer({ label = "Ends in" }: { label?: string }) {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(0);
  useEffect(() => {
    setMounted(true);
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");
  const ms = mounted ? Math.max(0, endOfDay() - now) : 0;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);

  return (
    <div className="inline-flex items-center gap-2 text-xs font-bold text-deal">
      <span className="uppercase tracking-wider text-muted-foreground">{label}</span>
      <span suppressHydrationWarning className="rounded bg-deal px-1.5 py-0.5 font-mono text-deal-foreground">{mounted ? pad(h) : "--"}</span>:
      <span suppressHydrationWarning className="rounded bg-deal px-1.5 py-0.5 font-mono text-deal-foreground">{mounted ? pad(m) : "--"}</span>:
      <span suppressHydrationWarning className="rounded bg-deal px-1.5 py-0.5 font-mono text-deal-foreground">{mounted ? pad(s) : "--"}</span>
    </div>
  );
}
