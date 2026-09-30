import { supabase } from "@/integrations/supabase/client";
import type { CartItem } from "@/hooks/use-cart";
import {
  calculateCanadianOrderTotals,
  normalizeProvinceCode,
} from "@/lib/canada-commerce";
import { signalCustomer, signalOrderCreated } from "./takatak-sync";

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
  customer_id?: string | null;
};

export type ValidatedItem = {
  id: string;
  vendor_id: string;
  title: string;
  unit_price: number;
  quantity: number;
};

export type CheckoutResult = {
  order_id: string;
  order_number: string;
  demo: boolean;
  subtotal: number;
  shipping_total: number;
  tax_total: number;
  total: number;
  tax_label: string;
  province: string;
};

/**
 * Validate cart items against Supabase. Returns null if none of the items
 * exist in the products table (demo / seed mode), or a validated list with
 * database-verified prices and vendor ids when they do.
 *
 * Blocks archived/rejected/inactive products in real mode.
 */
export async function validateCart(items: CartItem[]): Promise<ValidatedItem[] | null> {
  if (items.length === 0) return [];
  const ids = items.map((i) => i.productId).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length === 0) return null;

  const { data, error } = await supabase
    .from("products")
    .select("id, vendor_id, title, price, status")
    .in("id", ids);
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return null;

  const byId = new Map(rows.map((r) => [r.id, r]));
  const validated: ValidatedItem[] = [];

  for (const item of items) {
    const row = byId.get(item.productId);
    if (!row) throw new Error(`Item "${item.title}" is no longer available`);
    if (row.status !== "active") {
      throw new Error(`Item "${row.title}" is no longer available`);
    }

    validated.push({
      id: row.id,
      vendor_id: row.vendor_id,
      title: row.title,
      unit_price: Number(row.price),
      quantity: item.qty,
    });
  }

  return validated;
}

export async function createOrder(input: CheckoutInput): Promise<CheckoutResult> {
  const validated = await validateCart(input.items);
  const province = normalizeProvinceCode(input.shipping_address.province);

  // Demo fallback for seed-only products. The production path below always
  // re-prices products from the database.
  if (validated === null) {
    const subtotal = input.items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const pricing = calculateCanadianOrderTotals({ subtotal, province });
    const synthetic = "1LV-" + Math.floor(100000 + Math.random() * 900000);

    return {
      order_id: synthetic,
      order_number: synthetic,
      demo: true,
      subtotal: pricing.subtotal,
      shipping_total: pricing.shippingTotal,
      tax_total: pricing.taxTotal,
      total: pricing.total,
      tax_label: pricing.taxProfile.taxLabel,
      province,
    };
  }

  if (validated.length === 0) {
    throw new Error("Your cart is empty.");
  }

  const subtotal = validated.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const pricing = calculateCanadianOrderTotals({ subtotal, province });

  const shippingAddress: Address = {
    ...input.shipping_address,
    province,
    country: "Canada",
  };
  const billingAddress: Address = {
    ...(input.billing_address ?? shippingAddress),
    province: normalizeProvinceCode((input.billing_address ?? shippingAddress).province),
    country: "Canada",
  };

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      customer_id: input.customer_id ?? null,
      customer_email: input.email,
      customer_phone: input.phone,
      currency: "CAD",
      subtotal: pricing.subtotal,
      shipping_total: pricing.shippingTotal,
      tax_total: pricing.taxTotal,
      discount_total: pricing.discountTotal,
      total: pricing.total,
      status: "pending",
      payment_status: "unpaid",
      shipping_address: shippingAddress as never,
      billing_address: billingAddress as never,
    })
    .select("id, order_number")
    .single();
  if (orderErr) throw orderErr;

  const itemRows = validated.map((item) => ({
    order_id: order.id,
    product_id: item.id,
    vendor_id: item.vendor_id,
    title: item.title,
    quantity: item.quantity,
    unit_price: item.unit_price,
    status: "pending" as const,
  }));
  const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);
  if (itemsErr) throw itemsErr;

  // Build per-vendor split rows. Commission rate is sensitive and is fetched
  // through the hardened SECURITY DEFINER RPC rather than a public vendor row.
  const vendorIds = Array.from(new Set(validated.map((item) => item.vendor_id)));
  const { data: vendorRows } = await supabase.rpc("get_vendor_commission_rates" as never, {
    _vendor_ids: vendorIds,
  } as never);

  const rateById = new Map<string, number>(
    ((vendorRows ?? []) as Array<{ id: string; commission_rate: number }>).map((row) => [
      row.id,
      Number(row.commission_rate ?? 0.1),
    ]),
  );

  const splits = vendorIds.map((vendorId) => {
    const vendorSubtotal = validated
      .filter((item) => item.vendor_id === vendorId)
      .reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    const rate = rateById.get(vendorId) ?? 0.1;
    const commission = +(vendorSubtotal * rate).toFixed(2);
    const payout = +(vendorSubtotal - commission).toFixed(2);

    return {
      order_id: order.id,
      vendor_id: vendorId,
      subtotal: vendorSubtotal,
      commission_amount: commission,
      vendor_payout_amount: payout,
      status: "pending" as const,
    };
  });

  if (splits.length > 0) {
    const { error: vendorOrderError } = await supabase.from("vendor_orders" as never).insert(splits as never);
    if (vendorOrderError) console.warn("vendor_orders insert failed:", vendorOrderError.message);
  }

  // TAKATAK master sync remains non-blocking.
  signalOrderCreated(order.id);
  if (input.customer_id) signalCustomer("customer.updated");

  return {
    order_id: order.id,
    order_number: order.order_number,
    demo: false,
    subtotal: pricing.subtotal,
    shipping_total: pricing.shippingTotal,
    tax_total: pricing.taxTotal,
    total: pricing.total,
    tax_label: pricing.taxProfile.taxLabel,
    province,
  };
}

export async function getOrderByNumber(orderNumber: string) {
  type OrderShape = {
    id: string;
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

  const { data, error } = await supabase.rpc("lookup_guest_order" as never, {
    _order_number: orderNumber,
  } as never);
  if (error) throw error;

  return (data as unknown as OrderShape | null) ?? null;
}

export async function listMyOrders(customerId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, total, status, payment_status, created_at, order_items(id, title, quantity, unit_price)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
