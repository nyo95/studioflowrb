# Active Plan

Plan ID: WO-SF-TIMELINE-HANDOVER-01
Scope: Rebuild StudioFlow Timeline around Design Handover, real progress, and Table/Gantt lenses
Module(s): StudioFlow
Target revision: R9.152
Risk: high — persisted schedule meaning, calculations, authorization, project and portfolio timeline reads, and user-facing routes change. Stop for a migration conflict or any need to widen Manager authority.
Status: READY
Priority: P1
Owner: Product Owner
Last updated: 2026-10-19

## Outcome

Each project has a canonical Design Handover date (office-table `Handover Radiant`). Timeline calculates plan dates backward from it, compares with Opening's independent 10-working-day backward constraint, and visibly reports conflict. Table and Gantt use one schedule source and derive progress from actual phase state.

## Locked Decisions

- ADD one nullable StudioFlow-owned Design Handover date; never repurpose Opening or Fit Out Start. No-Handover projects retain their current schedule.
- REUSE recorded project Start (`timeline_start_date`, then the existing created-date fallback); never calculate or overwrite Start.
- Working-day defaults: Design Final/CD same day; CD → CD Final 5; CD Final → END 5; END → Submission/Start Fit Out 5; Start Fit Out → Handover 40; Handover → Opening 10. Calculate this chain backward from Handover, honor holidays, and warn for anchor conflict or a generated date before today—never silently shift it.
- Platform Owner (`project.manage + project.override`) is the only date writer. A one-phase manual date exception survives calculation; Manager stays portfolio read-only by default. Do not add delegation in this work order.
- Derive schedule status from the real active phase: On track / Due today / Overdue by its planned end; pending, completed and paused retain actual workflow state. Clicking a phase is a date-exception action only.
- ADD a Table and retain Gantt as two views over the same data. Table order: Start, Design Final, CD, CD Final, END, Submission/Start Fit Out, Design Handover, Opening, real Status/Progress, final-output availability.

## Architecture and Boundaries

- EXTEND StudioFlow project planning, phase read models and public route contract only. Add an additive nullable migration; never infer Handover from historical dates or overwrite existing planned dates during migration.
- One planning service supplies project table rows, Gantt bars, warnings and active-phase status. Pages do not recompute policy or query Prisma directly.
- Preserve current audit, transaction, private-file and assignment boundaries.

## Acceptance Criteria

- A set Handover generates the locked dates; Opening conflict and pre-today milestones warn without moving anything.
- A no-Handover legacy project remains readable with unchanged dates.
- Only Platform Owner can set/recalculate Handover or create a phase exception; Manager cannot write dates.
- Table/Gantt agree on dates, real active-phase status and final-output availability.

## Verification

- Tier: high (schema migration, schedule meaning, authorization/audit and public reads). Per-command timeout: 15 minutes. Verify each `kantor` database target is rebuild-only before Prisma, migrate every local database used, then regenerate Prisma.
- Add domain tests for working days, holidays, both anchors/conflict and pre-today warning; service integration for no-Handover fallback, apply/recalculate, exception, Manager refusal and Platform Owner success; transport/row-model tests for Table/Gantt parity.
- Run `node scripts/verify.mjs --tier high` after migration plus Prisma generation. Browser acceptance is Reviewer-owned and owner-deferred; record it pending.

## Reviewer Acceptance

- On a migrated disposable project, set Handover/Opening and verify calculated dates, warnings, real phase status, exception survival, Table/Gantt parity and Manager/Owner states at desktop and 375 px. Confirm a no-Handover project is unchanged.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, the installed Next.js guides and this READY `PLAN.md`; implement the locked Timeline backend/data outcome only: nullable Design Handover, canonical planning source, real progress status, authorization, migration/tests and minimal functional route wiring. Preserve no-Handover schedules, do not add Manager delegation or redesign UI, run the high gate, update changelog/browser backlog, and commit R9.152. Do not claim browser acceptance.
