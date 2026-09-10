# StudioFlow Legacy Audit and Rebuild Roadmap

## Status and scope

**HISTORICAL AUDIT — discovery evidence retained; implementation status is
tracked in [`roadmap.md`](../../roadmap.md) and [`knownbug.md`](../../knownbug.md).** This
document records what legacy demonstrated and the risks that must not be carried
forward. It does not describe the current R7.40 completion state.

Legacy was inspected read-only at:

- repository: `D:/Misc/ProjectsHUB/studioflow`
- committed reference: `5fc605e304a12db6b5efe0a2c0271a2d9415b2da`
- branch at inspection: `main`

The legacy working tree was dirty. This audit relies on committed files only;
it does not treat local legacy edits as evidence and does not modify, run, or
connect to legacy code or infrastructure.

At the time of this historical audit, the committed rebuild registered only
Master Data and BQ. StudioFlow project-workflow and Library slices were
implemented later; use the current code, changelog, and operational trackers for
their status.

## Executive finding

Legacy contains valuable operational intent—projects, staged work, reviews,
tasks, meeting notes, deliverables, selection schedules, and SketchUp
exchange—but it combines them in one Prisma schema and several overlapping
technical patterns. The rebuild should preserve proven user outcomes, not the
implementation shape.

The first StudioFlow rebuild must therefore begin as a bounded project-workflow
app with explicit public boundaries. It must not start by importing the legacy
schema, local upload APIs, role enum, compatibility readers, or the large
schedule/SketchUp workflows.

## Evidence map

| Legacy concern | Committed evidence inspected | What it proves |
| --- | --- | --- |
| Project workspace | `src/app/(dashboard)/projects/*`, `src/lib/services/project-service.ts`, `Project`, `Phase`, `Revision`, `Activity` models | Projects have a structured phase/revision workflow plus project-level work items. |
| Phase review lifecycle | `src/lib/services/phase-service.ts`, `src/lib/domain/phase-policy.ts`, phase route | Legacy supports sequential activation, internal/client review, rejection, bypass, revision creation, and task/checklist blockers. |
| Tasks and checklists | `Activity`, `ProjectChecklist`, `ChecklistTemplate`, `src/lib/services/checklist-*`, task feed | Work items exist in multiple contexts: phase revisions, project-level tasks, deferred tasks, and checklists. |
| Schedule/product selection | `src/extensions/schedule/services/schedule-service.ts`, schedule models and routes | A project schedule combines templates, catalog snapshots, options, numbering, approvals, manual and import/plugin origins. |
| Meeting minutes | `ProjectMomDocument`, `ProjectMomItem`, `ProjectMomPoint`, `ProjectMomImage`, `extensions/mom` | MoM is its own ordered document hierarchy within a project. |
| Deliverables/files | upload routes, `src/lib/deliverable-storage.ts`, `File`, `TemporaryAttachment` | Files use runtime local disk with a mix of public and authenticated URL paths. |
| SketchUp exchange | `SketchupProject`, `SketchupMaterial`, `SketchupFFE`, `SketchupMergeAction`, `extensions/sketchup` | An external-plugin bridge owns code synchronization and a queued merge protocol. |
| Access and audit | `User.role`, `core/rbac/*`, `core/platform/audit/compat.ts` | Legacy mixes fixed app roles, permission matrices, and compatibility/audit layers. |
| Master Data and BQ | legacy `subapps/master-data/*`, `subapps/bq/*` and models | These are independent product domains and already have separate rebuild apps; they must not be recreated inside StudioFlow. |

## Confirmed debt and rebuild disposition

