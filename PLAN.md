# Active Plan

Plan ID: WO-SF-ACCESS-01
Scope: StudioFlow edit rights follow the project's PIC assignment (server enforcement, new permissions, access read model). Backend only; the Lead does the UI gating afterwards.
Target revision: R8.220
Status: READY
Priority: P1
Owner: owner (Product Owner). Decisions answered 2026-09-30: adopt the legacy rule with an admin override permission; every staff member may still view (read-only); separate PIC designer/drafter permissions; project-level documents are editable by the designer OR drafter PIC.
Last updated: 2026-09-30

## Outcome

Today any holder of a role permission (for example `studioflow.phase.work` or `studioflow.mom.manage`) can edit every project. After this change a
staff member can edit a project only when they are **assigned to it as PIC designer or PIC drafter** (rules below) or hold the new override
permission. Reading stays open to everyone who has `studioflow.project.read`. The PIC pickers list only people who may take that seat.

## Context and Evidence

- Rebuild today: authorization is grants only (`requireCommand(ctx, permission)` in `src/apps/studioflow/shared.ts`). The PIC fields
  `SfProject.pic_designer_id` / `pic_drafter_id` and each phase's `seat_snapshot` (`designer` | `drafter`, CD phase = drafter) exist but are used only for display
  and fallback assignee. `STUDIOFLOW-REWORK-CONTRACT.md` RW-02 and §3 said "no PIC-based authorization"; the owner reversed that on 2026-09-30 and the Lead updated the contract.
- Legacy evidence (`c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`, read-only): `src/core/rbac/guards.ts` `evaluateAccess`, `src/core/rbac/permissions.ts`
  `getProjectMembershipOrThrow`, `assertPhaseContentMutationAccess`. Legacy required BOTH the role permission and the assignment; ADMIN/DEVELOPER bypassed everything.
- Existing services and their current permission checks: `projects/service.ts`, `phases/service.ts`, `tasks/service.ts`, `mom/service.ts`, `schedule/service.ts`,
  `presentation/service.ts`, plus `library` and `today` where they mutate project data. `listAssignablePeople` and `assertPic` use `P.phaseWork` holders today.
- Permission registry: `src/apps/studioflow/permissions.ts`, registered in `src/app/app-registrations.ts`.

## Locked Decisions

- **Rule = base grant AND assignment.** Every mutating command keeps its current grant check and additionally passes the assignment gate below. The gate is a single
  shared helper in `src/apps/studioflow/shared.ts` (one implementation, unit-tested); services call it, nothing re-derives it.
- **New permissions (registered, labelled in plain English for Platform Access):**
  - `studioflow.project.override` — "Edit any project regardless of assignment" (replaces legacy "ADMIN always allowed"). Passes every gate below. Does not replace the base grant.
  - `studioflow.project.pic.designer` — "Can be assigned as a project's designer (PIC)".
  - `studioflow.project.pic.drafter` — "Can be assigned as a project's drafter (PIC)".
  - Keep `studioflow.phase.override` unchanged (it is the revision hard-reset command, a different thing).
- **Gate rules** (`actor` = the signed-in user; `override` = holds `project.override`):
  1. Project data (edit fields, priority, status, archive/restore, set PICs, project dates): PIC designer, or `override`. Creating a project and client management keep the base `project.manage` only (no project exists yet).
  2. Phase transitions (activate, submit, approve/reject, reopen, bypass, override-revision): PIC designer on every phase; PIC drafter only on a phase whose `seat_snapshot` is `drafter`; or `override`. The base grant (`phase.work` / `phase.review` / `phase.override`) is still required.
  3. Phase content (activities, checklist items attached to a phase, deliverables/files, deferrals): phase seat `drafter` → PIC drafter or PIC designer; any other phase → PIC designer only; or `override`.
  4. Project-level documents and lists not tied to a phase (MOM, Product Schedule and its sample requests, Presentation, Library, project-level checklist/tasks): PIC designer OR PIC drafter, or `override`.
  5. Reading: unchanged. Anyone with `project.read` may read everything, including Today and search.
