# D-SF — Legacy Recovery Discovery

Status: **RATIFIED RECOVERY EVIDENCE — informs Foundation F-C/F-D; StudioFlow
implementation remains sequenced after Foundation freeze**

Date: 2026-09-14
Rebuild revision: R8.48
Evidence source: committed StudioFlow legacy only, repository
`D:\Misc\ProjectsHUB\studioflow`, remote
`https://github.com/nyo95/studioflow.git`, branch `main`, commit
`c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`.

This is recovery evidence, not an implementation specification. The legacy
working tree was not read: its untracked `foldering/` and recovered dump
artifacts were explicitly excluded. No legacy database, environment, process,
or application command was accessed. Every legacy citation below names a path
and symbol in the pinned commit.

## 1. Recovery rules and classification

| Classification | Meaning in this report |
|---|---|
| KEEP | Preserve the user outcome in the recovery implementation. |
| MERGE | Preserve it by combining it with an already approved rebuild contract. |
| ALREADY_REPLACED | The rebuild contract already supplies the corrected outcome. |
| REDESIGN | The user outcome may remain, but its legacy technical mechanism is prohibited. |
| PURGE | Do not recover this behavior or mechanism. |
| DECISION_REQUIRED | Evidence establishes the question but cannot choose product policy. |

The authoritative rebuild routes remain `/studioflow/projects/...`. Legacy
`/projects/...` is evidence only: a recovery work order may add a compatibility
redirect only after Planner specifies the supported old entry points. It must
not reinstate a parallel route tree.

## 2. End-to-end capability and route matrix

