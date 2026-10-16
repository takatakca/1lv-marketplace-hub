# 1LV.CA — TASK QUEUE

**Verified code checkpoint 2026-10-16:** 39816dda18be1624dd8e1b05a2cc8f0201e71b47 (CI 38953845179 SUCCESS: 2 jobs, local migration replay and pgTAP). Production remains blocked; next tasks are runtime dependency audit, multi-tab merge concurrency QA, real 1LV database/Stripe acceptance and MochaHost release verification.

**2026-10-16 checkpoint:** PR #12 includes in-progress idempotent account-guest cart merge implementation; code CI and database replay must be verified at its exact new SHA. Production Supabase still unavailable; do not apply live migration.


**UI reliability code complete and CI green (not deployed):** commit `6a12e57` addresses truthful read failures across orders/wishlist/admin; [run 38615696004](https://github.com/takatakca/1lv-marketplace-hub/actions/runs/38615696004). Next executable tasks prioritize server-idempotent guest cart merge and authorized addresses once isolated 1LV DB testing is available. Continue resolving runtime security findings and the production full-stack gate.


**New completed-in-code checkpoint:** guest order lookup and payment-status UX `0edcc3a`; CI SUCCESS run 38614892717. Browser/RLS/Stripe integration and production release still pending. Next safe backend priorities: idempotent guest merge and tenant-isolated shipping addresses under authorized Supabase project with tests.


**Code milestone:** `ba1702564d4af19e332f5b27b06c07a3af1c1a67` adds 11 payment-status regression cases and honest paid/pending/failed/refunded/unknown UX. Await exact-head CI before marking this item complete; database and production acceptance remain blocked.


Reviewed 2026-10-14. Ordered by release risk; update status only with verifiable evidence.

| Priority | Status | Work / acceptance |
| --- | --- | --- |
| P0 | IN PROGRESS — PR #12 | Correct checkout payment statuses, retry/error states and guest/account cart edges; exact-head build, lint, TypeScript and targeted regressions green. |
| P0 | BLOCKED — access | Verify ownership and access to 1LV Supabase `odoybkshqszucvoxzjyz`. Confirm backup and migration history before production changes; never use another TAKATAK database in its place. |
| P0 | BLOCKED — PR #8 | Replay complete migrations on an isolated database and verify TAKATAK JWT/RLS, public grants, cross-customer/vendor isolation, checkout idempotency, refunds, inventory and signed webhooks. |
| P0 | BLOCKED — production | Verify complete TanStack Start Node runtime on MochaHost, secrets, health SHA, security audit and rollback before merging PR #8/#12. |
| P1 | OPEN — #6/#10 | Remediate high-risk runtime npm vulnerabilities without forced breaking upgrades; validate shipped dependency tree. |
| P1 | OPEN — PR #11 | Integrate npm dependency lockfile fix safely with stacked work after release gates. |
| P1 | OPEN — PR #9 | Remove authenticated demo fallback and verify truthful empty states. |
| P1 | CODE CI COMPLETE / BROWSER QA PENDING | Server-idempotent guest merge under lost responses; local pgTAP + model tests pass. Still validate concurrent-tab races, live 1LV auth and production migration. |
| P1 | TO DO | Save shipping addresses linked to authorized identity only; protected DB schema/API, account/checkout UI and RLS tests. |
| P1 | TO DO | On verified paid checkout, reconcile only the purchased cart lines, preserving later additions from other tabs. |
| P1 | BLOCKED — QA | Real test-mode checkout, refunds, webhook replay, auth/session changes and vendor visibility acceptance matrix. |
| P2 | TO DO | Canadian French, responsive UX, accessibility, performance, monitoring and operational playbooks. |

**Next executable step:** read PR #12 head and its CI logs, finish an independent checkout/cart reliability fix, push to the same stacked branch, update the handoff. Avoid unsafe main deployment until gates clear.
