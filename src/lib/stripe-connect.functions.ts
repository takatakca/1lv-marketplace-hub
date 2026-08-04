import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Stripe Connect (Express) server functions.
 *
 * All Stripe API calls happen server-side with STRIPE_SECRET_KEY.
 * The client only ever receives a safe status payload or a hosted
 * onboarding URL — never account objects or secret keys.
 */

const STRIPE_API = "https://api.stripe.com/v1";

export type ConnectStatus = "not_connected" | "onboarding" | "restricted" | "enabled";

export type ConnectResult = {
  status: ConnectStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  connected: boolean;
  pending: boolean;
  reason?: string;
};

export type ConnectLinkResult = {
  url: string | null;
  pending: boolean;
  reason?: string;
};

function configured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function stripeCall(
  path: string,
  method: "GET" | "POST",
  body?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe not configured");
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(body ? { body: new URLSearchParams(body).toString() } : {}),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error as { message?: string } | undefined)?.message ?? "Stripe error";
    throw new Error(err);
  }
  return json;
}

type VendorRow = {
  id: string;
  user_id: string;
  store_name: string;
  status: string;
  contact_email: string | null;
  stripe_connect_account_id: string | null;
};

/** Load the caller's own vendor row through RLS and enforce ownership + active status. */
async function loadOwnedVendor(
  supabase: { from: (t: string) => any },
  vendorId: string,
  userId: string,
  requireActive: boolean,
): Promise<VendorRow> {
  const { data, error } = await supabase
    .from("vendors")
    .select("id, user_id, store_name, status, contact_email, stripe_connect_account_id")
    .eq("id", vendorId)
    .maybeSingle();
  if (error || !data) throw new Error("Vendor not found or access denied");
  const vendor = data as VendorRow;
  if (vendor.user_id !== userId) throw new Error("Forbidden");
  if (requireActive && vendor.status !== "active") {
    throw new Error("Your store must be approved before connecting a payout account.");
  }
  return vendor;
}

function deriveStatus(acct: Record<string, unknown>): ConnectResult {
  const chargesEnabled = Boolean(acct.charges_enabled);
  const payoutsEnabled = Boolean(acct.payouts_enabled);
  const detailsSubmitted = Boolean(acct.details_submitted);
  const status: ConnectStatus = !detailsSubmitted
    ? "onboarding"
    : chargesEnabled && payoutsEnabled
      ? "enabled"
      : "restricted";
  return { status, chargesEnabled, payoutsEnabled, detailsSubmitted, connected: true, pending: false };
}

async function persist(vendorId: string, r: ConnectResult, accountId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("vendors")
    .update({
      ...(accountId ? { stripe_connect_account_id: accountId } : {}),
      charges_enabled: r.chargesEnabled,
      payouts_enabled: r.payoutsEnabled,
      stripe_details_submitted: r.detailsSubmitted,
      stripe_connect_status: r.status,
      stripe_connect_last_checked_at: new Date().toISOString(),
    } as never)
    .eq("id", vendorId);
}

/** Create (or reuse) a Stripe Express account for the caller's vendor. */
export const createStripeConnectAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { vendorId: string }) => data)
  .handler(async ({ data, context }): Promise<ConnectResult> => {
    if (!configured()) {
      return {
        status: "not_connected",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        connected: false,
        pending: true,
        reason: "Stripe setup required — add STRIPE_SECRET_KEY to enable payout onboarding.",
      };
    }
    const vendor = await loadOwnedVendor(context.supabase, data.vendorId, context.userId, true);

    if (vendor.stripe_connect_account_id) {
      const acct = await stripeCall(`/accounts/${vendor.stripe_connect_account_id}`, "GET");
      const result = deriveStatus(acct);
      await persist(vendor.id, result);
      return result;
    }

    const acct = await stripeCall("/accounts", "POST", {
      type: "express",
      country: "CA",
      default_currency: "cad",
      email: vendor.contact_email ?? "",
      "capabilities[card_payments][requested]": "true",
      "capabilities[transfers][requested]": "true",
      "business_profile[name]": vendor.store_name,
      "metadata[vendor_id]": vendor.id,
      "metadata[owner_id]": context.userId,
      "metadata[store_name]": vendor.store_name,
    });
    const result = deriveStatus(acct);
    await persist(vendor.id, result, acct.id as string);
    return result;
  });

/** Create a hosted Express onboarding Account Link for the caller's vendor. */
export const createStripeConnectAccountLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { vendorId: string; returnOrigin: string }) => data)
  .handler(async ({ data, context }): Promise<ConnectLinkResult> => {
    if (!configured()) {
      return { url: null, pending: true, reason: "Stripe setup required" };
    }
    const vendor = await loadOwnedVendor(context.supabase, data.vendorId, context.userId, true);
    if (!vendor.stripe_connect_account_id) {
      return { url: null, pending: true, reason: "No payout account yet — create one first." };
    }
    const origin = data.returnOrigin.replace(/\/$/, "");
    const link = await stripeCall("/account_links", "POST", {
      account: vendor.stripe_connect_account_id,
      refresh_url: `${origin}/vendor/payouts?connect=refresh`,
      return_url: `${origin}/vendor/payouts?connect=success`,
      type: "account_onboarding",
    });
    return { url: (link.url as string) ?? null, pending: false };
  });

/** Re-read the Stripe account and sync capability flags onto the vendor row. */
export const refreshStripeConnectStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { vendorId: string }) => data)
  .handler(async ({ data, context }): Promise<ConnectResult> => {
    const vendor = await loadOwnedVendor(context.supabase, data.vendorId, context.userId, false);
    if (!vendor.stripe_connect_account_id) {
      return {
        status: "not_connected",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        connected: false,
        pending: false,
      };
    }
    if (!configured()) {
      return {
        status: "not_connected",
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        connected: false,
        pending: true,
        reason: "Stripe setup required",
      };
    }
    const acct = await stripeCall(`/accounts/${vendor.stripe_connect_account_id}`, "GET");
    const result = deriveStatus(acct);
    await persist(vendor.id, result);
    return result;
  });