| Finding | Evidence | Risk | Disposition |
| --- | --- | --- | --- |
| One schema combines platform identity, project workflow, files, Master Data, BQ, schedules, MoM, and SketchUp. | Legacy `prisma/schema.prisma` declares all these models together. | Ownership and migrations cannot evolve independently; cross-domain changes become high-risk. | **PURGE** monolith shape. Create StudioFlow-owned persistence only after a public contract is locked; consume Master Data/BQ through their public ports. |
| Access uses a fixed `Role` enum alongside a role-to-permission matrix and a compatibility `RBAC` adapter. | `User.role`, `core/rbac/rbac.ts`, `core/rbac/permissions.ts`. | Business roles, system roles, and permissions are coupled; exceptions accumulate in guards. | **PURGE** the enum/compatibility model. **REUSE** rebuilt persisted RBAC and grants; StudioFlow owns only its permission vocabulary and contextual policy. |
| Upload endpoints write to runtime disk. The general media endpoint accepts a caller-selected `folder` and only checks the subsequent path. | `src/app/api/upload/media/route.ts`, `upload/library/route.ts`, `upload/temp/route.ts`, `deliverable-storage.ts`. | Vercel storage is non-durable; the general endpoint has an unsafe storage-boundary design; error responses expose raw error text. | **PURGE** all local upload routes. **REUSE** the planned shared Supabase Storage capability in [`PLATFORM-ASSET-STORAGE-ROADMAP.md`](../platform/PLATFORM-ASSET-STORAGE-ROADMAP.md). |
| Phase decisions, review state, revision copying, and task blockers are spread across services, UI routes, guards, and audit calls. | `phase-service.ts`, phase page, project service, task feed. | The lifecycle is difficult to reason about and easy to alter accidentally; review/bypass semantics are not a compact business contract. | **MERGE/FIX** into one explicit StudioFlow workflow state machine, after owners confirm the required states and transitions. |
| Tasks are represented as revision activities, phase-tagged deferred activities, project-level activities, and hierarchical project checklists. | `Activity`, `ProjectChecklist`, task feed and phase-service blockers. | Similar concepts have different completion and blocking rules; reporting can drift from approval rules. | **FIX** by defining one work-item vocabulary and one documented blocker projection. Do not collapse entities until the owner confirms which distinctions are operationally required. |
| Schedule code contains snapshot compatibility reads, code normalization, negative temporary sequence values, and two-step renumbering to avoid uniqueness conflicts. | `schedule-service.ts`, `schedule/display-utils.ts`, schedule models. | It is highly stateful, has substantial accidental complexity, and carries old shapes into new paths. | **DEFER**. Rebuild only after a standalone Schedule contract defines identifiers, ordering, option approval, and immutable catalog snapshots. |
| SketchUp uses a queue of merge actions and temporary-code hops to avoid rename collisions. | `extensions/sketchup/actions/sketchup-actions.ts`, `merge-queue.ts`, SketchUp models/routes. | External synchronization needs idempotency, authentication, retries, observability, and reconciliation—not just server actions. | **DEFER** as an integration adapter. No plugin endpoint enters the first StudioFlow release. |
| Audit contains schema-capability checks, compatibility raw queries, and legacy payload readers. | `core/platform/audit/compat.ts`, `record.ts`, `read-models.ts`. | Historical schema drift leaks into normal reads and increases maintenance cost. | **PURGE** compatibility readers. **REUSE** the rebuild audit contract with stable, domain-owned event metadata. |
| Test inventory covers utilities and isolated schedule/SketchUp helpers, but no committed end-to-end characterization suite was found for project lifecycle, uploads, or authorization routes. | Committed `*.test.ts(x)` inventory; project/phase/upload/auth paths. | Critical workflow behavior is vulnerable to regressions and legacy implementation cannot be treated as automatically correct. | **ADD** characterization tests only for owner-approved KEEP behavior before each rebuild slice. |
| Project pages directly query Prisma while other paths route through services/actions; imports include both `@/core/platform/db` and `@/lib/db`. | project, phase, and SketchUp route files. | Boundary and transaction rules are inconsistent. | **PURGE** mixed access patterns. Rebuild routes stay thin and invoke StudioFlow application services only. |

## Business logic: preserve intent, re-decide policy

The following are observed capabilities, not approved rebuild requirements:

| Legacy behavior | Rebuild treatment |
| --- | --- |
| Project has client, area, opening date, priority, designer/drafter PICs, status, and ordered phases. | Candidate for the first StudioFlow slice. Confirm mandatory fields, participants, and ownership before schema design. |
| A phase moves through pending, active, internal/client review, ready/completed; a bypass and an administrative reset exist. | Define the minimum valid lifecycle and approval authority first. Bypass/reset require explicit audit reason and must not be copied by default. |
| Rejection creates a new revision and transforms feedback into TODOs. | Preserve only if users rely on revision history. Define whether feedback is a work item, comment, or immutable review record; do not encode it as a side effect without a contract. |
| Incomplete activities and selected checklist items block a phase decision. | Define one blocker query and whether subtasks, deferred work, and project-wide tasks block a phase. |
| MoM uses ordered documents, sections/items, points, images, and print. | A separate optional StudioFlow module after project identity and membership exist. |
| Product schedules pull catalog data, offer alternatives, approvals, manual entries, imports, and plugin entries. | Treat as a separate procurement/selection domain. Read Master Data through a versioned public DTO and snapshot only facts needed by the schedule. |

