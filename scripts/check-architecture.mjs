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

for (const [content, marker, label] of [
  [masterClient, 'source_application: "1lv"', "1LV source binding"],
  [
    masterClient,
    'process.env["TAKATAK_1LV_API_KEY"]',
    "dedicated 1LV API credential",
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
    masterClient,
    "requestTakatakPhoneOtp",
    "phone-only TAKATAK OTP payload",
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

if (
  masterClient.includes("metadata.email") ||
  authBridge.includes("data.email") ||
  authBridge.includes("normalizeOptionalEmail")
) {
  violations.push(
    "TAKATAK OTP bridge must stay phone-only; unverified email must not enter master auth.",
  );
}

if (masterClient.includes("TAKATAK_MASTER_API_KEY")) {
  violations.push(
    "src/lib/takatak/client.server.ts: generic TAKATAK_MASTER_API_KEY must not return",
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
