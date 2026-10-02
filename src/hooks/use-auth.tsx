import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { signalCustomer } from "@/services/takatak-sync";

type Role = "customer" | "vendor" | "admin";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  roles: Role[];
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);


const MASTER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isTakatakLocalUser(user: User | null | undefined): user is User {
  if (!user) return false;

  const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;
  const masterId =
    typeof appMetadata["takatak_person_id"] === "string"
      ? appMetadata["takatak_person_id"]
      : "";
  const authSource =
    typeof appMetadata["auth_source"] === "string"
      ? appMetadata["auth_source"]
      : "";
  const email = user.email?.trim().toLowerCase() ?? "";
  const expectedEmail = masterId
    ? `takatak.${masterId.toLowerCase()}@auth.1lv.ca`
    : "";

  return (
    authSource === "takatak" &&
    MASTER_ID_PATTERN.test(masterId) &&
    email === expectedEmail
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s?.user && !isTakatakLocalUser(s.user)) {
        setSession(null);
        setRoles([]);
        // Defer Auth calls outside the callback to avoid Supabase auth
        // callback deadlocks. A stray local Supabase session is never trusted.
        setTimeout(() => {
          void supabase.auth.signOut();
        }, 0);
        return;
      }

      setSession(s);
      if (s?.user) {
        // defer to avoid deadlocks
        setTimeout(() => fetchRoles(s.user.id), 0);
        // The browser session is local to 1LV and is issued only after
        // GROUPE TAKATAK verifies the master identity. This non-blocking event
        // updates TAKATAK's authorized 1LV projection; it is not authentication.
        setTimeout(() => signalCustomer("customer.created"), 0);
      } else {
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      const current = data.session;
      if (current?.user && !isTakatakLocalUser(current.user)) {
        setSession(null);
        setRoles([]);
        void supabase.auth.signOut();
      } else {
        setSession(current);
        if (current?.user) fetchRoles(current.user.id);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    setRoles((data ?? []).map((r) => r.role as Role));
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, roles, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
