# 1LV.CA — AGENT HANDOFF

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
