import { Link } from "@tanstack/react-router";
import { Ticket } from "lucide-react";

const COUPONS = [
  { code: "WELCOME10", label: "10% off first order", min: "No minimum" },
  { code: "FREESHIP", label: "Free shipping", min: "Orders $35+" },
  { code: "SAVE20", label: "$20 off", min: "Orders $100+" },
  { code: "FLASH5", label: "Extra 5% off deals", min: "Today only" },
];

export function CouponStrip() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-4">
      <div className="scrollbar-hide flex gap-2 overflow-x-auto">
        {COUPONS.map((c) => (
          <Link
            key={c.code}
            to="/coupons"
            className="flex min-w-[200px] items-center gap-3 rounded-lg border-2 border-dashed border-deal/40 bg-deal/5 px-3 py-2.5 hover:border-deal hover:bg-deal/10"
          >
            <span className="grid h-9 w-9 place-items-center rounded-md bg-deal text-deal-foreground">
              <Ticket size={16} />
            </span>
            <div className="min-w-0 text-xs">
              <div className="font-bold text-navy">{c.label}</div>
              <div className="text-[11px] text-muted-foreground">Code <span className="font-mono font-semibold text-deal">{c.code}</span> · {c.min}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
