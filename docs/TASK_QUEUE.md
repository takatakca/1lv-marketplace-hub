# 1LV.CA — TASK QUEUE

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
| P1 | TO DO | Make guest-to-account cart merge server-idempotent under lost responses; test duplicate/retry and customer isolation. |
| P1 | TO DO | Save shipping addresses linked to authorized identity only; protected DB schema/API, account/checkout UI and RLS tests. |
| P1 | TO DO | On verified paid checkout, reconcile only the purchased cart lines, preserving later additions from other tabs. |
| P1 | BLOCKED — QA | Real test-mode checkout, refunds, webhook replay, auth/session changes and vendor visibility acceptance matrix. |
| P2 | TO DO | Canadian French, responsive UX, accessibility, performance, monitoring and operational playbooks. |

**Next executable step:** read PR #12 head and its CI logs, finish an independent checkout/cart reliability fix, push to the same stacked branch, update the handoff. Avoid unsafe main deployment until gates clear.
