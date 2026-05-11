import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  DollarSign,
  BarChart3,
  Settings,
  Upload,
  Crown,
  type LucideIcon,
  ArrowLeft,
} from "lucide-react";
import { Logo } from "./Logo";
import { useAuth } from "@/hooks/use-auth";

type Item = { to: string; icon: LucideIcon; label: string };

const vendorItems: Item[] = [
  { to: "/vendor", icon: LayoutDashboard, label: "Overview" },
  { to: "/vendor/products", icon: Package, label: "Products" },
  { to: "/vendor/orders", icon: ShoppingBag, label: "Orders" },
  { to: "/vendor/payouts", icon: DollarSign, label: "Payouts" },
  { to: "/vendor/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/vendor/imports", icon: Upload, label: "Imports" },
  { to: "/vendor/subscription", icon: Crown, label: "Subscription" },
  { to: "/vendor/settings", icon: Settings, label: "Settings" },
];

const adminItems: Item[] = [
  { to: "/admin", icon: LayoutDashboard, label: "Overview" },
  { to: "/admin/vendors", icon: Package, label: "Vendors" },
  { to: "/admin/products", icon: Package, label: "Products" },
  { to: "/admin/orders", icon: ShoppingBag, label: "Orders" },
  { to: "/admin/customers", icon: Package, label: "Customers" },
  { to: "/admin/categories", icon: Package, label: "Categories" },
  { to: "/admin/subscriptions", icon: Crown, label: "Subscriptions" },
  { to: "/admin/commissions", icon: DollarSign, label: "Commissions" },
  { to: "/admin/coupons", icon: DollarSign, label: "Coupons" },
  { to: "/admin/disputes", icon: BarChart3, label: "Disputes" },
  { to: "/admin/integrations", icon: Settings, label: "Integrations" },
  { to: "/admin/settings", icon: Settings, label: "Settings" },
];

export function DashboardLayout({ kind }: { kind: "vendor" | "admin" }) {
  const items = kind === "vendor" ? vendorItems : adminItems;
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b border-sidebar-border p-5">
          <Logo variant="light" />
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-electric">
            {kind === "vendor" ? "Vendor portal" : "Admin console"}
          </p>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {items.map(({ to, icon: Icon, label }) => {
            const active = to === pathname || (to !== `/${kind}` && pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-sidebar-accent text-white"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white"
                }`}
              >
                <Icon size={16} /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-sidebar-border p-4 text-xs">
          <Link to="/" className="flex items-center gap-2 text-sidebar-foreground/70 hover:text-white">
            <ArrowLeft size={14} /> Back to marketplace
          </Link>
          {user && (
            <button onClick={signOut} className="block text-sidebar-foreground/70 hover:text-white">
              Sign out ({user.email})
            </button>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-white px-5 py-3 md:hidden">
          <Logo />
          <Link to="/" className="text-sm font-medium text-electric">← Marketplace</Link>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
