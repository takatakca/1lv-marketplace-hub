import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

export function ProtectedRoute({ children, role }: { children: ReactNode; role?: "vendor" | "admin" }) {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (role && !roles.includes(role)) {
      navigate({ to: "/account" });
    }
  }, [user, roles, loading, role, navigate]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (role && !roles.includes(role)) {
    return (
      <div className="grid min-h-screen place-items-center p-8 text-center">
        <div>
          <h2 className="text-xl font-bold text-navy">Access restricted</h2>
          <p className="mt-2 text-sm text-muted-foreground">You need {role} permissions to view this page.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
