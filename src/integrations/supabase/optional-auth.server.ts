import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";
import type { Database } from "./types";
import { requireTakatakAuthorizedSession } from "./auth-middleware";

export type OptionalSupabaseUser = {
  id: string;
  email: string | null;
};

export async function getOptionalSupabaseUser(): Promise<OptionalSupabaseUser | null> {
  const request = getRequest();
  const authorization = request?.headers?.get("authorization");

  if (!authorization) return null;
  if (!authorization.startsWith("Bearer ")) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) throw new Response("Unauthorized", { status: 401 });

  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase server authentication is not configured.");
  }

  const client = createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const claims = data.claims as Record<string, unknown>;
  const id = await requireTakatakAuthorizedSession(client, claims);
  const email =
    typeof claims["email"] === "string" ? claims["email"] : null;

  return { id, email };
}

export async function getOptionalSupabaseUserId(): Promise<string | null> {
  return (await getOptionalSupabaseUser())?.id ?? null;
}
