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

## Critical remaining control: server-authoritative atomic checkout

The application still creates production order rows from the browser through the Supabase Data API. Existing guest INSERT policies allow anonymous creation of guest orders.

That means the UI-level pricing hardening in this branch is **not sufficient as a final financial security boundary**. A malicious client can bypass the React application and call the Data API directly.

Before automatic production payment processing is considered hardened, checkout should move to one trusted transaction boundary that:

1. accepts only product IDs, quantities, contact/address data, and a validated promotion reference;
2. loads active product prices and seller state from the database;
3. verifies inventory and purchase eligibility;
4. calculates shipping and applicable tax server-side;
5. validates coupons/promotions server-side;
6. calculates vendor commissions server-side;
7. creates the parent order, order items and vendor splits atomically;
8. returns only the final order ID/order number and safe totals;
9. prevents direct customer/guest INSERT access to financial order columns afterward;
10. uses idempotency protection so retries cannot create duplicate purchases.

Preferred implementation paths:

- a tightly scoped server function using server-only Supabase credentials; or
- a carefully designed database RPC with explicit grants, validated inputs and an intentionally limited security model.

Any privileged database function must use a pinned/empty `search_path`, schema-qualified references, minimum EXECUTE grants, and a documented reason if anonymous execution is intentionally permitted.

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

1. merge this Canada commerce/UI consistency upgrade;
2. implement server-authoritative atomic checkout;
3. implement the persistent coupon engine;
4. persist marketplace settings;
5. run Supabase Security Advisor and targeted checkout tests;
6. test paid orders in Stripe test mode across representative provinces;
7. only then widen production traffic and automation.
