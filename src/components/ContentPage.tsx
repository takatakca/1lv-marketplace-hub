import type { ReactNode } from "react";
import { AppLayout } from "./AppLayout";

export function ContentPage({ title, kicker, children }: { title: string; kicker?: string; children: ReactNode }) {
  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-12">
        {kicker && <p className="text-xs font-bold uppercase tracking-widest text-electric">{kicker}</p>}
        <h1 className="mt-1 font-display text-3xl font-extrabold text-navy md:text-4xl">{title}</h1>
        <div className="prose prose-sm mt-6 max-w-none text-muted-foreground prose-headings:text-navy prose-strong:text-navy">
          {children}
        </div>
      </div>
    </AppLayout>
  );
}
