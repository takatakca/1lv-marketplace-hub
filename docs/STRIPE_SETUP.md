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

## 11. Stripe Connect Express onboarding

Vendors connect a payout account from `/vendor/payouts`. All Stripe calls run
server-side in `src/lib/stripe-connect.functions.ts`.

### Platform requirements
- Enable **Connect** in Stripe → Connect → Get started, platform profile completed.
- Platform account country: **Canada**; connected accounts are created with
  `country=CA`, `default_currency=cad`, `type=express`.
- Requested capabilities: `card_payments`, `transfers`.

### Server functions
| Function | Purpose |
|---|---|
| `createStripeConnectAccount` | Creates or reuses the vendor's Express account. Requires auth, vendor ownership, and `vendors.status = 'active'`. |
| `createStripeConnectAccountLink` | Returns a hosted onboarding URL only. |
| `refreshStripeConnectStatus` | Re-reads the account and syncs capability flags. |

### Redirect URLs
- Refresh: `/vendor/payouts?connect=refresh`
- Return: `/vendor/payouts?connect=success`

### Vendor fields synced
`stripe_connect_account_id`, `charges_enabled`, `payouts_enabled`,
`stripe_details_submitted`, `stripe_connect_status`
(`not_connected` | `onboarding` | `restricted` | `enabled`),
`stripe_connect_last_checked_at`. These are private — never exposed on the
public storefront views, and admin sees a readiness badge, not the account ID.

### Testing (test mode)
1. Set `STRIPE_SECRET_KEY=sk_test_...`.
2. Approve a vendor (`status = active`) and click **Connect payout account**.
3. Complete the Stripe test onboarding form (use the "skip / use test data" prompts).
4. Return to `/vendor/payouts?connect=success` and click **Refresh Stripe status**.

### Remaining before live transfers
- Transfer scheduling (`transfer_data` / separate `transfers` per vendor order).
- Refunds and dispute handling against connected accounts.
- Payout reconciliation against `vendor_orders`.
- Accepting Stripe's Canadian platform/regulatory obligations.

## 12. Payout engine (manual release)

Automatic transfers are **off**. Payouts are generated, reviewed, approved and
released one at a time by an admin.

### Data model
| Table | Purpose |
|---|---|
| `payouts` | One row per vendor per period: gross, commission, refunds, dispute holds, net, status, transfer id, approver, timestamps. |
| `payout_items` | Vendor orders included in a payout. `vendor_order_id` is **unique** — a vendor order can never be paid twice. |
| `payout_adjustments` | Negative carry-forward amounts (refund on an already-paid payout, dispute clawback). Applied to the next generated payout. |
| `payout_settings` | `hold_days` (default 7) and `auto_transfers_enabled` (false). |

`vendor_orders` gained `delivered_at` (stamped by trigger), `refund_amount`
and `dispute_hold_amount`.

### Eligibility
A vendor order enters a payout only when **all** are true:
- `vendor_orders.status = 'delivered'`
- `delivered_at <= now() - hold_days`
- parent `orders.payment_status = 'paid'`
- `vendors.payouts_enabled = true`
- `dispute_hold_amount = 0`
- not already present in `payout_items`

### Flow
1. Admin opens `/admin/payouts`, picks a period, clicks **Generate payouts**
   (`generateVendorPayouts`). Rows are created as `pending_review`. No Stripe call.
2. Admin **approves**, **holds** or **cancels** (`setPayoutStatus`). Paid or
   in-flight payouts cannot be changed.
3. Admin clicks **Send transfer** (`processApprovedPayout`). It refuses unless the
   payout is `approved`, `net_amount > 0`, has no `stripe_transfer_id`, and the
   vendor has `payouts_enabled` plus a Connect account. Status moves
   `processing` → `paid` (with `stripe_transfer_id`, `paid_at`) or
   `failed` + `failure_reason`.
4. With no `STRIPE_SECRET_KEY`, the function returns **setup-required** and
   leaves the payout untouched.

### Reconciliation
`/admin/payouts` labels each row: reconciled, awaiting review, paid but no
transfer reference, duplicate transfer reference, transfer failed, paid but
missing paid date, or net amount zero/negative. Labels only — nothing is mutated.

### Refunds & disputes (prepared, not implemented)
- A refund on a vendor order sets `vendor_orders.refund_amount`; it is deducted
  from that vendor order's net in the next payout.
- A dispute sets `dispute_hold_amount`, which makes the vendor order ineligible
  until the hold is cleared.
- If the payout was **already paid**, insert a negative row into
  `payout_adjustments` — it is summed into the next generated payout for that
  vendor and stamped with `applied_payout_id`.

### Security
- Vendors can read only their own payouts, items and adjustments (RLS).
- Customers have no access at all.
- All mutations run in admin-only server functions that verify `has_role(admin)`
  before touching the service-role client.
- Stripe secret keys and Connect account ids are never returned to the client.

### Before automatic weekly payouts
- Refund and dispute handling implemented end to end.
- Scheduler (pg_cron → `/api/public/*` route) with per-run locking.
- Transfer failure retry/alerting policy.
- Live reconciliation against the Stripe transfers API (currently local-state only).

## 13. Disputes & refunds

**Lifecycle:** `open → under_review → waiting_customer / waiting_vendor → resolved_customer | resolved_vendor | rejected | cancelled`.

- Customers open a dispute from their order detail page (paid orders only, one open dispute per vendor split).
- Vendors reply and add evidence at `/vendor/disputes`; they can never issue refunds and never see internal admin notes (enforced by RLS, not the UI).
- Admins review at `/admin/disputes`: status changes, internal notes, holds, refund approval and processing.

