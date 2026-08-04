/**
 * Stripe Connect client service — thin wrapper around server functions.
 * No Stripe keys or account objects ever reach this layer.
 */
import {
  createStripeConnectAccount as createAccountFn,
  createStripeConnectAccountLink as createLinkFn,
  refreshStripeConnectStatus as refreshFn,
  type ConnectResult,
  type ConnectLinkResult,
  type ConnectStatus,
} from "@/lib/stripe-connect.functions";

export type { ConnectResult, ConnectLinkResult, ConnectStatus };

const notConfigured = (reason: string): ConnectResult => ({
  status: "not_connected",
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
  connected: false,
  pending: true,
  reason,
});

export async function createConnectAccount(vendorId: string): Promise<ConnectResult> {
  try {
    return await createAccountFn({ data: { vendorId } });
  } catch (err) {
    return notConfigured(err instanceof Error ? err.message : "Stripe setup required");
  }
}

export async function createConnectOnboardingLink(vendorId: string): Promise<ConnectLinkResult> {
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return await createLinkFn({ data: { vendorId, returnOrigin: origin } });
  } catch (err) {
    return { url: null, pending: true, reason: err instanceof Error ? err.message : "Stripe setup required" };
  }
}

export async function refreshConnectStatus(vendorId: string): Promise<ConnectResult> {
  try {
    return await refreshFn({ data: { vendorId } });
  } catch (err) {
    return notConfigured(err instanceof Error ? err.message : "Stripe setup required");
  }
}

export function connectLabel(status: ConnectStatus): string {
  switch (status) {
    case "enabled":
      return "Ready";
    case "restricted":
      return "Restricted";
    case "onboarding":
      return "Onboarding";
    default:
      return "Not connected";
  }
}
