# StudioFlow R7.49 — Coherent Project Work Surface

## Status

Active executable work order. Target local revision: **R7.49**.

## Objective

Present the existing project-owned to-dos and phase deliverables together on
the project detail page so the user has one actionable work surface. This is a
composition and interaction slice; it must not introduce a second task entity.

## Locked contract

- `SfTask` remains the only task collection and remains project-owned.
- A phase view may filter project to-dos by the existing `phase_scope`; it must
  not create phase-owned task persistence.
- Deliverables remain the existing iteration/file records and must not be
  copied into tasks.
- MOM is out of scope and has no Task, phase, or iteration relation.
- Start Round, internal approval, and Send remain persisted domain actions but
  become contextual actions beside the relevant deliverable/iteration rather
  than the dominant phase entry point.
- Preserve the R7.48 current-deliverable summary and fixed-folder intake.
- Preserve the project-wide Files page.
- Preserve permission semantics: controls the user cannot perform are absent,
  not dead disabled buttons.
- Legacy minimum remains the floor: project to-dos, phase progress, current
  deliverable, iteration/review state, permissions, audit, and loading/empty/
  error states must remain usable.

## In scope

- Project detail composition of the existing to-do block and phase rows.
- Phase-scoped to-do filtering using existing fields and service methods.
- Contextual placement of existing round/approval/send actions.
- Loading, empty, error, permission, DONE, long-content, collapsed-rail, and
  narrow-viewport states for the combined surface.
- Focused regression tests for no duplicate task carrier, phase filtering,
  contextual action visibility, and preservation of R7.48 deliverable behavior.
- Update the relevant UX/alignment/roadmap text only after behavior is verified.

## Out of scope

- No Prisma schema or migration.
- No new task, checklist, chat, notification, or calendar entity.
- No MOM or Product Catalogue implementation.
- No storage-byte behavior, Google Drive, SketchUp, or cross-app changes.
- No redesign of the shared UI Engine unless a missing generic primitive is
  proven; if needed, extend one canonical primitive and test its consumers.

## Required inspection before editing

- Read `docs/README.md`, `CHANGELOG.md`, `docs/alignment.md`,
  `docs/roadmap.md`, `docs/knownbug.md`, `CORE.md`, `DESIGN.md`,
  `UI_ENGINE.md`, `prisma/schema.prisma`, and the current StudioFlow route,
  service, tests, and UX contract.
- Inspect the legacy project detail, to-do, iteration, and action flow as
  read-only evidence at the recorded legacy commit. Classify behavior as
  KEEP, FIX, MERGE, or PURGE in the implementation notes.
- Record HEAD, branch, and dirty-file list before editing. Preserve unrelated
  owner changes.

## Acceptance gates

Run with `STUDIOFLOW_LOCATION=kantor` and report every unavailable check as not
passed:

- `npx prisma validate`
- `npm run typecheck`
- `npm run lint`
- `npm run check:boundaries`
- `npm run check:legacy-runtime`
- focused tests and full `npm test`
- `npm run build`
- browser smoke test for project detail at desktop, collapsed rail, and narrow
  viewport, including empty/error/permission/DONE states and at least one
  populated project with a to-do plus a deliverable.

Do not close roadmap/alignment items or claim zero gap unless the populated
browser workflow and disposable-database integration are both evidenced.

## Delivery

- Update `CHANGELOG.md` with exact scope, checks, and limitations.
- Stage only owned files, inspect staged diff and whitespace, and create one
  local commit with exactly:

`R7.49 | feat(studioflow): unify project work surface`

- Never push, publish, or alter remote state.
