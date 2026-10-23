# Active Plan

Plan ID: WO-SF-SCHEDULE-MARKS-01; full plan in `docs/apps/studioflow/WO-SF-SCHEDULE-MARKS-01.md`
Scope: Product Schedule items can be hidden and highlighted (shared for everyone), with filters, bulk actions, progress that skips hidden items, and a print that asks whether hidden items are included.
Module(s): `studioflow` (Product Schedule).
Target revision: plan R9.212; backend (Codex) R9.213; UI (Lead) R9.214.
Risk: low-medium - two additive columns on schedule items and two bulk commands.
Status: DONE - backend R9.213 (Codex, PASS), UI R9.214 (Lead); owner browser check owed.
Priority: P1
Owner: Product Owner (decisions 2026-10-23: marks are shared in the database; hidden items leave the progress count; print asks each time whether hidden items are included)
Last updated: 2026-10-23

Previous plan: `WO-SF-SCHEDULE-SHEET-01` DONE in R9.205-R9.207 (owner browser check owed), followed by List/Board
refinements R9.208-R9.211.

## Locked Decisions

See `docs/apps/studioflow/WO-SF-SCHEDULE-MARKS-01.md` "Locked decisions" 1-8.

## Acceptance Criteria

As in WO-SF-SCHEDULE-MARKS-01 "Acceptance". Executor verification: typecheck, lint, studioflow unit and
integration tests, boundary checks, build, migration applied to the selected location's dev and test databases.
Reviewer (Lead) owns the UI (R9.214) and acceptance; browser checks are the owner's.

## Executor Prompt

```text
Role: BACKEND EXECUTOR. Read AGENTS.md, docs/agent/EXECUTOR.md, PLAN.md and
docs/apps/studioflow/WO-SF-SCHEDULE-MARKS-01.md. Location: kantor (load .env.kantor, STUDIOFLOW_LOCATION=kantor).
Implement only the "Executor scope (R9.213)" of WO-SF-SCHEDULE-MARKS-01: hidden + highlight on schedule items
(one additive migration), SCHEDULE_HIGHLIGHTS in the domain, the two bulk service commands with audit and
permission checks, the two server actions, view mapping, re-import keeping the marks, tests, changelog R9.213.
Do not build menus, filters, print or progress changes (Lead R9.214). Apply the migration to the kantor dev and
test databases after verifying both targets are rebuild-only, restart the :3001 dev server, commit locally as
R9.213 (no push) and return the Planner/Reviewer prompt with outcome, commit, checks, limitations and dirty files.
```
