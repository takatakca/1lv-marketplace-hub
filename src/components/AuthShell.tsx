import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck, Truck, Store, BadgeCheck } from "lucide-react";
import { Logo } from "./Logo";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-2">
        {/* Left — marketing / trust panel */}
        <aside className="relative hidden flex-col justify-between bg-navy p-10 text-white lg:flex">
          <div>
            <Link to="/" className="inline-block">
              <Logo variant="light" />
            </Link>
            <h2 className="mt-10 font-display text-3xl font-extrabold leading-tight">
              Canada's marketplace
              <br />
              for everything.
            </h2>
            <p className="mt-3 max-w-sm text-sm text-white/70">
              Shop millions of products from trusted Canadian and global vendors.
              Fast CAD checkout, buyer protection, and easy returns.
            </p>
          </div>

          <ul className="grid gap-4">
            <Benefit icon={<ShieldCheck size={18} />} title="Secure account" desc="Encrypted login, optional 2FA via SMS." />
            <Benefit icon={<BadgeCheck size={18} />} title="Buyer protection" desc="Refunds on items not as described." />
            <Benefit icon={<Truck size={18} />} title="Fast Canadian shipping" desc="Free over $49 from Canadian vendors." />
            <Benefit icon={<Store size={18} />} title="Vendor-ready marketplace" desc="Open a store and start selling in minutes." />
          </ul>

          <p className="text-xs text-white/50">© {new Date().getFullYear()} 1LV.CA — Canadian marketplace</p>
        </aside>

        {/* Right — auth card */}
        <section className="flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md">
            <div className="mb-6 text-center lg:hidden">
              <Link to="/"><Logo /></Link>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
              <h1 className="font-display text-2xl font-extrabold text-navy">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
              <div className="mt-6">{children}</div>
            </div>
            {footer && <div className="mt-4 text-center text-xs text-muted-foreground">{footer}</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

function Benefit({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-electric">{icon}</span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-white/60">{desc}</p>
      </div>
    </li>
  );
}
