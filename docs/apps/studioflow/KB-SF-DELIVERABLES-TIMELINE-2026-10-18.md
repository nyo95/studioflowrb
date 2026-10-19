# StudioFlow KB — Deliverables and Timeline owner direction

Status: Deliverables authority matrix applied; Timeline decision record in progress
Owner conversation: 2026-10-18 (WIB)
Evidence checked: 2026-10-19 (UTC)

## 1. Evidence identity and method

The legacy repository was read only from committed Git objects:

- Repository: `https://github.com/nyo95/studioflow.git`
- Branch documented by recovery discovery: `main`
- Exact detached commit: `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`
- Checkout was clean. No legacy dependency install, runtime, environment, database, migration, or write was used.

Relevant committed paths:

- `src/app/(dashboard)/projects/[id]/deliverables/page.tsx`
- `src/components/deliverables-table.tsx`
- `src/components/deliverable-upload-dialog.tsx`
- `src/actions/phase-actions.ts` (`addDeliverable`)
- `src/lib/services/phase-service.ts` (`executeAddDeliverable`, managed-file cleanup)
- `src/core/rbac/permissions.ts` (`assertDeliverableUploadAccess`)
- `src/app/(dashboard)/upcoming/page.tsx`
- `src/lib/services/task-feed-query.ts`

## 2. Deliverables — observed legacy behavior

Legacy is also phase-based. Its project Deliverables dashboard explicitly renders exactly one compliance row per phase, not a free folder tree. Each row compares the newest uploaded file across that phase's revisions with the current revision and marks it outdated when the revision differs.

The row accepts either an uploaded managed file or an external link. Upload authority follows the phase seat: the assigned Drafter for Construction Drawing, the assigned Designer for other phases, plus the legacy admin level. Saving a new deliverable deletes every prior file row for that phase, creates one file on the chosen revision, audits the replacement ids, then removes replaced managed assets. In other words, legacy presents one current phase deliverable and replaces old phase files; it does not preserve the current rebuild's version-slot lifecycle.

The rebuild currently differs materially:

- files are still phase-owned, but multiple same-name versions are retained;
- each name forms a stable version slot with one Final and two newest working versions;
- working versions expire after 30 days;
- files remain tied to the round current at upload and show missing/current/outdated state;
- private storage is streamed through the current object-storage boundary.

## 3. Deliverables — owner direction and unresolved contract

Owner direction: “Deliverables yang sekarang strukturnya jadi satu per fase, ubah mengikuti legacy.” Follow-up confirmed on 2026-10-19: “di penyimpanan hanya menyimpan 1 file tiap phase.”

Locked implementation scope: phase-owned persistence remains; a successful upload replaces the prior file regardless of name; only one current managed private file remains per phase; no external-link type or project-wide dashboard is added. The existing phase-seat/PIC upload authorization remains in force. Existing multi-file data keeps its newest upload and queues older unreferenced object keys for retry-safe cleanup.

Safety floor: authenticated private reads, project-detail assignment access, current ObjectStorage, audit events, transaction-scoped metadata writes, and cleanup only after a successful replacement stay mandatory. Never restore legacy public paths, local-file coupling, role enums, or direct page Prisma.

### 3.1 Project authority matrix (owner-ratified)

This matrix restates the existing StudioFlow contract in operational terms. A
grant establishes the capability; a PIC assignment establishes who may work a
specific project. It is not a return to legacy fixed roles.

| Work | Assigned Designer | Assigned Drafter | Studio Manager | Platform Owner (`project.manage` + `project.override`) |
|---|---|---|---|---|
| Confidential project detail | assigned project | assigned project | every project, read-only work sections | every project |
| Project identity, client, PIC and archive | no | no | create/edit/archive and assign PIC | same, with recovery authority |
| Designer-seat phase rounds, notes and file upload | yes | no | read only | recovery override |
| Drafter-seat phase rounds, notes and file upload | yes | yes | read only | recovery override |
| MOM, Schedule and Presentation documents | yes | yes | read only unless separately assigned document authority and PIC access apply | recovery override |
| Deliverable download | assigned project | assigned project | every project | every project |
| Deliverable deletion | no | no | yes, for an open project | yes |
| Portfolio Timeline | assigned-project status | assigned-project status | whole portfolio, read-only | set Handover and audited manual override |

