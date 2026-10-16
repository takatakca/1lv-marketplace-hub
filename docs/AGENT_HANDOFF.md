# 1LV.CA — AGENT HANDOFF

## 2026-10-16 — Code + isolated database suite VERIFIED

- **Last fully validated source commit:** `39816dda18be1624dd8e1b05a2cc8f0201e71b47`.
- **Exact-head CI:** [GitHub Actions 38953845179 SUCCESS](https://github.com/takatakca/1lv-marketplace-hub/actions/runs/38953845179). The **cart** job passed `npm ci`, cart/payment/guest-storage/merge regressions, ESLint, schema marker, Vite build and TypeScript. The **database** job started local Supabase Docker, replayed all migrations and ran 11 pgTAP test files (including transactional signed-session-like fixture, duplicate merge key, changed-payload rejection and cross-customer isolation). This local test does **not** prove production authorization or live Stripe operation.
- **Latest task completed:** new `20261016191000_idempotent_guest_cart_merge.sql` records transactionally idempotent results per (customer, merge key), checks TAKATAK session, applies restrictive RLS, denies browser access to the legacy non-idempotent function; client keeps a durable merge attempt for lost acknowledgments. Repaired invalid composite `SELECT INTO` in `20261003064500_account_persistent_cart.sql`. Updated global database integrity test schema version, health/deployment schema guards, and CI.
- **Files changed since last handoff:** `src/lib/cart-merge-intent.ts`, `src/services/account-cart.ts`, `src/hooks/use-cart.tsx`, `scripts/guest-cart-merge-tests.mjs`, both SQL migrations above, `supabase/tests/database/guest_cart_merge_idempotency_test.sql`, `supabase/tests/database/production_integrity_test.sql`, `src/routes/api/public/health.ts`, `.github/workflows/deploy.yml`, `.github/workflows/migrate-production-db.yml`, `.github/workflows/ci-cart-integration.yml`, documentation/WORKLOG.
- **Current task:** add/verify high-severity production dependency audit to PR CI; investigate #6/PR #10 without breaking lockfile. Confirm the CI of any newer SHA, especially a documentation-only commit.
- **Open risks:** concurrent tabs could begin distinct merge keys before seeing a shared journal; assess browser cross-tab tests and guest intent recovery. App and database CI are not live acceptance tests.
- **Deployment:** NO PRODUCTION MIGRATION OR MERGE; PR #12 remains DRAFT based on #8. Expected 1LV Supabase project `odoybkshqszucvoxzjyz` is unavailable in the current connector. MochaHost/TanStack production health, real signed Stripe webhooks, JWT/RLS with real identities, runtime audit and rollback gates still require verification.
- **Access needed:** permission to the dedicated 1LV project and its backup, authorized MochaHost logs and release pipeline settings, Stripe test credentials (never commit secret values); no new billable Supabase project.
- **Exact next action:** read latest GitHub PR #12 SHA and CI, fix audit failures if any; verify Supabase project availability and migration deployment gates before any production release. Keep `main` untouched until safe.


## 2026-10-16 — Current development handoff

- **GitHub baseline:** `b30420958bb1c1a978b0b70e7597836a1ad7a42b`, verified CI [38616013334](https://github.com/takatakca/1lv-marketplace-hub/actions/runs/38616013334).
- **Working branch:** `upgrade/account-cart-ui-20261014`, draft PR #12 stacked on PR #8; `main` is not authorized for an unverified financial rollout.
- **Last task developed:** idempotent guest cart merge with a durable browser journal and new account-bound PostgreSQL RPC; old non-idempotent RPC revoked for browser roles. Code files: `src/lib/cart-merge-intent.ts`, `src/services/account-cart.ts`, `src/hooks/use-cart.tsx`, `scripts/guest-cart-merge-tests.mjs`, new SQL migration and pgTAP test, version guards in health + workflows and updated CI.
- **Verification:** new code must complete exact-head CI including `npm ci`, cart/payment/merge regressions, lint, build, TypeScript, version guard; **SQL local replay/pgTAP required before production certification**. This handoff text is written before its own resulting Git SHA exists: obtain actual head SHA/CI from GitHub.
- **Known edge:** concurrent tabs can create separate merge attempts if they race to initialize storage; test this scenario before public release. Do not claim full distributed exactly-once guarantees until browser/Supabase integration is tested.
- **Deployment:** NO MERGE, NO LIVE MIGRATION, NO VERIFIED DEPLOYMENT. Expected production Supabase project `odoybkshqszucvoxzjyz` is not accessible with the connected credentials. Preserve full rollback; do not create billable Supabase projects.
- **Access required:** permitted connection to the exact 1LV Supabase project; secure GitHub/host configuration and Stripe test-mode access, no secret values in repo.
- **Next action:** read PR #12 exact head and Actions; fix failures; run full isolated Supabase migration replay/pgTAP. Then review legacy merge callers and concurrent-tab behavior, address remaining #6/PR #11 vulnerabilities and, only after financial/auth acceptance, follow `docs/DEPLOYMENT.md`.


## Latest verified code and next task — 2026-10-14

**Latest verified code commit:** `6a12e57a3edca4bde0b1eef6e84da42b420e936f`.

**GitHub Actions verification:** [run 38615696004 — SUCCESS at that exact SHA](https://github.com/takatakca/1lv-marketplace-hub/actions/runs/38615696004). Passed locked install, cart/payment/guest context regressions, scoped ESLint, schema guard, production build and TypeScript. These checks do **not** certify the Supabase production data, Stripe payments or MochaHost deployment.

**Last completed task:** prevent misleading empty records when data reads fail and prevent stale cross-account display. `src/routes/orders.tsx`, `src/routes/wishlist.tsx`, `src/routes/admin.index.tsx` now distinguish genuine empty datasets from load errors and offer retry; order/admin state resets or is owner-keyed. The PR CI lint scope was updated.

**Active next task:** resolve backend guest-cart merge idempotency and saved delivery addresses with SQL/RLS/CI validation, only when the correct Supabase environment can be safely tested. Independently coordinate dependency vulnerability #6/PR #10 and lockfile PR #11. No unsafe DB edits in other TAKATAK projects.

**Current draft branch:** `upgrade/account-cart-ui-20261014`, stacked PR #12 on PR #8. Last pushed code SHA above; to obtain this handoff's own latest documentation SHA read `git rev-parse HEAD` or [PR #12 commits](https://github.com/takatakca/1lv-marketplace-hub/pull/12/commits).

**Release blocker rechecked:** Supabase connection lists several TAKATAK projects but NOT required 1LV reference `odoybkshqszucvoxzjyz`. HTTP health verification from external environments was unsuccessful (one 403; one DNS resolution failure), which is **not** proof of site downtime. No live migration, signed Stripe payment test, `main` merge or MochaHost deployment has occurred. **Do not merge PR #8/#12** without the gates in `docs/DEPLOYMENT.md`.


## 2026-10-14 — Read-failure honesty and account isolation

Latest code batch on PR #12 changes `src/routes/orders.tsx`, `src/routes/wishlist.tsx`, `src/routes/admin.index.tsx`, `.github/workflows/ci-cart-integration.yml` and `WORKLOG.md`. Order histories, wishlists and admin metrics now show an explicit retryable error when their reads fail rather than falsely asserting no records. Account switching cannot expose the previously selected user's order rows. Obtain current head SHA via PR #12 and verify its own CI before claiming success. This change does not apply migrations or deploy.

## Certified latest coding checkpoint — 2026-10-14

- **Last verified code SHA:** `0edcc3a1c48982d8a55425feca42b5a1102ea83f`
- **CI SUCCESS:** [1LV Account Cart Integration run 38614892717](https://github.com/takatakca/1lv-marketplace-hub/actions/runs/38614892717). Checked `npm ci`, cart model, payment-status and guest payment-storage regressions, scoped ESLint, schema marker, Vite production build and TypeScript. This is not a real Stripe integration test or production deployment.
- **Files in the code change:** `src/services/guest-payment.ts`, `src/routes/order-confirmation.tsx`, `src/routes/orders.$id.tsx`, `src/lib/payment-status.ts`, `src/components/PaymentBadge.tsx`, `scripts/payment-status-tests.mjs`, `scripts/guest-payment-tests.mjs`, `.github/workflows/ci-cart-integration.yml`, `WORKLOG.md`, `docs/AGENT_HANDOFF.md`.
- **Outcome:** preserve authorized guest lookup key within its original browser session after settled payment while discarding the payment capability; allow guest order details and permitted retry; remove fabricated shipment/tracking fallback; recognize partial refunds as a real terminal status, never charge them again.
- **Latest documentation commit:** this handoff refresh follows `0edcc3a`; obtain its own SHA via `git rev-parse HEAD` or [PR #12 commits](https://github.com/takatakca/1lv-marketplace-hub/pull/12/commits).
- **Deployment status:** **NOT DEPLOYED**. The expected 1LV Supabase project `odoybkshqszucvoxzjyz` is still absent from the connected project list; no remote migration applied or signed Stripe and RLS QA performed. Host HTTP request returned 403 in an external read, not proof of downtime.
- **Exact next action:** confirm latest head SHA and CI, then implement server-side idempotent guest merge and authorized address storage on a separate reviewed migration once correct Supabase access and local DB test facilities are available; independently remediate dependency runtime vulnerabilities #6/PR #10 and coordinate PR #11. Do not merge PR #8 or #12 until the full checklist in `docs/DEPLOYMENT.md` passes.


## 2026-10-14 — Guest order integrity continuation

New code batch after `29da1e9` repairs guest receipt lookup by preserving checkout key while removing the payment token after settlement, enables guest `/orders/$id` lookup/retry via the original session, removes fictitious shipped/tracking information from inaccessible orders, and distinguishes partial refunds. Added `scripts/guest-payment-tests.mjs` and expanded CI/payment-status cases. Exact new code SHA and CI conclusion must be retrieved from PR #12; DO NOT MERGE and no remote schema changes.

## 2026-10-14 — Latest code pushed and validation

- Documentation baseline: `89610f0e328c3c3e5a2e602e4af76bfbfccf71d0`, **GitHub Actions 38613657563 SUCCESS**: https://github.com/takatakca/1lv-marketplace-hub/actions/runs/38613657563
- Latest pushed **code** commit at time of this update: `ba1702564d4af19e332f5b27b06c07a3af1c1a67`. Adds `src/lib/payment-status.ts`, `scripts/payment-status-tests.mjs`, status corrections in `src/routes/order-confirmation.tsx` and test/lint steps in `.github/workflows/ci-cart-integration.yml`.
- Code CI run **38613941139**: https://github.com/takatakca/1lv-marketplace-hub/actions/runs/38613941139 — queued at last inspection; do not mark this code certified unless this exact SHA concludes SUCCESS.
- This documentation refresh is committed separately; its own resulting SHA must be read from PR #12 or `git rev-parse HEAD`.
- Real deployment remains **NOT VERIFIED / NOT PERFORMED**; an attempt to view `https://1lv.ca` through an external reader returned 403, and the public health endpoint could not be read. These web access failures are not proof the site itself is offline.
- Next exact action: inspect run 38613941139 and the newest run on PR #12; if failed, inspect job logs and fix the same branch. If green, continue the next independent task, preserving PR #8 migration/security release gates.


Updated 2026-10-14. **Not a claim of deployment.** Read `AGENTS.md`, `WORKLOG.md`, `.agent/CONTINUATION.md`, PRs #8/#11/#12 and GitHub Actions before any write.

## Latest completed task

The last exact-head **CI-verified** checkout/cart changes prior to this documentation: commit `0880c42d57e200d620fceb301cfdeba87aabf3b2` passed [Actions 38609556895](https://github.com/takatakca/1lv-marketplace-hub/actions/runs/38609556895). Checkout now preserves an unpaid basket and verifies status via backend. This document addition requires its **own new** CI check.

## Task currently in progress

Add reliable presentation and regression tests for paid/pending/failed/refunded/unknown Stripe order status; keep PR #12 in draft, update exact-head CI evidence after code push.

## Repository and pushed SHA

`takatakca/1lv-marketplace-hub`; main observed at `b73b37343b339138617e92654265f76375161427`; active branch `upgrade/account-cart-ui-20261014` stacked on PR #8. Last pushed SHA *at the start of this work*: `0880c42d57e200d620fceb301cfdeba87aabf3b2`. **For the latest current SHA including this document** read `git rev-parse HEAD` after pulling the branch or the [PR commits](https://github.com/takatakca/1lv-marketplace-hub/pull/12/commits). A commit cannot embed its own resulting SHA; do not invent one.

## Files changed in this handoff batch

`AGENTS.md` and `BRAND.md` restored from main; `WORKLOG.md`, `.agent/CONTINUATION.md`; `docs/PROJECT_STATUS.md`, `docs/TASK_QUEUE.md`, `docs/AGENT_HANDOFF.md`, `docs/DEPLOYMENT.md`, `docs/DECISIONS.md`.

## Commands/verification evidence

Connector read of actual repository, branches, latest PR/issues, workflow results and prior agent handoff. Previously successful CI ran locked npm install, cart model regressions, lint, schema consistency check, build and TypeScript (run 38609556895). The current batch must be checked independently. Commands for the next CI phase: `npm ci`, `node scripts/cart-model-tests.mjs`, `node scripts/payment-status-tests.mjs` once added, `node scripts/check-schema-marker.mjs`, `npm run build`, `npx tsc --noEmit`.

## Known issues, environment and deploy status

- Connected Supabase project listing did not include the expected 1LV project `odoybkshqszucvoxzjyz`. No production migrations/auth/RLS proof.
- Draft PR #8 is marked **DO NOT MERGE**; PR #12 is stacked. #6/#10 dependency security findings, PR #11 npm lock drift.
- Guest merge exactly-once under lost HTTP acknowledgement remains unimplemented; post-payment targeted cart cleanup not verified.
- Last documented main live deploy workflow [37750107702](https://github.com/takatakca/1lv-marketplace-hub/actions/runs/37750107702) failed during `npm ci`. No new release performed here.

## Access required — names only, never values

Correct 1LV Supabase project access, migration/backup authorization, dedicated GitHub Actions/host server keys, Stripe test-mode verification access, MochaHost deployment/logs. Do not repurpose credentials for TAKATAK V1 or another tenant.

## Next exact action

Fetch the latest branch SHA and PR #12 Actions run, fix any failed job using its logs, update this file with the last verified code SHA/run, then implement the next independent task in `docs/TASK_QUEUE.md`. **Never deploy/fuse a stacked PR without the documented security/database/payment gates.**
