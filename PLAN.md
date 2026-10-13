# Active Plan

Plan ID: WO-SF-WORKSPACE-03 (Workspace canvas backend: frames and cards keep their place on the board)
Scope: StudioFlow Workspace backend — geometry for sections (frames) and cards, one batch "place" command, reads, tests; minimal type pass-through only
Module(s): studioflow (core; Workspace is not an optional module)
Target revision: R8.531 (Executor). The Lead's canvas UI follows as its own revision.
Status: READY
Priority: P1
Owner: owner 2026-10-13 — accepted the canvas prototype as built in R8.529 ("sudah oke"), including 10 px snapping and the stacked document on a phone. Recorded in R8.530.
Last updated: 2026-10-13 (Lead, R8.530)

## Why

The accepted direction is the R8.529 prototype (`prototypes/workspace-canvas/`):
the project Workspace is a free canvas — sections are **frames** placed
anywhere, cards are placed anywhere inside them, cards size their height to
their content, everything snaps to an 8 px grid, the canvas pans with the
middle mouse button. Today the database only knows an order (`sort_order`), so
a card's place on the canvas would be lost on reload. This slice stores
positions and sizes. It changes no meaning of sections or cards.

## Owner decisions carried into the product (2026-10-13)

- Frames = the existing Workspace sections (R8.519); the default section
  (R8.525, `system_key = DEFAULT`, "Workspace") is the default frame. Frame
  delete rules stay: only an empty frame can be deleted, the default never.
- A card always belongs to a frame (`section_id` stays required). In the UI,
  dropping a card on empty canvas keeps it in its frame (Lead UI rule).
- A card's **height is never stored**: it follows its content. Its width and
  position are stored. Images stay part of a card (the existing card image
  gallery); there is no separate image card.
- Heading / bullet / checklist from the `/` menu are formatting inside the
  card body (the existing rich-text dialect), not a stored card type. Client
  feedback stays `origin = CLIENT_ANSWER`; Starred stays `is_pinned`.
- Pan and zoom are a personal view, kept in the browser only; never stored.
- On a phone, frames and cards read top to bottom in their stored order.

## Locked decisions

### Schema (one forward-only migration, `studioflow` schema)

- `SfWorkspaceSection` gains `canvas_x Int?`, `canvas_y Int?`,
  `canvas_w Int?`, `canvas_h Int?` (columns of the same names).
- `SfWorkspaceCard` gains `canvas_x Int?`, `canvas_y Int?`, `canvas_w Int?`.
  No height column.
- All nullable, no backfill. **Null means "not placed yet"**: the UI lays an
  unplaced frame out to the right of the placed ones in `sort_order`, and
  stacks unplaced cards under the frame's lowest card in `sort_order`, with
  default widths (frame 384, card 256). This is how existing data, new cards
  from Client answered or a site visit, and cards created without a position
  appear, so the Phase Engine paths need no geometry.
- Check constraints: every stored value is `0 ≤ value ≤ 100000`; when set,
  `canvas_w ≥ 180` for cards and `canvas_w ≥ 260`, `canvas_h ≥ 120` for frames;
  for each row, x and y are both null or both set.

### Service (`src/apps/studioflow/workspace/service.ts`)

- New `placeWorkspaceItems(input: ProjectInput & { sections?: Array<{ id,
  x, y, w, h }>, cards?: Array<{ id, x, y, w, sectionId? }> })` — one
  transaction, up to 200 sections and 500 cards per call:
  - Every id must belong to the project (`NOT_FOUND` otherwise); a card's
    `sectionId`, when given, must be a section of the same project.
  - Gates: each card follows its own write rule (phase-labelled → that phase's
    `transition`; unlabelled → `document`), and section geometry needs
    `document`; `phaseWork`; writable, ACTIVE project. One refused item
    refuses the whole call.
  - Geometry is **layout, last write wins**: no version is checked and
    `version` is **not** incremented, so moving or resizing never makes
    someone's text edit stale. A card whose `sectionId` changes is a
    membership change: lock both sections, set `section_id`, and record
    `studioflow.workspace-card.moved` (from/to section). Pure geometry writes
    are **not** audited (too frequent, no meaning).
  - After writing, recompute `sort_order` of every touched section's cards by
    `(canvas_y nulls last, canvas_x, created_at, id)` and of the project's
    sections by `(canvas_x nulls last, canvas_y, sort_order, id)` when any
    section moved, so the phone order follows the canvas. Unplaced (null)
    items keep their relative order after the placed ones.
  - Returns nothing but `{ ok: true }`.
