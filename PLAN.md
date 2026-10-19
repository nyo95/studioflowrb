# Active Plan

Plan ID: WO-SF-TIMELINE-HANDOVER-01
Scope: Redesign StudioFlow Timeline around real project progress and two anchored planning dates
Module(s): StudioFlow
Target revision: unassigned — blocked before implementation
Risk: high — this changes schedule meaning, persisted dates, authorization and portfolio/project surfaces. No implementation is authorized while the canonical Handover field and dependency map remain ambiguous.
Status: BLOCKED
Priority: P1
Owner: Product Owner
Last updated: 2026-10-19

## Confirmed Owner Decisions

- Design Handover plans project work forward; Opening plans backward. The schedule exposes conflicts rather than silently choosing one anchor.
- Changing either anchor recalculates the generated schedule. A Platform Owner's manual phase override affects that phase only and survives later recalculation.
- Overdue means the currently active phase has passed its planned end date.
- Studio Manager date editing is permitted as a future delegable capability, but disabled by default. Current Manager portfolio access remains read-only unless a later explicit delegation mechanism is approved.
- Existing projects with no Handover keep their existing schedule until Handover is supplied.
- Both Table and Gantt views are required. The Table follows the office operational layout; the Gantt is a calendar lens of the same data.
- Phase/status progress is derived from the project's actual phase state and rounds, never selected manually in Timeline.

## Locked Date Meaning

- Office-table `Handover Radiant` and the owner-directed `Handover Desain` are the same business date: the project's canonical Handover.
- Handover requires its own persisted StudioFlow date. It must not overwrite the existing Opening or Fit Out Start date, whose historical meaning remains intact.

## Blocking Decision

Choose the source of standard working-day gaps between the Table columns and phases. Recommended: one Studio-wide configurable default set, with a Platform Owner allowed to override one phase for an exceptional project. The alternative is entering every project date manually, which conflicts with the requested automatic plan.

## Non-goals Until Unblocked

- No migration or reinterpretation of `opening_date`, `fit_out_start_date`, or existing phase planned dates.
- No automatic schedule rewrite, new permission, table/Gantt UI, or progress calculation change.
