import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, "src");

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) files.push(full);
  }
  return files;
}

const forbiddenAuth = [
  [/\.auth\.signInWithPassword\s*\(/, "local email/password sign-in"],
  [/\.auth\.signUp\s*\(/, "local Supabase signup"],
  [/\.auth\.signInWithOAuth\s*\(/, "local OAuth sign-in"],
  [/\.auth\.signInWithOtp\s*\(/, "local OTP authority"],
  [/\.auth\.resetPasswordForEmail\s*\(/, "local password reset"],
  [/\.auth\.updateUser\s*\(\s*\{\s*password\b/s, "local password mutation"],
];

const siblingAppNames =
  /\b(?:rentauto|r2nette|festi[-_ ]?ice|qmaps|mielaissa)\b/i;

const violations = [];
for (const file of walk(sourceRoot)) {
  const rel = relative(root, file).replaceAll("\\", "/");
  if (rel.endsWith("routeTree.gen.ts")) continue;

  const content = readFileSync(file, "utf8");
  for (const [pattern, label] of forbiddenAuth) {
    if (pattern.test(content)) {
      violations.push(rel + ": forbidden " + label);
    }
  }

  if (siblingAppNames.test(content)) {
    violations.push(
      rel + ": references another TAKATAK child application directly",
    );
  }

  if (content.includes("TAKATAK_MASTER_API_KEY")) {
    violations.push(
      rel + ": legacy generic TAKATAK_MASTER_API_KEY must not return; use TAKATAK_1LV_API_KEY",
    );
  }
}

for (const legacyPath of [
  "src/components/SocialAuthButtons.tsx",
  "src/components/PasswordField.tsx",
]) {
  if (existsSync(join(root, legacyPath))) {
    violations.push(legacyPath + ": legacy local-auth UI must stay removed");
  }
}

const masterClient = readFileSync(
  join(root, "src/lib/takatak/client.server.ts"),
  "utf8",
);
const authBridge = readFileSync(
  join(root, "src/lib/takatak-auth.functions.ts"),
  "utf8",
);
const masterOutbox = readFileSync(
  join(root, "src/lib/takatak/outbox.server.ts"),
  "utf8",
);
const orderMapper = readFileSync(
  join(root, "src/lib/takatak/order-mapper.ts"),
  "utf8",
);
const relationshipMapper = readFileSync(
  join(root, "src/lib/takatak/relationship-mapper.ts"),
  "utf8",
);
const authMiddleware = readFileSync(
  join(root, "src/integrations/supabase/auth-middleware.ts"),
  "utf8",
);
const authProvider = readFileSync(
  join(root, "src/hooks/use-auth.tsx"),
  "utf8",
);
const finalAuthMigration = readFileSync(
  join(root, "supabase/migrations/20261002034500_takatak_authenticated_session_guard.sql"),
  "utf8",
);
const sessionGrantMigration = readFileSync(
  join(root, "supabase/migrations/20261002050000_takatak_authorized_sessions.sql"),
  "utf8",
);
const stripeAccountingMigration = readFileSync(
  join(root, "supabase/migrations/20261002054500_stripe_webhook_accounting.sql"),
  "utf8",
);
const refundReservationMigration = readFileSync(
  join(root, "supabase/migrations/20261002062000_atomic_refund_reservation.sql"),
  "utf8",
);
const webhookLeaseMigration = readFileSync(
  join(root, "supabase/migrations/20261002064000_stripe_event_claim_lease.sql"),
  "utf8",
);
const inventorySelloutMigration = readFileSync(
  join(root, "supabase/migrations/20261002070000_inventory_sellout_integrity.sql"),
  "utf8",
);
const vendorFulfillmentMigration = readFileSync(
  join(root, "supabase/migrations/20261002071500_vendor_fulfillment_authority.sql"),
  "utf8",
);
const vendorPaidVisibilityMigration = readFileSync(
  join(root, "supabase/migrations/20261002073000_vendor_paid_order_visibility.sql"),
  "utf8",
);
const vendorInventoryGateMigration = readFileSync(
  join(root, "supabase/migrations/20261002074500_vendor_inventory_commit_gate.sql"),
  "utf8",
);
const vendorInventoryCommitMigration = readFileSync(
  join(root, "supabase/migrations/20261002074500_vendor_inventory_commit_gate.sql"),
  "utf8",
);
const checkoutProductLockMigration = readFileSync(
  join(root, "supabase/migrations/20261002080000_checkout_product_lock_order.sql"),
  "utf8",
);
const checkoutIdempotencyMigration = readFileSync(
  join(root, "supabase/migrations/20261002081500_checkout_idempotency_payload.sql"),
  "utf8",
);
const vendorOrderProjectionMigration = readFileSync(
  join(root, "supabase/migrations/20261002083000_vendor_order_safe_projection.sql"),
  "utf8",
);
const refundPayoutRaceMigration = readFileSync(
  join(root, "supabase/migrations/20261002084500_refund_payout_race_safety.sql"),
  "utf8",
);
const ordersService = readFileSync(
  join(root, "src/services/orders.ts"),
  "utf8",
);
const vendorOrderDetailRoute = readFileSync(
  join(root, "src/routes/vendor.orders.$id.tsx"),
  "utf8",
);
const inventoryMaintenanceRoute = readFileSync(
  join(root, "src/routes/api/internal/inventory.cleanup.ts"),
  "utf8",
);
const inventoryMaintenanceWorkflow = readFileSync(
  join(root, ".github/workflows/inventory-maintenance.yml"),
  "utf8",
);
const healthRoute = readFileSync(
  join(root, "src/routes/api/public/health.ts"),
  "utf8",
);
const productRoute = readFileSync(
  join(root, "src/routes/product.$slug.tsx"),
  "utf8",
);
const productCard = readFileSync(
  join(root, "src/components/ProductCard.tsx"),
  "utf8",
);
const stickyBuyBar = readFileSync(
  join(root, "src/components/StickyBuyBar.tsx"),
  "utf8",
);
const loginRoute = readFileSync(
  join(root, "src/routes/login.tsx"),
  "utf8",
);
const signupRoute = readFileSync(
  join(root, "src/routes/signup.tsx"),
  "utf8",
);
const supabaseConfig = readFileSync(
  join(root, "supabase/config.toml"),
  "utf8",
);
const payoutSchedulerServer = readFileSync(
  join(root, "src/lib/payout-scheduler.server.ts"),
  "utf8",
);
const payoutSchedulerFunctions = readFileSync(
  join(root, "src/lib/payout-scheduler.functions.ts"),
  "utf8",
);
const stripeConnectFunctions = readFileSync(
  join(root, "src/lib/stripe-connect.functions.ts"),
  "utf8",
);
const stripeFunctions = readFileSync(
  join(root, "src/lib/stripe.functions.ts"),
  "utf8",
);
const checkoutFunctions = readFileSync(
  join(root, "src/lib/checkout.functions.ts"),
  "utf8",
);
const checkoutRoute = readFileSync(
  join(root, "src/routes/checkout.tsx"),
  "utf8",
);
const stripeWebhook = readFileSync(
  join(root, "src/routes/api/public/webhooks.stripe.ts"),
  "utf8",
);
const optionalAuth = readFileSync(
  join(root, "src/integrations/supabase/optional-auth.server.ts"),
  "utf8",
);
const disputesFunctions = readFileSync(
  join(root, "src/lib/disputes.functions.ts"),
  "utf8",
);
const requestOrigin = readFileSync(
  join(root, "src/lib/request-origin.server.ts"),
  "utf8",
);
const productionServer = readFileSync(join(root, "server.cjs"), "utf8");
const deployWorkflow = readFileSync(
  join(root, ".github/workflows/deploy.yml"),
  "utf8",
);
const ciWorkflow = readFileSync(
  join(root, ".github/workflows/ci.yml"),
  "utf8",
);
const takatakDrainRoute = readFileSync(
  join(root, "src/routes/api/internal/takatak.drain.ts"),
  "utf8",
);
const takatakDrainWorkflow = readFileSync(
  join(root, ".github/workflows/takatak-outbox-drain.yml"),
  "utf8",
);

for (const [content, marker, label] of [
  [masterClient, 'source_application: "1lv"', "1LV source binding"],
  [
    masterClient,
    'process.env["TAKATAK_1LV_API_KEY"]',
    "dedicated 1LV API credential",
  ],
  [
    masterOutbox,
    'process.env["TAKATAK_1LV_API_KEY"]',
    "1LV integration status uses the dedicated API credential",
  ],
  [
    masterOutbox,
    "normalizeTakatakMasterApiBaseUrl",
    "1LV integration status validates the TAKATAK API URL",
  ],
  [
    masterOutbox,
    '.eq("status", "pending")',
    "automatic outbox retries process pending events only",
  ],
  [
    masterOutbox,
    '.lt("attempt_count", MAX_ATTEMPTS)',
    "automatic outbox retries enforce MAX_ATTEMPTS at query time",
  ],
  [
    masterOutbox,
    "attempt_count: 0",
    "manual outbox retry resets retry budget",
  ],
  [
    masterOutbox,
    "last_error: null",
    "manual outbox retry clears stale error",
  ],
  [
    masterClient,
    "key.length < 32",
    "minimum 32-character 1LV credential",
  ],
  [
    masterClient,
    'json["authority"] !== "takatak_supabase_phone"',
    "TAKATAK OTP authority assertion",
  ],
  [
    authBridge,
    "syntheticIdentityEmail(identity.id)",
    "master-UUID local session isolation",
  ],
  [
    authBridge,
    "supabaseAdmin.auth.admin.createUser",
    "explicit local 1LV Auth user creation",
  ],
  [
    authBridge,
    "email_confirm: true",
    "synthetic local email is server-confirmed without sending email",
  ],
  [
    authBridge,
    'new Set(["email_exists", "user_already_exists"])',
    "local auth bootstrap only recovers explicit duplicate-user races",
  ],
  [
    authBridge,
    "app_metadata: immutableAppMetadata",
    "TAKATAK authorization marker is stored in immutable app_metadata",
  ],
  [
    authBridge,
    "appMetadataMatchesIdentity",
    "duplicate/local Auth users must match the exact TAKATAK identity",
  ],
  [
    authBridge,
    "supabaseAdmin.auth.admin.updateUserById",
    "existing linked users are promoted to immutable TAKATAK local auth",
  ],
  [
    authMiddleware,
    "requireTakatakSessionClaims",
    "server functions reject non-TAKATAK Supabase sessions",
  ],
  [
    authMiddleware,
    "requireTakatakAuthorizedSession",
    "server functions require a server-recorded TAKATAK session grant",
  ],
  [
    authMiddleware,
    '"is_takatak_authorized_session" as never',
    "server middleware validates the exact granted Supabase session_id",
  ],
  [
    authMiddleware,
    "methods.has('magiclink') || methods.has('otp')",
    "server functions require the local TAKATAK bridge authentication method",
  ],
  [
    authMiddleware,
    "'password'",
    "server session gate explicitly rejects local password authentication",
  ],
  [
    authProvider,
    "isTakatakLocalUser",
    "browser AuthProvider ignores stray local Supabase sessions",
  ],
  [
    authBridge,
    "exchangeClient.auth.verifyOtp",
    "TAKATAK bridge performs the local magic-link exchange on the server",
  ],
  [
    authBridge,
    '.from("takatak_authorized_sessions" as never)',
    "TAKATAK bridge records the exact authorized Supabase session_id",
  ],
  [
    loginRoute,
    "supabase.auth.setSession",
    "login installs only the server-authorized local session",
  ],
  [
    signupRoute,
    "supabase.auth.setSession",
    "signup installs only the server-authorized local session",
  ],
  [
    sessionGrantMigration,
    "CREATE TABLE public.takatak_authorized_sessions",
    "database stores explicit TAKATAK-authorized local sessions",
  ],
  [
    sessionGrantMigration,
    "authorized.session_id::text = n.session_id",
    "database session gate binds access to the exact granted session_id",
  ],
  [
    sessionGrantMigration,
    "SECURITY DEFINER",
    "session grant lookup can enforce a private registry without exposing it",
  ],
  [
    refundPayoutRaceMigration,
    "SELECT '20261002084500'",
    "final production schema marker includes refund/payout race safety",
  ],
  [
    refundPayoutRaceMigration,
    "Refund changed payout amount; review before transfer.",
    "pre-transfer payouts are recalculated and forced back through review after refunds",
  ],
  [
    refundPayoutRaceMigration,
    "refund_clawback",
    "processing or paid payouts receive an idempotent future refund clawback",
  ],
  [
    refundPayoutRaceMigration,
    "mark_order_promotion_refunded",
    "full refund accounting restores promotion usage when configured",
  ],
  [
    checkoutProductLockMigration,
    "ORDER BY 1",
    "multi-product checkout locks are deterministic",
  ],
  [
    checkoutIdempotencyMigration,
    "checkout_request_hash",
    "checkout idempotency key is bound to the normalized request payload",
  ],
  [
    checkoutIdempotencyMigration,
    "hashtextextended(v_idempotency_hash, 0)",
    "checkout idempotency serialization occurs before product processing",
  ],
  [
    vendorInventoryGateMigration,
    "Vendor fulfillment requires committed inventory",
    "paid inventory-conflict orders remain blocked from vendor fulfillment",
  ],
  [
    vendorInventoryGateMigration,
    "inventory_committed_at IS NOT NULL",
    "vendor visibility requires inventory commitment",
  ],
  [
    vendorInventoryGateMigration,
    "inventory_released_at IS NULL",
    "released inventory orders stay hidden from vendors",
  ],
  [
    vendorInventoryGateMigration,
    "public.vendor_can_view_paid_order_scope",
    "inventory-gated vendor visibility remains non-recursive through narrow helpers",
  ],
  [
    vendorInventoryCommitMigration,
    "Vendor fulfillment requires committed inventory",
    "vendor fulfillment cannot begin before inventory was committed",
  ],
  [
    vendorInventoryCommitMigration,
    "inventory_committed_at IS NOT NULL",
    "vendor visibility requires committed inventory",
  ],
  [
    vendorInventoryCommitMigration,
    "public.vendor_can_view_paid_order_scope",
    "inventory gate preserves non-recursive vendor visibility helpers",
  ],
  [
    vendorPaidVisibilityMigration,
    "payment_status::text IN ('paid', 'partially_refunded')",
    "vendor visibility begins only after confirmed payment",
  ],
  [
    vendorPaidVisibilityMigration,
    "public.vendor_can_view_paid_order",
    "vendor parent-order visibility uses a non-recursive caller-bound helper",
  ],
  [
    vendorPaidVisibilityMigration,
    "public.vendor_can_view_paid_order_scope",
    "vendor split/item visibility uses a non-recursive caller-bound helper",
  ],
  [
    vendorPaidVisibilityMigration,
    "public.is_takatak_authorized_session()",
    "vendor visibility helpers require a server-authorized TAKATAK session",
  ],
  [
    vendorPaidVisibilityMigration,
    'CREATE POLICY "Vendors view related orders"',
    "vendor privacy migration protects parent-order reads",
  ],
  [
    vendorPaidVisibilityMigration,
    'CREATE POLICY "Vendors view own vendor orders"',
    "vendor privacy migration protects vendor-split reads",
  ],
  [
    vendorPaidVisibilityMigration,
    'CREATE POLICY "Vendors view own order items"',
    "vendor privacy migration protects vendor line-item reads",
  ],
  [
    vendorFulfillmentMigration,
    "public.is_takatak_authorized_session()",
    "vendor fulfillment mutations require the authorized TAKATAK session registry",
  ],
  [
    vendorFulfillmentMigration,
    "Vendor fulfillment requires a paid order",
    "vendor fulfillment cannot start before confirmed payment",
  ],
  [
    vendorFulfillmentMigration,
    "REVOKE UPDATE ON public.vendor_orders FROM authenticated",
    "browser sessions cannot mutate vendor order state directly",
  ],
  [
    vendorFulfillmentMigration,
    "REVOKE UPDATE ON public.order_items FROM authenticated",
    "browser sessions cannot mutate order-item fulfillment directly",
  ],
  [
    ordersService,
    '"update_vendor_order_fulfillment" as never',
    "vendor order service uses the guarded fulfillment RPC",
  ],
  [
    vendorOrderDetailRoute,
    "admin dispute/refund workflow",
    "vendor UI does not expose unsafe paid-order cancellation",
  ],
  [
    inventorySelloutMigration,
    "OLD.status IS DISTINCT FROM NEW.status",
    "publication stock validation applies to publication transitions, not checkout decrements",
  ],
  [
    productRoute,
    "const soldOut =",
    "product detail page recognizes tracked zero inventory as sold out",
  ],
  [
    productCard,
    "disabled={soldOut}",
    "catalog cards cannot add tracked zero-inventory products to cart",
  ],
  [
    stickyBuyBar,
    "disabled={soldOut}",
    "mobile buy bar cannot add tracked zero-inventory products to cart",
  ],
  [
    webhookLeaseMigration,
    "updated_at < now() - interval '10 minutes'",
    "stale processing Stripe webhook claims can be recovered after the lease expires",
  ],
  [
    refundReservationMigration,
    "public.reserve_dispute_refund",
    "refund approval is reserved transactionally in PostgreSQL",
  ],
  [
    refundReservationMigration,
    "disputes_one_open_per_vendor_order",
    "database prevents concurrent duplicate open disputes",
  ],
  [
    refundReservationMigration,
    "FOR UPDATE",
    "refund reservation serializes financial approval against the order",
  ],
  [
    refundReservationMigration,
    "refund_already_reserved",
    "one dispute cannot reserve duplicate refunds concurrently",
  ],
  [
    optionalAuth,
    "requireTakatakAuthorizedSession",
    "optional auth cannot bypass the TAKATAK session grant",
  ],
  [
    finalAuthMigration,
    "public.is_takatak_authorized_session()",
    "database has a TAKATAK session authority helper",
  ],
  [
    finalAuthMigration,
    "AS RESTRICTIVE",
    "database RLS applies a restrictive TAKATAK session gate",
  ],
  [
    finalAuthMigration,
    "CREATE OR REPLACE FUNCTION public.has_role",
    "role helper is redefined inside the final TAKATAK auth boundary",
  ],
  [
    finalAuthMigration,
    "CREATE OR REPLACE FUNCTION public.owns_vendor",
    "vendor ownership helper is redefined inside the final TAKATAK auth boundary",
  ],
  [
    finalAuthMigration,
    "CREATE OR REPLACE FUNCTION public.can_access_dispute",
    "dispute helper is redefined inside the final TAKATAK auth boundary",
  ],
  [
    finalAuthMigration,
    "normalized_email !~ '^takatak",
    "database user bootstrap only creates profiles for deterministic TAKATAK synthetic emails",
  ],
  [
    stripeConnectFunctions,
    "const request = getRequest()",
    "Stripe Connect derives redirect origin from the trusted server request",
  ],
  [
    stripeFunctions,
    "const request = getRequest()",
    "Stripe subscription checkout derives redirect origin from the trusted server request",
  ],
  [
    stripeFunctions,
    "resolveTrustedAppOrigin(request.url)",
    "Stripe subscription URLs use the canonical trusted 1LV origin",
  ],
  [
    stripeFunctions,
    "findOpenVendorSubscriptionCheckout",
    "vendor subscription checkout reuses or blocks an already-open Stripe Checkout",
  ],
  [
    stripeFunctions,
    "subscription_checkout_${checkoutWindow}_v1",
    "vendor subscription Checkout creation is idempotent within a short retry window",
  ],
  [
    stripeFunctions,
    "Stored Stripe payment authorization does not match this order.",
    "stored PaymentIntents are revalidated before reuse",
  ],
  [
    stripeFunctions,
    "payment_after_${order.stripe_payment_intent_id}_v1",
    "canceled PaymentIntents are replaced with a stable idempotency key",
  ],
  [
    stripeFunctions,
    '"stripe_payment_intent_id",\n            order.stripe_payment_intent_id',
    "replacement PaymentIntent binding compares the previously stored authorization",
  ],
  [
    stripeFunctions,
    '.in("payment_status", ["unpaid", "failed"])',
    "replacement PaymentIntent binding cannot overwrite a terminal paid state",
  ],
  [
    stripeFunctions,
    "Payment authorization was created but could not be bound safely to the order.",
    "new PaymentIntent persistence is verified before returning success",
  ],
  [
    stripeFunctions,
    "terminalSubscriptionStatuses",
    "subscription checkout blocks duplicate non-terminal subscriptions",
  ],
  [
    stripeFunctions,
    `1lv_vendor_\${vendor.id}_customer_v1`,
    "Stripe Customer creation is vendor-idempotent",
  ],
  [
    stripeFunctions,
    "AbortSignal.timeout(STRIPE_TIMEOUT_MS)",
    "Stripe Billing requests have a bounded network timeout",
  ],
  [
    stripeConnectFunctions,
    "AbortSignal.timeout(STRIPE_TIMEOUT_MS)",
    "Stripe Connect requests have a bounded network timeout",
  ],
  [
    stripeConnectFunctions,
    `1lv_vendor_\${vendor.id}_connect_v1`,
    "Stripe Connect account creation is vendor-idempotent",
  ],
  [
    stripeConnectFunctions,
    "conflicts with the account already bound to this vendor",
    "Stripe Connect account binding fails closed on concurrent identity conflicts",
  ],
  [
    payoutSchedulerServer,
    "Stripe transfer succeeded but the payout could not be finalized locally.",
    "successful Stripe payout transfers require confirmed local persistence",
  ],
  [
    payoutSchedulerServer,
    "AbortSignal.timeout(STRIPE_TIMEOUT_MS)",
    "Stripe payout requests have a bounded network timeout",
  ],
  [
    stripeWebhook,
    '"finalize_refund_accounting"',
    "Stripe webhook uses the atomic refund accounting finalizer",
  ],
  [
    stripeAccountingMigration,
    "public.finalize_refund_accounting",
    "Stripe refund accounting RPC exists in the production migration",
  ],
  [
    requestOrigin,
    'DEFAULT_PUBLIC_ORIGIN = "https://1lv.ca"',
    "trusted origin helper has the canonical 1LV production origin",
  ],
  [
    requestOrigin,
    "process.env.PUBLIC_APP_ORIGIN",
    "trusted origin helper supports an explicit server-only canonical origin",
  ],
  [
    productionServer,
    "const PUBLIC_ORIGIN = configuredPublicOrigin();",
    "production server canonicalizes request URLs before TanStack handles them",
  ],
  [
    productionServer,
    "CURRENT_RELEASE_FILE",
    "production server reads the atomic CURRENT release marker",
  ],
  [
    productionServer,
    "process.env.RELEASE_REVISION = revision.toLowerCase();",
    "production server exports the active release SHA to the runtime",
  ],
  [
    healthRoute,
    "revision: process.env.RELEASE_REVISION?.trim() || null",
    "health endpoint reports the active application revision",
  ],
  [
    deployWorkflow,
    "RELEASE_REVISION: ${{ github.sha }}",
    "packaged runtime smoke test binds health to the exact candidate SHA",
  ],
  [
    deployWorkflow,
    "payload.revision !== process.env.GITHUB_SHA",
    "production health check rejects an old Passenger process",
  ],
  [
    ciWorkflow,
    "RELEASE_REVISION: ${{ github.sha }}",
    "PR runtime smoke tests bind health to the exact candidate SHA",
  ],
  [
    ciWorkflow,
    "payload.revision !== process.env.GITHUB_SHA",
    "PR runtime smoke tests verify the exact candidate SHA",
  ],
  [
    takatakDrainRoute,
    'process.env.TAKATAK_DRAIN_CRON_SECRET?.trim()',
    "TAKATAK drain uses a dedicated server-only cron secret",
  ],
  [
    takatakDrainRoute,
    "expected.length < 32",
    "TAKATAK drain rejects weak or missing cron secrets",
  ],
  [
    takatakDrainRoute,
    "safeEqual(received, expected)",
    "TAKATAK drain compares the bearer secret without ordinary string equality",
  ],
  [
    takatakDrainWorkflow,
    'url.protocol !== "https:"',
    "scheduled TAKATAK drain refuses non-HTTPS production URLs",
  ],
  [
    takatakDrainWorkflow,
    "payload.failed !== 0",
    "scheduled TAKATAK drain fails visibly when event delivery fails",
  ],
  [
    stripeWebhook,
    '"finalize_refund_accounting"',
    "Stripe refunds reconcile through the atomic 1LV accounting RPC",
  ],
  [
    stripeWebhook,
    '["paid", "partially_refunded", "refunded"].includes',
    "stale PaymentIntent success events cannot reactivate terminal paid/refunded order states",
  ],
  [
    stripeWebhook,
    '.in("payment_status", ["unpaid", "failed"])',
    "stale PaymentIntent failure events cannot downgrade a paid or refunded order",
  ],
  [
    stripeAccountingMigration,
    "public.claim_stripe_event",
    "Stripe webhook claim RPC exists in the production migration",
  ],
  [
    stripeAccountingMigration,
    "public.finalize_refund_accounting",
    "Stripe refund accounting RPC exists in the production migration",
  ],
  [
    stripeAccountingMigration,
    "payout_adjustments_refund_unique",
    "refund payout clawbacks are idempotent by refund id",
  ],
  [
    stripeWebhook,
    '"stripe_external_refund_detected"',
    "external Stripe refunds are surfaced for manual reconciliation",
  ],
  [
    disputesFunctions,
    '["approved", "processing", "failed"].includes(refund.status)',
    "failed and in-flight Stripe refunds remain safely recoverable with the stable idempotency key",
  ],
  [
    disputesFunctions,
    '"Use the explicit resolution action so payout holds and refund accounting stay consistent."',
    "terminal dispute status changes cannot bypass payout-hold side effects",
  ],

  [
    stripeWebhook,
    '"stripe_subscription_binding_conflict"',
    "Stripe Checkout cannot silently replace a non-terminal vendor subscription",
  ],
  [
    stripeWebhook,
    '"stripe_stale_subscription_deleted"',
    "stale Stripe cancellation events cannot cancel the currently linked subscription",
  ],
  [
    stripeWebhook,
    "retrieveStripeSubscription",
    "subscription and invoice webhooks re-read current Stripe subscription state before local mutation",
  ],
  [
    stripeWebhook,
    '"stripe_invoice_subscription_binding_mismatch"',
    "invoice webhook status updates verify the current vendor/customer subscription binding",
  ],
  [
    stripeWebhook,
    '"stripe_invoice_missing_subscription"',
    "subscription invoice events without a subscription id fail closed",
  ],
  [
    stripeConnectFunctions,
    "resolveTrustedAppOrigin(request.url)",
    "Stripe Connect account links use the canonical trusted 1LV origin",
  ],
  [
    masterClient,
    "normalizeTakatakMasterApiBaseUrl",
    "TAKATAK master API base URL normalization",
  ],
  [
    masterClient,
    'pathname.endsWith("/api/v1")',
    "TAKATAK /api/v1 normalization",
  ],
  [
    masterClient,
    'pathname = "/api"',
    "TAKATAK origin-to-/api normalization",
  ],
  [
    masterClient,
    'input.aggregateType === "customer"',
    "customer aggregate remote-id routing",
  ],
  [masterClient, '["identity_id"]', "TAKATAK master identity response key"],
  [masterClient, '["merchant_id"]', "TAKATAK master merchant response key"],
  [
    masterOutbox,
    'customerRef = order.customer_id ?? `order:${order.order_number}`',
    "canonical guest relationship reference",
  ],
  [authBridge, 'auth_source: "takatak"', "TAKATAK local session marker"],
  [
    authBridge,
    'intent === "login" && !expectedUserId',
    "login must never create an unconsented 1LV account",
  ],
  [
    authBridge,
    '.from("profile_consent_events")',
    "login requires recorded 1LV consent",
  ],
  [
    authBridge,
    'SIGNUP_CONSENT_REVISION = "1lv-terms-privacy-effective-2026-09-30"',
    "server-authoritative 1LV consent audit",
  ],
  [
    authBridge,
    'MARKETING_CONSENT_REVISION = "1lv-casl-opt-in-2026-10-01"',
    "versioned express marketing consent",
  ],
  [
    masterClient,
    "requestTakatakPhoneOtp",
    "phone-only TAKATAK OTP payload",
  ],
  [
    masterClient,
    "intent: \"login\" | \"signup\" = \"login\"",
    "explicit login/signup OTP intent",
  ],
  [
    authBridge,
    'expectedUserId ? "customer.updated" : "customer.created"',
    "correct master lifecycle event",
  ],
]) {
  if (!content.includes(marker)) {
    violations.push("Missing architecture guard: " + label);
  }
}

for (const forbiddenFinancialMarker of [
  "lifetimeValue:",
  '.select("subtotal',
  "vendor_orders(vendor_id, subtotal",
  "payment_status",
  "stripe_payment",
  "refund_amount",
  "payout_amount",
  "total, currency",
]) {
  if (masterOutbox.includes(forbiddenFinancialMarker)) {
    violations.push(
      "TAKATAK outbox must not read or project 1LV financial data: " +
        forbiddenFinancialMarker,
    );
  }
}

if (masterOutbox.includes('.in("status", ["pending", "failed"])')) {
  violations.push(
    "failed TAKATAK events must require explicit retry; automatic drain may process only pending events.",
  );
}

if (
  !readFileSync(join(root, "src/lib/disputes.functions.ts"), "utf8").includes(
    'stripeRefundStatus !== "succeeded"',
  )
) {
  violations.push(
    "refund accounting must remain blocked until Stripe reports status=succeeded.",
  );
}

if (
  productionServer.includes("x-forwarded-host") ||
  productionServer.includes("x-forwarded-proto")
) {
  violations.push(
    "production server must not trust client-controlled X-Forwarded host/proto when constructing the application request URL.",
  );
}

if (
  stripeFunctions.includes("requestUrl.origin") ||
  stripeConnectFunctions.includes("requestUrl.origin")
) {
  violations.push(
    "Stripe redirects must use resolveTrustedAppOrigin instead of a request-controlled origin.",
  );
}

if (stripeConnectFunctions.includes("returnOrigin")) {
  violations.push(
    "Stripe Connect must not accept a browser-supplied return origin.",
  );
}

if (stripeFunctions.includes("returnOrigin")) {
  violations.push(
    "Stripe subscription checkout must not accept a browser-supplied return origin.",
  );
}

{
  const refundStart = stripeWebhook.indexOf('case "charge.refunded":');
  const refundEnd = stripeWebhook.indexOf(
    'case "checkout.session.completed":',
    refundStart,
  );
  const refundBlock =
    refundStart >= 0 && refundEnd > refundStart
      ? stripeWebhook.slice(refundStart, refundEnd)
      : "";

  if (
    !refundBlock.includes("finalize_refund_accounting") ||
    refundBlock.includes('.update({ payment_status:')
  ) {
    violations.push(
      "charge.refunded must not directly mutate order payment status; it must reconcile verified 1LV refund records through finalize_refund_accounting.",
    );
  }
}

if (
  authMiddleware.includes("user_metadata") ||
  finalAuthMigration.includes("auth.jwt() -> 'user_metadata'")
) {
  violations.push(
    "authorization must never trust mutable user_metadata; use immutable app_metadata only.",
  );
}

if (
  !finalAuthMigration.includes(
    "'password',\n        'oauth',\n        'recovery'",
  )
) {
  violations.push(
    "database TAKATAK session gate must explicitly reject alternate local authentication methods.",
  );
}

if (
  loginRoute.includes(".auth.verifyOtp(") ||
  signupRoute.includes(".auth.verifyOtp(") ||
  loginRoute.includes("tokenHash") ||
  signupRoute.includes("tokenHash")
) {
  violations.push(
    "browser auth routes must not exchange local magic-link tokens directly; the TAKATAK server bridge must create and grant the session.",
  );
}

if (
  authBridge.includes('type: "magiclink"') &&
  !authBridge.includes("supabaseAdmin.auth.admin.createUser")
) {
  violations.push(
    "generateLink magiclink must not be the only local signup primitive; create the verified local user explicitly first.",
  );
}

if (
  masterClient.includes("metadata.email") ||
  authBridge.includes("data.email") ||
  authBridge.includes("normalizeOptionalEmail")
) {
  violations.push(
    "TAKATAK OTP bridge must stay phone-only; unverified email must not enter master auth.",
  );
}

if (
  !masterClient.includes('intent: "login" | "signup" = "login"')
) {
  violations.push(
    "TAKATAK login OTP must default to non-creating intent.",
  );
}

if (
  !payoutSchedulerServer.includes('.eq("locked_by", owner)') ||
  !payoutSchedulerFunctions.includes(
    "releaseLock(db, s.PAYOUT_LOCK, context.userId)",
  )
) {
  violations.push(
    "payout scheduler lock release must be scoped to the current lease owner",
  );
}

for (const migration of [
  vendorPaidVisibilityMigration,
  vendorInventoryCommitMigration,
]) {
  if (
    migration.includes(
      "JOIN public.order_items AS oi ON oi.order_id = orders.id",
    ) ||
    migration.includes(
      "JOIN public.orders AS o ON o.id = order_items.order_id",
    )
  ) {
    violations.push(
      "vendor paid-order visibility must not reintroduce mutually recursive RLS policy subqueries",
    );
  }
}

if (
  !inventoryMaintenanceRoute.includes(
    'process.env.INVENTORY_MAINTENANCE_CRON_SECRET',
  ) ||
  !inventoryMaintenanceRoute.includes("expected.length < 32") ||
  !inventoryMaintenanceRoute.includes(
    '"release_expired_inventory_reservations" as never',
  ) ||
  !inventoryMaintenanceRoute.includes(
    'createFileRoute("/api/internal/inventory/cleanup")',
  )
) {
  violations.push(
    "expired checkout inventory cleanup must stay on the authenticated internal route with a dedicated secret",
  );
}

if (
  !inventoryMaintenanceWorkflow.includes('cron: "*/15 * * * *"') ||
  !inventoryMaintenanceWorkflow.includes(
    "INVENTORY_MAINTENANCE_CRON_SECRET",
  ) ||
  !inventoryMaintenanceWorkflow.includes(
    "/api/internal/inventory/cleanup",
  )
) {
  violations.push(
    "expired checkout inventory must be released by the dedicated 15-minute production scheduler",
  );
}

if (
  !healthRoute.includes('"INVENTORY_MAINTENANCE_CRON_SECRET"')
) {
  violations.push(
    "production health must fail closed when inventory maintenance is not configured",
  );
}

if (
  ordersService.includes('.from("vendor_orders" as never)\n    .update') ||
  ordersService.includes('.from("order_items").update')
) {
  violations.push(
    "vendor fulfillment must never return to direct browser table updates",
  );
}

if (
  vendorOrderDetailRoute.includes('update("cancelled")') ||
  vendorOrderDetailRoute.includes(">Cancel</button>")
) {
  violations.push(
    "vendor UI must not cancel paid orders outside the admin refund/cancellation workflow",
  );
}

if (
  productRoute.includes("Math.max(1, product.inventoryQuantity)") ||
  productCard.includes('> Add to cart</button>') && !productCard.includes("disabled={soldOut}")
) {
  violations.push(
    "sold-out tracked inventory must never be coerced back to a purchasable quantity in the storefront",
  );
}

if (
  !payoutSchedulerServer.includes('.is("applied_payout_id", null)') ||
  !payoutSchedulerServer.includes('.select("id")') ||
  !payoutSchedulerServer.includes("(claimed ?? []).length !== ids.length")
) {
  violations.push(
    "payout adjustment claims must verify every expected row before finalizing a payout",
  );
}

if (
  !payoutSchedulerServer.includes("Could not roll back incomplete payout") ||
  !payoutSchedulerServer.includes("Could not roll back payout adjustment claim")
) {
  violations.push(
    "payout generation must fail loudly if cleanup of a partial payout fails",
  );
}

if (
  !payoutSchedulerServer.includes(
    "Recovered a stale processing transfer lease for safe idempotent retry.",
  )
) {
  violations.push(
    "stale payout processing leases must be recoverable with the stable Stripe idempotency key",
  );
}

if (
  !payoutSchedulerServer.includes("recoveredStaleProcessing") ||
  !payoutSchedulerServer.includes("!recoveredStaleProcessing") ||
  !payoutSchedulerServer.includes("Math.max(previousAttempts, 1)") ||
  !payoutSchedulerFunctions.includes('payout.status === "failed"') ||
  !payoutSchedulerFunctions.includes('payout.status === "processing" ? attempts : attempts + 1')
) {
  violations.push(
    "stale processing payout recovery must replay the same logical Stripe attempt even at the normal retry ceiling",
  );
}

if (
  !payoutSchedulerServer.includes("confirmedTransferId") ||
  !payoutSchedulerServer.includes(
    "Stripe transfer succeeded; local finalization requires reconciliation.",
  ) ||
  !payoutSchedulerServer.includes(
    '.eq("stripe_transfer_id", payout.stripe_transfer_id)',
  ) ||
  !payoutSchedulerServer.includes('status: "paid"') ||
  payoutSchedulerServer.includes(
    'if (payout.status === "failed") return finish("failed"',
  )
) {
  violations.push(
    "confirmed Stripe payouts must remain non-retryable and reconciliation must be able to repair the local paid state",
  );
}

if (
  !payoutSchedulerServer.includes("clawbackSources") ||
  !payoutSchedulerServer.includes('"refund_clawback"') ||
  !payoutSchedulerServer.includes('source.status === "paid"') ||
  !payoutSchedulerServer.includes('source.status === "cancelled"') ||
  !payoutSchedulerServer.includes("unresolvedClawback") ||
  !payoutSchedulerServer.includes("eligibleAdjustmentRows")
) {
  violations.push(
    "refund clawbacks must remain provisional until the source payout is reconciled paid or definitively cancelled without a transfer",
  );
}

if (
  payoutSchedulerServer.includes("json.amount ?? expectedAmount") ||
  payoutSchedulerServer.includes("json.currency ?? expectedCurrency") ||
  !payoutSchedulerServer.includes("!Number.isSafeInteger(actualAmount)") ||
  !payoutSchedulerServer.includes("actualDestination !== destination") ||
  !payoutSchedulerServer.includes("!Number.isSafeInteger(actualCents)") ||
  !payoutSchedulerServer.includes("!destination || transferDest !== destination")
) {
  violations.push(
    "Stripe payout transfer and reconciliation responses must fail closed on missing or mismatched amount, currency, or destination",
  );
}

if (
  authBridge.includes(".auth.signOut();") ||
  authProvider.includes(".auth.signOut();")
) {
  violations.push(
    "1LV session cleanup must use signOut({ scope: \"local\" }) so one failed/current session never revokes other devices.",
  );
}

if (
  !authBridge.includes('signOut({ scope: "local" })') ||
  !authProvider.includes('signOut({ scope: "local" })')
) {
  violations.push(
    "TAKATAK bootstrap and browser logout must explicitly preserve unrelated sessions with local sign-out scope.",
  );
}

if (
  !optionalAuth.includes("requireTakatakAuthorizedSession") ||
  !optionalAuth.includes("client.auth.getClaims(token)")
) {
  violations.push(
    "optional Supabase auth must enforce both TAKATAK JWT claims and the exact server-granted session_id",
  );
}


for (const [pattern, label] of [
  [/\[auth\][\s\S]*?enable_signup\s*=\s*false/, "global Supabase signup disabled"],
  [/\[auth\][\s\S]*?enable_anonymous_sign_ins\s*=\s*false/, "anonymous Supabase sign-in disabled"],
  [/\[auth\.email\][\s\S]*?enable_signup\s*=\s*false/, "email Supabase signup disabled"],
  [/\[auth\.sms\][\s\S]*?enable_signup\s*=\s*false/, "SMS Supabase signup disabled"],
]) {
  if (!pattern.test(supabaseConfig)) {
    violations.push("Missing Auth configuration guard: " + label);
  }
}


for (const helperName of [
  "public.has_role",
  "public.owns_vendor",
  "public.can_access_dispute",
]) {
  const helperStart = finalAuthMigration.indexOf(
    "CREATE OR REPLACE FUNCTION " + helperName,
  );
  if (helperStart < 0) continue;
  const nextFunction = finalAuthMigration.indexOf(
    "CREATE OR REPLACE FUNCTION ",
    helperStart + 1,
  );
  const helperBody = finalAuthMigration.slice(
    helperStart,
    nextFunction < 0 ? undefined : nextFunction,
  );
  if (
    !helperBody.includes("_user_id = auth.uid()") ||
    !helperBody.includes("public.is_takatak_authorized_session()")
  ) {
    violations.push(
      helperName +
        ": SECURITY DEFINER helper must bind the caller to auth.uid() and a verified TAKATAK session",
    );
  }
}


/* ------------------------------------------------------------------ */
/* TAKATAK master-data boundary: 1LV retains financial responsibility. */
/* ------------------------------------------------------------------ */

if (
  masterOutbox.includes('from "./order-mapper"') ||
  masterOutbox.includes("mapOrder(")
) {
  violations.push(
    "1LV order/financial projections must not be sent to GROUPE TAKATAK; sync customer and relationship context only.",
  );
}

for (const marker of [
  "payment_status",
  "lifetimeValue",
  "subtotal",
]) {
  if (masterOutbox.includes(marker)) {
    violations.push(
      `TAKATAK outbox must not include financial marker: ${marker}`,
    );
  }
}

for (const [content, marker, label] of [
  [orderMapper, "payment_status", "order payment status"],
  [orderMapper, "subtotal", "vendor subtotal"],
  [orderMapper, "total:", "order total"],
  [orderMapper, "currency:", "order currency"],
  [relationshipMapper, "lifetime_value", "relationship lifetime value"],
  [relationshipMapper, "lifetimeValue", "relationship lifetime value input"],
  [relationshipMapper, "currency:", "relationship currency"],
]) {
  if (content.includes(marker)) {
    violations.push(
      `TAKATAK mapper contains forbidden financial field (${label}).`,
    );
  }
}

if (
  !masterClient.includes('if (input.aggregateType === "order")') ||
  !masterClient.includes(
    "TAKATAK customer-data boundary rejected financial payload.",
  ) ||
  !masterClient.includes("MASTER_FINANCIAL_KEY")
) {
  violations.push(
    "TAKATAK HTTP boundary must suppress historical order aggregates and reject financial payload keys.",
  );
}

if (
  stripeWebhook.includes("queueOrderEvent") ||
  disputesFunctions.includes("queueOrderEvent") ||
  stripeWebhook.includes("takatakOrder(")
) {
  violations.push(
    "Stripe/refund code must never queue financial order lifecycle events to GROUPE TAKATAK.",
  );
}

if (
  !checkoutIdempotencyMigration.includes("Checkout idempotency key conflict") ||
  !checkoutIdempotencyMigration.includes("checkout_request_hash") ||
  !checkoutIdempotencyMigration.includes(
    "hashtextextended(v_idempotency_hash, 0)",
  )
) {
  violations.push(
    "checkout idempotency must serialize by key and reject payload reuse conflicts",
  );
}

if (
  !checkoutFunctions.includes('"create_marketplace_order_locked"') ||
  checkoutFunctions.includes('"create_marketplace_order" as never')
) {
  violations.push(
    "checkout must use create_marketplace_order_locked so concurrent carts acquire deterministic product locks",
  );
}

if (checkoutFunctions.includes("queueCustomerEvent")) {
  violations.push(
    "checkout must use order.created as the single TAKATAK customer synchronization entrypoint",
  );
}

if (
  !vendorOrderProjectionMigration.includes(
    'DROP POLICY IF EXISTS "Vendors view related orders"',
  ) ||
  !vendorOrderProjectionMigration.includes(
    "public.list_vendor_orders_for_current_user",
  ) ||
  !vendorOrderProjectionMigration.includes(
    "public.get_vendor_order_for_current_user",
  ) ||
  !vendorOrderProjectionMigration.includes(
    "public.is_takatak_authorized_session()",
  ) ||
  !vendorOrderProjectionMigration.includes(
    "o.inventory_committed_at IS NOT NULL",
  ) ||
  !vendorOrderProjectionMigration.includes(
    "o.inventory_released_at IS NULL",
  )
) {
  violations.push(
    "vendors must read paid committed orders only through the curated server-authoritative projection",
  );
}

for (const sensitiveVendorProjectionMarker of [
  "stripe_payment_intent_id",
  "stripe_charge_id",
  "billing_address",
  "checkout_request_hash",
  "takatak_customer_id",
  "takatak_order_event_id",
  "shipping_total",
  "tax_total",
  "promotion_code",
  "o.total",
]) {
  if (vendorOrderProjectionMigration.includes(sensitiveVendorProjectionMarker)) {
    violations.push(
      "vendor order projection exposes forbidden parent-order field: " +
        sensitiveVendorProjectionMarker,
    );
  }
}

if (
  !ordersService.includes('"list_vendor_orders_for_current_user"') ||
  !ordersService.includes('"get_vendor_order_for_current_user"') ||
  ordersService.includes('orders!inner(*)') ||
  ordersService.includes('orders!inner(id, order_number')
) {
  violations.push(
    "vendor UI must use curated order RPCs and never join the full parent orders row",
  );
}

if (
  checkoutFunctions.includes("user?.email?.trim() || data.email.trim()") ||
  !checkoutFunctions.includes('checkoutEmail.endsWith("@auth.1lv.ca")') ||
  !checkoutFunctions.includes(
    "Receipt/contact email is always the address explicitly supplied at checkout.",
  ) ||
  !checkoutRoute.includes('endsWith("@auth.1lv.ca")') ||
  !checkoutRoute.includes("defaultValue={contactEmail}")
) {
  violations.push(
    "synthetic TAKATAK RLS email must never become the 1LV checkout receipt/contact email",
  );
}

if (
  !healthRoute.includes('EXPECTED_SCHEMA_VERSION = "20261002084500"') ||
  !deployWorkflow.includes("supabase test db --local") ||
  !readFileSync(
    join(root, ".github/workflows/migrate-production-db.yml"),
    "utf8",
  ).includes('EXPECTED_SCHEMA_VERSION: "20261002084500"')
) {
  violations.push(
    "production health/migration gates must track schema 20261002084500",
  );
}

if (violations.length > 0) {
  console.error("GROUPE TAKATAK architecture check failed:");
  for (const violation of violations) console.error(" - " + violation);
  process.exit(1);
}

console.log(
  "GROUPE TAKATAK architecture check: PASS — TAKATAK owns identity/auth/OTP; 1LV remains isolated.",
);