| Legacy route / evidence | Observed end-to-end behavior | Classification | Rebuild destination / recovery requirement |
|---|---|---|---|
| `src/app/(dashboard)/projects/page.tsx`; `src/actions/project-actions.ts` `bootstrapProject`, `updateProjectMetadata`, `completeProject`; `src/lib/services/project-service.ts` `projectService` | Project list and creation/edit/completion actions lead into a project workspace; service writes audit entries. | MERGE | `studioflow-project-contract.md` §§3–6 and `/studioflow/projects`; retain project lifecycle and audit, using current app service and grants. |
| `src/app/(dashboard)/projects/[id]/page.tsx`; `src/components/project-identity-strip.tsx`, `project-tasks-card.tsx` | Project overview combines identity, ordered phases, root checklist, and open work. | KEEP | SF-A project overview, composed from UI Engine primitives; no direct page-to-Prisma access. |
| `src/app/(dashboard)/projects/[id]/phases/[phaseId]/page.tsx`; `src/components/phase-actions.tsx`, `phase-checklist.tsx`, `activity-manager.tsx`, `phase-reading.tsx` | A phase surface presents iteration/phase state, review actions, checklist, activity, change/drawing items, reading tools, loading and error states. | MERGE | `studioflow-project-contract.md` §§4–6; retain workflow outcome and states, but implement one canonical phase/iteration service. |
| `src/actions/phase-actions.ts` `submitForInternalReview`, `approveInternal`, `submitForClientReview`, `approveClientPhase`, `rejectPhase`, `reopenPhase`, `completeSupervisionPhase`; `src/lib/services/phase-service.ts` matching `execute*` methods | State transitions use action/service boundaries, transaction work, invalidation, and audit. Pending tasks can block transition (`assertNoPendingTasks`). | MERGE | Project contract §§4.2–4.5; retain explicit transition/audit/precondition behavior, mapped to `studioflow.iteration.review` and `studioflow.phase.override`. |
| `src/app/(dashboard)/projects/[id]/activity/page.tsx`; `src/app/(dashboard)/activity/page.tsx`; `src/app/(dashboard)/activity-center/page.tsx`; `src/lib/services/task-feed.ts` `fromActivity`, `fromChecklistTask`, `groupTasksByProject`, `bucketTasksByDate` | Legacy has project activity plus global activity and date-bucketed feed views over activities and checklist tasks. | KEEP for project work; REDESIGN global surface | Activity Center is the one canonical Today workspace over project-owned work. Do not restore duplicate Activity Center/Today concepts. Upcoming is deferred as a future planning/Gantt/timeline surface, not the old list. |
| `src/lib/services/checklist-task.ts` `buildChecklistTree`, `reorderChecklistSiblings`, `applyChecklistFilter`; `src/lib/services/checklist-task.test.ts`; `src/lib/services/checklist-filter-rules.test.ts` | Project checklist tasks have a nested order and filtering semantics. | MERGE | Project contract task rules and `studioflow.task.manage`; recover tree/order behavior only if its current contract remains compatible. Template seeding is separately deferred. |
| `src/app/(dashboard)/projects/[id]/deliverables/page.tsx`; `src/actions/phase-actions.ts` `addDeliverable`; `src/lib/services/phase-service.ts` `deleteManagedDeliverableAsset` | Phase deliverables are revision-owned and mutation has a file lifecycle. | MERGE | Project contract §8 asset treatment. Keep delivered-asset provenance; use platform `ObjectStorage` boundary and opaque keys, never legacy URL/path handling. |
| `src/app/(dashboard)/projects/[id]/extensions/product-catalog/page.tsx`; `src/extensions/sketchup/components/CatalogBoard.tsx`, `ProductScheduleTabs.tsx`; `prisma/schema.prisma` `ProjectProductRequest`, `ProjectScheduleEntry`, `ProjectScheduleOption` | Product/schedule UI is scoped to a project and persists project-linked request, schedule-entry, and option records. | REDESIGN | Canonical ownership is `Project → Product Catalogue`. The existing global rebuild rows are discarded—not migrated, re-scoped, or retained as application history—only in a separately approved, safe cutover migration. |
| `src/app/(dashboard)/projects/[id]/mom/page.tsx`; `src/extensions/mom/actions/mom-actions.ts`; `src/extensions/mom/services/mom-service.ts` | Project MOM documents, ordered items/points/images, project-scope assertions, membership guard, invalidation, and audit. | ALREADY_REPLACED for ownership/lifecycle; REDESIGN for access implementation | The current `studioflow-mom-contract.md` is canonical. Retain the legacy content floor; use registered MOM grants rather than legacy membership and the existing draft-correction lifecycle. MOM remains a later recovery module, not SF-A backbone work. |
| `src/app/(dashboard)/projects/[id]/sketchup/page.tsx`; `src/extensions/sketchup/actions/sketchup-actions.ts` `generateApiKeyAction`, `queueSketchupMaterialMergeAction`, `normalizeSketchupMaterialCodesAction`; `src/extensions/sketchup/lib/catalog-ownership.ts` | Project integration creates/revokes a plugin key and manages material-code reconciliation/merge queue. | DEFER | Keep SketchUp as a later StudioFlow capability. Its future integration must be authenticated, idempotent, observable, retry-safe, reconcilable, and independent of legacy DB/runtime; do not design or activate the adapter now. |
| `src/app/(dashboard)/settings/profile/page.tsx`; `settings/clients/page.tsx`; `settings/studio/page.tsx`; `settings/database/page.tsx`; `src/actions/settings-actions.ts`, `database-actions.ts` | Settings has profile, client/studio configuration, and an admin database snapshot/restore screen. | ALREADY_REPLACED for platform profile; KEEP app workflow settings; PURGE database screen | Platform owns profile/account, organization/general application settings, appearance/theme, and platform access/settings. StudioFlow owns project naming, phase/general/phase-requirement templates, project-engine defaults, Schedule configuration, and other workflow defaults. App-level backup/restore stays absent. |
| `src/app/(dashboard)/projects/[id]/layout.tsx`; `src/components/project-layout-shell.tsx`; `src/components/project-live-provider.tsx`, `phase-live-provider.tsx` | Project navigation shell and live providers supply workspace navigation and realtime presence/update plumbing. | KEEP for shell; REDESIGN and DEFER live/chat | Reuse the app shell/navigation pattern through UI Engine. Future collaboration is StudioFlow-global/general, temporary presence and discussion—not a permanent Project record or recovered project chat. Retention, privacy, delivery, and mechanism remain deferred. |

