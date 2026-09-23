# Active Plan

Plan ID: SF-PORTFOLIO-TIMELINE
Scope: StudioFlow — portfolio-wide Gantt/timeline page with real per-phase dates and filters
Status: READY
Priority: P2
Owner: Repository owner (berkah.rad, chat 2026-09-23)
Last updated: 2026-09-23
Lane: Planner/Reviewer + Executor (combined), rumah

## Outcome

A new `/studioflow/timeline` page, reachable from a "Timeline" item in the
StudioFlow sidebar, shows one Gantt row per project across the whole
portfolio, filterable by client, designer/drafter (PIC), project status, and
a date range. Each phase segment renders from a real per-phase planned
start/end date when the owner has set one, and falls back to today's
equal-width sequence split when not — the existing per-project Overview
`ProjectTimeline` bar (`STUDIOFLOW-REWORK-CONTRACT.md` §8) gains the same
upgrade so both views share one rendering rule instead of diverging.

## Context and Evidence

- Prior decision this replaces/extends: `STUDIOFLOW-REWORK-CONTRACT.md` §8,
  "Timeline / Gantt (owner, 2026-09-23)" — shipped R8.125 as a **sequence
  breakdown, not calendar-accurate**, explicitly flagging "A true
  per-phase-dated Gantt would need new schema and is future work if the
  owner wants it," and separately flagging a "portfolio-wide 'Upcoming' view
  across projects" as future work (contract line ~757-758). Owner asked for
  both today; this plan locks that as one combined outcome.
- Current code:
  - [project-timeline.tsx](src/app/(platform)/studioflow/projects/[projectId]/project-timeline.tsx) —
    equal-width-by-sequence renderer, the only Gantt rendering today.
  - `SfPhase` (`prisma/schema.prisma`) has `order_index` and a single latest
    `status_changed_at`; no per-phase start/end fields exist.
  - `SfProject.timeline_start_date` (R8.125) is the precedent for an
    overridable, nullable, falls-back-when-unset schedule field edited via
    `EditProjectDialog` from the Projects directory row menu.
  - `listProjects` ([service.ts:316](src/apps/studioflow/projects/service.ts:316))
    already filters by `status`, `priority`, `clientId`, `picUserId` (OR of
    designer/drafter — matches the existing single "PIC" dropdown seen in
    the Projects directory UI) and `search`; no date-range filter exists yet.
  - StudioFlow nav: [nav.ts](src/apps/studioflow/public/nav.ts) (routes) and
    the sidebar it feeds — `Today, Projects, Clients, Library` today.
  - [library/page.tsx](src/app/(platform)/studioflow/library/page.tsx) is the
    template for a new top-level StudioFlow page (session/grants, `PageHeader`).
  - Permission `studioflow.project.manage` already covers project-level
    schedule/administrative edits (`STUDIOFLOW-REWORK-CONTRACT.md` §3); this
    plan reuses it for phase-level planned dates rather than inventing a new
    grant.

## Locked Decisions

1. **Schema (owner-approved upgrade):** add `SfPhase.planned_start_date` and
   `SfPhase.planned_end_date` (both nullable `DATE`, additive migration,
   named `<timestamp>_sf_phase_planned_dates`). Unset means "no override" —
   same fallback philosophy as `timeline_start_date`, not a required field.
2. **Rendering rule (REUSE, not fork):** the segment-width logic becomes:
   *if a phase has both planned dates set, size its segment by real
   duration against the project's overall span; otherwise keep today's
   equal-width sequence behavior for that phase.* Both the per-project
   Overview bar and the new portfolio page call the same shared logic
   (extend `project-timeline.tsx`'s calculation into a small shared helper
   rather than duplicating it).
3. **Editing surface:** planned dates are edited from the new Timeline page
   itself — click a phase segment to open a small dialog (start/end date
   inputs) scoped to that one phase, gated by `studioflow.project.manage`.
   The individual phase page does **not** gain a duplicate editor in this
   plan (non-goal below); that stays available as later, separate work if
   the owner wants it there too.
