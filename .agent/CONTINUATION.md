# 1LV.CA — Agent continuation / durable handoff

Verified 2026-10-14 code checkpoint: `0edcc3a1c48982d8a55425feca42b5a1102ea83f`, Actions run `38614892717` SUCCESS. Guest payment capability cleanup now preserves session-scoped receipt lookup, fake tracking fallback removed, partial refunds distinguished. Canonical durable report: `docs/AGENT_HANDOFF.md`. No main merge or production deploy, live 1LV Supabase access unavailable.


Latest note 2026-10-14: Full canonical agent handoff now lives in `docs/AGENT_HANDOFF.md`; baseline docs commit `89610f0` passed Actions 38613657563; payment status code commit `ba17025` is awaiting Actions 38613941139 at last check. No live migration, main merge or production deployment has been performed. Continue from GitHub head, not this historical snapshot.


Updated: **2026-10-14** (GitHub connector session).
Read this before changing anything. Check the *live* GitHub commit/PR/workflow state first; this record is a handoff, not proof production is live.

## Project and business boundaries

- Repository: `takatakca/1lv-marketplace-hub`; default branch: `main`.
- 1LV is a Canada-first multi-vendor marketplace. TAKATAK V1 is authoritative for shared identity; 1LV owns its commerce catalog, checkout, orders, payment/financial state and vendor isolation.
- Central TAKATAK site `takatak.ca` and its `takatak-v1` production infrastructure are out of scope for this branch.
- App stack: React, TanStack Start, Vite, Supabase PostgreSQL/Auth, Stripe integration, MochaHost GitHub CI artifact deployment.
- Independent application: do not expose 1LV vendor commerce records to other merchants or take over TAKATAK's master CRM.

## Verified GitHub state at handoff

- `main` at `b73b37343b339138617e92654265f76375161427` (recheck for updates).
- Most recent **main production deployment run 37750107702 FAILED** at `npm ci` (lockfile mismatch); build/SSH/deploy were skipped.
- PR #11 `fix/main-dependency-lock-drift-20261013` corrects this. Exact SHA `1cb2305d8f2cfa99ce45493526321312ba0209e9` had successful workflow run **38507447611**, passing npm ci, build and TypeScript. It remains draft/unmerged.
- PRs #4, #7, #8, #9 and #10 remain outstanding. Read their dependencies, descriptions and migration requirements before code changes.
- PR #8 branch `upgrade/persistent-commerce-settings` was **not merged** and explicitly says **DO NOT MERGE** without full production database/payment/server authorization gates.
- The PR #8 tree includes `supabase/migrations/20261003064500_account_persistent_cart.sql`, defining authenticated 1LV cart RPCs, but `src/hooks/use-cart.tsx` remained browser-only at beginning of this session.
- Supabase project expected for 1LV by the earlier release checkpoint: `odoybkshqszucvoxzjyz`. The connected Supabase credential did not have access. **No migration applied or production schema verified.**

## Active unit of work — authenticated persistent cart

Branch: `upgrade/account-cart-ui-20261014`, **based on** `upgrade/persistent-commerce-settings`. This is a stacked code change; do not merge directly to main without its parent and migration gates.

Changes:
1. `src/lib/cart-model.ts`: pure guest cart normalization, stable line IDs, bounded quantities and mutation rules.
2. `src/services/account-cart.ts`: dedicated calls to existing `list_my_cart_items`, `merge_guest_cart`, `set_my_cart_item`, `clear_my_cart` RPCs. These do not create a second identity authority.
3. `src/hooks/use-cart.tsx`: authorized account hydration, guest-to-account merge, queue of absolute-quantity changes, guest storage isolation on sign-out, retry/error states. Account data is never cached in the browser's guest localStorage.
4. `src/routes/cart.tsx`: account sync visibility and retry, unavailable/low-stock handling and checkout gating while sync has failed.
5. `scripts/cart-model-tests.mjs`: regression cases for restored browser data, line identifiers, duplicate quantities and cart editing.
6. `.github/workflows/ci-cart-integration.yml`: scoped PR validation without migration/deployment.

## Tests and deployment status

