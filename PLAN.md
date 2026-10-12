# Active Plan

Plan ID: WO-MODULES-M2-01 (Ideas and Presentation coupling discovery)
Scope: exhaustive coupling report and locked public-boundary/migration design
Module(s): studioflow, ideas, presentation, platform registry
Target revision: R8.510
Status: READY
Priority: P1
Owner: direct decision 2026-10-12; MODULES-DECISION D8-D9
Last updated: 2026-10-12 (Lead; RBAC review passed in R8.509)

## Outcome

Produce the M2 evidence needed to extract Ideas first and Presentation second without changing behavior. The report must trace every route, service, database relation, media lifecycle, permission/module gate, audit write, project lifecycle hook, test, and UI caller; define the exact public StudioFlow functions and module-owned ports; and lock the forward-only migration and compatibility order.

## Locked Rules

- This revision is discovery and contract only. It changes no runtime, schema, migration, dependency, permission, or UI behavior.
- Ideas and Presentation become sibling optional modules with their own manifests, schemas, runtimes, public doors, tests, and module-owned persistence.
- StudioFlow remains the owner of projects, project access/PIC rules, Schedule, phases/workspace source media, and project lifecycle. Optional modules may call only StudioFlow public functions and may not import StudioFlow internals.
- Cross-module database foreign keys are replaced with plain ids plus the minimum historical snapshot required by the current product meaning. Missing upstream records must degrade safely.
- Cross-module writes use explicit public commands/coordinators. No implicit database write, internal import, duplicate authorization engine, or shared mutable transaction across module schemas is introduced.
- Existing permissions remain `studioflow.ideas.manage` and `studioflow.presentation.manage` unless the report proves a compatibility-safe ownership move; no new role or permission is invented.
- Disabled modules retain data, expose no route/action capability, and do not break StudioFlow project reads. Project archive/delete/purge and object cleanup remain explicit, auditable coordination.
- The report must distinguish current coupling, required public contract, migration step, deletion/cleanup behavior, tests, risk, and estimated implementation cost for each edge.

## Required Evidence

- Ideas: private cards, usage links to Schedule options, save phase-note image, use image in Schedule, add image to Presentation moodboard, target-project listing, storage copy/cleanup, audit, module/RBAC gates, routes/actions/UI, and tests.
- Presentation: project boards, slides/images, Schedule-linked annotations, project navigation counts, print route, moodboard writer used by Ideas/Notes, storage cleanup, audit, module/RBAC gates, routes/actions/UI, and tests.
- StudioFlow public surface needed for project facts/access, writable target projects, Schedule reads/writes, authorized phase-note image reads, project lifecycle notifications, and any post-Workspace replacement needed by the approved plan.
- Exact schema move from `studioflow` to module-owned schemas, including enum/table/index names, plain-id snapshots, data copy/verification, old-object cleanup ownership, rollback boundary, and removal order.
- Boundary-check changes that forbid optional modules from importing StudioFlow internals while allowing only declared `public/` doors.

## Verification

- Repository-wide import/caller/schema search with exact symbol inventory.
- Each existing Ideas/Presentation user journey maps to one future owner and one explicit public boundary.
- Migration design preserves row counts, ids where safe, timestamps, object keys, ordering, links/snapshots, and disabled-module data.
- Lead reviews and locks the report before M3. No implementation begins from unresolved alternatives.
- Documentation whitespace checks and local revision commit.

## Non-goals

No Ideas or Presentation extraction yet; no Workspace schema/UI; no permission redesign; no Schedule/MOM modularization; no new dependency; no database command; no push, deployment, or release.

## Executor Prompt

You are the Backend Executor on the same checkout. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, `PLAN.md`, `docs/MODULE-BOUNDARIES.md`, `docs/apps/platform/MODULES-DECISION.md`, and the active StudioFlow contract. Execute WO-MODULES-M2-01 as a read-only code/schema discovery plus documentation revision R8.510. Trace every Ideas and Presentation coupling end to end, write the precise public-boundary and forward migration design, update the changelog, run documentation/boundary checks that apply, and commit locally without changing runtime behavior or pushing.
