import { createServerFn } from "@tanstack/react-start";
import { getOptionalSupabaseUser } from "@/integrations/supabase/optional-auth.server";
import { assertGuestPaymentTokenConfigured, createGuestPaymentToken } from "@/lib/guest-payment-token.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ServerCheckoutItem = {
  productId: string;
  quantity: number;
};

export type ServerCheckoutAddress = {
  first_name: string;
  last_name: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  country?: string;
};

export type ServerCheckoutInput = {
  idempotencyKey: string;
  items: ServerCheckoutItem[];
  email: string;
  phone: string;
  shippingAddress: ServerCheckoutAddress;
  billingAddress?: ServerCheckoutAddress;
};

export type ServerCheckoutResult = {
  order_id: string;
  order_number: string;
  subtotal: number;
  shipping_total: number;
  tax_total: number;
  discount_total: number;
  total: number;
  tax_label: string;
  province: string;
  demo: false;
  reused: boolean;
  guest_payment_token: string | null;
};

function validateCheckoutInput(data: ServerCheckoutInput): ServerCheckoutInput {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid checkout request.");
  }

  if (
    typeof data.idempotencyKey !== "string" ||
    !UUID_RE.test(data.idempotencyKey)
  ) {
    throw new Error("Invalid checkout session.");
  }

  if (!Array.isArray(data.items) || data.items.length === 0 || data.items.length > 100) {
    throw new Error("Your cart is empty or too large.");
  }

  for (const item of data.items) {
    if (!UUID_RE.test(item.productId)) {
      throw new Error("Invalid product in cart.");
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      throw new Error("Invalid product quantity.");
    }
  }

  if (!data.email || data.email.length > 320) {
    throw new Error("A valid email address is required.");
  }
  if (!data.shippingAddress?.province) {
    throw new Error("Shipping province is required.");
  }

  if (JSON.stringify(data).length > 50_000) {
    throw new Error("Checkout request is too large.");
  }

  return data;
}

export const createMarketplaceOrder = createServerFn({ method: "POST" })
  .inputValidator(validateCheckoutInput)
  .handler(async ({ data }): Promise<ServerCheckoutResult> => {
    const user = await getOptionalSupabaseUser();
    const userId = user?.id ?? null;
    const customerEmail = user?.email?.trim() || data.email.trim();

    if (!userId) {
      assertGuestPaymentTokenConfigured();
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: result, error } = await supabaseAdmin.rpc(
      "create_marketplace_order" as never,
      {
        _customer_id: userId,
        _customer_email: customerEmail,
        _customer_phone: data.phone,
        _shipping_address: data.shippingAddress,
        _billing_address: data.billingAddress ?? null,
        _items: data.items.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
        })),
        _idempotency_key: data.idempotencyKey,
      } as never,
    );

    if (error) {
      const message = error.message || "Could not create order.";
      const safeMessage =
        /inventory|available|quantity|address|email|province|checkout/i.test(message)
          ? message
          : "Checkout could not be completed.";
      throw new Error(safeMessage);
    }

    const order = result as unknown as Omit<
      ServerCheckoutResult,
      "guest_payment_token"
    > | null;

    if (!order?.order_id || !UUID_RE.test(order.order_id) || !order.order_number) {
      throw new Error("Checkout did not return a valid order.");
    }

    const guestPaymentToken = userId
      ? null
      : await createGuestPaymentToken(order.order_id);

    try {
      const { queueCustomerEvent, queueOrderEvent } = await import(
        "@/lib/takatak/outbox.server"
      );
      await queueOrderEvent(order.order_id, "order.created");
      if (userId) await queueCustomerEvent(userId, "customer.updated");
    } catch (syncError) {
      console.warn("TAKATAK checkout sync was queued incompletely:", syncError);
    }

    return {
      ...order,
      guest_payment_token: guestPaymentToken,
    };
  });
