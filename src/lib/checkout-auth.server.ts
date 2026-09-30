import { getRequest } from "@tanstack/react-start/server";

export type CheckoutUser = {
  id: string;
  email: string | null;
};

/**
 * Resolve the current Supabase user when a bearer token is attached to a
 * TanStack server-function call. Missing auth means guest checkout. A malformed
 * or invalid bearer token is rejected rather than silently downgraded to guest.
 */
export async function getOptionalCheckoutUser(): Promise<CheckoutUser | null> {
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");

  if (!authHeader) return null;

  if (!authHeader.startsWith("Bearer ")) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new Response("Unauthorized", { status: 401 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
  };
}
