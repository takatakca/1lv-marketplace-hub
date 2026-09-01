/**
 * TAKATAK Master Platform integration — shared types.
 *
 * 1LV.CA is ONE vertical inside TAKATAK. TAKATAK is the system of authority for
 * master identity (people, companies, merchants) and the cross-vertical
 * relationship graph. 1LV never resolves identity itself and never exposes
 * TAKATAK-wide data to vendors or customers.
 */

export const SOURCE_APPLICATION = "1lv" as const;
export const SOURCE_VERTICAL = "marketplace" as const;

export type TakatakEventType =
  // customer
  | "customer.created"
  | "customer.updated"
  // merchant
  | "merchant.application.created"
  | "merchant.approved"
  | "merchant.suspended"
  | "merchant.updated"
  // marketplace relationship
  | "customer.vendor.first_order"
  | "customer.vendor.order_completed"
  | "customer.vendor.dispute_opened"
  // commerce
  | "order.created"
  | "order.paid"
  | "order.fulfilled"
  | "order.refunded";

export type AggregateType = "customer" | "merchant" | "order" | "relationship";

export type OutboxStatus = "pending" | "processing" | "delivered" | "failed";

export type OutboxRow = {
  id: string;
  event_type: TakatakEventType;
  aggregate_type: AggregateType;
  aggregate_id: string;
  source_application: string;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempt_count: number;
  last_error: string | null;
  remote_id: string | null;
  next_attempt_at: string;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
};

/** Normalized customer/person payload sent to TAKATAK. Never includes secrets. */
export type TakatakCustomerPayload = {
  source_application: typeof SOURCE_APPLICATION;
  local_profile_id: string | null;
  local_guest_reference: string | null;
  is_guest: boolean;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  preferred_language: string | null;
  country: string | null;
  province: string | null;
  account_created_at: string | null;
};

export type TakatakMerchantPayload = {
  source_application: typeof SOURCE_APPLICATION;
  vertical: typeof SOURCE_VERTICAL;
  local_vendor_id: string;
  local_owner_user_id: string;
  store_name: string;
  store_slug: string;
  legal_business_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: {
    line1: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    country: string | null;
  };
  marketplace_status: string;
  subscription_status: string;
  subscription_plan: string | null;
  created_at: string | null;
};

export type TakatakRelationshipPayload = {
  source_application: typeof SOURCE_APPLICATION;
  source_vertical: typeof SOURCE_VERTICAL;
  relationship_type: "customer_of";
  customer_local_reference: string;
  customer_is_guest: boolean;
  vendor_local_reference: string;
  first_seen_at: string | null;
  last_seen_at: string | null;
  order_count: number | null;
  /** Lifetime value with THIS vendor only. Never cross-merchant. */
  lifetime_value: number | null;
  currency: string;
};

export type TakatakOrderPayload = {
  source_application: typeof SOURCE_APPLICATION;
  source_vertical: typeof SOURCE_VERTICAL;
  local_order_id: string;
  order_number: string;
  customer_local_id: string | null;
  guest_reference: string | null;
  merchant_local_ids: string[];
  splits: Array<{
    vendor_local_id: string;
    subtotal: number;
    status: string;
  }>;
  total: number;
  currency: string;
  payment_status: string;
  fulfillment_status: string;
  created_at: string;
};
