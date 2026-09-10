# StudioFlow R7.48 — Phase Deliverable Surface

Status: **ACTIVE EXECUTABLE WORK ORDER**

Manager: Codex

Executor: Claude/OpenCode

Locked implementation target: **R7.48**

Required starting point: clean `studioflow/contracts` checkout whose HEAD is the
R7.47 handoff commit, with R7.46 implementation commit
`3f11bfcfeccd3fcfa51e36d9b821dd944064e83b` in its history.

## 1. Objective

Put the current deliverable summary, next standard filename, and metadata/link
intake directly inside every expanded project phase. Keep the Files page as the
project-wide filing view. This slice does not yet redesign the combined
Task/deliverable work surface or implement MOM/Product Catalogue.

The legacy checkout and all legacy databases are out of scope. The required
behavior is already locked in the rebuild contracts and current code; do not
inspect or touch legacy for this work order.

## 2. Corrections to the earlier Claude plan

The earlier `Claude outputs/NEXT-SLICE-PLAN.md` is planning evidence, not this
work order. Two service gaps mean the slice is not composition-only:

1. `getNextFilename` currently includes a round label only when a DRAFT already
   exists. Contract §8.5 requires the next name before the file exists and
   before intake opens a draft. The read must preview the next server number
   without creating or reserving a round.
2. `resolveFolderPlacement` returns early for a no-round phase before checking
   `DONE`. That allows file intake into completed Supervision. Every completed
   phase must refuse intake until reopened.

The required Copy interaction is domain-neutral and has no canonical UI Engine
export today. Add it once to UI Engine; do not create a StudioFlow-local copy
primitive.

## 3. Locked behavior

### 3.1 Server read and current-file derivation

- Project detail calls `listFiles(grants, projectId)` once, not once per phase.
- `listFiles` already returns newest first. For each phase, current deliverable
  is the first file whose `folder_key` equals the phase snapshot's `folder_key`
  and whose `superseded_at` is null.
- A null phase `folder_key` has no phase deliverable. It must never consume the
  unsorted tray as a phase file.
- Serialize client props explicitly. `bytes` crosses the server/client boundary
  as a decimal string, dates as ISO strings, and the sent-round label is derived
  server-side from the matching iteration id. Do not pass Prisma objects or
  `bigint` into the client component.
- The summary shows standard filename, original filename, treatment, humanized
  size, dropped date, and sent state. If sent, show the round label. If LINKED,
  expose the existing safe external link. An empty phase says that no current
  deliverable is recorded.

### 3.2 Next standard filename

- A reader sees the next standard filename for every non-`DONE` phase with a
  non-null output folder.
- Extend `getNextFilename` without a write:
  - when a round-bearing phase has a DRAFT, use that DRAFT's number;
  - otherwise preview `max(existing iteration.number) + 1`, or `1` when none
    exists;
  - a no-round phase has no round token;
  - verify the phase belongs to the supplied project before using it;
  - do not create a draft, reserve a number, update state, or audit this read.
- Preview is advisory. `recordFile`/`linkFile` remain authoritative and may
  produce a later number after a concurrent write.
- Infer the preview extension from the current deliverable's original filename
  when one exists; otherwise show the extensionless standard base. Do not invent
  a phase-specific file type policy.
- A `DONE` phase shows neither a next filename nor intake; its existing Reopen
  action is the route back to work.

### 3.3 Canonical Copy control

- Add a domain-neutral public UI Engine `CopyButton` (or equivalently named
  canonical export) using the existing Button/IconButton language.
- It accepts the value and caller-owned accessible copy/success labels. It uses
  the browser clipboard API, communicates success without removing its
  accessible name, and handles clipboard rejection without claiming success.
- No StudioFlow vocabulary, persistence, toast policy, or business default may
  enter UI Engine.
- Export it through the one canonical UI Engine public surface and add focused
  tests for export, accessible label, success, and failure behavior.

### 3.4 Phase intake

- Reuse/extend the existing `DeliverableForm` and canonical `FileDropZone`.
  Add a fixed-folder mode instead of copying the form into `phase-section.tsx`.
- Fixed-folder mode submits one hidden `folder_key` and does not render the
  project-wide folder selector or unsorted option.
- Preserve both existing treatments supported by that form: metadata-only
  `RECORDED` and external `LINKED`. Never read or submit file bytes; picker has
  no `name` and only metadata reaches the action.
