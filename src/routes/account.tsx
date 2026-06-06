import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { Package, Heart, Tag, Eye, Store, Shield, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/account")({
  component: Account,
  head: () => ({ meta: [{ title: "My account — 1LV.CA" }] }),
});

function Account() {
  const { user, roles, signOut, loading } = useAuth();

  if (loading) {
    return <AppLayout><div className="grid h-96 place-items-center text-sm text-muted-foreground">Loading…</div></AppLayout>;
  }

  if (!user) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="font-display text-2xl font-extrabold text-navy">You're not signed in</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to manage orders, wishlist and your account.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/login" className="rounded-md bg-electric px-5 py-2.5 text-sm font-semibold text-electric-foreground hover:opacity-90">Sign in</Link>
            <Link to="/signup" className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-navy hover:bg-muted">Create account</Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const displayName = (meta.display_name as string) || user.email?.split("@")[0] || "Member";
  const phone = (meta.phone as string) || user.phone || "—";
  const googleLinked = (user.app_metadata?.providers ?? []).includes("google");
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-display text-3xl font-extrabold text-navy">My account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Welcome back, {displayName}.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {/* Profile card */}
          <div className="rounded-xl border border-border bg-card p-5 md:col-span-1">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-electric text-base font-bold text-electric-foreground">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate font-bold text-navy">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-1.5 text-sm">
              <Row label="Email" value={user.email ?? "—"} />
              <Row label="Phone" value={phone} />
              <Row label="Roles" value={(roles.length ? roles : ["customer"]).join(", ")} capitalize />
              <Row
                label="Google"
                value={
                  googleLinked
                    ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={14} /> Connected</span>
                    : <span className="text-muted-foreground">Not connected</span>
                }
              />
            </dl>
            <button
              onClick={signOut}
              className="mt-4 w-full rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Sign out
            </button>
          </div>

          {/* Shortcuts */}
          <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
            <Shortcut to="/orders" icon={<Package size={18} />} title="Orders" desc="Track and review your orders" />
            <Shortcut to="/wishlist" icon={<Heart size={18} />} title="Wishlist" desc="Saved products" />
            <Shortcut to="/coupons" icon={<Tag size={18} />} title="Coupons" desc="Promo codes & savings" />
            <RecentlyViewedShortcut />

            {roles.includes("vendor") && (
              <Link to="/vendor" className="md:col-span-2 flex items-center gap-3 rounded-xl border border-electric bg-electric/5 p-5 hover:bg-electric/10">
                <Store size={18} className="text-electric" />
                <div className="flex-1">
                  <p className="font-bold text-electric">Vendor dashboard</p>
                  <p className="text-xs text-muted-foreground">Manage your store, products and orders</p>
                </div>
                <span className="text-electric">→</span>
              </Link>
            )}
            {roles.includes("admin") && (
              <Link to="/admin" className="md:col-span-2 flex items-center gap-3 rounded-xl border border-deal bg-deal/5 p-5 hover:bg-deal/10">
                <Shield size={18} className="text-deal" />
                <div className="flex-1">
                  <p className="font-bold text-deal">Admin console</p>
                  <p className="text-xs text-muted-foreground">Marketplace operations</p>
                </div>
                <span className="text-deal">→</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Row({ label, value, capitalize }: { label: string; value: React.ReactNode; capitalize?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 truncate text-right font-medium text-navy ${capitalize ? "capitalize" : ""}`}>{value}</dd>
    </div>
  );
}

function Shortcut({ to, icon, title, desc }: { to: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-electric">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-navy">{icon}</span>
      <div className="flex-1">
        <p className="text-sm font-bold text-navy">{title}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
    </Link>
  );
}

function RecentlyViewedShortcut() {
  return (
    <Link to="/" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-electric">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-navy"><Eye size={18} /></span>
      <div className="flex-1">
        <p className="text-sm font-bold text-navy">Recently viewed</p>
        <p className="text-[11px] text-muted-foreground">Pick up where you left off</p>
      </div>
    </Link>
  );
}
