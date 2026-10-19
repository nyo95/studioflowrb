# StudioFlow KB — Deliverables and Timeline owner direction

Status: owner direction recorded; runtime redesign deferred
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

Owner direction: “Deliverables yang sekarang strukturnya jadi satu per fase, ubah mengikuti legacy.” The evidence shows that “one per phase” also describes legacy, so this phrase does not uniquely select a new data model.

Do not change runtime behavior until these points are resolved from the owner's intended legacy experience:

1. Is the requested change a standalone project-wide Deliverables dashboard, while persistence remains phase-owned?
2. Should a new upload replace every prior phase file like legacy, or preserve the rebuild's version history and expiry rules?
3. Does one visible row mean one current file total, or one logical deliverable slot with versions?
4. Are external links still accepted alongside managed files?
5. Should upload authority follow legacy seat ownership: Drafter for Construction Drawing, Designer for every other phase, with Platform Owner recovery only?

Safety floor regardless of the answer: authenticated private reads, project-detail assignment access, current ObjectStorage, audit events, transaction-scoped metadata writes, and cleanup only after a successful replacement stay mandatory. Never restore legacy public paths, local-file coupling, role enums, or direct page Prisma.

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

R9.137 applies only the clear authority slice: portfolio Timeline is a Studio Manager view, and mutation controls/services require `project.manage + project.override` (Platform Owner authority). It intentionally does not replace the Fit Out Start calculation or redesign the Gantt.

## 5. Timeline — contract required before runtime redesign

The next Work Order must settle:

1. Which stored field is canonical Handover, and whether existing `opening_date`, `fit_out_start_date`, or a new field migrates into it.
2. Exact backward dependency graph and duration source for every phase, including parallel phases and two-step Construction Drawing.
3. Overdue definition: phase planned end vs actual completion, current active phase only vs every unfinished phase, and working-day vs calendar-day count.
4. What a manual Platform Owner adjustment overrides: Handover only, one milestone, one phase, or the whole generated plan; and how later recalculation treats it.
5. Presentation for on-track, due-today, and overdue states on Home, project Timeline, and portfolio Timeline.
6. Migration/fallback for existing projects that have manual planned dates but no canonical Handover.

Until then, preserve existing dates and audits; do not destructively rewrite or silently reinterpret them.
