# Active Plan

Plan ID: WO-SF-PRESENTATION-01
Scope: StudioFlow Presentation Manager — project-owned boards with multi-image slides and editable annotations
Target revision: R8.194
Status: READY
Priority: P2
Owner: owner (Product Owner)
Last updated: 2026-09-29

## Outcome

A StudioFlow project can keep a Presentation board containing several uploaded render images. Each image can carry
editable pins, optionally linked to a Product Schedule entry or left blank temporarily. The board can be printed or
saved as PDF, one slide per page.

WO-SR-01's browser acceptance remains outstanding and untouched by this Work Order. This plan neither closes nor
changes sample-request behavior.

## Context and Evidence

- `docs/apps/studioflow/SF-PRESENTATION-PLAN.md` records the owner request and allowed legacy behavior.
- `docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md` permits porting the pinned legacy RenderBoard behavior into
  StudioFlow, but not legacy code, storage, database, or UI infrastructure.
- Current StudioFlow already provides project workspace navigation, Schedule reads, private object storage, audit,
  print/PDF documents, and multi-file `FileDropZone`; no shared UI extension is needed for multiple uploads.

## Locked Decisions

- Presentation is app-owned and project-scoped inside StudioFlow; it has no cross-app read/write boundary.
- A board holds many slides. Slides use device-uploaded PNG, JPEG, or WebP images stored privately; no Deliverables or
  Schedule-photo import is included.
- Export is the established browser print view / PDF save flow, not a `.pptx` generator.
- Each annotation stores percentage coordinates, an optional Schedule entry link, label side, and optional note.
  An annotation may remain wholly blank until the user fills it later.
- Read access requires StudioFlow access plus project read. Mutations require the new
  `studioflow.presentation.manage` permission and an unarchived project.

## Business Rules and Architecture Constraints

- ADD app-owned Presentation data/service; REUSE StudioFlow storage, audit, authorization, route/nav, Schedule data,
  asset cleanup, and UI Engine document-print components.
- Board deletion cascades its slides and annotations. Slide deletion cascades its annotations. Schedule-entry deletion
  sets an annotation link to null. Private slide objects are released only after their database references are gone.
- Linked Schedule labels are resolved from current Schedule data on read; no copied product text becomes a second
  source of truth.
- The existing `FileDropZone` already supports multiple files. Do not alter it.

## Backend Contract

- Add board, slide, and annotation persistence in the `studioflow` schema and a matching modular Presentation service.
- Expose board list/detail reads and commands to create, rename, reorder, and delete boards; add, reorder, and delete
  slides; and add, update, and delete annotations.
- Validate image type/content and size through the existing StudioFlow image rules, validate pins in the 0–100 range,
  enforce project ownership on every id, record meaningful audit events, and clean up unreferenced slide storage.
- Add the permission to StudioFlow's public vocabulary and application registration.

## UI Contract

Provide only the functional StudioFlow wiring needed to use the backend: project navigation entry, board list/detail,
multi-file upload, slide choice/reorder controls, pin add/move/edit/delete controls, and a print route. The work must
use existing UI Engine components and patterns. Visual refinement remains a later Lead-owned pass.

## Boundaries and Non-goals

- No real PowerPoint generation, external presentation sharing, comments, collaboration, live updates, or importing
  existing images from other StudioFlow areas.
- Do not modify Master Data, BQ, platform notification behavior, or sample-request acceptance records.
- Do not alter the existing single-image `ImageWorkspace` behavior.

## Acceptance Criteria

- A permitted StudioFlow user can create a board, upload several valid images, and see them as independently ordered slides.
- A permitted user can place, move, edit, and remove annotations; a blank pin is valid; a linked pin only accepts a
  Schedule entry from the same project; linked labels reflect current Schedule information.
- Unpermitted users cannot mutate Presentation; archived projects are read-only; deleting a board/slide removes its
  dependent records and eventually releases an unreferenced object.
- The Presentation project route and print route load for an authorized user. The print document renders one slide per
  page with its pins and legend.

## Verification

- Add focused Presentation service integration coverage for permissions, ownership, validation, lifecycle, Schedule
  linking, and storage cleanup.
- Apply the additive migration to the selected office rebuild dev and disposable test databases, regenerate Prisma, and
  run `npm test`, `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, `npm run check:legacy-runtime`, and
  `npm run build`.

## Reviewer Acceptance

- Browser: create a board, upload multiple images, manipulate a linked and a blank pin, check read-only/denied states,
  and open the print/PDF view.
- Sample-request browser acceptance remains separate and open.

## Regression Risks and Recovery

The primary risk is orphaned private image storage after a failed write or a deletion. Upload before persistence,
remove failed uploads on rollback, and extend the existing reference-aware cleanup check. Migration is additive and
the local revision can be reverted if needed.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this `PLAN.md`, then
implement the entire READY Presentation Manager outcome and nothing beyond it. Preserve unrelated owner work and the
open sample-request acceptance state. Run the required checks, update `CHANGELOG.md`, and create local revision
R8.194. Stop only for a material locked-decision conflict or unsafe boundary; otherwise report the commit, checks,
limitations, and remaining unrelated dirty files.
