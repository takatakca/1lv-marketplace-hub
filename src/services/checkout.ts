import { supabase } from "@/integrations/supabase/client";
import type { CartItem } from "@/hooks/use-cart";
import {
  calculateCanadianOrderTotals,
  normalizeProvinceCode,
  type ShippingPricing,
} from "@/lib/canada-commerce";
import { createMarketplaceOrder } from "@/lib/checkout.functions";

export type Address = {
  first_name: string;
  last_name: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
};

export type CheckoutInput = {
  items: CartItem[];
  email: string;
  phone: string;
  shipping_address: Address;
  billing_address?: Address;
  checkout_key?: string;
  promotion_code?: string | null;
  shipping_settings?: ShippingPricing;
};

export type CheckoutResult = {
  order_id: string;
  order_number: string;
  demo: boolean;
  checkout_key: string | null;
  guest_payment_token: string | null;
  subtotal: number;
  shipping_total: number;
  tax_total: number;
  total: number;
  tax_label: string;
  province: string;
  discount_total: number;
  promotion_code: string | null;
  promotion_savings_total: number;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function createOrder(input: CheckoutInput): Promise<CheckoutResult> {
  if (input.items.length === 0) throw new Error("Your cart is empty.");

  const uuidItems = input.items.filter((item) => isUuid(item.productId));
  const province = normalizeProvinceCode(input.shipping_address.province);

  // Seed/demo products never enter the production financial tables.
  if (uuidItems.length === 0) {
    const subtotal = input.items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const pricing = calculateCanadianOrderTotals({
      subtotal,
      province,
      shipping: input.shipping_settings,
    });
    const synthetic = "1LV-" + Math.floor(100000 + Math.random() * 900000);

    return {
      order_id: synthetic,
      order_number: synthetic,
      demo: true,
      checkout_key: null,
      guest_payment_token: null,
      subtotal: pricing.subtotal,
      shipping_total: pricing.shippingTotal,
      tax_total: pricing.taxTotal,
      total: pricing.total,
      tax_label: pricing.taxProfile.taxLabel,
      province,
      discount_total: 0,
      promotion_code: null,
      promotion_savings_total: 0,
    };
  }

  if (uuidItems.length !== input.items.length) {
    throw new Error("Your cart contains a mix of demo and live products. Remove the demo items before checkout.");
  }

  const checkoutKey = input.checkout_key ?? crypto.randomUUID();
  const result = await createMarketplaceOrder({
    data: {
      idempotencyKey: checkoutKey,
      items: input.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId ?? null,
        quantity: item.qty,
      })),
      email: input.email,
      phone: input.phone,
      shippingAddress: {
        ...input.shipping_address,
        province,
        country: "Canada",
      },
      billingAddress: input.billing_address
        ? {
            ...input.billing_address,
            province: normalizeProvinceCode(input.billing_address.province),
            country: "Canada",
          }
        : undefined,
      promotionCode: input.promotion_code?.trim().toUpperCase() || null,
    },
  });

  return {
    ...result,
    demo: false,
    checkout_key: checkoutKey,
  };
}

export async function getOrderByNumber(orderNumber: string, checkoutKey?: string | null) {
  type OrderShape = {
    id?: string;
    order_number: string;
    total: number;
    status: string;
    payment_status: string;
    created_at: string;
    order_items?: Array<{
      id: string;
      title: string;
      quantity: number;
      unit_price: number;
      status: string;
      tracking_number: string | null;
      carrier: string | null;
    }>;
  };

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    const { data } = await supabase
      .from("orders")
      .select("id, order_number, total, status, payment_status, created_at, order_items(*)")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (data) return data as unknown as OrderShape | null;
  }

  if (!checkoutKey) return null;

  const { data, error } = await supabase.rpc(
    "lookup_guest_order" as never,
    {
      _order_number: orderNumber,
      _checkout_key: checkoutKey,
    } as never,
  );
  if (error) throw error;

  return (data as unknown as OrderShape | null) ?? null;
}

export async function listMyOrders(customerId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, total, status, payment_status, created_at, order_items(id, title, quantity, unit_price)",
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
