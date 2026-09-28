# Active Plan

Status: **READY**

## SF-PRESENTATION — Presentation Manager (StudioFlow module)

### Origin

Owner request (2026-09-26 session): a centralized, non-destructive annotation
board over design renders — "seperti PPT yang bisa dianotasi" — to replace
sending clients/vendors a manually-annotated PowerPoint. Reviewed against:

- legacy evidence (`nyo95/studioflow` @ `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`,
  read-only, public GitHub, matches the pinned commit in
  `D-SF-RECOVERY-DISCOVERY.md`): `RenderBoard`/`RenderAnnotation` — a
  project-owned board holding a render image, with non-destructive pin
  callouts (x/y %) each optionally linked to a Product Schedule entry. Listed
  in `docs/archive/studioflow-rb/studioflow-schedule-contract.md` §8 as
  `RenderAnnotation on schedule entries | DEFER | Not contracted`. Verified
  it has **no functional dependency on the SketchUp plugin/sync** — plain
  CRUD, gated by the same permission as the rest of Product Schedule — so it
  is not blocked by SketchUp's own deferred status (D-SF-06).
- current rebuild: the shipped `ImageWorkspace` (UI Engine) freehand-pen
  annotation is a different, smaller thing — it bakes strokes into the raster
  at save time (no persisted annotation data, one photo at a time). Not a fit
  for "centralized" / re-editable / multi-image. Kept as-is; not touched by
  this plan.
- placement: owner confirmed (this session) this module is project-scoped,
  same as MOM and Product Schedule — so it is a **module inside the
  StudioFlow app** (`src/apps/studioflow/presentation`), not a new top-level
  app and not a cross-app capability. No public port needed: it reads
  Schedule entries same-app.

### Scope (this slice)

A `Board` (per project) holding many `Slide`s (bulk-imported images — this is
a deliberate scope expansion over legacy's one-image-per-board model, to
match "bulk import" / deck framing), each slide carrying independent,
non-destructive pin `Annotation`s. A pin may optionally link to one Product
Schedule entry (same-app FK) so its label can never drift from the entry's
real code/product name; or it may carry only a free-text note. Boards are
exportable as a print/PDF document, one page per slide, via the same shared
UI Engine print view already used by MOM and Product Schedule (UI_ENGINE
§13) — this is the third consumer of that pattern.

### Data model (new migration, `studioflow` schema)

Mirrors `SfScheduleEntry`'s conventions (`Sf<Thing>` model, `sf_snake_case`
table, cascade from project/board/slide):

- `SfPresentationBoard` — `id`, `project_id` (FK `SfProject`, cascade),
  `title`, `sort_order`, `created_by`, `created_at`, `updated_at`.
- `SfPresentationSlide` — `id`, `board_id` (FK cascade), `image_key`
  (private `ObjectStorage` key — **not** a raw URL like legacy; short-lived
  signed URLs on read, same pattern as Schedule/MOM photos), `image_ratio`
  (float?, natural w/h for stable layout — ported from legacy), `sort_order`,
  `created_at`, `updated_at`.
- `SfPresentationAnnotation` — `id`, `slide_id` (FK cascade), `schedule_entry_id`
  (nullable FK `SfScheduleEntry`, `onDelete: SetNull` — ported from legacy
  exactly), `pin_x`, `pin_y` (Float, 0–100, % of image), `label_side`
  (enum `auto`/`left`/`right`, ported from legacy `RenderLabelSide`), `note`
  (nullable text override), `sort_order`, `created_at`, `updated_at`.

### Service (`src/apps/studioflow/presentation/service.ts`)

Registered in `createStudioFlowService` alongside `mom`/`schedule` (same
composition pattern, `service.ts`). Commands: `createBoard`, `updateBoard`
(title/reorder), `deleteBoard`; `addSlides` (bulk — multiple images in one
call, one `ObjectStorage.put` each), `reorderSlides`, `deleteSlide`;
`addAnnotation`, `updateAnnotation` (move pin / edit note / relink entry),
`deleteAnnotation`. Reads: `listBoards(projectId)`, `getBoard(boardId)` —
resolves each linked annotation's entry to a live code/product-name/thumbnail
summary at read time (same "resolve against current Schedule data" principle
`domain/schedule.ts` already uses), never a frozen copy.

New permission: `studioflow.presentation.manage` (mutations), gated for reads
by the existing `access` + `projectRead` grants — same shape as
`momManage`/`scheduleManage` in `permissions.ts`.

### UI

