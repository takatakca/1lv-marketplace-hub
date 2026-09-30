# Canada Commerce Readiness

## Purpose

1LV.CA is a Canada-first, multi-vendor marketplace. This document records the current commerce rules implemented in the storefront and the production controls still required before treating checkout as fully server-authoritative.

## Current storefront rules

The shared module `src/lib/canada-commerce.ts` is the single storefront source for:

- Canadian provinces and territories
- general GST/HST/PST/QST rate profiles
- the current marketplace free-shipping threshold
- the current standard shipping fee
- province-aware estimated sales tax
- checkout total calculations

Current marketplace defaults:

- Currency: CAD
- Free standard shipping threshold: $49 CAD
- Standard shipping below threshold: $7.99 CAD
- Tax estimate: based on the selected ship-to province or territory

The federal GST/HST rate depends on the type and place of supply. Provincial sales taxes and product-specific taxability may also apply. The current lookup is therefore an estimate layer, not a substitute for a complete tax engine or tax-registration analysis.

Official references:

- CRA — GST/HST rates and calculator: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/calculator.html
- CRA — place-of-supply rules: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-place-supply.html
- Revenu Québec — GST/QST rates: https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/basic-rules-for-applying-the-gsthst-and-qst/tables-of-gst-and-qst-rates/

## Improvements in this upgrade

- Cart no longer assumes Québec tax for every Canadian shopper.
- Checkout uses a controlled province/territory selector.
- Checkout re-prices database products before calculating totals.
- Client-provided subtotal, shipping, tax and total fields were removed from the application checkout input.
- The payment step uses the order pricing returned by checkout.
- Fake client-only coupon totals were removed.
- Public promotion surfaces no longer advertise discount codes the backend cannot validate.
- Header, shipping and storefront messaging share the same shipping threshold.
- Shipping, privacy, terms and return pages now explain the multi-vendor operating model more clearly.

## Server-authoritative atomic checkout

This branch now contains the P0 checkout boundary. It is **code-complete but not production-active until the new Supabase migration is applied and the required server secret is configured**.

The new flow:

1. browser sends product IDs, quantities, contact/address data and a UUID checkout key to a TanStack server function;
2. authenticated identity is resolved server-side rather than trusted from the payload;
3. a service-role-only PostgreSQL RPC validates active products/vendors, database prices and inventory;
4. province tax and shipping totals are calculated inside the database transaction;
5. parent order, order items and vendor splits are created atomically;
6. duplicate retries are collapsed by a hashed checkout idempotency key;
7. direct browser INSERT policies/privileges for financial order rows are removed;
8. guest lookup requires both the public order reference and the original high-entropy checkout key;
9. guest Stripe payment requires a separate short-lived signed capability;
10. PaymentIntent creation verifies ownership/capability, blocks cancelled/refunded/expired orders and persists one order-scoped PaymentIntent;
11. inventory is reserved at checkout, committed on Stripe payment success, and can be safely restored when an unpaid reservation expires.

The database RPC is executable only by `service_role`; it uses `SECURITY INVOKER`, an empty `search_path`, schema-qualified relations, and explicit function grants. The public guest lookup remains a narrowly scoped `SECURITY DEFINER` function because it must read a guest order through RLS, and it requires the high-entropy checkout key in addition to the order number.

### Deployment requirements

Before this branch is merged/deployed:

- apply `supabase/migrations/20260930141500_server_authoritative_checkout.sql` to the correct 1LV.CA Supabase project;
- set a dedicated `CHECKOUT_GUEST_TOKEN_SECRET` of at least 32 random characters on the server;
- keep `SUPABASE_SERVICE_ROLE_KEY`, Stripe secret keys and the guest token secret server-only;
- run Supabase Security Advisor after the migration;
- test guest and authenticated checkout, tampered totals, duplicate retries, expired reservations, inventory exhaustion and unauthorized PaymentIntent attempts.

## Coupon engine

The current admin coupon screen is still local/demo state. Do not advertise arbitrary coupon codes publicly until a persistent coupon engine validates:

- active status
- start/end windows
- minimum order value
- percent/fixed/free-shipping type
- global or vendor scope
- product/category exclusions
- per-customer and global usage limits
- stacking rules
- server-calculated discount amount
- redemption recording in the same transaction as checkout

## Persistent marketplace settings

The admin settings screen currently stores values in browser localStorage and is not the production source for checkout rules.

A later phase should move operational settings into a protected database table with:

- admin-only writes
- audit history
- versioning/effective dates where necessary
- server-side reads for checkout
- safe public projection for storefront messaging

## Tax-engine roadmap

Before nationwide scale, introduce a dedicated tax decision layer that can account for:

- seller/platform registration status
- marketplace-facilitator obligations
- place-of-supply rules
- taxable, zero-rated and exempt products
- province-specific retail sales tax rules
- refunds and tax reversals
- invoice/receipt requirements
- auditable rate/version history

The current province lookup is appropriate for UI estimation and early general-taxable-goods testing, but it should not be treated as tax or legal advice.

## Release gate

Do not enable fully automatic payment/payout operations solely because this UI branch is merged.

Recommended release sequence:

1. apply and verify the server-authoritative checkout migration on the correct 1LV.CA Supabase project;
2. configure the dedicated guest checkout signing secret;
3. merge this Canada commerce/security upgrade only after CI and database verification are green;
4. implement the persistent coupon engine;
5. persist marketplace settings;
6. run targeted Stripe test-mode orders across representative provinces and inventory edge cases;
7. only then widen production traffic and automation.
