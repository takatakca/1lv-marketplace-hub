# 1LV.CA — ARCHITECTURE DECISIONS

Reviewed 2026-10-14. See `docs/TAKATAK_1LV_DATA_BOUNDARY.md` and `BRAND.md`.

### ADR-001: Split identity and commerce authority
GROUPE TAKATAK owns the master identity, OTP/auth, permissions and customer-company relationship authority. Independent 1LV owns marketplace catalog, orders, money, Stripe identifiers, refunds, invoicing and seller payouts. Do not expose another tenant's customer/commerce state or combine unrelated product dashboards.

### ADR-002: Trust the server, not browser state
Authoritative checkout, pricing, stock, taxes, promotions and payment status are determined by authenticated server/database functions. Browser cart prices and Stripe redirect parameters are informational only. Protect every customer/vendor operation by the proper identity and RLS.

### ADR-003: Payment UX remains honest
Only an order verified by the trusted backend with `payment_status = paid` may display "Payment received". Distinguish pending, failed, refunded, expired/cancelled and unknown. Never automatically retry/charge or discard the cart because a Stripe page closed.

### ADR-004: Deployment has a hard security gate
Stacked PR #8/#12 remain drafts until the precise 1LV production migrations, backups, real TAKATAK Auth/RLS tests, Stripe signed webhook QA, dependency audit, full-stack runtime and verified rollback exist. Never force-push, bypass approvals or publish unverified payments.

### ADR-005: Persistent handoff
Agents must keep `AGENTS.md`, `WORKLOG.md`, `docs/PROJECT_STATUS.md`, `docs/TASK_QUEUE.md`, `docs/AGENT_HANDOFF.md`, `docs/DEPLOYMENT.md` and this file synchronized. Historic `.agent/CONTINUATION.md` is retained and linked.

### ADR-006: Paid-cart cleanup must be targeted
Only after verified paid order attribution may the application clear exactly purchased lines still applicable, without deleting later changes from other tabs.

### ADR-007: No secrets or wrong DB
Secrets live in host/Actions secret stores; Supabase migration requires proof of right project, backup, SQL review, local verification and explicit authorized run. `scripts/check-schema-marker.mjs` keeps schema, health and release expectations aligned.

### ADR-008: Guest receipts survive payment capability cleanup

Upon verified `paid` or refunded terminal state, remove only the short-lived guest payment capability while retaining the unguessable guest order lookup checkout key in **sessionStorage** for that same browser session. The backend still verifies this key before exposing any order. Full deletion is a separate explicit operation. A guest order must never display fabricated shipping/tracking data if inaccessible.
