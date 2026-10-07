# Active Plan

Plan ID: WO-SF-NOTE-IMG-01 (images on an iteration's client notes)
Scope: StudioFlow backend for images attached to one iteration's client notes: storage, add/remove commands, reads with signed URLs, cleanup on every delete path, and the history labels. The Lead builds the drag/paste/pick UI and the thumbnails in the next revision.
Target revisions: R8.393 (this plan), R8.394 (Executor: backend + minimal wiring), then the Lead's UI revision.
Status: READY
Priority: P1
Owner: Product Owner. Decisions confirmed by the owner in chat on 2026-10-07 (kantor).
Last updated: 2026-10-07

Previous plan WO-MD-SAMPLE-01 is BUILT (R8.385–R8.391); its open browser walk is in BACKLOG.

## Outcome

When a client answers with screenshots or marked-up photos, the designer drops,
pastes or picks them into the client notes of that iteration. They sit under
the notes, travel with the notes as the brief of the next iteration, stay in
the iteration history, and open large on click. Nothing is copied: the next
iteration reads the previous iteration's images.

## Locked Decisions (owner 2026-10-07: "Drag, tempel, pilih")

1. **One image set per iteration** (`SfRevision`), new table
   `studioflow.sf_iteration_image`: id, `iteration_id` (FK to `SfRevision`,
   `onDelete: Cascade`), `storage_key` (unique), `content_type`, `bytes`,
   `sort_order`, `uploaded_by_id`, `uploaded_by_name` (snapshot), `created_at`.
   Additive migration; apply to the rebuild dev and test databases only.
2. **Files:** PNG, JPEG or WebP, sniffed like Schedule/MOM images
   (`domain/images.ts`), at most **3 MB each** (same as MOM; the UI shrinks
   large photos before upload), at most **12 per iteration**
   (`ITERATION_IMAGE_LIMIT`). Private keys under
   `studioflow/iterations/<projectId>/…` through `platform/core/storage`; the
   object is written before the row and discarded if the transaction fails
   (the Schedule `setOptionImage` order).
3. **Commands** (same permission and project rules as `setIterationNote`,
   including closed iterations that may still get notes):
   `addIterationImage({ iterationId, file })` appends at the end;
   `removeIterationImage({ imageId })`. Both audit
   (`studioflow.iteration.image-added` / `-removed`, with History labels) and
   are **not undoable** (an upload is not reversible within the five-minute
   undo; removal asks for confirmation in the UI). No reorder in this work order.
4. **Reads:** every read that returns an iteration's `note` also returns its
   `images` (`{ id, url, contentType, bytes }`, ordered, short-lived signed
   URLs as for Schedule photos): the phase page iterations (current, previous
   brief, earlier iterations) and the project card's current iteration. No
   storage keys leave the server.
5. **Cleanup on every delete path:** removing an image releases the object
   after commit when nothing else references it (`asset-cleanup.ts`
   reference count gains `sf_iteration_image`); deleting a never-sent
   iteration counts images as attached work (`ITERATION_HAS_ATTACHED_WORK`),
   the same as files; the admin iteration reset and the archived-project purge
   (`projects/asset-retention.ts`) release the image keys like MOM images.
6. **Notes stay text.** Images are not inline in the note; the formatted note
   (R8.392) shows above the images.

## Backend Contract

- Prisma model, migration, and the image domain constants.
- Phase service commands and their server-action wiring (multipart for the
  file, like `setScheduleOptionImageAction`).
- Read changes per decision 4 in the phase reads and the project cards read.
- Cleanup per decision 5 and the History labels for the two audit actions.

## UI Contract (minimal wiring only; the Lead owns the design)

- Nothing beyond what is needed to exercise the commands in tests. The Lead
  builds the drop/paste/pick area, thumbnails and the large view.

## Boundaries and Non-goals

- No images in pinned notes, visit notes or MOM through this table.
- No image editing, captions, reorder or undo.
- No cross-app change.

## Acceptance Criteria (Executor)

1. Add stores the object and the row; type, size and count limits refuse with
   their own codes and write nothing (no stored object left behind).
2. Remove deletes the row and releases the object after commit; an object
   still referenced elsewhere is kept.
3. Permission and project rules match `setIterationNote` (refused for a
   viewer, an archived or inactive project, another project's iteration).
4. Reads return ordered images with signed URLs for the current, previous and
   earlier iterations and the card's current iteration; no storage keys.
5. A never-sent iteration with images cannot be deleted; admin reset and the
   archived-project purge release the image objects.
6. Audit events and History labels exist for add and remove; neither is
   offered for undo.

## Verification

`npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run check:boundaries`,
`npm run check:legacy-runtime`, `npm test` (all, nothing skipped), and
`npm run build`, which must pass. Integration tests for criteria 1–6.
Migration applied to the rebuild dev and test databases only, after
confirming both targets. Keep server-only modules out of any barrel that
client components import (the R8.386 build failure).

## Reviewer Acceptance

After the Lead's UI revision: drop, paste and pick images into client notes;
see them in the next iteration's brief and in earlier iterations; open one
large; remove one; try a 13th image and a PDF.

## Regression Risks and Recovery

Risk: orphaned objects if a delete path is missed; mitigated by decision 5 and
its tests. Risk: slow phase pages from signing many URLs; images are signed
only for the iterations a page shows. Recovery: revert R8.394; the migration
is additive (drop the table).

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this `PLAN.md` (WO-SF-NOTE-IMG-01), then implement
the entire READY backend outcome and nothing beyond it. Start from a clean tree
on `main`; confirm the next unused revision in `CHANGELOG.md` (expected
R8.394). Verify both database targets are the rebuild-only dev and test
databases before any database command. Do not build screens; the Lead designs
them next. Run the checks listed, including `npm run build` (it must pass),
update `CHANGELOG.md`, and create one local commit. Do not push. Stop with the
BLOCKED / CONFLICT report only for a locked-decision conflict or an unsafe
boundary; otherwise finish and return one Planner/Reviewer prompt with the
outcome, commit, checks and test count, limitations, and dirty files.
