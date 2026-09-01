import { SOURCE_APPLICATION, SOURCE_VERTICAL, type TakatakRelationshipPayload } from "./types";

export type RelationshipInput = {
  customerLocalReference: string;
  customerIsGuest: boolean;
  vendorLocalReference: string;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  orderCount?: number | null;
  /** Lifetime value WITH THIS VENDOR ONLY. Never aggregate across merchants. */
  lifetimeValue?: number | null;
  currency?: string;
};

/**
 * Build a single "person is a customer of this vendor, through 1LV" edge.
 *
 * TAKATAK stitches these edges into the global relationship graph. The graph
 * is NEVER sent back down to a vendor: Vendor B must not learn that the same
 * person also buys from Vendor C, PPP, Ramasse, QMAPS, etc.
 */
export function mapRelationship(input: RelationshipInput): TakatakRelationshipPayload {
  return {
    source_application: SOURCE_APPLICATION,
    source_vertical: SOURCE_VERTICAL,
    relationship_type: "customer_of",
    customer_local_reference: input.customerLocalReference,
    customer_is_guest: input.customerIsGuest,
    vendor_local_reference: input.vendorLocalReference,
    first_seen_at: input.firstSeenAt ?? null,
    last_seen_at: input.lastSeenAt ?? null,
    order_count: input.orderCount ?? null,
    lifetime_value: input.lifetimeValue ?? null,
    currency: input.currency ?? "CAD",
  };
}
