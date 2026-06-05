import { Truck } from "lucide-react";
import { formatCAD } from "@/lib/data";

export function FreeShippingBar({ subtotal, threshold = 49 }: { subtotal: number; threshold?: number }) {
  const pct = Math.min(100, Math.round((subtotal / threshold) * 100));
  const remaining = Math.max(0, threshold - subtotal);
  const unlocked = remaining === 0;

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs">
        <Truck size={14} className={unlocked ? "text-success" : "text-electric"} />
        {unlocked ? (
          <span className="font-semibold text-success">🎉 You unlocked free Canadian shipping!</span>
        ) : (
          <span className="text-navy">
            Add <span className="font-bold text-deal">{formatCAD(remaining)}</span> more for <span className="font-semibold">free CA shipping</span>
          </span>
        )}
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${unlocked ? "bg-success" : "bg-gradient-to-r from-electric to-deal"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
