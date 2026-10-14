# Work log

Newest first. Format: `YYYY-MM-DD | agent | branch → PR | status | what | next step`

- 2026-10-14 | ChatGPT | upgrade/account-cart-ui-20261014 → PR #12 | PR #12 | Orders/wishlist/admin read failure UX and account isolation 6a12e57 PASSED CI 38615696004; handoff refreshed | Blocked from production by Supabase project access, migrations, Stripe and security/rollback


- 2026-10-14 | ChatGPT | upgrade/account-cart-ui-20261014 → PR #12 | PR #12 | Distinguish unavailable order/wishlist/admin data from genuinely empty datasets, with retry and identity isolation | Verify exact-head CI; no production release


- 2026-10-14 | ChatGPT | upgrade/account-cart-ui-20261014 → PR #12 | PR #12 | Guest receipt/token cleanup, real order detail, no fake tracking and partial refund code at 0edcc3a PASSED CI 38614892717 | DB project access, idempotent cart merge and live Stripe/RLS gates remain


- 2026-10-14 | ChatGPT | upgrade/account-cart-ui-20261014 → PR #12 | PR #12 | Retain guest lookup key after payment, remove fake tracking, support partial refunds and guest detail/retry | Check exact-head CI and authorizations before release
- 2026-10-14 | ChatGPT | upgrade/account-cart-ui-20261014 → PR #12 | PR #12 | Payment status handling + 11 regression cases pushed as ba17025; docs 89610f0 CI successful | Check run 38613941139, fix if red, no production merge


- 2026-10-14 | ChatGPT | upgrade/account-cart-ui-20261014 → PR #12 | PR #12 | Restore AGENTS/BRAND and establish five durable status/queue/deploy/decisions/handoff docs | Continue status UX code and verify exact-head CI
- 2026-10-14 | ChatGPT | upgrade/account-cart-ui-20261014 → PR #12 | PR #12 | Reconcile payment status after Stripe redirect with bounded polling and manual refresh | Verify exact-head CI; real webhook acceptance later
- 2026-10-14 | ChatGPT | upgrade/account-cart-ui-20261014 → PR #12 | PR #12 | Align schema version and add guard to CI/deploy/migration workflows | Verify exact-head CI, no live migration attempted
- 2026-10-14 | ChatGPT | upgrade/account-cart-ui-20261014 → PR #12 | PR #12 | Guard checkout on cart sync and stock; preserve cart across unpaid Stripe flows; show verified payment status | Verify exact-head CI; defer migrations and Stripe acceptance to authorized release
- 2026-10-08 | claude (owner setup) | default branch | done | Added work log rules on main | every agent follows AGENTS.md › Work log rule