New project-workspace nav entry "Presentation", same tier as MOM/Schedule
(`STUDIOFLOW_ROUTES.projectPresentation(projectId)` etc., following the
existing `nav.ts` pattern). Board list → open a board → slide strip + main
canvas on the current slide. Click the image to drop a pin; a small popover
picks "link to Schedule entry" (reuse Schedule's existing entry
search/picker) or leaves it a free-text-only pin; drag an existing pin to
reposition. Export button opens the print route
`/studioflow/print/projects/[projectId]/presentation/[boardId]`, built the
same way as the Schedule print page: `DocumentSheet`/`DocumentBlock`/
`PrintButton`/`PrintFormatPicker`, one page per slide, pins rendered as
numbered markers with a legend beneath resolving live entry data.

### REUSE / EXTEND / ADD ledger (`CORE.md` §14 placement test)

- **REUSE**: `ObjectStorage` (slide images); `DocumentSheet`/`PrintButton`/
  `PrintFormatPicker`/`printFormatFromSearchParams` (export — third consumer,
  no changes needed); StudioFlow permission/route/nav conventions; Schedule
  entry read (same app, plain query — no public port).
- **EXTEND**: `FileDropZone` (UI Engine) needs a multi-file variant for bulk
  import — check its current single-file assumption first; small, additive.
- **ADD, app-owned (not UI Engine)**: the click/drag pin-editor interaction.
  One consumer today; per `CORE.md` §14 rule 6, it stays inside
  `apps/studioflow/presentation` until a second consumer (e.g. MOM wanting
  pinned photo notes) makes it worth promoting — do not pre-build it generic.
- **No cross-app boundary anywhere in this slice** — everything is inside
  StudioFlow.

### Explicit defaults locked for this slice (flag if you want either changed)

1. **Export = PDF via the existing browser-print pattern**, not literal
   `.pptx` file generation. Real PPTX output is a materially different,
   larger tool (OOXML generation) — recommended only as a later fast-follow
   if PDF genuinely does not satisfy sending this to clients/vendors.
2. **Bulk import = local multi-file upload from device only.** Pulling
   images from existing Deliverables or Schedule option photos into a board
   is a reasonable fast-follow, not in this slice.

### Ordinary implementation choices (Executor's judgment, not locked here)

- Exact nav placement among the existing project tabs.
- Slide reorder interaction (drag handles vs. move-up/down), matching
  whichever pattern the Schedule list already uses.

### Checks required before handoff back

`tsc --noEmit`, `eslint .`, `node scripts/check-boundaries.mjs`, full
`npm test` (new integration test file for the presentation service,
mirroring `service.integration.test.ts`'s pattern), migration applied to
both the dev and disposable test databases. Browser walk is owed after the
commit (per the normal loop) — record it `[UNVERIFIED]` in
`docs/BACKLOG.md` if it can't be done in the same pass.

### Sizing

One coherent vertical slice (schema + service + UI + print + tests) per the
work-sizing rule in `docs/agent/README.md` — do not split by layer/table/route.

---

## Copy-ready Executor prompt

```
Lane: EXECUTOR. Location: kantor (load .env.kantor if present; this cloud
checkout has neither .env.rumah nor .env.kantor, so derive/confirm a local
disposable Postgres the same way R8.163/R8.164 did — verify the target name
explicitly contains studioflow_rebuild before any DB command).

Read docs/agent/EXECUTOR.md, then PLAN.md (SF-PRESENTATION, READY) in full.

Implement the Presentation Manager module exactly as scoped in PLAN.md:
schema (SfPresentationBoard/Slide/Annotation), service
(src/apps/studioflow/presentation/service.ts, registered in
service.ts), permission (studioflow.presentation.manage), UI (board
list/editor, pin drop/drag/link-to-schedule-entry, bulk multi-file import),
and the print/export route (third consumer of the shared UI Engine print
view — copy the Schedule print route's shape).

The two explicit defaults in PLAN.md (PDF-only export, device-upload-only
bulk import) are locked for this slice — do not expand scope to real .pptx
generation or Deliverables/Schedule-photo import without checking back.

Everything is same-app (inside apps/studioflow) — there is no cross-app
port to design here.

Before writing code: check FileDropZone's current single-file assumption
and confirm the EXTEND (multi-file) is actually needed, rather than assuming.

Finish with: implementation + integration tests + tsc/eslint/boundaries
clean + one local revision commit (R8.<next>, determined fresh from
CHANGELOG.md, never inferred) + updated CHANGELOG.md entry. Browser
acceptance may be deferred to [UNVERIFIED] in docs/BACKLOG.md if it can't
be done in the same pass. End with a Planner/Reviewer handoff prompt: outcome,
commit, checks run, limitations, dirty files, request for verdict.
```
