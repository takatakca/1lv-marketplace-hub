import { Link, useLocation } from "@tanstack/react-router";
import {
  Home, LayoutGrid, Zap, ShoppingCart, User,
  LayoutDashboard, Package, ShoppingBag, Shield,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useAuth } from "@/hooks/use-auth";
import { isAdmin, isVendor } from "@/lib/roles";

type Item = { to: string; icon: LucideIcon; label: string; badgeCart?: boolean };

const customerItems: Item[] = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/categories", icon: LayoutGrid, label: "Browse" },
  { to: "/deals", icon: Zap, label: "Deals" },
  { to: "/cart", icon: ShoppingCart, label: "Cart", badgeCart: true },
  { to: "/account", icon: User, label: "Account" },
];

const vendorItems: Item[] = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/vendor", icon: LayoutDashboard, label: "Vendor" },
  { to: "/vendor/orders", icon: ShoppingBag, label: "Orders" },
  { to: "/vendor/products", icon: Package, label: "Products" },
  { to: "/account", icon: User, label: "Account" },
];

const adminItems: Item[] = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/admin", icon: Shield, label: "Admin" },
  { to: "/admin/vendors", icon: LayoutDashboard, label: "Vendors" },
  { to: "/admin/products", icon: Package, label: "Products" },
  { to: "/admin/orders", icon: ShoppingBag, label: "Orders" },
];

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { count } = useCart();
  const { roles } = useAuth();
  const items = isAdmin(roles) ? adminItems : isVendor(roles) ? vendorItems : customerItems;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {items.map(({ to, icon: Icon, label, badgeCart }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <li key={to}>
              <Link
                to={to as never}
                className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                  active ? "text-electric" : "text-muted-foreground"
                }`}
              >
                <span className="relative">
                  <Icon size={20} />
                  {badgeCart && count > 0 && (
                    <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-deal px-1 text-[9px] font-bold text-deal-foreground">
                      {count}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
