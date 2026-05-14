import { Link, useNavigate } from "@tanstack/react-router";
import { Search, ShoppingCart, User, Heart, Menu, X, ChevronDown } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Logo } from "./Logo";
import { LanguageToggle } from "./LanguageToggle";
import { CategoryMegaMenu } from "./CategoryMegaMenu";
import { useCart } from "@/hooks/use-cart";
import { useAuth } from "@/hooks/use-auth";
import { canAccessAdmin, canAccessVendor } from "@/lib/roles";
import { categories } from "@/lib/data";

export function Header() {
  const [megaOpen, setMegaOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { count } = useCart();
  const { user, roles, signOut } = useAuth();
  const showVendor = canAccessVendor(roles);
  const showAdmin = canAccessAdmin(roles);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    navigate({ to: "/search", search: { q } });
  };

  return (
    <>
      {/* Top promo strip */}
      <div className="bg-navy text-navy-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-1.5 text-xs">
          <span className="hidden sm:inline">Free shipping on Canadian orders over $49 · 30-day returns</span>
          <span className="sm:hidden">Free CA shipping over $49</span>
          <div className="flex items-center gap-3">
            <Link to="/become-a-vendor" className="hidden font-medium hover:text-electric sm:inline">
              Sell on 1LV
            </Link>
            <Link to="/help" className="hidden hover:text-electric sm:inline">
              Help
            </Link>
            <LanguageToggle />
          </div>
        </div>
      </div>

      {/* Main header */}
      <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button
            className="grid h-9 w-9 place-items-center rounded-md text-navy hover:bg-muted md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>

          <Logo />

          <form onSubmit={onSearch} className="ml-2 hidden flex-1 md:flex">
            <div className="flex w-full overflow-hidden rounded-lg border border-border focus-within:border-electric focus-within:shadow-glow">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                type="search"
                placeholder="Search 1M+ products from Canadian and global vendors…"
                className="flex-1 bg-transparent px-4 py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              <button className="flex items-center gap-2 bg-electric px-5 text-sm font-semibold text-electric-foreground hover:opacity-90">
                <Search size={16} /> Search
              </button>
            </div>
          </form>

          <div className="ml-auto flex items-center gap-1">
            {user ? (
              <div className="hidden items-center gap-1 md:flex">
                <Link to="/account" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-navy hover:bg-muted">
                  <User size={16} /> Account
                </Link>
                {showVendor && (
                  <Link to="/vendor" className="rounded-md px-2 py-1.5 text-sm font-medium text-electric hover:bg-muted">Vendor</Link>
                )}
                {showAdmin && (
                  <Link to="/admin" className="rounded-md px-2 py-1.5 text-sm font-medium text-deal hover:bg-muted">Admin</Link>
                )}
                <button onClick={signOut} className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted">
                  Sign out
                </button>
              </div>
            ) : (
              <div className="hidden items-center gap-1 md:flex">
                <Link to="/login" className="rounded-md px-3 py-1.5 text-sm font-medium text-navy hover:bg-muted">
                  Sign in
                </Link>
                <Link to="/signup" className="rounded-md bg-navy px-3 py-1.5 text-sm font-medium text-navy-foreground hover:opacity-90">
                  Sign up
                </Link>
              </div>
            )}
            <Link to="/wishlist" className="hidden rounded-md p-2 text-navy hover:bg-muted md:inline-flex" aria-label="Wishlist">
              <Heart size={20} />
            </Link>
            <Link to="/cart" className="relative inline-flex rounded-md p-2 text-navy hover:bg-muted" aria-label="Cart">
              <ShoppingCart size={20} />
              {count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-deal px-1 text-[10px] font-bold text-deal-foreground">
                  {count}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Mobile search */}
        <form onSubmit={onSearch} className="px-4 pb-3 md:hidden">
          <div className="flex overflow-hidden rounded-lg border border-border">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="search"
              placeholder="Search products…"
              className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
            />
            <button className="bg-electric px-4 text-electric-foreground" aria-label="Search">
              <Search size={16} />
            </button>
          </div>
        </form>

        {/* Category bar */}
        <div className="relative hidden border-t border-border md:block" onMouseLeave={() => setMegaOpen(false)}>
          <div className="mx-auto flex max-w-7xl items-center gap-1 px-4">
            <button
              onMouseEnter={() => setMegaOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-navy hover:text-electric"
            >
              <Menu size={16} /> All categories <ChevronDown size={14} />
            </button>
            {categories.slice(0, 8).map((c) => (
              <Link
                key={c.slug}
                to="/category/$slug"
                params={{ slug: c.slug }}
                onMouseEnter={() => setMegaOpen(false)}
                className="px-3 py-2.5 text-sm text-navy/80 hover:text-electric"
              >
                {c.name}
              </Link>
            ))}
            <Link to="/become-a-vendor" className="ml-auto px-3 py-2.5 text-sm font-medium text-deal hover:underline">
              Become a vendor →
            </Link>
          </div>
          <CategoryMegaMenu open={megaOpen} />
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] overflow-y-auto bg-white p-5">
            <div className="mb-6 flex items-center justify-between">
              <Logo />
              <button onClick={() => setMobileOpen(false)} className="rounded-md p-1.5 hover:bg-muted">
                <X size={22} />
              </button>
            </div>
            <nav className="space-y-1">
              {!user && (
                <>
                  <Link to="/login" className="block rounded-md px-3 py-2 font-medium text-navy hover:bg-muted">Sign in</Link>
                  <Link to="/signup" className="block rounded-md px-3 py-2 font-medium text-navy hover:bg-muted">Create account</Link>
                  <div className="my-2 border-t border-border" />
                </>
              )}
              <p className="px-3 pt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Categories</p>
              {categories.map((c) => (
                <Link
                  key={c.slug}
                  to="/category/$slug"
                  params={{ slug: c.slug }}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm text-navy hover:bg-muted"
                >
                  {c.emoji} {c.name}
                </Link>
              ))}
              <div className="my-2 border-t border-border" />
              <Link to="/become-a-vendor" className="block rounded-md px-3 py-2 font-medium text-deal">Become a vendor</Link>
              <Link to="/help" className="block rounded-md px-3 py-2 text-sm text-navy hover:bg-muted">Help center</Link>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
