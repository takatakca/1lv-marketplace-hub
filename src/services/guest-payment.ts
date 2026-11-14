export type GuestPaymentContext = {
  orderId: string;
  orderNumber: string;
  checkoutKey: string;
  token: string | null;
  createdAt: string;
};

const PREFIX = "1lv_guest_payment:";

export function saveGuestPaymentContext(context: GuestPaymentContext) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      PREFIX + context.orderNumber,
      JSON.stringify(context),
    );
  } catch {
    // The current payment attempt can still proceed. Only a later retry loses
    // convenience if session storage is unavailable.
  }
}

export function getGuestPaymentContext(
  orderNumber: string | null | undefined,
): GuestPaymentContext | null {
  if (!orderNumber || typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(PREFIX + orderNumber);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<GuestPaymentContext>;
    if (
      typeof parsed.orderId !== "string" ||
      parsed.orderNumber !== orderNumber ||
      typeof parsed.checkoutKey !== "string" ||
      !parsed.checkoutKey ||
      (parsed.token !== null && typeof parsed.token !== "string")
    ) {
      return null;
    }

    return {
      orderId: parsed.orderId,
      orderNumber: parsed.orderNumber,
      checkoutKey: parsed.checkoutKey,
      token: parsed.token,
      createdAt:
        typeof parsed.createdAt === "string"
          ? parsed.createdAt
          : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearGuestPaymentContext(orderNumber: string) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(PREFIX + orderNumber);
  } catch {
    // no-op
  }
}

/**
 * Keep the guest's unguessable checkout key in sessionStorage for order lookup,
 * but discard the short-lived payment capability when the order is settled.
 * A paid guest otherwise loses access to their receipt immediately on refresh.
 */
export function clearGuestPaymentToken(orderNumber: string) {
  const context = getGuestPaymentContext(orderNumber);
  if (!context || context.token === null) return;
  saveGuestPaymentContext({ ...context, token: null });
}