## Rebuild roadmap

### Gate 0 — owner decisions and characterization

Before application code, produce a StudioFlow contract that answers:

1. What is the minimum project lifecycle and which transitions are actually used?
2. Who may create, edit, submit, review, approve, reopen, bypass, or delete?
3. Which work items block which decisions, and which are informational only?
4. Are internal and client reviews materially different, including revision rules?
5. Is StudioFlow a project workspace only in its first release, or must it include MoM, schedule, deliverables, or SketchUp?
6. Which Master Data and BQ facts are read, and which snapshots must remain historical?

Write behavior-focused characterization tests for the approved answers only. Do
not derive policy from an enum, a screen label, or legacy data shape alone.

### Phase 1 — StudioFlow application foundation

- Register a distinct `studioflow` app and its public permission list in the
  existing platform registry.
- Add only StudioFlow project ownership and membership persistence.
- Build application services behind thin server boundaries; no direct Prisma in
  UI routes and no app-specific roles in Platform Core.
- Provide a project directory, project detail, authorization, audit, and
  standard loading/empty/error/permission states.

### Phase 2 — minimum phase workflow

- Implement the owner-approved phase state machine with a single transition
  authority, reasoned overrides, and audit events.
- Model review/revision only where Gate 0 proves it is required.
- Add concurrency and permission tests for every transition.

### Phase 3 — work items and checklists

- Introduce the smallest vocabulary that can represent the approved work and
  blocker rules.
- Add task assignment, completion, ordering, and a deterministic projection
  for phase blockers.
- Avoid parallel `Activity`/checklist semantics unless a confirmed workflow
  requires distinct entities.

### Phase 4 — artifacts and meeting minutes

- Consume the shared storage port only after the Platform Asset Storage
  roadmap is executed.
- Add deliverable and MoM modules independently, with explicit access,
  retention, download, preview, audit, and deletion rules.
- Never restore local filesystem uploads or public temporary URLs.

### Phase 5 — schedule selection

- Activate only with a dedicated Schedule contract and user journey.
- Use a stable schedule-item identity plus deliberate display ordering; do not
  make visible code normalization the primary consistency mechanism.
- Read Master Data through its public read port; snapshot selected facts when
  later Master Data edits must not rewrite project history.

### Phase 6 — external integrations

- Treat SketchUp as an authenticated, idempotent integration with explicit
  synchronization records, retry/reconciliation, rate limiting, and
  observability.
- Keep plugin-specific code and permissions inside StudioFlow integration
  boundaries, not Core or UI Engine.

### Phase 7 — operational hardening and release

- Add production monitoring, backup/retention strategy, rate limits, and
  audit review surfaces.
- Run browser workflow checks across desktop, collapsed rail, and narrow
  viewport; test empty, loading, disabled, error, conflict, and destructive
  states.
- Publish only after an owner acceptance review maps every approved legacy
  behavior to KEEP, FIX, MERGE, or PURGE with exact rebuild destinations.

## Efficiency principles

1. **Start with one project slice.** Project directory, detail, membership,
   and minimal phases deliver usable value without Schedule or SketchUp.
2. **Use contracts instead of compatibility layers.** Public DTOs and
   snapshots are cheaper than reinterpreting historical tables at runtime.
3. **Prefer explicit state over derived patches.** A small state machine plus
   transition tests is easier to maintain than UI-dependent transition logic.
4. **One write path per aggregate.** Routes/actions validate transport input;
   one application service enforces authorization, transaction, audit, and
   invariants.
5. **Add abstractions only with a consumer.** Shared storage/image preparation
   is justified by Brand mark and future media; generic upload folders, plugin
   adapters, or workflow engines are not.

## Explicit exclusions from the first StudioFlow release

- Legacy database/data migration or any connection to legacy PostgreSQL.
- Legacy fixed roles, audit compatibility readers, and local filesystem files.
- Schedule import, product alternatives, SketchUp plugin/sync, code-merge
  queues, and render boards.
- Recreation of Master Data or BQ inside StudioFlow.
- Public self-registration, email invitations, notification jobs, or broad
  media management unless separately activated by the owner.