**Payout holds**
- Opening a dispute sets `vendor_orders.dispute_hold_amount`; the payout generator skips any vendor_order with a non-zero hold.
- If the vendor_order already sits in a payout that is not paid, that payout flips to `held`.
- Resolving for the vendor, or rejecting the dispute, releases the hold and returns the payout to `pending_review`.

**Refunds**
- Approving a refund creates a `refund_records` row with status `approved`. Nothing hits Stripe yet.
- `processApprovedRefund(refundId)` (admin only) creates the Stripe refund from the parent order's PaymentIntent/charge. Refunds are capped at the order's remaining refundable amount, and a record with a `stripe_refund_id` can never be processed twice.
- Order payment status becomes `partially_refunded` or `refunded` once money actually moves.
- Without `STRIPE_SECRET_KEY`, processing returns `setup-required` and the record stays safely `approved`.

**Negative adjustments after payout**
- If the vendor_order was already paid out, refund approval writes a negative row into `payout_adjustments`, which the next generated payout subtracts automatically.

**Notifications** are written to the `notifications` table (dispute opened/replied/resolved, refund approved/processed/failed). No email delivery yet.

**Remaining before automatic weekly payouts**
- pg_cron scheduler with per-run locking
- transfer failure retry + alerting policy
- live reconciliation against the Stripe transfers API

## 14. Payout scheduler, retries & live reconciliation

### Settings (`payout_settings`, single row)
| Field | Default | Meaning |
|---|---|---|
| `hold_days` | 7 | Delivered vendor orders wait this long before becoming eligible |
| `payout_frequency` | `weekly` | Scheduling cadence |
| `payout_day` | 1 | Day of week (0=Sunday) the external scheduler should fire |
| `payout_hour_utc` | 7 | Hour (UTC) the external scheduler should fire |
| `auto_generate_payouts` | true | Scheduler may create `pending_review` payouts |
| `auto_process_transfers` | **false** | Scheduler may send Stripe transfers — keep OFF |
| `retry_failed_transfers` | false | Reserved for automated retry sweeps |
| `max_transfer_attempts` | 3 | Hard cap on transfer attempts per payout |

### Locking
`scheduler_locks` holds one row per named job. The payout job uses
`weekly_vendor_payout_generation`, takes a 30-minute lease, and always releases it.
A concurrent run exits immediately as `skipped_locked` and records that run.
Even if a lock were bypassed, `payout_items.vendor_order_id` is unique, so a
vendor order can never be paid twice.

### Run history
`payout_scheduler_runs` records `started_at`, `completed_at`, `status`
(`running | completed | partial | failed | skipped_locked`), period, created /
processed / failed counts, `error_message` and `metadata`. Admin-readable only;
the last eight runs are shown on `/admin/payouts`.

### Server functions (`src/lib/payout-scheduler.functions.ts`, all admin-only)
| Function | Purpose |
|---|---|
| `runWeeklyPayoutScheduler` | Locks, computes the last complete week, generates payouts. Sends transfers only if `auto_process_transfers` is true, and only for already-approved payouts. |
| `retryFailedPayout` | Retries one failed transfer. Refuses if not `failed`, if a `stripe_transfer_id` exists, or if the attempt cap is reached. Stripe idempotency key `payout_<id>_<attempt>`. |
| `reconcileStripePayout` | Reads the Stripe transfer and classifies: `matched`, `missing_transfer`, `amount_mismatch`, `currency_mismatch`, `destination_mismatch`, `failed`, `unknown`. |
| `reconcileRecentPayouts` | Same check across recent paid/processing/failed payouts (1–180 days, max 200). |

Retry backoff placeholder: 1h → 6h → 24h → 72h, stored in `payouts.next_retry_at`;
`transfer_attempt_count` and `last_transfer_attempt_at` track history. Retries stop
at `max_transfer_attempts` — nothing retries forever.

### Alerting
Admin rows are written into `notifications` for: payout generation failed,
transfer failed, retries exhausted, and reconciliation mismatch. No email or SMS
delivery yet.

### Deployment options

**A. pg_cron (if enabled)** — weekly, Monday 07:00 UTC:

```sql
select cron.schedule(
  'weekly-vendor-payout-generation',
  '0 7 * * 1',
  $$ select net.http_post(
       url := 'https://project--deec4249-153f-4f4a-8a40-79e457dc6c83.lovable.app/api/public/hooks/payout-scheduler',
       headers := '{"Content-Type":"application/json","apikey":"YOUR_ANON_KEY"}'::jsonb,
       body := '{}'::jsonb
     ); $$
);
```

**B. External secured cron** — any scheduler (GitHub Actions, Cloud Scheduler)
calling the same URL on the same cadence.

The HTTP scheduler endpoint is **intentionally not deployed yet**. Until a
dedicated scheduler secret is configured, the job is triggered only by an
authenticated admin from `/admin/payouts` → **Run scheduler now**. Do not expose
the endpoint without header authentication.

### Security
- Scheduler, retry and reconciliation all verify `has_role(admin)` before the
  service-role client is loaded. Vendors and customers cannot call them.
- Vendors see only status (`processing`, `paid`, `held`, `failed`) — never Stripe
  errors, transfer ids or connected-account ids.
- Destination mismatches are reported without revealing either account id.
- Automatic transfers remain OFF; manual approval is still the gate.

### Before enabling automatic weekly transfers
- Run several manual weekly cycles with clean reconciliation.
- Deploy the authenticated scheduler endpoint plus its secret.
- Define the transfer-failure alerting/escalation policy (email/SMS).
- Then flip `auto_process_transfers` to true.
