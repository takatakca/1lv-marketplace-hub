/**
 * Fire-and-forget TAKATAK lifecycle signals.
 *
 * NOTHING here may block or fail a marketplace action. Every call is wrapped:
 * if the master platform (or its server function) is unavailable, the user
 * flow continues and the event is simply not queued yet — an admin can
 * re-queue it from the TAKATAK console.
 */
import {
  syncTakatakCustomer,
  syncTakatakMerchant,
  syncTakatakOrderCreated,
  syncTakatakVendorOrderDelivered,
} from "@/lib/takatak.functions";

function safe(p: Promise<unknown>) {
  void p.catch(() => {
    /* intentionally silent: TAKATAK sync never affects the marketplace */
  });
}

export function signalCustomer(event: "customer.created" | "customer.updated") {
  safe(syncTakatakCustomer({ data: { event } }));
}

export function signalMerchant(
  vendorId: string,
  event: "merchant.application.created" | "merchant.updated" | "merchant.approved" | "merchant.suspended",
) {
  safe(syncTakatakMerchant({ data: { vendorId, event } }));
}

export function signalOrderCreated(orderId: string) {
  safe(syncTakatakOrderCreated({ data: { orderId } }));
}

export function signalVendorOrderDelivered(vendorOrderId: string) {
  safe(syncTakatakVendorOrderDelivered({ data: { vendorOrderId } }));
}
