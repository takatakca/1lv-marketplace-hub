import { formatCAD } from "@/lib/data";

export function PriceDisplay({ price, compareAt, size = "md" }: { price: number; compareAt?: number; size?: "sm" | "md" | "lg" }) {
  const off = compareAt && compareAt > price ? Math.round(((compareAt - price) / compareAt) * 100) : 0;
  const sizes = { sm: "text-sm", md: "text-base", lg: "text-2xl" } as const;
  const cmpSizes = { sm: "text-xs", md: "text-xs", lg: "text-sm" } as const;
  return (
    <div className="flex flex-wrap items-baseline gap-1.5">
      <span className={`font-bold text-navy ${sizes[size]}`}>{formatCAD(price)}</span>
      {compareAt && compareAt > price && (
        <span className={`text-muted-foreground line-through ${cmpSizes[size]}`}>{formatCAD(compareAt)}</span>
      )}
      {off > 0 && (
        <span className="rounded-sm bg-deal/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-deal">
          -{off}%
        </span>
      )}
    </div>
  );
}
