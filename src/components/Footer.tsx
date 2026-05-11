import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-navy text-navy-foreground">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 md:grid-cols-5">
        <div className="md:col-span-2">
          <Logo variant="light" />
          <p className="mt-3 max-w-xs text-sm text-white/70">
            1LV.CA is Canada's marketplace for everyday essentials and unique finds — powered by trusted Canadian and global vendors.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["🇨🇦 CAD", "EN / FR", "Secure checkout", "Klarna ready"].map((t) => (
              <span key={t} className="rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/80">
                {t}
              </span>
            ))}
          </div>
        </div>
        {[
          { title: "Shop", links: [["Categories", "/categories"], ["Flash deals", "/search"], ["New arrivals", "/search"], ["Wishlist", "/wishlist"]] },
          { title: "Sell", links: [["Become a vendor", "/become-a-vendor"], ["Vendor pricing", "/vendor-pricing"], ["Vendor login", "/login"]] },
          { title: "Support", links: [["Help center", "/help"], ["Shipping", "/shipping"], ["Returns", "/returns"], ["Privacy", "/privacy"], ["Terms", "/terms"]] },
        ].map((col) => (
          <div key={col.title}>
            <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-white">{col.title}</h4>
            <ul className="space-y-2 text-sm text-white/70">
              {col.links.map(([label, to]) => (
                <li key={to}>
                  <Link to={to} className="hover:text-electric">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 py-4 text-xs text-white/60 sm:flex-row">
          <span>© {new Date().getFullYear()} 1LV.CA — Made in Canada with care.</span>
          <span>Prices in CAD · GST/QST/HST calculated at checkout</span>
        </div>
      </div>
    </footer>
  );
}
