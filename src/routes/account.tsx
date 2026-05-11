import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/use-auth";

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
          <p className="mt-2 text-sm text-muted-foreground">Sign in to manage your orders, wishlist and account.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/login" className="rounded-md bg-electric px-5 py-2.5 text-sm font-semibold text-electric-foreground hover:opacity-90">Sign in</Link>
            <Link to="/signup" className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-navy hover:bg-muted">Create account</Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="font-display text-3xl font-extrabold text-navy">My account</h1>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-bold text-navy">Profile</h3>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Email</dt><dd className="font-medium">{user.email}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Roles</dt><dd className="font-medium capitalize">{roles.join(", ") || "customer"}</dd></div>
            </dl>
            <button onClick={signOut} className="mt-4 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">Sign out</button>
          </div>
          <div className="grid gap-3">
            <Link to="/orders" className="rounded-xl border border-border bg-card p-5 hover:border-electric">
              <h3 className="font-bold text-navy">Orders</h3>
              <p className="text-xs text-muted-foreground">Track and review your orders</p>
            </Link>
            <Link to="/wishlist" className="rounded-xl border border-border bg-card p-5 hover:border-electric">
              <h3 className="font-bold text-navy">Wishlist</h3>
              <p className="text-xs text-muted-foreground">Saved products</p>
            </Link>
            {roles.includes("vendor") && (
              <Link to="/vendor" className="rounded-xl border border-electric bg-electric/5 p-5 hover:bg-electric/10">
                <h3 className="font-bold text-electric">Vendor dashboard →</h3>
              </Link>
            )}
            {roles.includes("admin") && (
              <Link to="/admin" className="rounded-xl border border-deal bg-deal/5 p-5 hover:bg-deal/10">
                <h3 className="font-bold text-deal">Admin console →</h3>
              </Link>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
