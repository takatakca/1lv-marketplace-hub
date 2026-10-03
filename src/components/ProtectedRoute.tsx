import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { usePublicMarketplaceSettings } from "@/hooks/use-marketplace-settings";
import { canAccessAdmin, canAccessVendor } from "@/lib/roles";

/**
 * Signed-out dashboard preview is allowed only when the persisted marketplace
 * demo_mode setting is enabled. Authenticated users are always role-checked.
 */
export function ProtectedRoute({
  children,
  role,
}: {
  children: ReactNode;
  role?: "vendor" | "admin";
}) {
  const { user, roles, loading } = useAuth();
  const { settings: marketplaceSettings, loading: settingsLoading } = usePublicMarketplaceSettings();
  const navigate = useNavigate();
  const previewEnabled = marketplaceSettings?.demo_mode === true;

  useEffect(() => {
    if (loading || !user || !role) return;
    const allowed = role === "admin" ? canAccessAdmin(roles) : canAccessVendor(roles);
    if (!allowed) navigate({ to: "/account" });
  }, [user, roles, loading, role, navigate]);

  if (loading || (!user && settingsLoading)) {
    return <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!user && role && !previewEnabled) {
    return (
      <div className="grid min-h-[40vh] place-items-center p-8 text-center">
        <div>
          <h2 className="text-xl font-bold text-navy">Sign in required</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Dashboard preview is disabled. Sign in with an authorized account to continue.
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/login" })}
            className="mt-4 rounded-md bg-electric px-4 py-2 text-sm font-semibold text-electric-foreground"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  if (user && role) {
    const allowed = role === "admin" ? canAccessAdmin(roles) : canAccessVendor(roles);
    if (!allowed) {
      return (
        <div className="grid min-h-[40vh] place-items-center p-8 text-center">
          <div>
            <h2 className="text-xl font-bold text-navy">Access restricted</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You need {role} permissions to view this page.
            </p>
          </div>
        </div>
      );
    }
  }
  return <>{children}</>;
}
