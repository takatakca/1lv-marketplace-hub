import { supabase } from "@/integrations/supabase/client";

export type ShipmentStatus =
  | "preparing"
  | "label_ready"
  | "shipped"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "exception"
  | "returned"
  | "cancelled";

export type ShipmentItemInput = {
  orderItemId: string;
  quantity: number;
};

export type ShipmentSummary = {
  id: string;
  order_id: string;
  vendor_order_id: string;
  status: ShipmentStatus;
  carrier: string | null;
  service_name: string | null;
  tracking_number: string | null;
  promised_ship_at: string | null;
  estimated_delivery_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
};

export async function saveVendorShippingProfile(input: {
  vendorId: string;
  handlingDays: number;
  transitMinDays: number;
  transitMaxDays: number;
}) {
  const { data, error } = await supabase.rpc(
    "upsert_vendor_shipping_profile" as never,
    {
      _vendor_id: input.vendorId,
      _handling_days: input.handlingDays,
      _transit_min_days: input.transitMinDays,
      _transit_max_days: input.transitMaxDays,
    } as never,
  );
  if (error) throw error;
  return data as unknown as {
    ok: true;
    vendor_id: string;
    handling_days: number;
    transit_min_days: number;
    transit_max_days: number;
  };
}

export async function createVendorShipment(input: {
  vendorOrderId: string;
  items: ShipmentItemInput[];
  carrier?: string | null;
  serviceName?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  labelUrl?: string | null;
  weightGrams?: number | null;
}) {
  const { data, error } = await supabase.rpc(
    "create_vendor_shipment" as never,
    {
      _vendor_order_id: input.vendorOrderId,
      _items: input.items.map((item) => ({
        order_item_id: item.orderItemId,
        quantity: item.quantity,
      })),
      _carrier: input.carrier?.trim() || null,
      _service_name: input.serviceName?.trim() || null,
      _tracking_number: input.trackingNumber?.trim() || null,
      _tracking_url: input.trackingUrl?.trim() || null,
      _label_url: input.labelUrl?.trim() || null,
      _weight_grams: input.weightGrams ?? null,
    } as never,
  );
  if (error) throw error;
  return data as unknown as {
    ok: true;
    shipment_id: string;
    vendor_order_id: string;
    status: ShipmentStatus;
    promised_ship_at: string;
    estimated_delivery_at: string;
  };
}

export async function markVendorShipmentShipped(input: {
  shipmentId: string;
  carrier: string;
  trackingNumber: string;
  serviceName?: string | null;
  trackingUrl?: string | null;
}) {
  const { data, error } = await supabase.rpc(
    "mark_vendor_shipment_shipped" as never,
    {
      _shipment_id: input.shipmentId,
      _carrier: input.carrier,
      _tracking_number: input.trackingNumber,
      _service_name: input.serviceName?.trim() || null,
      _tracking_url: input.trackingUrl?.trim() || null,
    } as never,
  );
  if (error) throw error;
  return data as unknown as {
    ok: true;
    shipment_id: string;
    status: "shipped";
    carrier: string;
    tracking_number: string;
  };
}

export async function getOrderShipments(orderId: string) {
  const { data, error } = await supabase.rpc(
    "get_order_shipments" as never,
    { _order_id: orderId } as never,
  );
  if (error) throw error;
  return (data ?? []) as unknown as Array<{
    id: string;
    vendor_order_id: string;
    vendor_id: string;
    status: ShipmentStatus;
    carrier: string | null;
    service_name: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
    promised_ship_at: string | null;
    estimated_delivery_at: string | null;
    shipped_at: string | null;
    delivered_at: string | null;
    items: Array<{
      order_item_id: string;
      quantity: number;
      title: string;
      variant_id: string | null;
      variant_sku: string | null;
      variant_options: Record<string, string> | null;
    }>;
    events: Array<{
      status: ShipmentStatus;
      carrier_status: string | null;
      location: string | null;
      message: string | null;
      occurred_at: string;
    }>;
  }>;
}

export async function listVendorShipments(
  vendorId: string,
  limit = 100,
): Promise<ShipmentSummary[]> {
  const { data, error } = await supabase.rpc(
    "list_vendor_shipments" as never,
    { _vendor_id: vendorId, _limit: limit } as never,
  );
  if (error) throw error;
  return (data ?? []) as unknown as ShipmentSummary[];
}
