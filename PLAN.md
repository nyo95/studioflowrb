# Active Plan

Plan ID: WO-SF-SCHEDULE-SHEET-01; full plan in `docs/apps/studioflow/WO-SF-SCHEDULE-SHEET-01.md`
Scope: Product Schedule gets a real Contact field (moved out of notes), the legacy sheet import accepts the owner's current sheet, and the List view matches the studio's Google Sheet columns.
Module(s): `studioflow` (Product Schedule).
Target revision: plan R9.204; backend (Codex) R9.205; Lead correction R9.206; list UI (Lead) R9.207.
Risk: medium - additive columns plus a data move out of option notes.
Status: DONE - backend R9.205 (Codex, PASS), re-import fix R9.206 (Lead), List UI R9.207 (Lead) with owner-requested fixed heading, sort and column filters; owner browser check owed.
Priority: P1
Owner: Product Owner (decisions 2026-10-23: Contact is its own field; Initials type is the rough spec before the product is known and is covered by Color/Pattern/Finishing; Status stays, Qty only for Fixture, category headers stay)
Last updated: 2026-10-23

Previous plans: `WO-SKETCHUP-02` / `WO-SKETCHUP-03` (`docs/apps/sketchup/`) built in R9.193 / R9.194; one owner
test in SketchUp with plugin 1.3.0 is still owed. `WO-SCHEDULE-ASSISTANT-04` DONE in R9.186.

## Locked Decisions

See `docs/apps/studioflow/WO-SF-SCHEDULE-SHEET-01.md` "Locked decisions" 1-7.

## Acceptance Criteria

As in WO-SF-SCHEDULE-SHEET-01 "Acceptance". Executor verification: typecheck, lint, studioflow unit and
integration tests, boundary checks, build, migration applied to the selected location's dev and test databases.
Reviewer (Lead) owns the List UI (R9.206) and acceptance; browser checks are the owner's.

## Executor Prompt

```text
Role: BACKEND EXECUTOR. Read AGENTS.md, docs/agent/EXECUTOR.md, PLAN.md and
docs/apps/studioflow/WO-SF-SCHEDULE-SHEET-01.md. Location: kantor (load .env.kantor, STUDIOFLOW_LOCATION=kantor).
Implement only the "Executor scope (R9.205)" of WO-SF-SCHEDULE-SHEET-01: Contact on schedule options and
template items with the notes data move, search key, copy paths, both imports (contact field, initials-as-type
fallback, "material type" header alias), one plain Contact input for wiring, tests, changelog R9.205.
Do not touch the schedule composer/MCP, board card, print or List layout. Apply the migration to the kantor
dev and test databases after verifying both targets are rebuild-only. Commit locally as R9.205 (no push) and
return the Planner/Reviewer prompt with outcome, commit, checks, limitations and dirty files.
```
