# Stripe Setup — 1LV.CA

Live payments, vendor subscriptions, and Connect payout preparation.

## 1. Environment variables

**Frontend (safe to expose):**
- `VITE_STRIPE_PUBLISHABLE_KEY` — Stripe publishable key (`pk_test_...` / `pk_live_...`)

**Server / backend (secret — NEVER expose):**
- `STRIPE_SECRET_KEY` — `sk_test_...` / `sk_live_...`
- `STRIPE_WEBHOOK_SECRET` — `whsec_...` from the webhook endpoint
- `STRIPE_PRICE_VENDOR_STARTER_MONTHLY` — Stripe Price ID (`price_...`)
- `STRIPE_PRICE_VENDOR_GROWTH_MONTHLY` — Stripe Price ID
- `STRIPE_PRICE_VENDOR_SCALE_MONTHLY` — Stripe Price ID

Add server-side keys through the secrets tool (Lovable Cloud → Secrets). They are injected into server functions and the webhook route at runtime; they are never bundled into the frontend.

## 2. Stripe dashboard — products & prices

In Stripe → Products, create three recurring products:

| Product | Price | Interval |
|---|---|---|
| 1LV Vendor — Starter | 0 CAD | monthly |
| 1LV Vendor — Growth | 39 CAD | monthly |
| 1LV Vendor — Scale | 119 CAD | monthly |

Copy each **Price ID** into the corresponding env var above.

## 3. Webhook endpoint

Add a webhook in Stripe → Developers → Webhooks:

- **URL:** `https://<your-domain>/api/public/webhooks/stripe`
- **Events:**
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `charge.refunded`
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

Copy the **Signing secret** into `STRIPE_WEBHOOK_SECRET`.

The endpoint verifies the `Stripe-Signature` header (HMAC-SHA256) and is idempotent via `stripe_event_log.event_id`.

## 4. Customer checkout flow

1. Frontend calls `createOrder` (Supabase insert, `payment_status = pending`).
2. Frontend calls the `createPaymentIntent` server fn with `{ orderId }`.
3. Server loads the order from the DB and uses `orders.total` (server truth — never client-supplied amount).
4. Server creates a Stripe PaymentIntent in CAD cents with metadata `{ order_id, order_number, customer_email }` and returns the `client_secret`.
5. Frontend confirms with Stripe.js Elements (using `VITE_STRIPE_PUBLISHABLE_KEY`).
6. Webhook flips `orders.payment_status` to `paid` / `failed` / `refunded`.

## 5. Vendor subscription flow

1. Vendor clicks a plan on `/vendor/subscription`.
2. Frontend calls `createVendorSubscriptionCheckout` server fn (auth-gated).
3. Server verifies vendor ownership, creates or reuses a Stripe Customer, and creates a Checkout Session (`mode=subscription`) with metadata `{ vendor_id, owner_id, plan }`.
4. User is redirected to Stripe Checkout.
5. On success, Stripe fires `checkout.session.completed` + `customer.subscription.created`; the webhook updates `vendors.subscription_status`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_plan`.

## 6. Product publishing rule

A vendor may submit a product for review only if:
- `vendors.status = 'active'` AND
- `vendors.subscription_status IN ('active', 'trialing')`

Enforced client-side in `/vendor/products/new`. Draft save always works. Admin override remains.

## 7. Stripe Connect (payout preparation)

The `vendors` table already has:
- `stripe_connect_account_id`
- `charges_enabled`
- `payouts_enabled`

`/vendor/payouts` shows one of:
- **Not connected** — no `stripe_connect_account_id`
- **Connected — charges disabled** — account exists, `charges_enabled = false`
- **Payouts enabled** — both flags true

Full Connect Express onboarding (Account Links, capability polling, live transfers) is intentionally deferred — the button is a placeholder until the ops team is ready to accept regulatory obligations for Canadian payouts.

## 8. Test cards

| Card | Result |
|---|---|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 9995` | Insufficient funds |
| `4000 0027 6000 3184` | 3-D Secure required |

Any future expiry, any CVC.

## 9. Production checklist

- [ ] `sk_live_...` + `pk_live_...` set (server / frontend respectively)
- [ ] Live webhook endpoint created, `STRIPE_WEBHOOK_SECRET` set
- [ ] Live Price IDs set for all three plans
- [ ] Business profile completed in Stripe (statement descriptor, support email)
- [ ] Tax settings configured (Canadian sales tax if applicable)
- [ ] Test order flows end-to-end using real cards in a small amount
- [ ] Confirm webhook idempotency (`stripe_event_log` populates)
- [ ] Confirm no secret key present in client bundle (`grep -r "sk_" dist/`)

## 10. Security notes

- Secret keys live only in server env; the frontend imports `VITE_STRIPE_PUBLISHABLE_KEY` only.
- PaymentIntent amount is derived from `orders.total` server-side, not from any client payload.
- Webhook verifies `Stripe-Signature` with timing-safe comparison and rejects unsigned or replayed events.
- Vendor subscription checkout requires an authenticated session and enforces `vendor.user_id = auth.uid()` via RLS before creating the session.
- `stripe_event_log` prevents double-processing of retried webhook deliveries.
