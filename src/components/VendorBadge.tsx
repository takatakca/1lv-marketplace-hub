import { Store, MapPin, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { Vendor } from "@/lib/data";

export function VendorBadge({ vendor, compact = false }: { vendor: Vendor; compact?: boolean }) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Store size={12} /> {vendor.name}
        {vendor.country === "CA" && <span className="ml-0.5">🇨🇦</span>}
      </span>
    );
  }
  return (
    <Link
      to="/"
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition hover:border-electric"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gradient-electric text-white">
        <Store size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-semibold text-navy">
          {vendor.name}
          {vendor.country === "CA" && <ShieldCheck size={14} className="text-success" />}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin size={11} /> {vendor.city}, {vendor.country} · {vendor.yearsActive}y · ⭐ {vendor.rating}
        </div>
      </div>
    </Link>
  );
}
