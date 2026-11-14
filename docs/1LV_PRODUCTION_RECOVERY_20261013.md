# 1LV.CA — GitHub deployment recovery and release boundaries (2026-10-13)

## Evidence and immediate repair

Repository: `takatakca/1lv-marketplace-hub`; production workflow:
`.github/workflows/deploy.yml` (push to `main`).

GitHub Actions runs **37750107702** (2026-10-08) and **37745204680**
(2026-10-08) both stopped at **Install dependencies**.
The actual `npm ci` diagnostic was `EUSAGE`: package.json and
package-lock.json are not in sync. Four direct constraints had changed
while the lockfile remained on the prior versions:

| Direct dependency | Failed main's package.json | Committed lockfile root |
| --- | --- | --- |
| `@lovable.dev/vite-tanstack-config` | `2.23.1` | `2.13.1` |
| `@tanstack/react-router` | `1.170.41` | `^1.168.25` |
| `@tanstack/react-start` | `1.168.60` | `^1.167.50` |
| `@tanstack/router-plugin` | `1.168.42` | `^1.167.28` |

This isolated recovery branch restores only the four package.json
constraints to those in the existing committed lockfile. It does **not**
rewrite the transitive dependency tree or run `npm audit fix --force`.

The new `ci-main-validation.yml` tests `npm ci`, Node entrypoint syntax,
production asset build, and TypeScript on a pull request. Successful
GitHub Actions evidence, not the local manifest comparison alone, is
required to call the fix tested.

Do not switch production from `npm ci` to `npm install`; doing so would
hide this class of error rather than fix reproducibility.

## Separate high-priority release blockers

1. **Runtime mismatch on main:** `server.cjs` currently serves only
   `dist/client` static files and rejects non-GET/HEAD HTTP methods.
   The TanStack Start server-functions runtime is necessary for secure
   checkout, authorized server actions and Stripe webhooks. The
   more complete backend-aware `server.cjs` is present in open draft
   PR #8, which must be reviewed and certified separately. A green static
   asset build is **not** a functioning commerce backend.
2. **Staged financial/backend changes:** PR #4 and the stacked PRs
   #7, #8, #9, #10 are not fully released. **PR #8 explicitly says
   DO NOT MERGE** until its production migration and live gates pass.
   Do not selectively deploy its checkout changes without the
   appropriate database migrations and required server configuration.
3. **Database:** PR #8 specifies the 1LV Supabase project reference
   `odoybkshqszucvoxzjyz` and schema migration target
   `20261003060000`; its recorded production apply and remote
   verification were **not performed**. Do not apply migrations to
   TAKATAK V1's database or any other client application. Obtain
   verified backup/recovery, migration review, correct project access
   and staging/live test evidence before promotion.
4. **Security:** Issue #6 and PR #10 address npm vulnerabilities. Do
   not claim dependency security is resolved by this lock sync.
5. **Commerce:** Complete Stripe test-mode payments, webhook signature
   and replay handling, inventory reservation, auth and guest checkout,
   vendor boundaries, refunds and order replay protection before any
   customer-facing live checkout claim.
6. **Deploy correctness:** Current main workflow runs on a push to main
   (when enabled) and builds on GitHub for MochaHost. Confirm the
   server really executes the intended release, secure environment
   variables are present, and check an authenticated API/health
   endpoint and exact release revision, not merely HTTP 200 on /.
7. **Separate TAKATAK authority:** The source repository
   `takatakca/takatak-v1` has scoped master integration code under
   `src/lib/integrations/master-api/` and API routes under
   `src/app/api/v1/`. Availability and credentials in production
   remain unverified. 1LV must not replace TAKATAK identity authority
   or expose other merchants' records. Integrate only through
   approved contracts and tenant-scoped credentials.

## Safe release sequence

1. Review this isolated lock consistency PR and confirm its actual CI
   result. Do **not** merge it solely to trigger an auto-deploy while
   the main runtime is still static.
2. Coordinate the open feature PR stack; audit code changes, migration
   order, Node/Passenger runtime, security checks, and current release
   controls. Update/rebase branches without discarding other agents'
   work.
3. Verify the correct Supabase project and **recoverable** backup;
   review migration SQL, service credentials/permissions, and database
   hardening with the owner. Obtain release/migration authorization.
4. Deploy and test the full server runtime in a non-production
   environment. Run reliable `npm ci`, lint, build, typecheck,
   database/RLS tests, payment/Stripe webhooks and tenant tests.
5. Validate environment configuration through approved secret stores;
   record only key names and configuration *status*, never key values.
6. Promote the certified SHA to production through the approved gate,
   verify the deployed SHA and live server functions, health, auth,
   catalog and checkout; rollback on failure.
7. Update WORKLOG.md and the agent handoff with actual evidence, run
   links, remaining blockers and the next owner action.

## Current status at document creation

- Lockfile direct-spec consistency: **statically checked in this PR**.
- `npm ci`, build, TypeScript in new PR CI: **pending actual workflow result**.
- 1LV production database migration: **not verified**.
- Full-stack 1LV checkout in production: **not verified**.
- TAKATAK integration in 1LV production: **not verified**.
- Safe production release: **BLOCKED** until evidence and approval gates pass.

Links: [latest failed deploy](https://github.com/takatakca/1lv-marketplace-hub/actions/runs/37750107702),
[existing release checkpoint PR #8](https://github.com/takatakca/1lv-marketplace-hub/pull/8),
[security issue #6](https://github.com/takatakca/1lv-marketplace-hub/issues/6).
