# 1LV.CA — PROJECT STATUS

Reviewed 2026-10-14. **Advanced code, NOT certified or deployed as a complete production system.**

- Repository: https://github.com/takatakca/1lv-marketplace-hub
- Publication branch: `main`, observed SHA `b73b37343b339138617e92654265f76375161427`.
- Active stacked branch: `upgrade/account-cart-ui-20261014` / [PR #12](https://github.com/takatakca/1lv-marketplace-hub/pull/12), based on `upgrade/persistent-commerce-settings` / PR #8.
- Last CI-certified commit before this documentation: `0880c42d57e200d620fceb301cfdeba87aabf3b2`, [successful action](https://github.com/takatakca/1lv-marketplace-hub/actions/runs/38609556895).
- Current exact branch SHA must be taken from `git rev-parse HEAD` or PR #12 after each new commit. Do not treat the SHA above as the latest after subsequent changes.

## Features already in the stacked code

TanStack Start/React storefront, Canadian checkout calculations, server-authoritative price/stock/discount order creation, Stripe authorization/refunds, multivendor products/SKUs/search/reviews, parcel shipments and returns, seller analytics, promotions, saved lists, TAKATAK-authorized account carts and guest-cart merge. Most advanced functions rely on migrations not yet applied to the 1LV production database.

## Non-negotiable release blockers

1. Supabase expected project `odoybkshqszucvoxzjyz` was not accessible to the connected Supabase credential during prior verification. **No migration or live RLS test completed.**
2. PR #8 says **DO NOT MERGE**; PR #12 depends on it. `main` currently uses a static-only Node entrypoint, not the full hardened TanStack backend.
3. Resolve dependency vulnerability issue #6/PR #10 and `npm ci` lock drift PR #11; examine shipped runtime tree.
4. Configure necessary server-only Stripe, Supabase and TAKATAK secrets in secure deployment settings; verify payment/webhook/account permissions against authorized targets.
5. Verify the actual version on MochaHost via production `/api/public/health`, expected revision SHA and database version; have a reversible deployment/rollback.

See `docs/TASK_QUEUE.md`, `docs/DEPLOYMENT.md`, `docs/AGENT_HANDOFF.md`.
