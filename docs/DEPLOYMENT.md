# 1LV.CA — DEPLOYMENT PLAYBOOK

**Current state: not deployed from stacked PR #8/#12.** Do not equate a green PR workflow with live release.

## Identified environment

- Target website: https://1lv.ca
- Host target documented in the repository: MochaHost/cPanel, Node.js 22, full TanStack Start runtime required.
- Production workflow: `.github/workflows/deploy.yml` on `main`, with packaging-only option, optional `AUTO_DEPLOY_ENABLED` activation, archive, server health check and release revision.
- Production DB workflow: `.github/workflows/migrate-production-db.yml`. **Never substitute the TAKATAK main or staging Supabase database for the dedicated 1LV project.**
- Compile on GitHub Actions, not on the limited-capacity MochaHost terminal.

## Before activation

1. Confirm exact Supabase reference `odoybkshqszucvoxzjyz`, backup/restore, pending migration list, full local replay, Security Advisor, correct TAKATAK authorized JWT/RLS, service grants and no cross-vendor visibility.
2. Run `npm ci`, `npm audit --omit=dev --audit-level=high`, lint, `npm run build`, `npx tsc --noEmit`, database tests, compiled Node smoke/API tests; resolve runtime vulnerabilities.
3. Ensure backend uses full TanStack Start bundle rather than static `main` server. Check schema marker `20261003064500` or newer with `node scripts/check-schema-marker.mjs`.
4. Configure protected server environment through deployment secret store: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CHECKOUT_GUEST_TOKEN_SECRET`, `TAKATAK_1LV_API_KEY`, scheduler secrets and required runtime values. Frontend uses only publishable keys. Never commit any secret or token.
5. Test Stripe in test mode: verified paid result, failed/cancelled payment, signed/invalid webhook, duplicate events, inventory expiry, refund and payout ledger behavior. Keep rollback artifacts ready.

## Post-deploy proof

Read the GitHub Actions run and its `GITHUB_SHA`, then verify HTTPS `https://1lv.ca/api/public/health` returns 200, `ok: true`, `runtime: "tanstack-start"`, `database: "ready"`, `revision` equal to that **exact** deployed commit. Do not enable `HEALTH_SKIP_DATABASE_CHECK` in production. Verify authorized storefront, cart, backend and order flows. If verification fails, rollback to a compatible release and investigate database compatibility separately.

## Known blocker

Prior live Supabase listing did not expose the 1LV project; no production migration, authenticated live payment test, or MochaHost deployment was performed in this handoff.
