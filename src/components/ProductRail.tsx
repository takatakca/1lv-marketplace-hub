import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { Product } from "@/lib/data";
import { ProductCard } from "./ProductCard";

/** Horizontally scrolling merchandising rail — compact on mobile, dense on desktop. */
export function ProductRail({ products }: { products: Product[] }) {
  return (
    <div className="scrollbar-hide -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
      {products.map((p) => (
        <div key={p.id} className="w-[150px] shrink-0 snap-start sm:w-[180px]">
          <ProductCard product={p} />
        </div>
      ))}
    </div>
  );
}

export function SectionHead({
  eyebrow,
  title,
  action,
  actionTo,
  children,
}: {
  eyebrow?: string;
  title: string;
  action?: string;
  actionTo?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p>
        )}
        <h2 className="font-display text-lg font-extrabold tracking-tight text-navy sm:text-2xl">{title}</h2>
      </div>
      <div className="flex items-center gap-3">
        {children}
        {action && actionTo && (
          <Link
            to={actionTo as "/"}
            className="inline-flex items-center gap-1 text-xs font-bold text-electric hover:underline sm:text-sm"
          >
            {action} <ChevronRight size={15} />
          </Link>
        )}
      </div>
    </div>
  );
}
