# Active Plan

Plan ID: WO-SF-PLAN-01 (working-time planning from Fit Out Start; Supervision becomes Construction)
Scope: StudioFlow backend — a working-day calculator, studio planning defaults, a holiday list, a Fit Out Start date per project, a plan that fills phase dates backward and forward from it, and the rename of the Supervision phase to Construction. The Timeline/Gantt drawing is a separate Lead work order (WO-SF-GANTT-01) after this commit.
Target revisions: R8.378 (this plan), R8.379 (WO-SF-PLAN-01), then WO-SF-GANTT-01.
Status: READY
Priority: P1
Owner: Product Owner. Decisions confirmed by the owner in chat on 2026-10-07.
Last updated: 2026-10-07

## Outcome

Given a project's Fit Out Start date, StudioFlow computes the planned dates of the
design side backward and of the construction side forward, using Monday–Friday
working days minus a hand-entered holiday list, and writes them into the
existing per-phase planned dates. Anyone can override any computed date or any
interval for one project and the plan never silently overwrites that override.
The plan also tells the user when the result does not fit the opening date.

## Business model (owner, 2026-10-07)

Two chains meet at **Fit Out Start** (RAD starts working from the CD / CD Final drawings):

```text
Start ─ (free) ─ Design Final ─ CD Mall ─ CD Final ─ END ─ gap ─┐
                                                                 ▼
                          Opening ◄─ 2 weeks ─ Handover ◄─ 2 months ─ FIT OUT START
```

- Design can run ahead; construction can be far away. So the design side is
  counted **backward** from Fit Out Start and the construction side **forward**.
