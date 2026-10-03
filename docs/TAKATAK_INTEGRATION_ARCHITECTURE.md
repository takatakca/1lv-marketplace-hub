# TAKATAK Integration Architecture

1LV.CA is one TAKATAK-managed marketplace vertical. It is not the system of record for identity.

## Responsibilities

**TAKATAK (master platform)**
- Master person, company and merchant identity
- Identity resolution
- Global relationship graph
- Master CRM
- Global permissions

**1LV (marketplace vertical)**
- Products, carts, orders, vendor_orders
- Fulfillment, disputes, refunds
- Marketplace operations

## Flow

```text
1LV mutation succeeds -> server fn rebuilds payload from DB -> takatak_outbox (event_key unique)
                                                           -> admin drain -> TAKATAK Master API
```

## Events
- customer.created / customer.updated (email, Google, OTP)
- merchant.application.created / merchant.updated / merchant.approved / merchant.suspended
- order.created / order.paid / order.fulfilled / order.refunded
- customer.vendor.first_order / customer.vendor.order_completed / customer.vendor.dispute_opened (one per vendor)

## Rules
- 1LV never performs global identity merging; TAKATAK resolves identities centrally.
- Vendor visibility stays isolated; one person across companies does not mean shared merchant access.
- No global customer history is sent from 1LV; relationship metrics are vendor-specific.
- The outbox protects marketplace availability: TAKATAK downtime cannot break signup or checkout.
- Payloads are always rebuilt server-side; browsers never supply payloads.
- API keys (`TAKATAK_MASTER_API_URL`, `TAKATAK_MASTER_API_KEY`) stay server-side; the console shows only "configured" booleans.
- Events are idempotent via deterministic `event_key` plus a unique index.
- `takatak_outbox` is readable by admins only; drain/retry/queue require a server-side admin check.

## Remaining dependency
Delivery requires the TAKATAK Master API to exist and both secrets to be set. Until then events stay queued safely.
