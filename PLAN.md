# Active Plan

Plan ID: WO-SF-CDLIST-01
Scope: StudioFlow CD List (Construction Drawing item list) — schema, service, audit, tests. Backend only; the Lead builds the screen afterwards.
Target revision: R8.224
Status: READY
Priority: P2
Owner: owner (Product Owner). Go-ahead 2026-09-30 ("ya boleh ... sekalian build"); wave-2 item of `STUDIOFLOW-REWORK-CONTRACT.md` (RW-04). Details below decided by the Lead from legacy evidence.
Last updated: 2026-09-30

## Outcome

On a drafter-seat phase (Construction Drawing) the team keeps a checklist of drawings to produce: each item has a drawing number, a drawing name, a status
(Pending / In progress / Completed) and an optional assignee. Users with edit rights on that phase can add, edit, change status of, and delete items;
everyone who can read the project can see the list. The list is informational: it never blocks approving a phase.

## Context and Evidence

- Legacy (read-only, `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`): `prisma/schema.prisma` `model CDList` (`phase_id`, `group_code`, `drawing_name`,
  `status_enum` PENDING/IN_PROGRESS/COMPLETED, `assigned_to_id?`, `created_at`); `src/lib/services/phase-service.ts` `executeCreateCDItem` /
  `executeUpdateCDItem` / `executeUpdateCDStatus` / `executeDeleteCDItem` (each writes an audit log with project_id, phase_id, drawing details);
  `src/components/cd-list-table.tsx` (drawing-number normalisation `ID_<number>`, numeric sort, groups by hundreds); `project-service.ts` deletes items with their phases.
- Rebuild today: no CD List. A phase carries `seat_snapshot` (`drafter` for CD); access gate `requireProjectAccess(..., kind: "content", phaseId)` in
  `src/apps/studioflow/shared.ts` (drafter PIC or designer PIC on a drafter-seat phase, designer PIC elsewhere, or override) — REUSE, do not re-derive.
  Writable-phase loader `loadWritablePhase` (`shared.ts`) rejects archived projects and locked phases.
- Patterns to follow: `src/apps/studioflow/tasks/service.ts` and `phases/service.ts` (command shape, `runTransaction`, `writeAudit`), `permissions.ts`.

## Locked Decisions

- **Table `SfCdItem` (`sf_cd_item`, schema `studioflow`)**: `id` uuid, `phase_id` FK → `SfPhase` `onDelete: Cascade` (so project/phase deletion removes items, matching legacy),
  `drawing_code` text (normalised, see below), `drawing_name` text, `status` enum `SfCdItemStatus` `PENDING | IN_PROGRESS | COMPLETED` default `PENDING`,
  `assigned_to_id` text nullable (a user id; **no foreign key** to the platform, same convention as the other `sf_*` tables), `created_by_id`, `created_at`, `updated_at`.
  Index on `phase_id`. One additive migration.
- **Only on drafter-seat phases** (`seat_snapshot = 'drafter'`): any create/list on another phase is a validation error `CD_LIST_WRONG_PHASE`.
- **Drawing code** input is free text; normalise as legacy: strip a leading `ARS`/`ID` prefix and separators, upper-case, and store `ID_<number>`; an empty number stores `ID_`.
  Keep the normaliser as a small pure function in `src/apps/studioflow/domain/` with unit tests (cases: `12`, `id-12.5`, `ARS_301`, empty, non-numeric).
  `drawing_name` is required (trimmed, max 200) → `DRAWING_NAME_REQUIRED`.
- **Order and grouping are presentation:** `list` returns items sorted by numeric drawing code ascending (non-numeric last, then by `created_at`) and includes
  `group` = `floor(number/100)*100` as a string, or `"-"` when not numeric, exactly as legacy computed it.
- **Commands (`studioFlow.cdList`):** `list({ grants, projectId, phaseId })`, `create`, `update`, `setStatus`, `delete`. Reads require `studioflow.project.read`.
  Writes require base grant `studioflow.phase.work` AND `requireProjectAccess(kind: "content", phaseId)`, and the phase must be writable (`loadWritablePhase`).
  Items may be edited while the phase is in any writable state (before, during and after review); a **locked** (approved) phase rejects changes, same as checklist edits.
- **Assignee:** optional; when set it must be an active user holding `studioflow.phase.work` (same rule as task assignees) → `CD_ASSIGNEE_NOT_ELIGIBLE`. Clearing is allowed.
- **Audit:** `cd-item.created` / `cd-item.updated` (with changed fields) / `cd-item.status-changed` / `cd-item.deleted`, entity `cd_item`, metadata `{ projectId, phaseId, drawingCode, drawingName }`, following `writeAudit` usage.
- **Read model for the UI:** `getAccess` already reports `phases[].canEditContent`; the Lead uses that. No new access API.
- **Never affects phase gates:** do not add CD items to blockers, warnings, `todoBlockers` or approval checks.

## Business Rules and Architecture Constraints

- StudioFlow only; no cross-app reads/writes, no Master Data/BQ changes, no platform RBAC changes, no new permissions, no new dependency.
- New service module under `src/apps/studioflow/cd-list/` registered in `src/apps/studioflow/service.ts` like the other services; one canonical implementation.
- Respect the audit and error conventions used by `tasks/service.ts`; user-facing messages plain English.
- Migration is additive (new enum and table). Apply it to both approved rebuild databases; verify with `prisma migrate status`.

## Boundaries and Non-goals

No UI. No import/export. No CD List on non-drafter phases. No per-item comments/files. No effect on approvals. No dependencies between items. No push.

## Acceptance Criteria

- A designer PIC and the drafter PIC can create, edit, change status, and delete items on the CD phase; an unassigned staff member with `phase.work` is denied every write (`PERMISSION_DENIED`) but can list.
- A drafter PIC cannot use the CD List API on a designer-seat phase (wrong phase error) and creating on any non-drafter phase fails.
- A locked phase and an archived project reject writes; a project deleted/phase cascade removes items.
- Code normalisation, numeric sort and grouping match the cases in the unit tests; assignee eligibility enforced.
- Each write produces exactly one audit event with the fields above.

## Verification

`npm test`, `npx tsc --noEmit`, `npm run check`, eslint, `npm run build`. Render `/studioflow` and a project page once in `next dev` and report it (restart the dev server first: the permission registry loads at boot). STUDIOFLOW_LOCATION=kantor. Databases: only `studioflow_rebuild` (dev) and `studioflow_rebuild_test` on localhost:5433 (container `studioflowrb-gateb-test-db`); never any legacy database.

## Reviewer Acceptance

The Lead reviews the diff, then builds the CD List table on the Construction Drawing phase canvas (add, inline edit, status select, delete, sorted/grouped like legacy, read-only for viewers) and verifies it in the browser.

## Regression Risks and Recovery

Low: additive table and a new service module. Recovery: revert the single commit and drop `sf_cd_item` / `SfCdItemStatus` with a follow-up migration.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the entire READY backend
outcome and nothing beyond it. Inspect current repository evidence, preserve unrelated owner work, make sound in-scope implementation decisions, run the
required checks (including opening the touched routes in `next dev`), update `CHANGELOG.md`, and create the target local revision commit R8.224. Stop only for
a material locked-decision conflict or unsafe boundary, using the BLOCKED / CONFLICT report. Report the commit, checks, limitations, and remaining unrelated dirty files.