- **END** is a Timeline word only: the date the CD phase was completed. It is
  derived (planned: computed; actual: the CD phase's done date). It is **not** a
  new project status and **no phase or project completion rule changes**. Project
  completion keeps its current meaning.
- **Handover** is RAD handing over to the client. **Opening** is the client's
  planned opening, entered by hand (existing `opening_date`).
- The span from Start to Design Final has no standard length; it fills what remains.

## Locked Decisions

1. **Working days** are Monday–Friday excluding the holiday list. Counting
   starts the day after the base date; a result is always a working day.
2. **Studio defaults** (working days, editable in StudioFlow settings, one row,
   same `SfSettings` singleton): CD Mall 5, CD Final 5, gap from END to Fit Out
   Start 5, Fit Out Start to Handover 40, Handover to Opening 10. A project may
   override any of the five in `plan_overrides` (nullable JSON, keys fixed, whole
   numbers 1–260).
3. **Computation** from `F = fit_out_start_date`:
   - `END = back(F, gap)`; `CD Final start = back(END, cdFinal)`;
     `CD Mall start = back(END, cdMall + cdFinal)`; **Design Final = CD Mall start**.
   - `Handover = fwd(F, fitOutToHandover)`; `Opening forecast = fwd(Handover, handoverToOpening)`.
   - Phase dates written: Design 3D `planned_end = Design Final`; Construction
     Drawing `planned_start = CD Mall start`, `planned_end = END`; Construction
     (formerly Supervision) `planned_start = F`, `planned_end = Handover`. Moodboard,
     Layout Plan and any other design phase are **not** computed (free span).
   - Phases are located by their legacy definition ids (`domain/phase.ts`
     `LEGACY_PHASE_DEFINITION_IDS`), never by display name.
4. **Overrides.** `SfPhase.planned_dates_manual` (boolean, default false) becomes
   true whenever a person sets planned dates through the existing
   `setPhasePlannedDates`. Applying the plan writes only phases that are not
   manual; a manual phase is reported as "kept your dates". A new
   "reset to computed" clears the flag and recomputes that phase.
5. **Warnings** (returned, never blocking): opening forecast later than
   `opening_date` (days late); `opening_date − Handover` shorter than the
   handover-to-opening interval ("tight"); `timeline_start_date` later than
   Design Final; a computed date in the past.
6. **Suggestion, not automation.** When the CD phase is DONE and
   `fit_out_start_date` is empty, the read model offers
   `fwd(END actual, gap)` as a suggested Fit Out Start; it is never written
   without a person saving it. END actual = the CD phase's done date
   (`status_changed_at` when `status = DONE`).
7. **Holidays** are rows `SfHoliday { date, label }` entered by hand under
   StudioFlow settings (`settingsManage`). The calculator takes a plain set of
   dates so a later import (e.g. from a public calendar) swaps only the source.
8. **Rename.** The default definition `LEGACY_PHASE_DEFINITION_IDS.supervision`
   is renamed `Supervision` → `Construction`, and `name_snapshot` of every phase
   with that definition is updated in the same migration. Code identifiers,
   `isSupervision`, the visit commands and their behaviour are unchanged.
9. No new dependency. Date math is pure, date-only (no time zones), in
   `src/apps/studioflow/domain/working-time.ts`. It stays app-owned until a
   second app needs working-day math, then it moves to Utilities (record that
   in the changelog).

## Backend Contract

- **Schema/migration.** `sf_project.fit_out_start_date date null`,
  `sf_project.plan_overrides jsonb null`; `sf_phase.planned_dates_manual boolean
  not null default false` (existing rows with planned dates set → `true`, so
  nothing already entered is ever overwritten); `sf_settings` five integer
  columns with the defaults above and CHECK 1–260; table `sf_holiday`
  (`date` unique, `label`, audit columns as elsewhere); rename migration from
  decision 8.
- **Domain** `working-time.ts`: `isWorkingDay`, `fwd(date, n, holidays)`,
  `back(date, n, holidays)`, `workingDaysBetween`. `plan.ts`:
  `computeProjectPlan({ fitOutStart, intervals, holidays, openingDate,
  timelineStart, cdDoneDate, today })` → milestones + warnings. Pure; no database.
- **Commands** (project service, `projectManage`, audited):
  `setFitOutStart`, `setPlanOverrides`, `applyProjectPlan` (writes non-manual
  phases, returns what it wrote, kept, and the warnings),
  `resetPhasePlannedDates`. `setPhasePlannedDates` sets the manual flag.
  Settings: `setPlanningDefaults`, `addHoliday`, `removeHoliday` (`settingsManage`).
- **Read.** The project and timeline reads expose `fitOutStartDate`,
  the resolved intervals, the computed milestones, END actual/planned, the
  suggested Fit Out Start, and the warnings. The Timeline page keeps using
  `listAccess` (R8.376); do not reintroduce per-project access reads.

## UI Contract (minimal wiring only; the Lead owns the design)

A "Fit Out Start" date field in the existing project edit dialog; a planning
defaults and holiday list section in StudioFlow settings; an "Apply plan"
action with its result and warnings shown as plain text. No Gantt change here.

## Boundaries and Non-goals

- No change to phase transitions, iteration rules, completion/reopen, or access rules.
- No Gantt drawing, drag-to-edit, or CD sub-bars (WO-SF-GANTT-01).
- No automatic holiday import, no per-phase lead times, no calendar-day mode.
- Do not rename database identifiers, route names, or the visit commands.

## Acceptance Criteria (Executor)

- Calculator tests: forward and backward over weekends; over a holiday; from a
  base date that is itself a weekend or holiday; `n = 0`; symmetric pairs
  (`back(fwd(d, n), n)` equals `d` for a working `d`).
- Plan tests: a worked example with a known `F` and holidays reproduces every
  milestone; each warning fires and does not fire in its neighbouring case;
  overrides of one interval change only the dates that depend on it.
- Integration: applying the plan writes the three phases' dates; a phase
  edited by hand is kept and reported; reset-to-computed restores it; running
  the plan twice changes nothing; the migration keeps every existing planned
  date (flag true) and renames Supervision → Construction in definition and snapshots.
- Existing tests stay green (baseline `npm test` 866/866 at R8.377).

## Verification

`npm run typecheck`, `npm run lint -- --quiet`, `npm run check:boundaries`,
`npm run check:legacy-runtime`, `npm test` on the disposable rebuild-only test
database (report the count; a skip or cancel is not a pass), `npm run build`.
Apply the migration to the dev and test databases only after verifying both
targets are rebuild-only. Changelog entry and one local commit `R8.379`.

## Reviewer Acceptance

Lead, after the commit: set a Fit Out Start on a project, apply the plan, read
the dates back against the worked example, edit one phase's dates by hand, apply
again (kept), reset it; check the Construction name on an existing project.

## Regression Risks and Recovery

Risk: overwriting dates people already typed (mitigated by the migration flag
and the "manual is kept" rule); a holiday list that is empty (plans still work,
weekends only); renaming breaking code that matches the name (all matching is by
definition id; grep for `"Supervision"` string comparisons first). Recovery:
revert R8.379 and run the down-steps recorded in the migration note; nothing
else depends on the new columns.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this `PLAN.md` (WO-SF-PLAN-01), then implement the
entire READY backend outcome and nothing beyond it. Start from a clean tree on
`main`; confirm the next unused revision in `CHANGELOG.md` (expected R8.379).
Verify both database targets are the rebuild-only dev and test databases before
any database command. Keep the minimal UI wiring described in the plan; do not
design the Gantt. Run the checks listed, update `CHANGELOG.md`, and create one
local commit. Do not push. Stop with the BLOCKED / CONFLICT report only for a
locked-decision conflict or an unsafe boundary; otherwise finish and return one
Planner/Reviewer prompt with the outcome, commit, checks and test count,
limitations, and dirty files.
