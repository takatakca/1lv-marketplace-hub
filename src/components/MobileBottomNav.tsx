import { Link, useLocation } from "@tanstack/react-router";
import { Home, LayoutGrid, Heart, ShoppingCart, User } from "lucide-react";
import { useCart } from "@/hooks/use-cart";

const items = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/categories", icon: LayoutGrid, label: "Browse" },
  { to: "/wishlist", icon: Heart, label: "Saved" },
  { to: "/cart", icon: ShoppingCart, label: "Cart" },
  { to: "/account", icon: User, label: "Account" },
] as const;

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { count } = useCart();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {items.map(({ to, icon: Icon, label }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <li key={to}>
              <Link
                to={to}
                className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                  active ? "text-electric" : "text-muted-foreground"
                }`}
              >
                <span className="relative">
                  <Icon size={20} />
                  {to === "/cart" && count > 0 && (
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