## 3. Permission and ownership matrix

| Legacy evidence | Observed control / ownership | Classification | Rebuild rule |
|---|---|---|---|
| `src/core/rbac/rbac.ts`, `matrix.ts`, `constants.ts`; `prisma/schema.prisma` `Role`; `src/core/rbac/project-pic.ts` `DESIGNER_ROLES`, `DRAFTER_ROLES` | Fixed `ADMIN`, `DIC`, `DRIC`, `STAFF`, `DEVELOPER` role vocabulary, including PIC eligibility. | PURGE | Never recover application role enums. `studioflow.md` §3 remains authoritative: platform grant assignments, not StudioFlow roles. |
| `src/core/rbac/permissions.ts` `getProjectMembershipOrThrow`, `getProjectMetadataAccessOrThrow`, `assertPhaseContentMutationAccess`; actions cited above | Project membership/PIC and role checks are scattered across pages/actions. | PURGE as a mechanism | `studioflow.md` §3.2 has no project-scoped authorization. Rebuild services make one grant decision per operation; assignment is accountability, not authorization. |
| `src/actions/project-actions.ts` and `phase-actions.ts`; `src/lib/services/project-service.ts`, `phase-service.ts` | Mutations consistently pair transaction-scoped work with `insertAuditLog` and cache invalidation. | KEEP | All recovery mutations need one application-service transaction and platform audit event; cache/UI refresh follows the supported runtime API. |
| `src/extensions/mom/services/mom-service.ts` `assertProjectScope` and all create/update/delete/reorder methods | MOM descendants are verified against their parent document’s project before mutation. | KEEP | Preserve parent-chain scope validation as domain integrity, separate from authorization. |
| `src/app/(dashboard)/projects/[id]/page.tsx`; `extensions/product-catalog/page.tsx`; `sketchup/page.tsx` | Several server pages query Prisma directly and also make local authorization decisions. | REDESIGN | Pages call StudioFlow read services; they do not own Prisma shape, legacy role checks, or cross-app reads. |
| `prisma/schema.prisma` `Project`, `Phase`, `Revision`, `Activity`, `ProjectChecklist`, `ProjectMom*`, `Sketchup*`, `ProjectSchedule*` | Project is parent of workflow, checklist, MOM, SketchUp and schedule records; most relations cascade; audit references are retained/nullified. | KEEP for project ownership; REDESIGN for schema | Preserve logical project ownership and audit retention intent. Do not copy schema or migration history; model only approved rebuild contracts. |

## 4. Shared capability and cross-app/downstream matrix

| Consumer / evidence | Observed dependency or downstream read | Classification | Recovery boundary |
|---|---|---|---|
| Project, phase, MOM, SketchUp actions cited above | Authentication, authorization, audit, cache invalidation, and transaction use are cross-cutting. | MERGE | Reuse Core/platform public APIs; StudioFlow owns business transition policy and its permission vocabulary. |
| `src/lib/services/task-feed.ts`; `src/app/(dashboard)/activity-center/page.tsx` | Activity and checklist records are normalized into a unified task feed. | MERGE | One app-owned task projection may read StudioFlow workflow records. A generic task-feed utility is justified only after F-D proves a second consumer. |
| `src/app/(dashboard)/projects/[id]/extensions/product-catalog/page.tsx`; `prisma/schema.prisma` comments on `ProjectProductRequest` | Legacy had removed direct Master Data foreign keys and retained project-local product/schedule records. | ALREADY_REPLACED | `studioflow.md` §4: Master Data public read only; no cross-app schema FK, join, or write. Any Brand read goes through the public port. |
| `prisma/migrations/20260820200000_remove_bq_studioflow_project_reference/migration.sql`; `20260820201000_remove_work_price_project_refs/migration.sql`; `20260820210000_bq_project_local_lines/migration.sql` | Legacy explicitly removed BQ-to-StudioFlow project and price references and made BQ project lines local. | ALREADY_REPLACED | `studioflow.md` §4: no StudioFlow–BQ relationship, synchronization, or shared persisted identity. |
| `src/extensions/sketchup/components/CatalogBoard.tsx`, `ProductScheduleTabs.tsx`; `src/extensions/sketchup/utils/material-list-export.ts` | Product/schedule and material presentation/export are coupled to the SketchUp extension directory. | REDESIGN | Recovery must separate StudioFlow project catalogue/schedule domain from optional adapter-specific import/export code. No shared UI/private wrapper is reserved now. |
| `src/actions/database-actions.ts`; `settings/database/page.tsx` | App-level backup/restore reaches operational database behavior. | PURGE | Database administration is not an app feature or shared app capability. Platform operations may define it separately, outside StudioFlow grants/routes. |

