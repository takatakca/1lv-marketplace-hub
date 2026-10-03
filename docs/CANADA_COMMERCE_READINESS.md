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

This branch contains the P0 checkout boundary and its production migration. The code and migration suite are CI-validated; production activation remains fail-closed until the exact 1LV Supabase project is migrated through schema version `20261002150000` and every required server/scheduler secret is configured.

The new flow:

1. browser sends product IDs, quantities, contact/address data and a UUID checkout key to a TanStack server function;
2. authenticated identity is resolved server-side rather than trusted from the payload;
3. a service-role-only PostgreSQL RPC validates active products/vendors, database prices and inventory;
4. province tax and shipping totals are calculated inside the database transaction;
5. parent order, order items and vendor splits are created atomically;
6. duplicate retries are serialized by checkout key, bound to a normalized request fingerprint, and multi-product locks are acquired deterministically;
7. direct browser INSERT policies/privileges for financial order rows are removed;
8. guest lookup requires both the public order reference and the original high-entropy checkout key;
9. guest Stripe payment requires a separate short-lived signed capability;
10. PaymentIntent creation verifies ownership/capability, blocks cancelled/refunded/expired orders, safely replaces a cancelled authorization, and persists one current order-scoped PaymentIntent;
11. inventory is reserved at checkout, committed on Stripe payment success, and released by a dedicated authenticated 15-minute maintenance job after unpaid reservations expire;
12. vendors receive only curated paid/committed order projections and fulfillment transitions run through a guarded TAKATAK-authorized RPC;
13. successful refunds atomically update order/vendor accounting, re-hold unreleased payouts for review, and create idempotent clawbacks when a Stripe transfer was already processing or paid.

The database RPC is executable only by `service_role`; it uses `SECURITY INVOKER`, an empty `search_path`, schema-qualified relations, and explicit function grants. The public guest lookup remains a narrowly scoped `SECURITY DEFINER` function because it must read a guest order through RLS, and it requires the high-entropy checkout key in addition to the order number.

### Deployment requirements

Before this branch is merged/deployed:

- apply the complete ordered migration set through `20261002150000_public_sold_count_refund_truth.sql` to the exact 1LV.CA Supabase project `odoybkshqszucvoxzjyz`;
- configure `CHECKOUT_GUEST_TOKEN_SECRET`, `TAKATAK_DRAIN_CRON_SECRET` and `INVENTORY_MAINTENANCE_CRON_SECRET` as separate random server-only secrets of at least 32 characters;
- keep `SUPABASE_SERVICE_ROLE_KEY`, Stripe secret keys and all scheduler/guest capability secrets server-only;
- configure the repository `PRODUCTION_URL` variable exactly as `https://1lv.ca`; the secured schedulers refuse any other origin before sending their bearer secrets;
- run Supabase Security Advisor after the migration;
- test guest and authenticated checkout, mismatched idempotency payload reuse, concurrent multi-product carts, expired reservations, final-unit sellout, unauthorized PaymentIntent attempts, cancelled PaymentIntent recovery, refund/payout races and vendor fulfillment authorization.

## Persistent promotion engine

Promotions are now persisted and validated server-side. The database enforces active windows, minimum order, fixed/percent/free-shipping types, global/per-customer limits, first-order rules, include/exclude targets, reservation/redeem/release states and restoration on eligible full refunds. Browser totals are never authoritative.

## Persistent marketplace settings

Operational settings are now stored in the protected `public.marketplace_settings` table rather than browser localStorage. Admin access is enforced with RLS, every update advances a version and writes audit evidence to `marketplace_settings_audit`, checkout reads trusted server-side values, and the storefront receives only the safe projection exposed by the dedicated public settings function.

Production still requires the exact 1LV migration set to be applied before these settings become authoritative on the live site.

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

1. apply and verify every migration through schema `20261002150000` on the exact 1LV.CA Supabase project;
2. configure the guest checkout, TAKATAK drain and inventory-maintenance secrets plus the production URL;
3. verify hosted 1LV Auth keeps public signup and anonymous users disabled;
4. merge this Canada commerce/security upgrade only after CI, migration replay, pgTAP and real TAKATAK Auth/JWT/RLS verification are green;
5. verify persisted marketplace settings, promotions and audit history in production;
6. run targeted Stripe test-mode orders across representative provinces, concurrent carts, inventory expiry, refund/payout races and fulfillment transitions;
7. perform one controlled real TAKATAK SMS login/signup session and confirm local-session revocation;
8. only then widen production traffic and automation.
