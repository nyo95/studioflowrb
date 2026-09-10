# StudioFlow R7.52 — Project MOM

## Status

Active executable work order. Execute before R7.53 Product Catalogue.

## Objective

Implement the owner-approved project-owned MOM surface at the legacy minimum:
documents containing ordered items, points, and up to two ordered images per
item, with a safe draft/issue/supersede lifecycle.

## Locked rules

- MOM belongs only to a StudioFlow project and is available from project detail
  regardless of phase; Supervision is not a guard.
- No `phase_id`, `iteration_id`, `task_id`, `linked_task_id`, client-response,
  Master Data, BQ, or Product Catalogue relation.
- To-do “Write today's MOM” remains an ordinary independent To-do.
- Preserve text-only, list/point styles, ordered blocks/points, and max two
  ordered images per block.
- Drafts are editable/discardable and consume no sequence. Issue assigns the
  next per-project sequence atomically. Issued records are immutable; correction
  creates a new MOM and marks the old one superseded.
- Read/print uses project read; draft management uses `studioflow.mom.manage`;
  issue/supersede uses `studioflow.mom.issue`.
- Use canonical shared rich-text/image capabilities. Do not create MOM-local
  upload, crop, annotation, or storage implementations. If the shared image
  workspace is not yet available, stop and report the exact foundation gap
  rather than silently omitting the legacy-required image capability.

## In scope

- Schema/migration and service actions for the locked persisted shape.
- Project detail MOM list, editor, print view, confirmation, unsaved-input,
  loading, empty, error, disabled, permission, and immutable states.
- Project-scope checks for every child mutation and audit for material writes.
- Focused integration and UI regression tests, browser smoke test with a
  populated project, and documentation updates after verification.

## Out of scope

- No task conversion/linking, phase integration, automatic extraction, client
  delivery, Master Data reads, Product Catalogue, Schedule, BQ, or SketchUp.
- No speculative request/approval workflow beyond direct confirmed issue.

## Required evidence and gates

Read all mandatory docs and this contract before editing; inspect legacy at the
recorded commit read-only and classify behaviors KEEP/FIX/MERGE/PURGE. Record
HEAD/branch/dirty state. Run with `STUDIOFLOW_LOCATION=kantor`: Prisma validate,
typecheck, lint, boundaries, legacy-runtime, focused/full tests, build, and
desktop/collapsed/narrow browser smoke. Unavailable mandatory checks are not
pass. Do not close the roadmap item without populated browser evidence.

## Delivery

Update `CHANGELOG.md`, stage only owned files, inspect the staged diff, and make
exactly one local commit:

`R7.52 | feat(studioflow): add project-owned MOM`

Never push or alter remote state.
