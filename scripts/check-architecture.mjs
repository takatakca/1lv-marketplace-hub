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
const atomicPayoutMigration = readFileSync(
  join(root, "supabase/migrations/20261002090000_atomic_payout_generation.sql"),
  "utf8",
);
const expiredOrderTerminalMigration = readFileSync(
  join(root, "supabase/migrations/20261002091500_expired_order_terminal_state.sql"),
  "utf8",
);
const refundVendorScopeMigration = readFileSync(
  join(root, "supabase/migrations/20261002093000_refund_vendor_scope.sql"),
  "utf8",
);
const checkoutCastSafetyMigration = readFileSync(
  join(root, "supabase/migrations/20261002094500_checkout_input_cast_safety.sql"),
  "utf8",
);
const vendorProductAuthorityMigration = readFileSync(
  join(root, "supabase/migrations/20261002100000_vendor_product_publication_authority.sql"),
  "utf8",
);
const vendorProfileAuthorityMigration = readFileSync(
  join(root, "supabase/migrations/20261002101500_vendor_profile_authority.sql"),
  "utf8",
);
const legacyPublicHelpersMigration = readFileSync(
  join(root, "supabase/migrations/20261002103000_retire_legacy_public_helpers.sql"),
  "utf8",
);
const consolidatedMarketplaceAuthorityMigration = readFileSync(
  join(root, "supabase/migrations/20261002104500_consolidate_marketplace_authority.sql"),
  "utf8",
);
const authorityRlsAlignmentMigration = readFileSync(
  join(root, "supabase/migrations/20261002110000_align_authority_rls_states.sql"),
  "utf8",
);
const marketplaceTimestampAuthorityMigration = readFileSync(
  join(root, "supabase/migrations/20261002111500_marketplace_creation_timestamp_authority.sql"),
  "utf8",
);
const firstOrderPromotionUniquenessMigration = readFileSync(
  join(root, "supabase/migrations/20261002113000_first_order_promotion_uniqueness.sql"),
  "utf8",
);
const firstOrderPartialRefundMigration = readFileSync(
  join(root, "supabase/migrations/20261002114500_first_order_partial_refund_guard.sql"),
  "utf8",
);
const checkoutContactNormalizationMigration = readFileSync(
  join(root, "supabase/migrations/20261002120000_checkout_contact_normalization.sql"),
  "utf8",
);
const firstOrderEmailHistoryMigration = readFileSync(
  join(root, "supabase/migrations/20261002121500_first_order_email_history_guard.sql"),
  "utf8",
);
const databaseLintCleanupMigration = readFileSync(
  join(root, "supabase/migrations/20261002123000_database_lint_cleanup.sql"),
  "utf8",
);
const vendorAssetStorageMigration = readFileSync(
  join(root, "supabase/migrations/20261002124500_vendor_asset_storage_limits.sql"),
  "utf8",
);
const vendorAssetWriteAuthorityMigration = readFileSync(
  join(root, "supabase/migrations/20261002130000_vendor_asset_write_authority.sql"),
  "utf8",
);
const vendorAssetReferenceAuthorityMigration = readFileSync(
  join(root, "supabase/migrations/20261002131500_vendor_asset_reference_authority.sql"),
  "utf8",
);
const publicCatalogSubscriptionGateMigration = readFileSync(
  join(root, "supabase/migrations/20261002133000_public_catalog_subscription_gate.sql"),
  "utf8",
);
const firstOrderRefundedHistoryMigration = readFileSync(
  join(root, "supabase/migrations/20261002134500_first_order_refunded_history_guard.sql"),
  "utf8",
);
const vendorAssetPublicReadScopeMigration = readFileSync(
  join(root, "supabase/migrations/20261002140000_vendor_asset_public_read_scope.sql"),
  "utf8",
);
const publicVendorCatalogScopeMigration = readFileSync(
  join(root, "supabase/migrations/20261002141500_public_vendor_catalog_scope.sql"),
  "utf8",
);
const publicCategoryCatalogScopeMigration = readFileSync(
  join(root, "supabase/migrations/20261002143000_public_category_catalog_scope.sql"),
  "utf8",
);
const inventoryReleasePaymentBindingMigration = readFileSync(
  join(root, "supabase/migrations/20261002144500_inventory_release_payment_binding.sql"),
  "utf8",
);
const publicSoldCountRefundTruthMigration = readFileSync(
  join(root, "supabase/migrations/20261002150000_public_sold_count_refund_truth.sql"),
  "utf8",
);
const publicCatalogSearchMigration = readFileSync(
  join(root, "supabase/migrations/20261002151500_public_catalog_search_scope.sql"),
  "utf8",
);
const searchRoute = readFileSync(
  join(root, "src/routes/search.tsx"),
  "utf8",
);
const categoryRoute = readFileSync(
  join(root, "src/routes/category.$slug.tsx"),
  "utf8",
);
const dealsRoute = readFileSync(
  join(root, "src/routes/deals.tsx"),
  "utf8",
);
const publicCatalogService = readFileSync(
  join(root, "src/services/public-catalog.ts"),
  "utf8",
);
const publicStoreRoute = readFileSync(
  join(root, "src/routes/store.$slug.tsx"),
  "utf8",
);
const vendorAssetService = readFileSync(
  join(root, "src/services/vendor-assets.ts"),
  "utf8",
);
const vendorAssetUploadComponent = readFileSync(
  join(root, "src/components/VendorAssetUpload.tsx"),
  "utf8",
);
const vendorSettingsRoute = readFileSync(
  join(root, "src/routes/vendor.settings.tsx"),
  "utf8",
);
const marketplaceSettingsMigration = readFileSync(
  join(root, "supabase/migrations/20260930150630_persistent_marketplace_settings.sql"),
  "utf8",
);
const ordersService = readFileSync(
  join(root, "src/services/orders.ts"),
  "utf8",
);
const demoMode = readFileSync(
  join(root, "src/lib/demo-mode.ts"),
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
const supabaseTypes = readFileSync(
  join(root, "src/integrations/supabase/types.ts"),
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
    "refund/payout race migration retains its historical schema marker",
  ],
  [
    refundVendorScopeMigration,
    "SELECT '20261002093000'",
    "vendor-scoped refund migration retains its historical schema marker",
  ],
  [
    checkoutCastSafetyMigration,
    "SELECT '20261002094500'",
    "checkout cast-safety migration retains its historical schema marker",
  ],
  [
    vendorProductAuthorityMigration,
    "SELECT '20261002100000'",
    "vendor product publication migration retains its historical schema marker",
  ],
  [
    vendorProfileAuthorityMigration,
    "SELECT '20261002101500'",
    "vendor profile authority migration retains its historical schema marker",
  ],
  [
    legacyPublicHelpersMigration,
    "SELECT '20261002103000'",
    "legacy public helper retirement migration retains its historical schema marker",
  ],
  [
    consolidatedMarketplaceAuthorityMigration,
    "SELECT '20261002104500'",
    "consolidated marketplace authority migration retains its historical schema marker",
  ],
  [
    authorityRlsAlignmentMigration,
    "SELECT '20261002110000'",
    "authority RLS alignment migration retains its historical schema marker",
  ],
  [
    marketplaceTimestampAuthorityMigration,
    "SELECT '20261002111500'",
    "marketplace timestamp authority migration retains its historical schema marker",
  ],
  [
    firstOrderPromotionUniquenessMigration,
    "SELECT '20261002113000'",
    "first-order promotion uniqueness migration retains its historical schema marker",
  ],
  [
    firstOrderPartialRefundMigration,
    "SELECT '20261002114500'",
    "partial-refund first-order migration retains its historical schema marker",
  ],
  [
    checkoutContactNormalizationMigration,
    "SELECT '20261002120000'",
    "checkout contact normalization migration retains its historical schema marker",
  ],
  [
    firstOrderEmailHistoryMigration,
    "SELECT '20261002121500'",
    "guest-to-account first-order protection retains its historical schema marker",
  ],
  [
    databaseLintCleanupMigration,
    "SELECT '20261002123000'",
    "database lint cleanup retains its historical schema marker",
  ],
  [
    vendorAssetStorageMigration,
    "SELECT '20261002124500'",
    "vendor asset storage limits retain their historical schema marker",
  ],
  [
    vendorAssetWriteAuthorityMigration,
    "SELECT '20261002130000'",
    "vendor asset write authority retains its historical schema marker",
  ],
  [
    vendorAssetReferenceAuthorityMigration,
    "SELECT '20261002131500'",
    "vendor branding reference authority retains its historical schema marker",
  ],
  [
    publicCatalogSubscriptionGateMigration,
    "SELECT '20261002133000'",
    "public catalog subscription eligibility retains its historical schema marker",
  ],
  [
    firstOrderRefundedHistoryMigration,
    "SELECT '20261002134500'",
    "fully refunded first-order protection retains its historical schema marker",
  ],
  [
    vendorAssetPublicReadScopeMigration,
    "SELECT '20261002140000'",
    "scoped public vendor asset reads retain their historical schema marker",
  ],
  [
    publicVendorCatalogScopeMigration,
    "SELECT '20261002141500'",
    "vendor-scoped public catalog retains its historical schema marker",
  ],
  [
    publicCategoryCatalogScopeMigration,
    "SELECT '20261002143000'",
    "category-scoped public catalog retains its historical schema marker",
  ],
  [
    inventoryReleasePaymentBindingMigration,
    "SELECT '20261002144500'",
    "PaymentIntent-bound inventory release retains its historical schema marker",
  ],
  [
    publicSoldCountRefundTruthMigration,
    "SELECT '20261002150000'",
    "truthful public sold counts retain their historical schema marker",
  ],
  [
    publicCatalogSearchMigration,
    "SELECT '20261002151500'",
    "final production schema marker includes server-scoped public catalog search",
  ],
  [
    publicCategoryCatalogScopeMigration,
    "p.category_slug = btrim(COALESCE(_category_slug, ''))",
    "related-product catalog filters by category in PostgreSQL before applying limits",
  ],
  [
    publicCatalogService,
    '"list_public_catalog_products_for_category" as never',
    "public catalog service exposes the category-scoped catalog RPC",
  ],
  [
    productRoute,
    "listPublicCatalogProductsForCategory",
    "product detail route queries related products by category without a global catalog scan",
  ],
  [
    publicVendorCatalogScopeMigration,
    "v.slug = btrim(COALESCE(_vendor_slug, ''))",
    "vendor storefront catalog filters in PostgreSQL before applying limits",
  ],
  [
    publicCatalogService,
    '"list_public_catalog_products_for_vendor" as never',
    "public catalog service exposes the vendor-scoped catalog RPC",
  ],
  [
    publicStoreRoute,
    "listPublicCatalogProductsForVendor",
    "storefront route queries only the requested vendor catalog",
  ],
  [
    vendorAssetPublicReadScopeMigration,
    "public.can_read_vendor_asset(name)",
    "vendor asset SELECT policy delegates to the scoped read authority",
  ],
  [
    vendorAssetPublicReadScopeMigration,
    "DROP POLICY IF EXISTS \"vendor-assets public read\"",
    "legacy bucket-wide anonymous vendor asset reads are removed",
  ],
  [
    firstOrderRefundedHistoryMigration,
    "'refunded'",
    "fully refunded orders remain prior paid history for first-order promotion eligibility",
  ],
  [
    publicCatalogSubscriptionGateMigration,
    "subscription_status IN ('active', 'trialing')",
    "public catalog visibility requires an eligible vendor subscription",
  ],
  [
    vendorAssetReferenceAuthorityMigration,
    "Vendor logo asset ownership mismatch",
    "vendor logo references cannot impersonate another vendor asset",
  ],
  [
    vendorAssetReferenceAuthorityMigration,
    "Vendor banner asset ownership mismatch",
    "vendor banner references cannot impersonate another vendor asset",
  ],
  [
    vendorAssetWriteAuthorityMigration,
    "public.is_takatak_authorized_session()",
    "vendor asset writes require a TAKATAK-authorized local session",
  ],
  [
    vendorAssetWriteAuthorityMigration,
    "FROM public.vendors AS v",
    "vendor asset writes require a real 1LV vendor owner",
  ],
  [
    vendorAssetWriteAuthorityMigration,
    'TO authenticated',
    "vendor asset mutation policies are authenticated-only",
  ],
  [
    vendorAssetStorageMigration,
    "file_size_limit",
    "vendor asset bucket enforces a server-side size limit",
  ],
  [
    vendorAssetStorageMigration,
    "allowed_mime_types",
    "vendor asset bucket enforces server-side MIME types",
  ],
  [
    databaseLintCleanupMigration,
    "ALTER FUNCTION public.normalize_canadian_checkout_address(jsonb, text)",
    "checkout address normalization volatility is explicitly corrected",
  ],
  [
    databaseLintCleanupMigration,
    "SELECT checkout_request_hash",
    "locked checkout implementation no longer selects an unused order id",
  ],
  [
    firstOrderEmailHistoryMigration,
    "lower(btrim(COALESCE(o.customer_email",
    "first-order promotion prior-history checks include normalized checkout email",
  ],
  [
    checkoutContactNormalizationMigration,
    "normalize_canadian_checkout_address",
    "checkout addresses are normalized and validated inside PostgreSQL",
  ],
  [
    checkoutContactNormalizationMigration,
    "@auth\\.1lv\\.ca$",
    "database checkout rejects synthetic TAKATAK transport emails as customer receipts",
  ],
  [
    firstOrderPartialRefundMigration,
    "payment_status::text IN ('paid', 'partially_refunded')",
    "partially refunded orders remain prior paid orders for first-order promotion eligibility",
  ],
  [
    firstOrderPartialRefundMigration,
    "Promotion is available on the first paid order only",
    "first-order promotion trigger fails closed when prior paid history exists",
  ],
  [
    firstOrderPromotionUniquenessMigration,
    "promotion_redemptions_first_order_customer_uidx",
    "first-order promotions are unique by authenticated customer identity",
  ],
  [
    firstOrderPromotionUniquenessMigration,
    "promotion_redemptions_first_order_email_uidx",
    "first-order promotions are unique by normalized checkout email",
  ],
  [
    firstOrderPromotionUniquenessMigration,
    "promotion_redemptions_first_order_identity",
    "first-order promotion identity keys are maintained by PostgreSQL",
  ],
  [
    marketplaceTimestampAuthorityMigration,
    "NEW.created_at := now()",
    "browser-created vendor/product timestamps are normalized by PostgreSQL",
  ],
  [
    marketplaceTimestampAuthorityMigration,
    "Marketplace creation timestamp is server-authoritative",
    "browser vendors cannot rewrite marketplace creation timestamps",
  ],
  [
    authorityRlsAlignmentMigration,
    "'pending'::public.vendor_status",
    "vendor insert RLS accepts the server-generated pending state",
  ],
  [
    authorityRlsAlignmentMigration,
    "'active'::public.vendor_status",
    "vendor insert RLS accepts the server-generated active state",
  ],
  [
    authorityRlsAlignmentMigration,
    "'pending_review'::public.product_status",
    "product insert RLS accepts the server-generated review state",
  ],
  [
    consolidatedMarketplaceAuthorityMigration,
    "DROP TRIGGER IF EXISTS enforce_vendor_marketplace_fields_trigger",
    "superseded vendor marketplace authority trigger is removed",
  ],
  [
    consolidatedMarketplaceAuthorityMigration,
    "DROP TRIGGER IF EXISTS enforce_product_marketplace_fields_trigger",
    "superseded product marketplace authority trigger is removed",
  ],
  [
    consolidatedMarketplaceAuthorityMigration,
    "s.require_vendor_approval",
    "vendor onboarding remains controlled by marketplace approval settings",
  ],
  [
    consolidatedMarketplaceAuthorityMigration,
    "s.default_commission_rate",
    "vendor default commission remains controlled by marketplace settings",
  ],
  [
    consolidatedMarketplaceAuthorityMigration,
    "s.require_product_approval",
    "product publication remains controlled by marketplace approval settings",
  ],
  [
    legacyPublicHelpersMigration,
    "REVOKE ALL ON FUNCTION public.get_vendor_commission_rates(uuid[])",
    "vendor commission rates are not browser-readable",
  ],
  [
    legacyPublicHelpersMigration,
    "REVOKE ALL ON FUNCTION public.get_public_product_by_slug(text)",
    "legacy single-product RPC cannot bypass the curated catalog",
  ],
  [
    legacyPublicHelpersMigration,
    "REVOKE ALL ON FUNCTION public.list_public_products(integer)",
    "legacy product-list RPC cannot bypass the curated catalog",
  ],
  [
    legacyPublicHelpersMigration,
    "REVOKE ALL ON TABLE public.public_vendors",
    "legacy public vendor view is inaccessible to browser roles",
  ],
  [
    vendorProfileAuthorityMigration,
    "Vendor attempted to modify server-authoritative fields",
    "browser vendors cannot mutate marketplace, Stripe, payout, or TAKATAK authority fields",
  ],
  [
    vendorProfileAuthorityMigration,
    "NEW.payouts_enabled := false",
    "new vendor records cannot self-enable payouts",
  ],
  [
    vendorProfileAuthorityMigration,
    "NEW.subscription_status := 'none'",
    "new vendor records cannot self-activate subscriptions",
  ],
  [
    vendorProfileAuthorityMigration,
    "WITH CHECK (auth.uid() = user_id)",
    "vendor profile update policy preserves ownership",
  ],
  [
    vendorProfileAuthorityMigration,
    'DROP POLICY IF EXISTS "Authenticated can view active vendors"',
    "authenticated customers cannot query private vendor rows through the base table",
  ],
  [
    vendorProfileAuthorityMigration,
    'CREATE POLICY "Vendors can view their own private record"',
    "vendor owner retains access to its own private row",
  ],
  [
    marketplaceSettingsMigration,
    "public.get_public_vendor_by_slug",
    "public storefront vendor lookup uses a fixed-column RPC",
  ],
  [
    marketplaceSettingsMigration,
    "public.list_public_vendors",
    "public storefront vendor listing uses a fixed-column RPC",
  ],
  [
    vendorProductAuthorityMigration,
    "Only marketplace admins may approve or reject products",
    "vendors cannot self-approve or reject marketplace products",
  ],
  [
    vendorProductAuthorityMigration,
    "NEW.status := 'pending_review'::public.product_status",
    "commercial edits to active vendor products require marketplace re-review",
  ],
  [
    vendorProductAuthorityMigration,
    "WITH CHECK",
    "vendor product update policy preserves ownership after updates",
  ],
  [
    vendorProductAuthorityMigration,
    "subscription_status IN ('active', 'trialing')",
    "review submission requires an active subscribed vendor",
  ],
  [
    vendorProductAuthorityMigration,
    "status = 'draft'::public.product_status",
    "vendors may hard-delete only draft products; reviewed products remain auditable through archive",
  ],
  [
    vendorProductAuthorityMigration,
    'DROP POLICY IF EXISTS "Authenticated can view active products"',
    "authenticated customers cannot query private product rows through the base table",
  ],
  [
    marketplaceSettingsMigration,
    "public.list_public_catalog_products",
    "public storefront product listing uses a fixed-column RPC",
  ],
  [
    marketplaceSettingsMigration,
    "public.get_public_catalog_product_by_slug",
    "public storefront product detail uses a fixed-column RPC",
  ],
  [
    expiredOrderTerminalMigration,
    "payment_status = 'failed'::public.payment_status",
    "released unpaid checkout becomes payment-failed",
  ],
  [
    expiredOrderTerminalMigration,
    "status = 'cancelled'::public.order_status",
    "released unpaid checkout becomes terminal cancelled",
  ],
  [
    expiredOrderTerminalMigration,
    "TO service_role",
    "inventory release remains service-role only",
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
    "makePaymentIntentNonPayable",
    "expired/released checkout makes the stored Stripe PaymentIntent non-payable before inventory release",
  ],
  [
    stripeFunctions,
    "paymentState === \"succeeded\"",
    "Stripe-succeeded expired checkout blocks inventory release for reconciliation",
  ],
  [
    stripeFunctions,
    "expire_${paymentIntentId}_v1",
    "expired PaymentIntent cancellation is idempotent",
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
    "releaseRevisionReady = /^[0-9a-f]{40}$/.test(releaseRevision)",
    "health endpoint requires a full active release revision before reporting ready",
  ],
  [
    healthRoute,
    "revision: releaseRevision || null",
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
    'if [ "$SITE_URL" != "https://1lv.ca" ]; then',
    "scheduled TAKATAK drain is pinned to the canonical 1LV production origin",
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
    stripeWebhook,
    'case "payment_intent.canceled"',
    "canceled PaymentIntents are handled explicitly",
  ],
  [
    stripeWebhook,
    "const checkoutClosed =",
    "canceled PaymentIntent preserves a still-valid inventory reservation",
  ],
  [
    stripeWebhook,
    'status: "cancelled" as const',
    "canceled PaymentIntent closes only an expired or already-released checkout",
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
  !productionServer.includes("requestRequiresNoStore") ||
  !productionServer.includes('res.setHeader("Cache-Control", "no-store")') ||
  !productionServer.includes("MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024") ||
  !productionServer.includes("boundedRequestBody(req)") ||
  !productionServer.includes('res.end("Payload Too Large"') ||
  !productionServer.includes(
    '"Cross-Origin-Opener-Policy", "same-origin-allow-popups"',
  ) ||
  !productionServer.includes('"Origin-Agent-Cluster", "?1"') ||
  !productionServer.includes(
    '"X-Permitted-Cross-Domain-Policies", "none"',
  )
) {
  violations.push(
    "production server must force no-store on authenticated/private responses and retain isolation headers",
  );
}

if (
  !productionServer.includes(
    'const INVALID_CONTENT_LENGTH_CODE = "ERR_1LV_INVALID_CONTENT_LENGTH";',
  ) ||
  !productionServer.includes("error.code === INVALID_CONTENT_LENGTH_CODE") ||
  !productionServer.includes("res.writeHead(400")
) {
  violations.push(
    "production server must classify invalid Content-Length as a 400 client error",
  );
}

if (
  !ciWorkflow.includes("Expected oversized request body to return 413") ||
  !ciWorkflow.includes("head -c 2097153 /dev/zero")
) {
  violations.push(
    "PR runtime smoke tests must prove the global request body limit returns HTTP 413",
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
    'createFileRoute("/api/internal/inventory/cleanup")',
  ) ||
  !inventoryMaintenanceRoute.includes("/payment_intents/") ||
  !inventoryMaintenanceRoute.includes("/cancel") ||
  !inventoryMaintenanceRoute.includes(
    'rpc("release_order_inventory"',
  ) ||
  !inventoryMaintenanceRoute.includes(
    "_expected_payment_intent_id: paymentIntentId ?? null",
  ) ||
  !inventoryMaintenanceRoute.includes(
    'status === "succeeded"',
  ) ||
  !inventoryMaintenanceRoute.includes(
    "Inventory release compare-and-release rejected stale state",
  )
) {
  violations.push(
    "expired checkout inventory cleanup must bind release to the exact Stripe PaymentIntent state it verified",
  );
}

if (
  !supabaseTypes.includes("release_order_inventory: {") ||
  !supabaseTypes.includes("_expected_payment_intent_id: string | null") ||
  !supabaseTypes.includes("_order_id: string") ||
  inventoryMaintenanceRoute.includes('"release_order_inventory" as never') ||
  stripeFunctions.includes('"release_order_inventory" as never') ||
  stripeWebhook.includes('"release_order_inventory" as never') ||
  !stripeWebhook.includes(
    "_expected_payment_intent_id: paymentIntentId",
  ) ||
  !stripeWebhook.includes(
    "Canceled PaymentIntent inventory release was rejected because order state changed concurrently.",
  )
) {
  violations.push(
    "PaymentIntent-bound inventory release must remain typed in maintenance, checkout and Stripe cancellation flows",
  );
}

if (
  !inventoryReleasePaymentBindingMigration.includes(
    "public.release_order_inventory(",
  ) ||
  !inventoryReleasePaymentBindingMigration.includes(
    "_expected_payment_intent_id text",
  ) ||
  !inventoryReleasePaymentBindingMigration.includes(
    "inventory_reserved_until > now()",
  ) ||
  !inventoryReleasePaymentBindingMigration.includes(
    "stripe_payment_intent_id\n        IS DISTINCT FROM _expected_payment_intent_id",
  ) ||
  !inventoryReleasePaymentBindingMigration.includes(
    "REVOKE ALL ON FUNCTION public.release_order_inventory(uuid)",
  ) ||
  !inventoryReleasePaymentBindingMigration.includes(
    "REVOKE ALL ON FUNCTION public.release_expired_inventory_reservations(integer)",
  ) ||
  !inventoryReleasePaymentBindingMigration.includes(
    "FROM PUBLIC, anon, authenticated, service_role",
  ) ||
  !stripeFunctions.includes(
    "_expected_payment_intent_id:",
  ) ||
  !stripeFunctions.includes(
    "Expired checkout state changed before inventory could be released safely.",
  )
) {
  violations.push(
    "inventory release must be transactionally bound to expiry and the exact verified PaymentIntent, with the legacy one-argument RPC retired",
  );
}

if (
  inventoryMaintenanceRoute.includes(
    '"release_expired_inventory_reservations" as never',
  )
) {
  violations.push(
    "inventory maintenance must not bulk-release PI-backed reservations before Stripe cancellation",
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
  !payoutSchedulerServer.includes('"create_vendor_payout_atomic"') ||
  payoutSchedulerServer.includes('.from("payouts")\n      .insert({') ||
  payoutSchedulerServer.includes('.from("payout_items").insert(') ||
  !atomicPayoutMigration.includes("FOR UPDATE OF vo") ||
  !atomicPayoutMigration.includes("pg_advisory_xact_lock") ||
  !atomicPayoutMigration.includes("v_inserted_items <> v_item_count") ||
  !atomicPayoutMigration.includes(
    "v_claimed_adjustments <> v_adjustment_count",
  ) ||
  !atomicPayoutMigration.includes("FOR UPDATE OF source") ||
  !atomicPayoutMigration.includes("SECURITY INVOKER") ||
  atomicPayoutMigration.includes("SECURITY DEFINER") ||
  !atomicPayoutMigration.includes("TO service_role")
) {
  violations.push(
    "payout generation must be created atomically inside PostgreSQL with locked vendor orders and adjustment count verification",
  );
}

if (
  !payoutSchedulerServer.includes(
    'boundedIntegerSetting(r.hold_days, 7, "hold_days", 0, 365)',
  ) ||
  !payoutSchedulerServer.includes(
    'boundedIntegerSetting(r.payout_day, 1, "payout_day", 0, 6)',
  ) ||
  !payoutSchedulerServer.includes(
    '"payout_hour_utc",\n      0,\n      23',
  ) ||
  !payoutSchedulerServer.includes(
    '"max_transfer_attempts",\n      1,\n      10',
  ) ||
  !payoutSchedulerServer.includes('frequency !== "weekly"')
) {
  violations.push(
    "payout settings must fail closed on invalid hold, cadence, hour, or retry-limit values",
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
  !atomicPayoutMigration.includes("refund_clawback") ||
  !atomicPayoutMigration.includes("v_unresolved_clawback") ||
  !atomicPayoutMigration.includes(
    "source.status = 'paid'::public.payout_status",
  ) ||
  !atomicPayoutMigration.includes("source.stripe_transfer_id IS NOT NULL") ||
  !atomicPayoutMigration.includes(
    "source.reconciliation_status = 'matched'",
  ) ||
  !atomicPayoutMigration.includes(
    "source.status = 'cancelled'::public.payout_status",
  ) ||
  !atomicPayoutMigration.includes("source.stripe_transfer_id IS NULL")
) {
  violations.push(
    "refund clawbacks must remain provisional inside the atomic payout transaction until the source payout is conclusively paid or cancelled without a transfer",
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
  !payoutSchedulerServer.includes('actualMetadata["payout_id"]') ||
  !payoutSchedulerServer.includes('actualMetadata["vendor_id"]') ||
  !payoutSchedulerServer.includes('transferMetadata["payout_id"] !== payout.id') ||
  !payoutSchedulerServer.includes('transferMetadata["vendor_id"] !== payout.vendor_id') ||
  !payoutSchedulerServer.includes('"metadata_mismatch"')
) {
  violations.push(
    "Stripe payout transfer and reconciliation must bind the remote transfer metadata to the exact local payout and vendor",
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


if (
  !refundVendorScopeMigration.includes(
    "Automatic marketplace refunds require a vendor order",
  ) ||
  !refundVendorScopeMigration.includes("vo.order_id = NEW.order_id") ||
  !disputesFunctions.includes("vendor_order_id") ||
  !disputesFunctions.includes(
    "Automatic refunds must be linked to a vendor order.",
  )
) {
  violations.push(
    "automatic Stripe refunds must remain vendor-order scoped before payout accounting",
  );
}

/* ------------------------------------------------------------------ */
/* TAKATAK master-data boundary: 1LV retains financial responsibility. */
/* ------------------------------------------------------------------ */

if (
  !checkoutCastSafetyMigration.includes(
    "CREATE OR REPLACE FUNCTION public.assert_checkout_items_safe",
  ) ||
  !checkoutCastSafetyMigration.includes("'^[1-9][0-9]?$'") ||
  !checkoutCastSafetyMigration.includes(
    "public.create_marketplace_order_unchecked",
  ) ||
  !checkoutCastSafetyMigration.includes(
    "public.create_marketplace_order_locked_unchecked",
  ) ||
  !checkoutCastSafetyMigration.includes(
    "PERFORM public.assert_checkout_items_safe(_items);",
  ) ||
  checkoutFunctions.includes("create_marketplace_order_unchecked") ||
  checkoutFunctions.includes("create_marketplace_order_locked_unchecked")
) {
  violations.push(
    "checkout quantities and product UUIDs must be validated before PostgreSQL casts, and application code must use canonical wrappers only",
  );
}

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
  !stripeWebhook.includes("configuredVendorPlanForPrice") ||
  !stripeWebhook.includes("verifiedVendorPlan") ||
  !stripeWebhook.includes("subscription.priceIds.length !== 1") ||
  stripeWebhook.includes("subscription_plan: meta.plan")
) {
  violations.push(
    "vendor subscription plan authority must come from one configured Stripe Price ID, not webhook metadata alone",
  );
}

if (
  !stripeWebhook.includes("quarantineLinkedSubscription") ||
  !stripeWebhook.includes('subscription_status: "needs_review"') ||
  !stripeWebhook.includes(
    "current.stripe_subscription_id !== subscriptionId",
  )
) {
  violations.push(
    "a linked Stripe subscription with vendor/customer/price inconsistency must fail closed into needs_review",
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
  !checkoutFunctions.includes("normalizeCheckoutAddress") ||
  !checkoutFunctions.includes("CANADIAN_POSTAL_CODE_RE") ||
  !checkoutFunctions.includes('typeof data.email !== "string"') ||
  !checkoutFunctions.includes('typeof item.quantity !== "number"')
) {
  violations.push(
    "checkout server input must fail closed on malformed runtime types and normalize Canadian addresses",
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
  !healthRoute.includes(
    'EXPECTED_SUPABASE_PROJECT_REF = "odoybkshqszucvoxzjyz"',
  ) ||
  !healthRoute.includes("supabaseTargetConfigured") ||
  !deployWorkflow.includes(
    'EXPECTED_SUPABASE_URL="https://odoybkshqszucvoxzjyz.supabase.co"',
  ) ||
  !deployWorkflow.includes(
    'VITE_SUPABASE_URL%/}" != "$EXPECTED_SUPABASE_URL"',
  )
) {
  violations.push(
    "frontend build and server runtime must remain pinned to the exact 1LV Supabase production project",
  );
}

if (
  !demoMode.includes("return !user;") ||
  demoMode.includes("hasRealData") ||
  demoMode.includes("!hasRealData")
) {
  violations.push(
    "demo data must remain strictly unauthenticated preview-only and never replace empty authenticated production data",
  );
}

if (
  !healthRoute.includes("MIN_32_CHAR_SECRET_ENV") ||
  !healthRoute.includes('"CHECKOUT_GUEST_TOKEN_SECRET"') ||
  !healthRoute.includes('"TAKATAK_DRAIN_CRON_SECRET"') ||
  !healthRoute.includes('"INVENTORY_MAINTENANCE_CRON_SECRET"') ||
  !healthRoute.includes("strongRuntimeSecretsConfigured")
) {
  violations.push(
    "production health must reject weak guest-payment and internal cron secrets",
  );
}

if (
  !healthRoute.includes('EXPECTED_SCHEMA_VERSION = "20261002151500"') ||
  !deployWorkflow.includes("supabase test db --local") ||
  !deployWorkflow.includes('EXPECTED_SCHEMA_VERSION: "20261002151500"') ||
  !readFileSync(
    join(root, ".github/workflows/migrate-production-db.yml"),
    "utf8",
  ).includes('EXPECTED_SCHEMA_VERSION: "20261002151500"') ||
  !publicCatalogSearchMigration.includes("SELECT '20261002151500'")
) {
  violations.push(
    "production health/migration gates must track schema 20261002151500",
  );
}

if (
  !categoryRoute.includes("searchPublicCatalogProducts") ||
  !categoryRoute.includes("liveCategoryQuery") ||
  !categoryRoute.includes("canadianOnly: caOnly")
) {
  violations.push(
    "live category pages must query category/price/vendor filters before the public catalog limit",
  );
}

if (
  !dealsRoute.includes("searchPublicCatalogProducts") ||
  !dealsRoute.includes("saleOnly: true") ||
  !dealsRoute.includes("maxPrice: 24.99")
) {
  violations.push(
    "live deals pages must query markdown and budget scopes before the public catalog limit",
  );
}

if (
  !publicCatalogSearchMigration.includes(
    "CREATE OR REPLACE FUNCTION public.search_public_catalog_products",
  ) ||
  !publicCatalogSearchMigration.includes(
    "v.subscription_status IN ('active', 'trialing')",
  ) ||
  !publicCatalogSearchMigration.includes(
    "NOT p.track_inventory OR p.inventory_quantity > 0",
  ) ||
  publicCatalogSearchMigration.includes(
    "'refunded'::public.payment_status",
  ) ||
  !publicCatalogService.includes(
    '"search_public_catalog_products" as never',
  ) ||
  !searchRoute.includes("searchPublicCatalogProducts")
) {
  violations.push(
    "live storefront search must filter the eligible public catalog in PostgreSQL before the result limit",
  );
}

if (
  publicSoldCountRefundTruthMigration.includes(
    "'refunded'::public.payment_status",
  ) ||
  !publicSoldCountRefundTruthMigration.includes(
    "'partially_refunded'::public.payment_status",
  )
) {
  violations.push(
    "public sold-count projections must exclude fully refunded orders while retaining partial-refund sales",
  );
}

if (
  !publicCatalogSubscriptionGateMigration.includes(
    "CREATE OR REPLACE FUNCTION public.list_public_catalog_products",
  ) ||
  !publicCatalogSubscriptionGateMigration.includes(
    "CREATE OR REPLACE FUNCTION public.get_public_catalog_product_by_slug",
  ) ||
  !publicCatalogSubscriptionGateMigration.includes(
    "CREATE OR REPLACE FUNCTION public.list_public_vendors",
  ) ||
  !publicCatalogSubscriptionGateMigration.includes(
    "CREATE OR REPLACE FUNCTION public.get_public_vendor_by_slug",
  ) ||
  !publicCatalogSubscriptionGateMigration.includes(
    "subscription_status IN ('active', 'trialing')",
  )
) {
  violations.push(
    "public storefront catalog and vendor visibility must match checkout subscription eligibility",
  );
}

if (
  !vendorAssetReferenceAuthorityMigration.includes(
    "storage.foldername(NEW.logo_url)",
  ) ||
  !vendorAssetReferenceAuthorityMigration.includes(
    "storage.foldername(NEW.banner_url)",
  ) ||
  !vendorAssetReferenceAuthorityMigration.includes(
    "Vendor logo asset ownership mismatch",
  ) ||
  !vendorAssetReferenceAuthorityMigration.includes(
    "Vendor banner asset ownership mismatch",
  )
) {
  violations.push(
    "vendor storefront branding references must stay owner-scoped and canonical",
  );
}

if (
  !vendorAssetWriteAuthorityMigration.includes(
    "public.is_takatak_authorized_session()",
  ) ||
  !vendorAssetWriteAuthorityMigration.includes("FROM public.vendors AS v") ||
  !vendorAssetWriteAuthorityMigration.includes("TO authenticated") ||
  !vendorAssetWriteAuthorityMigration.includes("WITH CHECK (") ||
  !vendorAssetWriteAuthorityMigration.includes(
    "public.can_manage_vendor_asset(name)",
  )
) {
  violations.push(
    "vendor asset mutations must require TAKATAK authorization, vendor ownership and canonical owner-scoped paths",
  );
}

if (
  !vendorAssetService.includes("SIGNED_URL_TTL_SECONDS = 60 * 60") ||
  !vendorAssetService.includes(".remove([path])") ||
  !vendorAssetUploadComponent.includes(
    "await deleteVendorAsset(path).catch(() => undefined)",
  ) ||
  !vendorSettingsRoute.includes("await setVendorAssetUrl(vendor.id, field, path)") ||
  !vendorSettingsRoute.includes("await deleteVendorAsset(previous)")
) {
  violations.push(
    "vendor branding lifecycle must use short-lived signed URLs and clean up failed/replaced uploads",
  );
}

if (
  !vendorAssetStorageMigration.includes("4194304") ||
  !vendorAssetStorageMigration.includes("'image/png'") ||
  !vendorAssetStorageMigration.includes("'image/jpeg'") ||
  !vendorAssetStorageMigration.includes("'image/webp'") ||
  !vendorAssetStorageMigration.includes("'image/gif'") ||
  !vendorAssetService.includes("EXTENSION_BY_MIME") ||
  !vendorAssetService.includes("crypto.randomUUID()") ||
  !vendorAssetService.includes("upsert: false") ||
  vendorAssetService.includes('file.name.split(".")')
) {
  violations.push(
    "vendor asset uploads must enforce server-side MIME/size limits and use canonical collision-resistant object names",
  );
}

if (
  !databaseLintCleanupMigration.includes(
    "ALTER FUNCTION public.normalize_canadian_checkout_address(jsonb, text)",
  ) ||
  !databaseLintCleanupMigration.includes("STABLE;") ||
  databaseLintCleanupMigration.includes("v_existing_order_id")
) {
  violations.push(
    "database lint cleanup must keep checkout normalization STABLE and remove the unused existing-order variable",
  );
}

if (
  !deployWorkflow.includes('"${GITHUB_REF}" != "refs/heads/main"') ||
  !deployWorkflow.includes(
    "manual production deployment is allowed only from refs/heads/main",
  )
) {
  violations.push(
    "manual production deployment must be impossible from non-main branches",
  );
}

if (
  !deployWorkflow.includes(
    'if [ "$SITE_URL" != "https://1lv.ca" ]; then',
  ) ||
  !deployWorkflow.includes(
    "PRODUCTION_URL must be exactly https://1lv.ca.",
  )
) {
  violations.push(
    "production deployment health and rollback checks must target only the canonical https://1lv.ca origin",
  );
}

if (
  !deployWorkflow.includes('test -f "$PREVIOUS_RELEASE/package.json"') ||
  !deployWorkflow.includes('test -d "$PREVIOUS_RELEASE/node_modules"') ||
  !deployWorkflow.includes(
    'test -f "$PREVIOUS_RELEASE/dist/server/server.js"',
  ) ||
  !deployWorkflow.includes(
    'cp "$PREVIOUS_RELEASE/package-lock.json" "$APP_ROOT/package-lock.json.new"',
  ) ||
  !deployWorkflow.includes('rm -f "$APP_ROOT/package-lock.json"')
) {
  violations.push(
    "MochaHost rollback must validate the complete previous runtime and restore package metadata consistently",
  );
}

if (
  !deployWorkflow.includes("always() &&") ||
  !deployWorkflow.includes("steps.activate.outcome == 'failure'") ||
  !deployWorkflow.includes("steps.health.outcome == 'failure'")
) {
  violations.push(
    "MochaHost rollback must run after either a partial activation failure or a failed production health check",
  );
}

if (
  !deployWorkflow.includes("id: rollback") ||
  !deployWorkflow.includes("id: rollback_health") ||
  !deployWorkflow.includes("Rollback health check attempt") ||
  !deployWorkflow.includes("payload.revision !== process.env.RECOVERED_SHA") ||
  !deployWorkflow.includes("Manual production recovery is required")
) {
  violations.push(
    "MochaHost rollback must verify the restored release health and never claim recovery when verification fails",
  );
}

if (
  !deployWorkflow.includes('FAILED_SHA="$2"') ||
  !deployWorkflow.includes(
    'if [ "$CURRENT" != "$FAILED_SHA" ]; then',
  ) ||
  !deployWorkflow.includes(
    "Existing production release remains active; no rollback switch is required.",
  ) ||
  !deployWorkflow.includes(
    "CURRENT does not contain a valid full Git SHA.",
  ) ||
  !deployWorkflow.includes(
    "PREVIOUS does not contain a valid full Git SHA.",
  ) ||
  !deployWorkflow.includes(
    'if [ "$PREVIOUS" = "$FAILED_SHA" ]; then',
  )
) {
  violations.push(
    "MochaHost rollback must not move an untouched production release and all release pointers must be validated as full Git SHAs",
  );
}

const migrateProductionWorkflow = readFileSync(
  join(root, ".github/workflows/migrate-production-db.yml"),
  "utf8",
);

if (
  !ciWorkflow.includes(
    "supabase db lint --local --schema public --level warning --fail-on warning",
  ) ||
  !deployWorkflow.includes(
    "supabase db lint --local --schema public --level warning --fail-on warning",
  ) ||
  !migrateProductionWorkflow.includes(
    "supabase db lint --local --schema public --level warning --fail-on warning",
  )
) {
  violations.push(
    "all database validation workflows must fail on PostgreSQL lint warnings",
  );
}

if (
  !migrateProductionWorkflow.includes(
    "production migration apply is allowed only from main or the certified 1LV hardening branch",
  ) ||
  !migrateProductionWorkflow.includes(
    "refs/heads/main|refs/heads/upgrade/persistent-commerce-settings",
  )
) {
  violations.push(
    "manual production migration apply must be constrained to approved refs",
  );
}

if (
  !takatakDrainWorkflow.includes(
    'if [ "$SITE_URL" != "https://1lv.ca" ]; then',
  ) ||
  !inventoryMaintenanceWorkflow.includes(
    'if [ "$SITE_URL" != "https://1lv.ca" ]; then',
  ) ||
  !takatakDrainWorkflow.includes(
    'if [ "${#DRAIN_SECRET}" -lt 32 ]; then',
  ) ||
  !inventoryMaintenanceWorkflow.includes(
    'if [ "${#MAINTENANCE_SECRET}" -lt 32 ]; then',
  )
) {
  violations.push(
    "scheduled internal jobs must validate 32-character secrets and send them only to the canonical https://1lv.ca origin",
  );
}

if (
  !deployWorkflow.includes("Verify production database and Auth prerequisite") ||
  !deployWorkflow.includes("SUPABASE_ACCESS_TOKEN") ||
  !deployWorkflow.includes("SUPABASE_DB_PASSWORD") ||
  !deployWorkflow.includes("supabase migration list --linked") ||
  !deployWorkflow.includes("supabase db push --linked --dry-run") ||
  !deployWorkflow.includes(
    "https://api.supabase.com/v1/projects/$EXPECTED_PROJECT_REF/config/auth",
  )
) {
  violations.push(
    "production deployment must fail closed before SSH unless the exact 1LV database is current and hosted Auth is locked down",
  );
}

if (
  !publicCategoryCatalogScopeMigration.includes(
    "CREATE OR REPLACE FUNCTION public.list_public_catalog_products_for_category",
  ) ||
  !publicCategoryCatalogScopeMigration.includes(
    "v.subscription_status IN ('active', 'trialing')",
  ) ||
  !publicCategoryCatalogScopeMigration.includes(
    "NOT p.track_inventory OR p.inventory_quantity > 0",
  ) ||
  !publicCatalogService.includes(
    '"list_public_catalog_products_for_category" as never',
  ) ||
  !productRoute.includes("listPublicCatalogProductsForCategory") ||
  !productRoute.includes("listPublicCatalogProductsForVendor") ||
  !productRoute.includes("getPublicCatalogVendorBySlug") ||
  productRoute.includes("listPublicCatalogProducts()") ||
  productRoute.includes("listPublicCatalogVendors()")
) {
  violations.push(
    "product detail must use targeted vendor/category/public-vendor queries instead of globally limited catalog lists",
  );
}

if (
  !publicVendorCatalogScopeMigration.includes(
    "CREATE OR REPLACE FUNCTION public.list_public_catalog_products_for_vendor",
  ) ||
  !publicVendorCatalogScopeMigration.includes(
    "v.subscription_status IN ('active', 'trialing')",
  ) ||
  !publicVendorCatalogScopeMigration.includes(
    "NOT p.track_inventory OR p.inventory_quantity > 0",
  ) ||
  !publicCatalogService.includes(
    '"list_public_catalog_products_for_vendor" as never',
  ) ||
  !publicStoreRoute.includes("listPublicCatalogProductsForVendor") ||
  publicStoreRoute.includes("(await listPublicCatalogProducts()).filter")
) {
  violations.push(
    "vendor storefronts must use a vendor-scoped public catalog query instead of filtering a globally limited catalog",
  );
}

if (
  !vendorAssetPublicReadScopeMigration.includes(
    "CREATE OR REPLACE FUNCTION public.can_read_vendor_asset",
  ) ||
  !vendorAssetPublicReadScopeMigration.includes(
    "v.subscription_status IN ('active', 'trialing')",
  ) ||
  !vendorAssetPublicReadScopeMigration.includes(
    "public.is_takatak_authorized_session()",
  ) ||
  !vendorAssetPublicReadScopeMigration.includes(
    'CREATE POLICY "vendor-assets scoped read"',
  ) ||
  !vendorAssetPublicReadScopeMigration.includes(
    'DROP POLICY IF EXISTS "vendor-assets public read"',
  )
) {
  violations.push(
    "vendor branding reads must be limited to referenced public assets or authorized owner/admin sessions",
  );
}

if (
  !firstOrderRefundedHistoryMigration.includes(
    "'partially_refunded'",
  ) ||
  !firstOrderRefundedHistoryMigration.includes("'refunded'") ||
  !firstOrderRefundedHistoryMigration.includes(
    "Promotion is available on the first paid order only",
  )
) {
  violations.push(
    "first-order promotions must treat fully refunded orders as prior paid history",
  );
}

if (
  !firstOrderEmailHistoryMigration.includes(
    "NEW.customer_id IS NOT NULL",
  ) ||
  !firstOrderEmailHistoryMigration.includes("o.customer_id = NEW.customer_id") ||
  !firstOrderEmailHistoryMigration.includes(
    "lower(btrim(COALESCE(o.customer_email",
  ) ||
  !firstOrderEmailHistoryMigration.includes(
    "OR lower(btrim(COALESCE(o.customer_email",
  )
) {
  violations.push(
    "first-order promotions must count prior paid history by customer id or normalized email, including guest-to-account transitions",
  );
}

if (
  consolidatedMarketplaceAuthorityMigration.includes(
    "CREATE TRIGGER enforce_vendor_marketplace_fields_trigger",
  ) ||
  consolidatedMarketplaceAuthorityMigration.includes(
    "CREATE TRIGGER enforce_product_marketplace_fields_trigger",
  )
) {
  violations.push(
    "consolidated marketplace authority must not recreate superseded vendor/product triggers",
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