## 5. Owner-ratified decision register

| ID | Owner-ratified outcome | Scope and guardrail |
|---|---|---|
| D-SF-01 | Activity Center **is** Today: one canonical daily-work surface. Upcoming is deferred toward a planning Gantt/timeline, not legacy-list restoration. | SF-A owns the Today work list; no duplicate Activity Center/Today route or concept. |
| D-SF-02 | Platform owns profile/account, organization/general settings, appearance/theme, and access/settings. StudioFlow owns workflow-operational settings: naming, phase/general/phase-requirement templates, project-engine defaults, and Schedule configuration. | F-C clarifies the boundary; SF-A later activates app workflow settings. Legacy Database Settings is PURGE. |
| D-SF-03 | Current MOM contract is canonical; legacy is the functional content floor only. | Preserve project-owned ordered content, print, and DRAFT → ISSUED → SUPERSEDED correction behavior. MOM stays independent from Phase/Iteration/Task/To-do/client response and remains later recovery work. |
| D-SF-04 | Replace the incorrect global Product Catalogue with `Project → Product Catalogue`; discard existing global rows at a later safe cutover. | Do not migrate, re-scope, or preserve the rows. This ratification authorizes disposition only; a destructive migration needs its own later plan. |
| D-SF-05 | Retain collaboration as StudioFlow-global/general, temporary realtime messages/presence/discussion—not project-scoped permanent records. | Detailed privacy, retention, delivery, presence, and persistence design remains deferred; no live/chat work is activated. |
| D-SF-06 | SketchUp integration remains deferred. | A later plan must be authenticated, idempotent, observable, retry-safe, reconcilable, and independent of legacy DB/runtime. |
| D-SF-07 | Use temporary redirects from meaningful legacy `/projects/...` entry points to canonical `/studioflow/projects/...` routes. | No parallel route tree and no permanent aliases. Remove aliases after accepted recovery cutover/parity. |

## 6. Contract reconciliation and next gate

The current contracts are consistent with the pinned evidence on: project
ownership, workflow transitions, audit intent, no cross-app BQ relationship,
Master Data read-only boundary, no legacy role enum, no project-scoped
authorization, project-owned MOM, and deferred SketchUp integration.

The owner ratified D-SF-01 through D-SF-07 on 2026-09-14. The prior global
Product Catalogue reuse-pool premise is not recovery authority; `Project →
Product Catalogue` is the future model and global rows are later discarded
through a separately approved destructive cutover. D-SF is complete. It informs
F-C/F-D now; StudioFlow implementation still begins only after F-E freeze.

## 7. Verification record

- Verified the exact legacy checkout identity by read-only Git: `main` HEAD
  equals `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27` and remote equals the URL
  recorded above.
- Read only committed blobs using Git object lookup; each path cited in the
  matrices was enumerated from that commit before its behavior was recorded.
- Re-read this report against `studioflow.md`,
  `studioflow-project-contract.md`, `studioflow-schedule-contract.md`, and
  `studioflow-mom-contract.md`. No application contract, schema, route,
  permission, dependency, or migration was changed.