- `createWorkspaceSection` and `createWorkspaceCard` accept optional
  `x, y, w` (and `h` for a section); without them the row stays unplaced.
- `moveWorkspaceCard` (to another section, by position) keeps working for the
  menu path and clears the moved card's `canvas_x/canvas_y` so it lands
  stacked in its new frame; `reorderWorkspaceCards` and
  `reorderWorkspaceSections` keep working unchanged.
- Reads: `readWorkspace` returns per section `canvas: { x, y, w, h } | null`
  and per card `canvas: { x, y, w } | null`.

### Wiring

- `workspaceAction` gains `placeItems` (schema mirrors the service limits:
  integers, ranges, array sizes) and the optional geometry on `createSection`
  and `createCard`. Pass the new read fields through `workspace/page.tsx` if the
  types require it; no other UI change — the Lead replaces the screen next.
- Contract §6.1: frames and cards have optional stored geometry, layout is last
  write wins and never bumps `version`, card height follows content, unplaced =
  null with the stacking rule, phone order follows the canvas.

## Tests (disposable database)

- Migration: existing sections and cards read back with `canvas: null`,
  nothing else changed (ids, order, versions, default section).
- `placeItems`: frames and cards placed and read back; `version` unchanged
  after a place; a stale text edit is **not** caused by a concurrent move
  (edit with the version read before a move still succeeds); a card moved to
  another frame changes `section_id`, writes the `moved` audit, and both
  frames' `sort_order` follow `(y, x)`; sections reorder by x when moved;
  unplaced items stay after placed ones in order.
- Refusals: a card or section of another project; a `sectionId` of another
  project; out-of-range or too-small widths; x without y; a drafter placing a
  card labelled with a designer phase (whole call refused, nothing written); a
  viewer; an archived or completed project; arrays over the limits.
- Create with geometry stores it; create without leaves null; Client answered
  and a site visit still create unplaced cards in the default frame.
- `moveWorkspaceCard` clears the card's position.
- The whole existing Phase Engine and Workspace suites stay green.

## Verification

`npm test`, typecheck, eslint, `check:boundaries`, `check:legacy-runtime`,
production build, `prisma migrate diff` (no new drift), the full migration chain
on a fresh disposable rebuild database and incremental deploy on the standard
disposable test database, staged and unstaged whitespace. Apply the migration
to the kantor dev database (`studioflow_rebuild` on localhost:5433, verified)
after the gates pass. Browser acceptance belongs to the Lead's canvas UI
revision.

## Non-goals

No canvas UI, no route or navigation change, no storing of card height, pan or
zoom, no card type column, no loose cards outside frames, no change to the
default-section or delete-when-empty rules, no Phase Engine meaning change, no
new permission, no new dependency, no push.

## Executor Prompt

You are the Backend Executor on the same checkout (location: kantor). Read
`AGENTS.md`, `docs/agent/EXECUTOR.md`, `PLAN.md` (WO-SF-WORKSPACE-03), the
StudioFlow contract §6.1, `CHANGELOG.md` R8.519–R8.530, the accepted prototype
in `prototypes/workspace-canvas/` (behaviour reference only), and
`src/apps/studioflow/workspace/service.ts`. Implement exactly the locked canvas
geometry backend as one local revision commit R8.531 (confirm it is the next
unused number in `CHANGELOG.md`): the forward-only migration adding nullable
`canvas_*` columns with their checks, `placeWorkspaceItems` (batch, last write
wins, no version bump, membership change audited, sort order following the
canvas), optional geometry on create, `moveWorkspaceCard` clearing position,
geometry on reads, the `placeItems` action, the contract update, and every test
in the plan. Do not build the canvas UI, change routes or navigation, or change
the Phase Engine's meaning. Stop with BLOCKED / CONFLICT if a locked decision
cannot be met as written. Database commands only against verified disposable
rebuild-only databases, then the kantor dev database after the gates pass. Run
every gate in Verification, update `CHANGELOG.md`, commit locally without
pushing, and reply with only a Planner/Reviewer prompt: commit, checks with
results, limitations, dirty files, and a request for verdict.
