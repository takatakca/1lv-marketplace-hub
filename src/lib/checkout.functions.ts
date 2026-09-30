import { createServerFn } from "@tanstack/react-start";
import { getOptionalSupabaseUserId } from "@/integrations/supabase/optional-auth.server";

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
  checkoutKey: string;
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
};

function validateCheckoutInput(data: ServerCheckoutInput): ServerCheckoutInput {
  if (!data || typeof data !== "object") throw new Error("Invalid checkout request.");
  if (!/^[0-9a-f-]{36}$/i.test(data.checkoutKey)) throw new Error("Invalid checkout session.");
  if (!Array.isArray(data.items) || data.items.length === 0 || data.items.length > 100) {
    throw new Error("Your cart is empty or too large.");
  }

  for (const item of data.items) {
    if (!/^[0-9a-f-]{36}$/i.test(item.productId)) throw new Error("Invalid product in cart.");
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      throw new Error("Invalid product quantity.");
    }
  }

  if (!data.email || data.email.length > 320) throw new Error("A valid email address is required.");
  if (!data.shippingAddress?.province) throw new Error("Shipping province is required.");

  return data;
}

export const createMarketplaceOrder = createServerFn({ method: "POST" })
  .inputValidator(validateCheckoutInput)
  .handler(async ({ data }): Promise<ServerCheckoutResult> => {
    const userId = await getOptionalSupabaseUserId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: result, error } = await supabaseAdmin.rpc(
      "create_marketplace_order" as never,
      {
        _checkout_key: data.checkoutKey,
        _customer_id: userId,
        _customer_email: data.email,
        _customer_phone: data.phone,
        _shipping_address: data.shippingAddress,
        _billing_address: data.billingAddress ?? null,
        _items: data.items.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
        })),
      } as never,
    );

    if (error) {
      throw new Error(error.message || "Could not create order.");
    }

    const order = result as unknown as ServerCheckoutResult | null;
    if (!order?.order_id || !order.order_number) {
      throw new Error("Checkout did not return a valid order.");
    }

    try {
      const { queueCustomerEvent, queueOrderEvent } = await import("@/lib/takatak/outbox.server");
      await queueOrderEvent(order.order_id, "order.created");
      if (userId) await queueCustomerEvent(userId, "customer.updated");
    } catch (error) {
      console.warn("TAKATAK checkout sync was queued incompletely:", error);
    }

    return order;
  });
