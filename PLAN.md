# Active Plan

Plan ID: WO-SF-CENTRAL-DELIVERABLES-01
Scope: Move StudioFlow Deliverables from the phase sidebar to one project-wide tab
Module(s): StudioFlow
Target revision: R9.141
Risk: medium — this changes a project navigation path and upload management surface, but retains the existing private-file, access, action, and storage contracts. Stop if evidence requires a new permission, a change to file ownership, or a persistence change.
Status: READY
Priority: P1
Owner: Product Owner
Last updated: 2026-10-19

## Outcome

Deliverables is a centralized project tab immediately after Phases. It lets a permitted user see each phase's active private file and act on that file in one place, as in the pinned legacy workflow, without duplicating or moving stored files.

## Context and Evidence

- Owner direction, 2026-10-19: “pindahin kesini aja delivrables nya seperti di legacy (terpusat)” on the project section navigation.
- R9.139 locks zero or one private Deliverable per phase, including authenticated signed reads, PIC-scoped upload and Studio Manager deletion.
- The current phase sidebar combines Requirements with a single phase's Deliverables panel; the project pill navigation is the canonical sibling-view surface.

## Locked Decisions

- ADD a `Deliverables` tab after `Phases` in the project navigation. It shows all project phases in their existing order, with each phase's current Deliverable status and its zero-or-one private file.
- MOVE the existing functional upload, signed download and confirmed manager deletion controls into that centralized page. Do not duplicate these controls in the phase sidebar.
- Keep the current per-phase access rule: only the authorized, modifiable phase's PIC may upload; only the existing Studio Manager authority may delete. Reading remains within the existing project-detail gate.
- REUSE the existing StudioFlow Deliverables service, authenticated upload route, server action, private storage, signed URLs and `DeliverablesPanel`; do not add a project-wide stored record, new permission, database migration, or public URL.

## UI and Boundaries

- The project page uses the existing `PillTabs` project navigation and UI Engine section cards. The centralized view must preserve clear phase labels, empty states and narrow-screen stacking.
- The phase sidebar remains focused on Requirements and no longer fetches or reports files.
- No Timeline, external link, multi-file, version, Final, expiry, role, schema, storage or audit behavior changes.

## Acceptance Criteria

- An eligible project opens `/studioflow/projects/:projectId/deliverables` from the tab immediately after Phases.
- The page presents every project phase, its file status and its single current private file when one exists.
- The same user who could upload/delete before can do so from the centralized page; an ineligible user sees no unauthorized action.
- The phase sidebar no longer presents Deliverables or a file count.
- No stored file is copied, moved or made public.

## Verification

- Tier: medium (bounded StudioFlow navigation and user-facing route; no schema/auth/service change). Per-command timeout: 15 minutes.
- Read the installed Next.js route guide before creating the route. Add a direct route/navigation regression test or extend the relevant deterministic StudioFlow test, and run it with `src/apps/studioflow/public/nav.test.ts` plus the existing affected Deliverables/service-surface test as consumer coverage.
- Run `node scripts/verify.mjs --tier medium --build --tests src/apps/studioflow/public/nav.test.ts src/apps/studioflow/phases/service-surface.test.ts`, including its boundary, legacy-runtime, typecheck, lint, production build and whitespace checks.
- Browser acceptance is Reviewer-owned and owner-deferred. Record the exact centralized-page scenario in the browser backlog; no browser PASS is claimed.

## Reviewer Acceptance

- On a disposable project with at least two phases, confirm the new tab placement, active state, phase order, file/download action, authorized upload and manager deletion at desktop and 375 px.
- Confirm a phase detail no longer exposes Deliverables. The prior R9.139 one-file replacement browser case remains pending independently.

## Regression Risks and Recovery

- A route or active-tab mistake can strand users or present duplicate file controls. Recovery is to revert only the centralized UI revision; private files and access rules are untouched.

## Executor Prompt

You are operating in the owner-authorized combined Lead/Executor session. Location: kantor. Read `AGENTS.md`, the installed Next.js route guide and this READY `PLAN.md`; implement only the centralized StudioFlow Deliverables UI, use the existing private-file boundary, run the locked medium gate, update the changelog and browser backlog, then commit local revision R9.141. Do not claim independent Claude review or browser acceptance.
