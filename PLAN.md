# Active Plan

Plan ID: WO-MODULES-M3-PRESENTATION-01 (Extract Presentation)
Scope: Presentation module/schema extraction with StudioFlow project, Schedule and retention boundaries
Module(s): presentation, studioflow, platform boundary harness
Target revision: R8.514
Status: READY
Priority: P1
Owner: direct decision 2026-10-12; Ideas extraction accepted in R8.513
Last updated: 2026-10-12 (Lead)

## Outcome

Presentation becomes a real optional module with its own app directory, schema, runtime, manifest and public door while preserving every current board, slide, pin, print, Moodboard, permission, module-state, URL and storage behavior. StudioFlow remains the sole owner of project access, Product Schedule facts and archive eligibility. This completes M3 so the Workspace backend may be planned next; it does not start Workspace work.

## Locked implementation

- Move the Presentation service, actions and UI/print implementation from StudioFlow into `src/apps/presentation`. Keep `/studioflow/projects/[projectId]/presentation/**` and `/studioflow/print/projects/[projectId]/presentation/**` as thin retained route entries explicitly owned by Presentation.
- Add `prisma/schema/presentation.prisma` in PostgreSQL schema `presentation`. Atomically move the label-side enum and board, slide and annotation tables with all ids, links, keys, ratios, ordering and timestamps intact. Keep board → slide and slide → annotation cascades inside Presentation; remove only board → StudioFlow project and annotation → StudioFlow Schedule entry foreign keys.
- Add exactly one named migration-isolation exception for this extraction. It may only create the Presentation schema, move/rename the four Presentation objects and their local constraints/indexes, drop the two cross-module foreign keys and run integrity guards. No duplicate tables, row copy, object copy or unrelated StudioFlow mutation is allowed.
- Retain module id/version/state, `requires: ["studioflow"]`, permission `studioflow.presentation.manage`, stored grants and every existing URL. Move manifest/nav/public ownership to Presentation; StudioFlow public code must no longer own or re-export Presentation internals.
- Complete the typed StudioFlow public document bridge: project display/access facts, canonical read/write gates, Presentation Schedule choices and batch live-link resolution. Presentation must not import StudioFlow internals or use StudioFlow Prisma delegates. Reads now enforce both project read permission and the existing per-project access rule rather than trusting the page caller.
- Store `project_id`, `created_by_id` and nullable `schedule_entry_id` as plain values. A missing or wrong-project Schedule entry renders as no linked item and is cleared idempotently. Schedule-entry deletion invokes the Presentation public cleanup hook after the StudioFlow commit; failed notification cannot expose stale data because reads remain missing-id tolerant.
- Presentation owns board/slide/pin validation, ordering, storage and audit. New images use `presentation/<projectId>/*`; existing `studioflow/presentation/*` keys remain valid and are not copied. Add a Presentation-owned failed-object cleanup ledger and retry path. Upload/copy failure must not leave rows or untracked objects.
- New audit events use app id/action prefix `presentation`; historical `studioflow.presentation.*` events are not rewritten. Audit metadata may include ids, counts, byte totals and placement facts, but never pin-note text or image contents.
- Publish `countProjectBoards`, board reads/commands, `addStoredImageToMoodboard`, `clearScheduleEntryLink` and `purgeArchivedProjectAssets` from `presentation/public`. Moodboard copy remains independently permission/project/writability gated and copy-based.
- Replace the current StudioFlow retention reach-through with a composition-owned coordinator. It calls the trusted Presentation purge hook even when Presentation is disabled, then the StudioFlow core purge. A Presentation failure leaves the project eligible for retry; core must never mark project assets purged while Presentation cleanup failed. Both modules own their rows, audit and object cleanup; neither receives the other's transaction/client.
- Project navigation obtains the board count through Presentation public only when built/enabled and degrades to zero without breaking the header. Print reads the same public board projection as the editor. Ideas and phase/workspace image actions call only Presentation public/coordinator doors.
- Extend boundary ownership for both the platform and document Presentation route subtrees. Remove the private StudioFlow Presentation folder and all `.presentation` service composition after callers move. Do not add a compatibility barrel for internals.

## Migration and compatibility verification

- Run the whole migration chain on a fresh verified disposable office rebuild database and incremental deploy on the standard disposable test database.
- On a populated disposable pre-extraction fixture, compare pre/post board, slide and annotation counts plus ids, project/board/slide links, nullable Schedule ids, creators, titles, keys, ratios, order and timestamps. Verify the old schema contains no duplicate Presentation table/type afterwards.
- Existing grants and module-state rows remain unchanged. Existing object keys still resolve; no object is copied or renamed.

## Service and regression verification

- Board CRUD/order; slide upload/order/delete; pin CRUD/position/side/note; live final/first Schedule label projection; missing/wrong-project entry cleanup; project ownership not-found; viewer/PIC/override; archived/completed refusal.
- Moodboard create-or-reuse and independent copy; Ideas-card and phase-note sources; Presentation disabled behavior; upload/copy rollback; cleanup retry.
- Navigation count, screen/editor read, print parity and print title; retained URLs and signed image reads.
- Archive purge while Presentation is enabled and disabled; retry after module hook, audit or object-delete failure; no core purge marker on partial failure; existing retention summary/count semantics preserved.
- `npm test`, typecheck, lint, architecture boundaries, legacy-runtime, production build, staged/unstaged whitespace. Append all browser work to the Reviewer backlog; do not block the Executor commit on browser execution.

## Reviewer acceptance after the Executor commit

- Re-run populated migration equality on a disposable rebuild database.
- Browser: board create/rename/delete, multi-image upload/reorder/delete, pin create/edit/delete with and without Schedule link, Moodboard from Ideas/note, print parity, module off/on data return, project navigation count, and desktop/375 px layouts.
- Exercise archive retention with Presentation enabled and disabled and confirm retry behavior before recording PASS. Workspace planning remains blocked until this acceptance passes.

## Non-goals

No Workspace model/UI; no Ideas redesign; no permission/URL redesign; no Schedule/MOM extraction; no new annotation behavior; no new dependency, event framework, provider, deployment, push or release.

## Executor Prompt

You are the Backend Executor on the same checkout. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, `PLAN.md`, `docs/apps/platform/MODULES-M2-COUPLING-REPORT.md`, `docs/MODULE-BOUNDARIES.md`, and the active StudioFlow contract. Implement WO-MODULES-M3-PRESENTATION-01 exactly as R8.514. Extract Presentation to its own module/schema/public boundary, complete only the locked StudioFlow project/Schedule ports and composition retention coordinator, preserve all data/objects/grants/routes/behavior, add migration and regression tests, update the browser backlog and changelog, run every mandatory Executor gate, and commit locally without pushing.
