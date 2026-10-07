# Active Plan

Plan ID: WO-SF-ACCESS-BATCH-01
Scope: StudioFlow — read project access for many projects in one query (Projects list, Timeline).
Target revision: R8.376 (R8.375 is this plan)
Status: READY — carried over from branch `claude/trusting-mayer-vkbdnb` (R8.337) and re-checked against `main` at R8.374: the per-project reads are still in `projects/page.tsx` and `timeline/page.tsx`.
Priority: P2
Owner: Product Owner (approved 2026-10-06: "ya" to the Lead's recommendation).
Last updated: 2026-10-07

## Outcome

The Projects list and the Timeline decide "may this person edit this project /
these phases" for every row with one database read, instead of one read per
project. Same answers as today for every person and project; only the number of
queries changes. With 200 projects the page issues a constant number of access
queries, not 200.

## Context and Evidence

- `src/app/(platform)/studioflow/projects/page.tsx` — `Promise.all(projects.map(... studioFlow.projects.getAccess(...)))`
  to build `editableProjectIds` (uses `canEditProject`).
- `src/app/(platform)/studioflow/timeline/page.tsx` — same pattern to build
  `editable[projectId] = { project: canEditProject, phaseIds: phases where canEditContent }`.
- `getAccess` (`src/apps/studioflow/projects/service.ts`) → `getProjectAccess`
  (`src/apps/studioflow/shared.ts`): one `sfProject.findUnique` (status, both PIC
  ids, phases' id + seat_snapshot) per call, then pure rules.
- Single-project callers (`_components/session.ts` → `pageProjectAccess`, and
  `requireProjectAccess` inside commands) are correct and stay per-project.

## Locked Decisions

- The access rules do not change. `canEditProject`, `canEditDocuments`,
  `phases[].canTransition`, `phases[].canEditContent`, `override`, `completed`,
  `isDesigner`, `isDrafter` must be computed exactly as `getProjectAccess` does now.
- One rule implementation: extract the pure part of `getProjectAccess` into a
  function both the single and the batch read call. No second copy of the rules.
- Commands keep `requireProjectAccess` (single project, inside the transaction). Not touched.
- No schema change, no migration, no new dependency.

## Backend Contract

- New read on the projects service: `listAccess({ grants, actor, projectIds })`
  → `Map` (or record) of `projectId → ProjectAccess`. Same read permission and
  same authenticated-actor requirement as `getAccess`. One `findMany` with
  `id in projectIds` (empty input returns empty without querying). Unknown ids are
  simply absent (the pages only pass ids they just listed).
- `getProjectAccess` keeps its signature and `NOT_FOUND` behaviour, now built on
  the extracted pure function.

## UI Contract

Minimal wiring only: the Projects page and the Timeline page call `listAccess`
once and derive `editableProjectIds` / `editable` from it exactly as they derive
them today. No layout, copy or component change.

## Boundaries and Non-goals

- No change to single-project pages, commands, Home cards or permissions.
- No caching layer, no new abstraction beyond the one pure function and the one read.
- Do not touch the other `listAssignablePeople` calls on the Projects page.

## Acceptance Criteria

- Integration test: for a designer PIC, a drafter PIC, an override holder and an
  unrelated staff member, over an active project and a completed project (with a
  designer and a drafter phase), `listAccess` returns results deep-equal to
  `getAccess` for every project.
- Test or assertion that `listAccess` issues one project query for N ids (e.g. a
  spy on `sfProject.findMany`/`findUnique`, or a query counter), and none for `[]`.
- Projects list "View only" vs row menu, and Timeline editable segments / "Edit
  dates", are unchanged for the same people.

## Verification

`npm run typecheck`, `npm run lint -- --quiet`, `npm run check:boundaries`,
`npm test` on the disposable rebuild-only test database (report the count; any
skip or cancel is not a pass). Changelog entry and one local commit `R8.376`.

## Reviewer Acceptance

Lead, after the commit: as a non-PIC staff member and as the project's designer,
open Projects and Timeline; rows show the same edit affordances as before.

## Regression Risks and Recovery

Risk: a rule drifts between single and batch reads — prevented by the shared pure
function and the equality test. Recovery: revert R8.376; nothing persisted changes.

## Executor Prompt

You are the Backend Executor. Location: <rumah|kantor — owner fills in>. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this `PLAN.md` (WO-SF-ACCESS-BATCH-01), then implement the entire READY
backend outcome and nothing beyond it: one pure access-rule function shared by `getProjectAccess`
and a new batched `listAccess`, wired into the Projects and Timeline pages. Inspect current repository
evidence, preserve unrelated owner work, run the required checks on the rebuild-only test database,
update `CHANGELOG.md`, and create local revision commit R8.376. Stop only for a material
locked-decision conflict or unsafe boundary, using the BLOCKED / CONFLICT report; otherwise finish and
report the commit, checks (with test count), limitations, and remaining unrelated dirty files.
