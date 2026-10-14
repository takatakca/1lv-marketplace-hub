# 1LV.CA — Agent continuation / durable handoff

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

- Source committed on the stacked branch. **Actual CI result pending** until a PR workflow runs. Inspect SHA-specific run, logs and exact failing line; repair before calling tested.
- No authorized live 1LV Supabase database test; local pgTAP evidence from parent PR is *not* proof of this UI integration.
- No payment/Stripe test or live merchant test performed this session.
- **Production: blocked; DO NOT MERGE OR DEPLOY this branch** until database migration, auth, identity, checkout and server smoke gates pass.
- Frontend cart price display is informational. Real checkout remains server-authoritative.
- Never bypass migration gates, expose service-role tokens, or send secret values into documentation.

## Next exact steps (in order)

1. Open stacked cart PR, verify its CI; fix errors in code, test and TS at the branch head until green.
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
- Last failed production deploy: https://github.com/takatakca/1lv-marketplace-hub/actions/runs/37750107702
