# Active Plan

Plan ID: WO-SF-SCHEDULE-BRAND-FREE-01; full plan in `docs/apps/studioflow/WO-SF-SCHEDULE-BRAND-FREE-01.md`
Scope: Product Schedule Brands do not depend on Master Data: typed Brands survive every create path, and the Schedule Assistant accepts a typed Brand with a warning instead of refusing it.
Module(s): `studioflow` (schedule service), `schedule-assistant` (composer, MCP bridge, contract; 1.3.0 -> 1.4.0).
Target revision: plan R9.216; backend (Codex) R9.217.
Risk: medium - reverses a locked Assistant rule (2026-10-22) and touches three create paths.
Status: READY for Executor (R9.217).
Priority: P1
Owner: Product Owner (decision 2026-10-23: the Product Schedule is independent; it may take a Brand from Master Data when one exists, and a Brand not in Master Data must still be usable)
Last updated: 2026-10-23

Previous plan: `WO-SF-SCHEDULE-MARKS-01` DONE in R9.213/R9.214 (owner browser check owed). R9.215 made the List's
Contact column optional.

## Locked Decisions

See `docs/apps/studioflow/WO-SF-SCHEDULE-BRAND-FREE-01.md` "Locked decisions" 1-6.

## Acceptance Criteria

As in WO-SF-SCHEDULE-BRAND-FREE-01 "Acceptance". Executor verification: typecheck, lint, studioflow and
schedule-assistant unit and integration tests, boundary checks, build. No migration.
Reviewer (Lead) owns acceptance; browser and MCP checks are the owner's.

## Executor Prompt

```text
Role: BACKEND EXECUTOR. Read AGENTS.md, docs/agent/EXECUTOR.md, PLAN.md and
docs/apps/studioflow/WO-SF-SCHEDULE-BRAND-FREE-01.md. Location: kantor (load .env.kantor, STUDIOFLOW_LOCATION=kantor).
Implement only the "Executor scope (R9.217)": one Brand helper in the schedule service so a typed Brand
(brandName without brandId) is kept on every create and edit path (createEntry, createOption and
createTemplateItem drop it today); in the schedule composer, a typed Brand resolves to an exact Master Data
name match or else is kept with the warning SCHEDULE_BRAND_NOT_IN_MASTER_DATA plus suggestions (an unknown
brandId stays blocking); update the MCP bridge instructions/descriptions, CONTRACT.md, README and bump
schedule-assistant to 1.4.0; tests; changelog R9.217. No Master Data writes, no migration, no UI change.
Restart the :3001 dev server, commit locally as R9.217 (no push) and return the Planner/Reviewer prompt with
outcome, commit, checks, limitations and dirty files.
```