4. **Filters (owner-approved, all four, combinable, in the URL like the
   Projects directory does today):** client, designer/drafter (reuse the
   existing single PIC dropdown concept, not two separate fields), project
   status, and a date range that keeps any project whose
   `[timelineStartDate, openingDate-or-fallback]` span overlaps the
   selected range. DB-level `where` reuses `listProjects`' existing
   status/client/pic filters; the date-range overlap check applies in
   application code after fetch (same place the fallback dates are already
   computed), consistent with portfolio-scale project counts.
5. **Nav:** new sidebar item "Timeline" → `/studioflow/timeline`, placed
   between "Projects" and "Clients" in `STUDIOFLOW_NAV_LINKS.workspace`.
   Gated by `studioflow.project.read` (read-only page; the per-phase edit
   dialog gates its own write on `studioflow.project.manage`).

## Boundaries and Non-goals

- No drag-to-resize Gantt interaction — v1 editing is a plain date-input
  dialog, not a draggable bar.
- No duplicate planned-date editor on the phase page in this plan.
- No change to how `status_changed_at`/phase status history works — this is
  still *planned* dates, not actual-duration tracking derived from status
  transitions.
- No change to `STUDIOFLOW-REWORK-CONTRACT.md` §8's existing per-project
  Overview placement or to any other app (Master Data, BQ).

## Acceptance Criteria

- `/studioflow/timeline` exists, reachable from a new "Timeline" sidebar
  item; unauthenticated/ungranted access is blocked the same way other
  StudioFlow pages block it.
- The page lists every non-archived project as one row with a phase-segment
  bar; filters for client, designer/drafter, status, and date range are
  present, combinable, and reflected in the URL (shareable/bookmarkable,
  matching the Projects directory pattern).
- Clicking a phase segment opens a dialog to set/clear that phase's planned
  start/end; saving persists via a new service call gated by
  `studioflow.project.manage` and immediately reflects in the bar's segment
  width.
- A phase with planned dates set renders proportional to its real duration;
  a phase without them still renders with the existing equal-width fallback
  — verified on both the portfolio page and the existing per-project
  Overview bar (no regression there).
- `docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md` §8 updated to record
  the new page, the shared rendering rule, and the schema addition, so the
  contract stops describing the sequence-only Gantt as the current state.
- `docs/BACKLOG.md`'s "Fixed 2026-09-23 (R8.125)" note superseded/updated to
  point at the revision that closes this plan instead of still reading as
  outstanding future work.

## Verification

- `npm run check` (typecheck, boundaries, legacy-runtime) and `npm test` —
  add unit coverage for the shared segment-width helper (real dates vs.
  fallback) and for the date-range overlap filter.
- Migrate **both** local databases per
  [docs/agent/README.md "Local database sync after new migrations"](docs/agent/README.md) —
  `masterdata` (dev) and `masterdata_test` — then restart `next dev` and
  regenerate the Prisma client before browser verification.
- Browser acceptance (Reviewer, after the Executor commit): open
  `/studioflow/timeline`, apply each filter individually and combined, edit
  one phase's planned dates and confirm the segment width updates, then
  revisit that project's own Overview page and confirm its bar reflects the
  same real dates.

## Risks and Recovery

- Date-range overlap semantics could surprise the owner (inclusive vs.
  exclusive edges, timezone-of-day handling) — keep it explicit and
  test-covered rather than implicit; flag to the owner in the handoff if a
  judgment call was made.
- If portfolio project count ever grows large enough that the
  application-code date-range filter becomes a real cost, that is a later
  optimization, not a blocker for this plan.

## Executor Prompt

You are the Executor, combined with Planner/Reviewer in this same session.
Location: rumah. Implement the SF-PORTFOLIO-TIMELINE outcome above in full:
schema migration (`SfPhase.planned_start_date`/`planned_end_date`), the
shared segment-width rendering helper reused by both the existing
per-project `ProjectTimeline` and the new portfolio page, the new
`/studioflow/timeline` route with its sidebar entry and four filters, the
per-phase planned-dates edit dialog gated by `studioflow.project.manage`,
contract/backlog doc updates, tests, and the required checks. Migrate both
the dev and test databases per `docs/agent/README.md`. Preserve every
unrelated dirty file already in the working tree. Make one coherent local
commit with the next `R8.<NN>` ordinal and a `CHANGELOG.md` entry, then
report the commit, checks run, and any limitations.
