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
    webhookLeaseMigration,
    "SELECT '20261002064000'",
    "final production schema marker includes stale Stripe event recovery",
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
    "subscription_checkout_${checkoutDay}_v1",
    "vendor subscription Checkout creation is idempotent within the active session window",
  ],
  [
    stripeFunctions,
    "Stored Stripe payment authorization does not match this order.",
    "stored PaymentIntents are revalidated before reuse",
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
    '.in("payment_status", ["pending", "failed"])',
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

if (violations.length > 0) {
  console.error("GROUPE TAKATAK architecture check failed:");
  for (const violation of violations) console.error(" - " + violation);
  process.exit(1);
}

console.log(
  "GROUPE TAKATAK architecture check: PASS — TAKATAK owns identity/auth/OTP; 1LV remains isolated.",
);
