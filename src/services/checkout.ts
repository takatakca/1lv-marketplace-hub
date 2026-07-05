import { supabase } from "@/integrations/supabase/client";
import type { CartItem } from "@/hooks/use-cart";

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
  subtotal: number;
  shipping_total: number;
  tax_total: number;
  discount_total?: number;
  total: number;
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
};

/**
 * Validate cart items against Supabase. Returns null if none of the items
 * exist in the products table (demo / seed mode), or a validated list with
 * server-verified prices and vendor ids when they do.
 *
 * Blocks archived/rejected/inactive products in real mode.
 */
export async function validateCart(items: CartItem[]): Promise<ValidatedItem[] | null> {
  if (items.length === 0) return [];
  const ids = items.map((i) => i.productId).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length === 0) return null; // seed ids, demo mode

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
    if (row.status !== "active")
      throw new Error(`Item "${row.title}" is no longer available`);
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

  // Demo fallback: products not in Supabase → simulate order locally
  if (validated === null) {
    const synthetic = "1LV-" + Math.floor(100000 + Math.random() * 900000);
    return { order_id: synthetic, order_number: synthetic, demo: true };
  }

  const subtotal = validated.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const shipping_total = input.shipping_total;
  const tax_total = +(subtotal * 0.14975).toFixed(2);
  const discount_total = input.discount_total ?? 0;
  const total = +(subtotal + shipping_total + tax_total - discount_total).toFixed(2);

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      customer_id: input.customer_id ?? null,
      customer_email: input.email,
      customer_phone: input.phone,
      currency: "CAD",
      subtotal,
      shipping_total,
      tax_total,
      discount_total,
      total,
      status: "pending",
      payment_status: "unpaid",
      shipping_address: input.shipping_address as never,
      billing_address: (input.billing_address ?? input.shipping_address) as never,
    })
    .select("id, order_number")
    .single();
  if (orderErr) throw orderErr;

  const itemRows = validated.map((v) => ({
    order_id: order.id,
    product_id: v.id,
    vendor_id: v.vendor_id,
    title: v.title,
    quantity: v.quantity,
    unit_price: v.unit_price,
    status: "pending" as const,
  }));
  const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);
  if (itemsErr) throw itemsErr;

  // Build per-vendor split rows — commission_rate is sensitive, fetch via SECURITY DEFINER RPC
  const vendorIds = Array.from(new Set(validated.map((v) => v.vendor_id)));
  const { data: vendorRows } = await supabase.rpc("get_vendor_commission_rates" as never, {
    _vendor_ids: vendorIds,
  } as never);
  const rateById = new Map<string, number>(
    ((vendorRows ?? []) as Array<{ id: string; commission_rate: number }>).map((r) => [
      r.id,
      Number(r.commission_rate ?? 0.1),
    ]),
  );

  const splits = vendorIds.map((vid) => {
    const vSub = validated
      .filter((v) => v.vendor_id === vid)
      .reduce((s, v) => s + v.unit_price * v.quantity, 0);
    const rate = rateById.get(vid) ?? 0.1;
    const commission = +(vSub * rate).toFixed(2);
    const payout = +(vSub - commission).toFixed(2);
    return {
      order_id: order.id,
      vendor_id: vid,
      subtotal: vSub,
      commission_amount: commission,
      vendor_payout_amount: payout,
      status: "pending" as const,
    };
  });

  if (splits.length > 0) {
    const { error: voErr } = await supabase.from("vendor_orders" as never).insert(splits as never);
    if (voErr) console.warn("vendor_orders insert failed:", voErr.message);
  }

  return { order_id: order.id, order_number: order.order_number, demo: false };
}

export async function getOrderByNumber(orderNumber: string) {
  type OrderShape = {
    id: string;
    order_number: string;
    total: number;
    status: string;
    payment_status: string;
    created_at: string;
    order_items?: Array<{ id: string; title: string; quantity: number; unit_price: number; status: string; tracking_number: string | null; carrier: string | null }>;
  };
  // Authenticated owners (logged-in customers) can read their own orders via RLS.
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    const { data } = await supabase
      .from("orders")
      .select("id, order_number, total, status, payment_status, created_at, order_items(*)")
      .eq("order_number", orderNumber)
      .maybeSingle();
    if (data) return data as unknown as OrderShape | null;
  }
  // Guest fallback: only returns the safe minimal set, and only when the exact
  // order number matches a guest order (customer_id IS NULL).
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