The intended split is deliberate: the PIC creates or replaces the file for the
phase they own; the Studio Manager is the accountable operational remover when
a delivered file must be withdrawn. A Manager does not thereby gain general
phase editing or upload rights. R9.141 exposed a service mismatch in that last
row—Manager Delete was visible but a non-PIC Manager was refused—so the
correction is tracked as `WO-SF-DELIVERABLE-MANAGER-DELETE-01`.

## 4. Timeline — evidence and owner direction

Legacy has no project portfolio Gantt or handover-based schedule engine at the pinned commit. Its `/upcoming` route groups task-feed rows by each item's due date. Therefore legacy cannot supply the requested Timeline calculation contract.

The rebuild currently computes Design Final, CD Mall, CD Final, END, Handover, and Opening forecast forward/backward around Fit Out Start using working-day intervals and holidays. Portfolio Gantt also permits stored project/phase dates. This does not yet match the new owner direction.

Owner direction now supersedes the interaction intent for future Timeline work:

- Timeline's primary purpose is to answer whether work is on time or overdue.
- The default plan is calculated automatically backward from the Handover date using office planning rules, dependencies/gaps, and holidays.
- Designer sees overdue/target information for assigned projects.
- Studio Manager sees the whole portfolio but is read-only.
- Only Platform Owner may set/change Handover or manually adjust calculated schedule dates; every adjustment is audited.
- Designer and Studio Manager do not drag or manually edit phase dates.

Follow-up owner decisions, 2026-10-19:

- Design Handover pulls the schedule forward and Opening pulls it backward. The
  generated plan must make a conflict visible; it must not silently prefer one
  anchor.
- A change to either anchor recalculates the generated plan. A Platform Owner
  adjustment is scoped to one phase only and persists when the surrounding plan
  is recalculated.
- Overdue means the currently active phase has passed its planned end date.
- Studio Manager date editing may be delegated in a later capability, but is
  disabled by default. Current Manager access stays read-only.
- A project with no Handover keeps its existing schedule until Handover is
  supplied.
- Timeline has two views over the same schedule: an office-style table and a
  calendar Gantt. Its progress/status is derived from the real project phase
  state and rounds, never selected manually.

Owner confirmation, 2026-10-19: office-table `Handover Radiant` and
`Handover Desain` are the same date. This is the project's canonical
Handover. It needs its own stored field: it must not overwrite the differently
meaningful Opening or Fit Out Start date.

Owner confirmation, 2026-10-19: working-day gaps are Studio-wide configurable
defaults. A Platform Owner may retain a one-phase exception for an exceptional
project; it does not change the studio default or other projects.

Owner confirmation, 2026-10-19: use the existing planning defaults for the
first automatic model. The complete table mapping is: Design Final → CD = 0
working days; CD → CD Final = 5; CD Final → END = 5; END → Submission/Start
Fit Out = 5; Start Fit Out → Design Handover = 40; and Design Handover →
Opening = 10. This makes explicit that Design Final and the start of CD are
the same default planning day.

Owner confirmation, 2026-10-19: work before Handover calculates backward from
the canonical Design Handover to project Start. Opening independently
calculates backward by its 10-day gap; a disagreement is visible rather than
silently resolved.

Owner confirmation, 2026-10-19: schedule state is derived from the actual
active phase. It is **On track** before its planned end, **Due today** on that
day, and **Overdue** afterward. Completed, pending and paused phases retain
their real workflow state rather than receiving a schedule-status label.

R9.137 applies only the clear authority slice: portfolio Timeline is a Studio Manager view, and mutation controls/services require `project.manage + project.override` (Platform Owner authority). It intentionally does not replace the Fit Out Start calculation or redesign the Gantt.

## 5. Timeline — remaining contract required before runtime redesign

The next Work Order must settle:

1. Studio-wide default working-day duration from project Start to Design Final. The current plan has no such interval, while the office table shows both columns. A project-specific Platform Owner exception follows the locked rule.

Until then, preserve existing dates and audits; do not destructively rewrite or silently reinterpret them.
