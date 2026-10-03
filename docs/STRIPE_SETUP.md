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
- `CHECKOUT_GUEST_TOKEN_SECRET` — dedicated random secret (32+ chars) used only to sign short-lived guest payment capabilities
- `PUBLIC_APP_ORIGIN` — optional canonical HTTPS origin for server-generated Stripe return URLs. Defaults to `https://1lv.ca`; never derive this value from browser-supplied Host or X-Forwarded-* headers.

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

1. Frontend sends only product IDs, quantities, contact/address data and a UUID checkout key to the TanStack server function.
2. The server resolves the authenticated customer when present, then calls the service-role-only `create_marketplace_order` database RPC.
3. PostgreSQL validates active products/vendors, locks product rows, checks and reserves inventory, loads DB prices, calculates Canada/province totals, creates the parent order/items/vendor splits atomically, and applies the checkout idempotency key.
4. Guest checkout receives a 24-hour signed payment capability; authenticated orders rely on the current Supabase user identity.
5. Frontend calls `createPaymentIntent` with the order ID plus the guest capability only when needed. The server authorizes ownership/capability and always reads `orders.total`.
6. Stripe PaymentIntent creation is order-idempotent. Before an existing PaymentIntent is reused, 1LV revalidates its amount, currency and `metadata.order_id`; a newly-created PaymentIntent is not returned until its ID is confirmed persisted on the order.
7. Frontend confirms with Stripe.js Elements using only `VITE_STRIPE_PUBLISHABLE_KEY`.
8. On `payment_intent.succeeded`, the webhook commits the inventory reservation before moving the order to processing. Stale signatures older than five minutes are rejected.

## 5. Vendor subscription flow

1. Vendor clicks a plan on `/vendor/subscription`.
2. Frontend calls `createVendorSubscriptionCheckout` server fn (auth-gated).
3. Server verifies vendor ownership, creates or reuses a Stripe Customer, and creates a Checkout Session (`mode=subscription`) with metadata `{ vendor_id, owner_id, plan }`.
4. User is redirected to Stripe Checkout.
5. On success, Stripe fires `checkout.session.completed` + `customer.subscription.created`; the webhook updates `vendors.subscription_status`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_plan`.
6. 1LV refuses to create a second Checkout Session while a non-terminal Stripe subscription already exists for the vendor. This prevents duplicate recurring billing; plan-change automation must update the existing subscription rather than silently creating another one.
7. Subscription webhooks are bound to the currently linked subscription. Stale cancellation/update events from an older subscription are ignored and surfaced to admins instead of overwriting the active billing state.

## 6. Product publishing rule

A vendor may submit a product for review only if:
- `vendors.status = 'active'` AND
- `vendors.subscription_status IN ('active', 'trialing')`

Enforced server-side and in the database authority/RLS layer; the UI mirrors the same rule but is never authoritative. Draft save remains available where permitted.

## 7. Stripe Connect (payout preparation)

The `vendors` table already has:
- `stripe_connect_account_id`
- `charges_enabled`
- `payouts_enabled`

`/vendor/payouts` shows one of:
- **Not connected** — no `stripe_connect_account_id`
- **Connected — charges disabled** — account exists, `charges_enabled = false`
- **Payouts enabled** — both flags true

Connect Express onboarding is implemented end to end: server-side Express account creation, hosted Account Links, capability/status refresh, and idempotent transfers. Express account creation is itself vendor-idempotent, and 1LV refuses to overwrite a different Connect account already bound to the vendor. Live operation still requires the production Stripe account, Connect settings, webhook secret, and approved operational/regulatory setup.

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
- Stripe Checkout and Connect return URLs are pinned to the canonical server-side 1LV origin; request Host/X-Forwarded headers cannot select the redirect domain.
- PaymentIntent amount is derived from `orders.total` server-side, not from any client payload.
- Stripe API calls use bounded server-side timeouts so payment/payout state cannot remain indefinitely blocked on a hung network request.
- Vendor Stripe Customer creation is idempotent, and a non-terminal existing subscription blocks creation of a duplicate recurring subscription.
- Browser roles cannot insert financial order, order-item or vendor-order rows after the server-authoritative checkout migration is applied.
- Guest payment authorization uses a dedicated short-lived HMAC capability; never reuse the Stripe or Supabase service-role secret for `CHECKOUT_GUEST_TOKEN_SECRET`.
- Inventory is reserved during checkout and committed only after Stripe payment success; expired unpaid reservations are recoverable through the service-role-only cleanup RPC.
- Expired reservations are checked by `.github/workflows/inventory-maintenance.yml` every 15 minutes through `/api/internal/inventory/cleanup`; production requires a dedicated `INVENTORY_MAINTENANCE_CRON_SECRET` (32+ characters), and the workflow refuses to send that bearer secret unless `PRODUCTION_URL` is exactly `https://1lv.ca`.
- Expiration cleanup is Stripe-first for orders that already have a PaymentIntent: 1LV retrieves and cancels the PaymentIntent before releasing inventory. A succeeded, mismatched, or non-cancelable/ambiguous PaymentIntent blocks inventory release and makes the maintenance job fail visibly for reconciliation.
- A cancelled order PaymentIntent can be replaced only after its amount/currency/order metadata are revalidated; the replacement uses a stable idempotency key and a conditional old-ID → new-ID database binding.
- Refund finalization recalculates payouts that have not transferred and forces them back through review. If a payout is already processing/paid, the original Stripe transfer amount stays immutable and an idempotent future clawback is recorded.
- Webhook verifies `Stripe-Signature` with timing-safe comparison, rejects signatures older than five minutes, and uses `stripe_event_log` for event idempotency.
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
- Production Stripe/Connect account configuration and live webhook verification.
- Operational approval of the payout policy and manual reconciliation procedure.
- Acceptance of Stripe's Canadian platform/regulatory obligations.
- Keep automatic transfer processing disabled until manual production cycles reconcile cleanly.

