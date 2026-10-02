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
const optionalAuth = readFileSync(
  join(root, "src/integrations/supabase/optional-auth.server.ts"),
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
    "NEW.raw_app_meta_data",
    "database user bootstrap requires immutable Auth app metadata",
  ],
  [
    stripeConnectFunctions,
    "const request = getRequest()",
    "Stripe Connect derives redirect origin from the trusted server request",
  ],
  [
    stripeConnectFunctions,
    "const origin = requestUrl.origin",
    "Stripe Connect account links use the server-derived 1LV origin",
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

if (masterOutbox.includes('.in("status", ["pending", "failed"])')) {
  violations.push(
    "failed TAKATAK events must require explicit retry; automatic drain may process only pending events.",
  );
}

if (stripeConnectFunctions.includes("returnOrigin")) {
  violations.push(
    "Stripe Connect must not accept a browser-supplied return origin.",
  );
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
  !optionalAuth.includes("requireTakatakSessionClaims") ||
  !optionalAuth.includes("client.auth.getClaims(token)")
) {
  violations.push(
    "optional Supabase auth must enforce the same verified TAKATAK JWT claims as protected server functions",
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
