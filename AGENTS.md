# Agent instructions

## Work log rule (every agent: Claude, Codex, Cursor, people)

Cheap to follow: read only what is listed here.

1. **Before you start:** read the top of the log (`head -40 WORKLOG.md`) and the titles of open pull requests (`gh pr list`). If a line for the same work is `active` or has an open PR, do not redo it: continue that branch or pick other work.
2. **Claim it:** add one line at the top of the log with status `active`.
3. **Before you stop:** update your line with the status (`done`, `PR #n`, `blocked: reason`) and the next step. Commit and push it with your work. Never stop with unlogged work.
4. One line per piece of work, newest first. Details go in the PR, not the log.

Line format: `YYYY-MM-DD | agent | branch → PR | status | what | next step`

## Brand rule

Everything visual or written for TAKATAK follows `BRAND.md` (logo, colours, tagline, services). Electric blue on deep navy; never the old gold "TK" logo; green is for status only.

## 1LV agent relay and release gate

Start with `docs/AGENT_HANDOFF.md`, `docs/TASK_QUEUE.md`, the head SHA and open PRs. Keep `WORKLOG.md` and the five docs in sync after work. Existing `.agent/CONTINUATION.md` remains historical context.

**DO NOT MERGE PR #8/#12 or deploy** until the target 1LV Supabase migrations, authenticated JWT/RLS, Stripe test-mode payments, runtime security audit and MochaHost full-stack health gates are proven. Never assume GitHub CI equals production deployment. TAKATAK owns master identity; 1LV owns its own financial state and each merchant is tenant-scoped.
