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
    let active = true;
    let validationSequence = 0;

    const acceptSession = async (
      candidate: Session | null,
      signalMaster: boolean,
    ) => {
      const sequence = ++validationSequence;
      if (!active) return;

      if (!candidate?.user) {
        setSession(null);
        setRoles([]);
        return;
      }

      if (!isTakatakLocalUser(candidate.user)) {
        setSession(null);
        setRoles([]);
        await supabase.auth.signOut();
        return;
      }

      const { data: granted, error: grantError } = await supabase.rpc(
        "is_takatak_authorized_session" as never,
      );

      if (!active || sequence !== validationSequence) return;

      if (grantError || (granted as unknown) !== true) {
        setSession(null);
        setRoles([]);
        await supabase.auth.signOut();
        return;
      }

      setSession(candidate);
      await fetchRoles(candidate.user.id);

      if (!active || sequence !== validationSequence) return;

      if (signalMaster) {
        // This event updates TAKATAK's authorized 1LV projection. It is never
        // used to establish identity or to authorize the local session.
        void signalCustomer("customer.updated");
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Supabase recommends deferring additional Auth/Data API work outside
      // the auth-state callback to avoid callback lock/deadlock behavior.
      setLoading(true);
      setTimeout(() => {
        void acceptSession(s, event === "SIGNED_IN").finally(() => {
          if (active) setLoading(false);
        });
      }, 0);
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      try {
        await acceptSession(data.session, false);
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    setRoles((data ?? []).map((r) => r.role as Role));
  };

  const signOut = async () => {
    try {
      await supabase.rpc("revoke_current_takatak_session" as never);
    } finally {
      await supabase.auth.signOut();
    }
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