- PR #12 created: https://github.com/takatakca/1lv-marketplace-hub/pull/12 (draft, base = PR #8 branch).
- Workflow run **38510344738 SUCCESS** at head `5ede6ec2f52bf10b713dbe235f1e6968523b8050`: npm ci, cart model regression, cart lint, application build, TypeScript and no-migration guard passed. Newer commits must be validated at their exact SHA before certification.
- npm ci on the stacked parent dependency graph reported **12 advisories (1 low, 10 high, 1 critical)** in run 38510154896. This is unresolved security work; consult existing issue #6 / PR #10 and verify a fresh runtime-only audit before production.
- Auth+RLS integration has *not* been tested against 1LV live/staging Supabase because project access is unavailable. Browser session-switch testing also remains open.
- Guest merge is not fully idempotent if a server RPC commits but its network response is lost; require a server idempotency key and migration review before claiming exactly-once behavior.
- No authorized live 1LV Supabase database test; local pgTAP evidence from parent PR is *not* proof of this UI integration.
- No payment/Stripe test or live merchant test performed this session.
- **Production: blocked; DO NOT MERGE OR DEPLOY this branch** until database migration, auth, identity, checkout and server smoke gates pass.
- Frontend cart price display is informational. Real checkout remains server-authoritative.
- Never bypass migration gates, expose service-role tokens, or send secret values into documentation.

## 2026-10-14 — Checkout/payment honesty continuation

On the cart PR branch, the subsequent checkout change guards direct `/checkout` access while an authenticated cart is still syncing, failed to sync, or contains unavailable/overstock lines. Abandoning Stripe no longer clears the cart or treats unpaid status as confirmed payment. The pending-payment flow keeps cart items if payment setup is unavailable, and the confirmation route states the real payment status (including unverified status) rather than celebrating an unverified order.

These are code changes, **not a production release**. The new commit needs exact-head CI verification and real browser/payment acceptance later. Outstanding: model a paid-order-specific cart cleanup only after verified Stripe webhook/order attribution; do not clear other tabs' or later-added cart items. No live payment, Supabase migration or secrets were modified.

## 2026-10-14 — Schema marker and release workflow consistency

Code-only follow-up aligns the deployment and health `EXPECTED_SCHEMA_VERSION` with the latest account-cart migration (`20261003064500`). A fail-closed `scripts/check-schema-marker.mjs` guard is wired to cart PR CI, main PR CI, production packaging/deploy and explicit production migration validation. This corrects a mismatch that would have rejected a correctly migrated 1LV runtime. The guard does **not** apply migrations or bypass existing release prerequisites.

The prior checkout correction at exact commit `8ddb1c693c18c464360d81fd5d6d461ac8650020` passed [GitHub Actions run 38608452178](https://github.com/takatakca/1lv-marketplace-hub/actions/runs/38608452178). The schema alignment commit must be checked at its own head. The Supabase connector still does not list project `odoybkshqszucvoxzjyz`. Do not touch TAKATAK STAGING or other project databases in its place.

## 2026-10-14 — Order-status reconciliation

PR #12 adds bounded visible-tab polling after Stripe returns (12 checks at five-second intervals), stopping at a backend-confirmed paid state, with manual refresh for delayed webhooks. Redirect flags are not proof of payment. Real webhook/browser acceptance remains pending. Schema alignment commit a354a7e passed GitHub Actions 38608917072.

## 2026-10-14 — Standard handoff documents

Added the five user-required durable project documents under `docs/`, restored `AGENTS.md` and `BRAND.md` from main on this stacked branch and updated `WORKLOG.md`. The active PR #12 remains a draft. Do not deploy before parent PR #8 gates are verified. The new documents track SHA by Git/PR inspection rather than guessing the hash of their own commit.

## Next exact steps (in order)

1. Verify the latest stacked PR #12 head SHA in GitHub Actions after any final code/doc commits; resolve any new CI failure before merging.
2. Independently review and test cart integration for auth session changes, offline writes, duplicate guest merges, out-of-stock variants, guest checkout, save/clear flows and cross-user isolation.
3. Maintain the parent PR #8 release constraints, **do not merge it to main automatically**; migrate only after approved backup, correct Supabase project authorization, full SQL review and acceptance tests.
4. Coordinate with PR #11 dependency-lock repair; rebase/merge correctly after branch checks, avoiding other agents' work loss.
5. Continue the next business-safe independent feature: saved delivery/checkout addresses, only after reviewing existing routes and confirmed TAKATAK Auth contract.
6. Verify MochaHost runs the *full* TanStack server bundle (not the current `main` static-only server); require verified exact SHA via a real server health/API response, Stripe test-mode webhook, and rollback plan.
7. When safe, update `WORKLOG.md` according to `AGENTS.md` on main, and update this continuation file before ending each coding session.

## Links

- Main GitHub: https://github.com/takatakca/1lv-marketplace-hub
- PR #8 backend release gate: https://github.com/takatakca/1lv-marketplace-hub/pull/8
- PR #11 dependency fix: https://github.com/takatakca/1lv-marketplace-hub/pull/11
- PR #12 stacked cart UI: https://github.com/takatakca/1lv-marketplace-hub/pull/12
- Latest previously successful cart CI: https://github.com/takatakca/1lv-marketplace-hub/actions/runs/38510344738
- Last failed production deploy: https://github.com/takatakca/1lv-marketplace-hub/actions/runs/37750107702