Transfer creation, refund/dispute accounting, payout reconciliation and idempotent recovery are implemented in 1LV; they remain production-gated.

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
`/admin/payouts` classifies payout reconciliation against the Stripe Transfers API. A verified transfer must match the exact amount, currency and destination. When Stripe proves the transfer succeeded and the local row is incomplete, reconciliation may repair only the local payout state to `paid`; mismatches remain blocked and are surfaced for manual review.

### Refunds & disputes
- Customers can open disputes only on their own paid vendor split; the disputed vendor amount is held immediately.
- Admin-approved refunds are first reserved atomically in PostgreSQL under an order lock, then processed server-side through Stripe with a stable idempotency key. Concurrent approvals cannot collectively exceed the remaining refundable order or vendor-split amount.
- 1LV revalidates the Stripe refund id, amount, currency and metadata before accounting. Only Stripe status `succeeded` finalizes the refund locally; `pending` / `requires_action` remain processing, while `failed` / `canceled` are surfaced to admins without marking money as returned.
- Successful refund accounting updates `refund_records`, order/vendor-order refund totals, dispute state and payout adjustments atomically through the database finalization RPC.
- If money was already paid out to a vendor, the accounting path records the compensating adjustment for a later payout instead of silently mutating a completed transfer.
- Stripe `charge.refunded` webhooks reconcile only successful refunds that are tied to verified 1LV `refund_records`. Untracked or mismatched refunds are blocked from automatic accounting and surfaced to admins. Financial order/refund lifecycle events are not sent to GROUPE TAKATAK.

### Security
- Vendors can read only their own payouts, items and adjustments (RLS).
- Customers have no access at all.
- All mutations run in admin-only server functions that verify `has_role(admin)`
  before touching the service-role client.
- Stripe secret keys and Connect account ids are never returned to the client.

### Before automatic weekly payouts
- [x] Refund and dispute handling implemented end to end.
- [x] Connect Express onboarding, capability refresh, bounded retries and reconciliation implemented.
- [ ] Production Stripe/Connect account configuration, live webhook and Price IDs verified.
- [ ] Operations approves `auto_process_transfers = true`; keep it false until that cutover.
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
- A refund in `processing` can be rechecked and a `failed` refund can be retried from the admin UI. Retries reuse the same stable Stripe idempotency key; if Stripe already created the refund, 1LV retrieves/reconciles that same refund instead of creating a duplicate.

**Negative adjustments after payout**
- If the vendor order was already paid out, successful Stripe refund finalization writes an idempotent negative row into `payout_adjustments`; the next generated payout applies that carry-forward adjustment.

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
| `retryFailedPayout` | Retries a failed transfer or safely recovers a stale `processing` lease. A stale unknown outcome replays the same Stripe operation instead of creating a new logical transfer. Any recorded transfer reference blocks another send. |
| `reconcileStripePayout` | Reads the Stripe transfer and classifies: `matched`, `missing_transfer`, `amount_mismatch`, `currency_mismatch`, `destination_mismatch`, `failed`, `unknown`. |
| `reconcileRecentPayouts` | Same check across recent paid/processing/failed payouts (1–180 days, max 200). |

Retry backoff: 1h → 6h → 24h → 72h, stored in `payouts.next_retry_at`;
`transfer_attempt_count` and `last_transfer_attempt_at` track history. Normal failed retries stop at `max_transfer_attempts`. A stale `processing` lease may still replay the same stable Stripe idempotency key at the retry ceiling because that is reconciliation of an unknown outcome, not authorization for an additional transfer.

### Alerting
Admin rows are written into `notifications` for: payout generation failed,
transfer failed, retries exhausted, and reconciliation mismatch. No email or SMS
delivery yet.

### Deployment options

Automatic payout scheduling is intentionally **not exposed through a public cron endpoint**. The current production-safe path is an authenticated admin action from `/admin/payouts` → **Run scheduler now**.

Do not reuse the TAKATAK drain secret, inventory-maintenance secret, Supabase keys or Stripe keys for a future payout scheduler. If an external scheduler is introduced later, add a dedicated 32+ character secret, a private/internal endpoint, exact-origin controls and CI coverage before enabling it.

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