- Render intake only when the user holds `studioflow.iteration.manage`, the
  phase has a non-null folder key, and phase state is not `DONE`. A permanently
  unavailable control is absent, not disabled.
- Move the `DONE` check in `resolveFolderPlacement` before the `has_rounds`
  return so completed round-bearing and no-round phases both fail with the
  existing `studioflow.phase.closed` safe error.
- Existing record/link actions and cache revalidation remain canonical. Do not
  add a route-local persistence action.

### 3.5 Placement and visual states

- In each expanded phase, place a compact “Current deliverable” surface before
  phase To-dos and iteration history.
- Information order is: current file → next filename/copy → intake (when
  authorized). Existing phase actions and history stay functional.
- Verify empty, current-unsent, current-sent, LINKED, permission-hidden, DONE,
  long filename, desktop, collapsed rail, and narrow viewport states.
- Update the subordinate UX spec only where its old phase-row diagram would
  otherwise contradict this implemented placement.

## 4. Allowed files

Implementation may change only these areas unless a failing gate proves a
directly related need:

- `src/apps/studioflow/service.ts`
- `src/apps/studioflow/service.integration.test.ts`
- `src/app/(platform)/studioflow/[id]/page.tsx`
- `src/app/(platform)/studioflow/[id]/phase-section.tsx`
- `src/app/(platform)/studioflow/[id]/files/file-controls.tsx`
- focused tests beside those StudioFlow files
- the minimum UI Engine primitive/component, public export, and focused UI
  Engine tests required by §3.3
- `docs/apps/studioflow/studioflow-ux-spec.md`
- `docs/alignment.md`, `docs/roadmap.md`, `docs/knownbug.md`, and `CHANGELOG.md`
  only after their claims match verified implementation state

No Prisma schema or migration is authorized. No Master Data, BQ, MOM, Product
Catalogue/Schedule, storage backend, bulk intake, unsorted-tray redesign,
Task/work-surface redesign, or phase-component relocation is in scope.

## 5. Required tests

Add focused regression coverage proving:

1. filename preview uses an existing DRAFT number without writing;
2. filename preview uses max iteration number plus one when no DRAFT exists;
3. phase/project mismatch is refused;
4. completed Supervision and completed round-bearing phases both refuse record
   and link intake;
5. current-file derivation excludes superseded and wrong-folder records;
6. fixed-folder form submits the locked folder and exposes no folder selector;
7. phase intake consumes canonical `FileDropZone` and never submits file bytes;
8. `CopyButton` reports success only after clipboard resolution and preserves
   an accessible failure state;
9. Master Data and BQ tests/boundaries remain unchanged.

Do not weaken an existing assertion to make the implementation pass.

## 6. Gates and database safety

Set `STUDIOFLOW_LOCATION=kantor`. Before any database command, load
`.env.kantor` and prove the target is rebuild-only. Never use the development
database as the disposable test database and never connect to legacy.

Required commands:

```text
npm run typecheck
npm run lint
npm run check:boundaries
npm run check:legacy-runtime
npx prisma validate
npm test
npm run build
```

Database-backed tests require `DATABASE_URL` and `PLATFORM_TEST_DATABASE_URL`
to be the same explicitly disposable test database. If that target is absent,
the full test gate is unavailable, not passed. Run all non-database focused
tests, record the limitation, and stop before claiming completion. Do not point
the test harness at `studioflow_rebuild` merely to obtain a green result.

Browser acceptance is mandatory before the roadmap/alignment item is closed.
Use the running rebuild only. Capture the states in §3.5 at desktop and narrow
viewport; verify keyboard copy/drop-picker behavior and that a DONE phase has
no intake.

## 7. Completion and handback

- Preserve unrelated owner changes. Stop on any unlisted dirty file or contract
  ambiguity.
- Update `CHANGELOG.md` for R7.48 with exact checks and limitations.
- Close the corresponding roadmap/alignment line only after browser and
  persistence behavior are actually verified. KB-002/003/004 remain open.
- Stage only owned files, inspect cached diff and cached diff-check, then create
  exactly one local commit:

```text
R7.48 | feat(studioflow): put deliverable intake in phases
```

- Never push, publish, deploy, amend, squash, or touch legacy.
- Hand back the commit hash, changed files, test counts, browser evidence, and
  every skipped/unavailable gate. Codex will review; do not begin the next slice.