- **Assignee rule unchanged:** tasks may still be assigned to any eligible staff (`phase.work` holders); this plan does not restrict assignment targets.
- **PIC eligibility:** `assertPic("designer")` requires the person to hold `studioflow.project.pic.designer` (and remain active); `assertPic("drafter")` requires `project.pic.drafter`.
  `listAssignablePeople` takes a `seat` argument and returns the matching holders. A project's existing PICs are never re-checked unless the PIC is being changed.
- **Read model for the UI:** add `projects.getAccess({ grants, actor, projectId })` returning `{ override, isDesigner, isDrafter, canEditProject, canEditDocuments, phases: Array<{ phaseId, canTransition, canEditContent }> }`, computed by the same helper. The Lead's UI consumes only this; it must never re-derive rules.
- **Existing data / deploy safety:** ship a data migration (no schema change if role grants are rows, otherwise the registry mechanism the repo already uses) so behavior does not silently lock people out: every role that currently holds `studioflow.phase.work` also receives both PIC permissions; every role that holds `studioflow.phase.override` receives `studioflow.project.override`. The owner tightens this afterwards in Platform Access. Inspect how grants are stored first; if grants are only configured in the UI and cannot be migrated safely, stop with BLOCKED / CONFLICT rather than guessing.
- Errors: a failed gate throws the existing `PERMISSION_DENIED`-family `AppError` with a plain message ("Only the project's assigned designer or drafter can change this.").
- Audit: unchanged. Do not audit denied attempts.

## Business Rules and Architecture Constraints

- StudioFlow only. Do not change Master Data, BQ, platform RBAC mechanics, or the Prisma schema beyond what the grant storage requires. No new dependency.
- Do not add abstraction layers beyond the one gate helper and the `getAccess` read model.
- Nothing outside StudioFlow may import the gate helper. Public exports only if a consumer already exists.
- Keep every existing test passing except tests that assert the old "any holder can edit any project" behavior; update those deliberately and list them in the report.

## Boundaries and Non-goals

No UI work (the Lead hides/disables controls afterwards). No per-phase permissions beyond `seat_snapshot`. No change to who can be an assignee. No project membership table. No change to Master Data or BQ. No push.

## Acceptance Criteria

- A designer PIC can edit their project everywhere; the drafter PIC can transition and edit content only on the drafter-seat phase and can edit project-level documents; an unassigned staff member with all base grants is denied every mutation on that project and can still read it; a user with `project.override` can edit any project.
- Unit tests for the gate helper cover all five rules and the override; integration tests cover at least one mutation per service (projects, phases, tasks, mom, schedule, presentation, library) for allowed and denied cases.
- `assertPic` and `listAssignablePeople` respect the seat permissions; changing a PIC to an ineligible person is rejected; an unchanged existing PIC is not re-checked.
- The deploy data migration leaves every current role able to do what it could before (no lock-out), verified by a test or a documented dry run against the dev database.

## Verification

`npm test`, `npx tsc --noEmit`, `npm run check`, eslint, `npm run build`. Render `/studioflow`, a project page, and the Projects list once in `next dev` and report it. Use STUDIOFLOW_LOCATION=kantor. Databases: only `studioflow_rebuild` (dev) and `studioflow_rebuild_test` on localhost:5433; never the stale scratch databases `studioflow_rebuild_browser_test` / `studioflow_rebuild_regression_test` and never any legacy database.

## Reviewer Acceptance

The Lead reviews the diff and the test list, then builds the UI gating from `getAccess` and verifies in the browser with three accounts (designer PIC, unassigned staff, override holder).

## Regression Risks and Recovery

Largest risk: a missed mutation path stays open, or a role loses access on deploy. Mitigate with the per-service integration tests and the grant-copy migration. Recovery: revert the single commit and, if the data migration ran, the reverse grant rows it recorded.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the entire READY backend
outcome and nothing beyond it. Inspect current repository evidence, preserve unrelated owner work, make sound in-scope implementation decisions, run the
required checks (including opening the touched routes in `next dev`), update `CHANGELOG.md`, and create the target local revision commit R8.220. Stop only for
a material locked-decision conflict or unsafe boundary, using the BLOCKED / CONFLICT report. Report the commit, checks, limitations, and remaining unrelated dirty files.
