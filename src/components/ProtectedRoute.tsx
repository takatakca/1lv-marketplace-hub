import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { canAccessAdmin, canAccessVendor } from "@/lib/roles";

/**
 * In preview mode (no signed-in user) we DO NOT redirect — the page renders
 * in demo mode so the marketplace can be explored. Real role enforcement
 * activates as soon as a user is authenticated.
 */
export function ProtectedRoute({
  children,
  role,
}: {
  children: ReactNode;
  role?: "vendor" | "admin";
}) {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !user || !role) return;
    const allowed = role === "admin" ? canAccessAdmin(roles) : canAccessVendor(roles);
    if (!allowed) navigate({ to: "/account" });
  }, [user, roles, loading, role, navigate]);

  if (loading) {
    return <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">Loading…</div>;
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
