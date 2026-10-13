# Active Plan

Plan ID: WO-SF-WORKSPACE-04 (Workspace board: one board per project, standalone Text / Image / File elements)
Scope: StudioFlow Workspace backend — element kinds, image and file elements, frames folded into the one board, data migration, follow-through in every reader; minimal UI wiring only
Module(s): studioflow (core; Workspace is not an optional module)
Target revision: R8.539 (Executor; R8.538 is the Lead's plan correction). The Lead's board UI follows as its own revision.
Status: READY
Priority: P1
Owner: owner 2026-10-13 — accepted the clickable board concept (https://claude.ai/artifact/TbUL52g4MYgm1Y3G3TBvhL) and the direction below ("sudah jalan, susun rencana kerjanya"). Recorded in R8.537.
Last updated: 2026-10-13 (Lead, R8.538 — correction after an Executor BLOCKED report that named no conflict; see "Corrections R8.538")

## Why

Today a Workspace nests four levels: canvas → frame (section) → card → images
(`SfWorkspaceCardImage`, up to 12 per card). The owner found this odd for a
designer: a pasted image becomes an empty card holding the image, an image
cannot be sized on its own, and files have no place. The accepted direction is
one board per project holding standalone elements. This Work Order is
**phase 1 (backend)**; comment pins on images, feedback merged with the round
feedback list, round lens/compare, the phone photo tray and grouping are later
phases and are non-goals here.

## Owner decisions (2026-10-13)

- **One board per project, no frames.** The project's DEFAULT section stays as
  the hidden container of every element; no other section exists afterwards.
- **Element kinds:** `TEXT` (body in the existing rich-text dialect — headings,
  bullets, numbered lists, checklists stay formatting inside the body), `IMAGE`
  (exactly one image), `FILE` (exactly one file, opened through a short-lived
  signed link). A text element has a style: `PLAIN`, `HEADING`, `STICKY`.
- **Height is never stored for any kind.** Text height follows content; an
  image's height follows its own proportions at the stored width (the browser
  renders `width = w, height = auto`). Width and position are stored, as today.
- Labels (phase, round), `origin` (`NOTE` / `CLIENT_ANSWER` / `SITE_VISIT`),
  star (`is_pinned`), author snapshot and optimistic `version` apply to every
  element unchanged. Layout stays last-write-wins without a version bump.
- **Old data is kept, split, never lost:** frame titles become `HEADING` text
  elements; a card holding text and images becomes a text element plus one
  image element per image, laid out beside it with the same labels and origin.
- File limits (Lead default, owner may change later): at most **25 MB**; allowed
  types PDF, DWG, DXF, SKP, XLSX, XLS, DOCX, DOC, PPTX, ZIP, TXT, CSV. Images keep
  today's types (PNG, JPEG, WebP) and 3 MB limit after client-side shrinking.
- Merging board client feedback with the round feedback list (`SfActivity`
  FEEDBACK) is **decided for phase 2**; do not build it now and do not change
  `SfActivity`.

## Locked decisions

### Schema (one forward-only migration, `studioflow` schema)

Keep the table `sf_workspace_card` and the model `SfWorkspaceCard` (the
"element"); renaming would only churn every reader.

- New enums `sf_workspace_element_kind` (`TEXT`, `IMAGE`, `FILE`) and
  `sf_workspace_text_style` (`PLAIN`, `HEADING`, `STICKY`).
- `SfWorkspaceCard` gains: `kind` (NOT NULL, default `TEXT`), `text_style`
  (NOT NULL, default `PLAIN`), and nullable asset columns `storage_key`
  (unique), `content_type`, `bytes`, `file_name`, `uploaded_by_id`,
  `uploaded_by_name`.
- Checks: `TEXT` ⇒ all asset columns null; `IMAGE`/`FILE` ⇒ `storage_key`,
  `content_type`, `bytes` set and `body = ''`; `FILE` ⇒ `file_name` set.
  Card width minimum drops from 180 to **120** (images may be small).
- Data move, in this order, inside the migration:
  1. **Frames.** For each project, a placed non-default section's cards that
     have a position get absolute coordinates: `card.x + frame.x - default.x`,
     `card.y + frame.y - default.y` (clamped to ≥ 0); the default section's own
     position is then set to `(0, 0)` (its stored size kept or cleared — it is
     no longer drawn). Cards of an unplaced section stay unplaced. Every card
     moves to the DEFAULT section. Each non-default section's title becomes a
     `HEADING` text element at the frame's absolute position (null when the
     frame was unplaced), `origin = NOTE`, no labels, author = the section's
     creator with a null name snapshot. Non-default sections are then deleted.
     A project with sections but without a DEFAULT one is impossible by R8.525;
     the migration refuses (RAISE) rather than guess.
  2. **Images.** Every `sf_workspace_card_image` row becomes an `IMAGE`
     element **with the image row's id** (so any id held elsewhere still
     resolves), same project/section/labels/origin/pinned/author snapshot as
     its card, `created_at` of the image, asset columns from the image row.
     Placement: a card with an empty body is replaced by its first image —
     that image element takes the card's position, width and `sort_order`
     slot and the empty text card is deleted; the remaining images of a card
     are laid in a row to the right of the card: `x = card.x + card.w + 16 +
     i * (240 + 16)`, `y = card.y`, `w = 240` (i from 0 in image `sort_order`);
     when the card is unplaced, its images stay unplaced. Overlap with other
     elements is acceptable; the owner rearranges.
  3. Drop `sf_workspace_card_image` once every row has moved; refuse (RAISE)
     if any image row is left behind.
  4. Recompute `sort_order` of each project's elements by `(canvas_y nulls
     last, canvas_x, created_at, id)` so the phone order follows the board.
- Integration tests prove each rule on seeded old-shape data (see Tests).

### Service (`src/apps/studioflow/workspace/service.ts`)

- **Create text:** the existing `createCard` path, plus optional `textStyle`;
  `withImages` disappears (an empty text element is not created).
- **Create image:** one command takes the image bytes, kind `IMAGE`, optional
  `x, y, w`, `phaseId`, `clientAnswer`; checks scope, access, size and type
  (sniffed, as today) before storage, stores the object, inserts the element
  in one transaction, discards the object if the insert fails. Replaces the
  current two-step "create empty card, then add image".
- **Create file:** the same shape for `FILE`, with the file limits above. The
  stored `content_type` comes from the allow-list by extension and a magic-byte
  check where the format has one (PDF `%PDF`, ZIP-based Office/ZIP `PK`, DWG
  `AC10`), never from the client's claim. The object key keeps the file's
  real extension (`createPrivateObjectKey`). Reads return the existing signed
  link (`ports.storage.createSignedReadUrl`) plus `fileName`; the original
  name is applied by the UI with the anchor `download` attribute, exactly as
  the deliverables panel does (`deliverables-panel.tsx`), because the private
  asset route is same-origin. **No change to the platform storage port, the
  private asset route or `contentTypeFromKey`** (PDF already opens inline,
  unknown types already arrive as `application/octet-stream` with `nosniff`).
- **File upload transport: REUSE the deliverable pattern.** Files up to 25 MB
  go through a streamed `PUT` route under `src/app/api/studioflow/` modelled
  on `api/studioflow/deliverables/route.ts` (`ports.storage.putStream` with
  `maxBytes`, declared length required); images may stay a Server Action
  `FormData` upload (3 MB). Add no dependency.
- **Update:** text body edit and `textStyle` change for `TEXT` only (refused
  for other kinds); labels, client-answer flag, star and delete for every kind.
  Deleting an image/file element queues its object through the existing
  unreferenced-cleanup path.
- **Placement:** `placeWorkspaceItems` keeps working for elements (sections
  part removed); the width check follows the new minimum.
- **Sections:** the create / rename / delete / reorder / move-to-section
  commands and the section part of placement are **PURGED** from the service,
  the action and their tests. `readWorkspace` returns the project's elements
  as one list (each with `kind`, `textStyle`, `canvas`, and for IMAGE/FILE a
  signed `url`, `contentType`, `bytes`, `fileName`), not sections.
- Phase Engine paths (Client answered note, site-visit note, `postPhaseNote`)
  keep creating `TEXT` elements in the default section, unplaced.

### Follow-through (every reader of the old image table)

- `public/ideas-bridge.ts` `readWorkspaceImageSource`: reads an `IMAGE`
  element by id (ids preserved by the migration).
- `projects/asset-retention.ts`, `asset-cleanup.ts`, the asset sweep: include
  image and file element objects.
- Pinned-notes dialog read: `imageCount` becomes the element's kind (an image
  or file element shows as such); keep the dialog working.
- Iteration delete / undo guards in `phases/service.ts` keep counting
  `workspace_cards` (now every element) — unchanged meaning.
- `docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md` Workspace section:
  one board per project, element kinds, limits, height rule, migration rule.

### Wiring (minimal; the Lead replaces the screen next)

Authorized UI edits, so the purge does not leave dead or broken screens: in
`_workspace-canvas/` and the Phases page, remove the frame controls (add /
rename / delete frame, frame header drag and resize, card move-to-frame menu)
and draw the elements on the one default frame; adapt `layoutBoard` and the
pinned-notes dialog to the new read shape. This is wiring, not design: no new
interaction, styling or layout beyond that.

`workspaceAction` mirrors the service (new create-image / create-file
actions as `FormData` uploads, `textStyle`, removed section commands). The
current canvas must keep compiling and remain usable: render all elements in
the single default frame, an image element through the existing image
component with one image, a file element as a link with its name. No layout,
interaction or styling work beyond that.

## Corrections R8.538

The Executor reported BLOCKED without naming a conflict. Lead inspection found
one real mismatch and two possible readings, now resolved above:

1. The plan asked for `Content-Disposition` on signed links; the platform
   storage port and private asset route have no such option. Resolved by the
   anchor `download` attribute (existing deliverables pattern) — no platform
   change.
2. 25 MB files: the transport is now fixed to the existing streamed deliverable
   route pattern.
3. Removing frame UI is explicitly authorized wiring (see Wiring), and
   dropping `sf_workspace_card_image` inside the migration after its rows have
   moved is an authorized, planned destructive step.

If anything else blocks, the report must use the full `BLOCKED / CONFLICT`
format of `docs/agent/EXECUTOR.md` (expected, actual with paths, the one
conflict, options, recommendation); a report without the conflict cannot be
decided.

## Tests (disposable database)

- Migration on seeded old-shape data: text-only card unchanged; text + 3 images
  → text kept, 3 image elements with the image ids, same labels/origin/pinned,
  row positions as specified; image-only card (1 and 2 images) → first image
  takes its place and the empty text card is gone; unplaced card → images
  unplaced; placed non-default frame → its cards in absolute coordinates in
  DEFAULT, a heading element with its title at its position, frame deleted;
  unplaced frame → heading and cards unplaced; image table dropped; sort order
  follows `(y, x)`; versions and ids of surviving cards unchanged.
- Create image / file: stored and read back with a signed link; wrong type,
  spoofed type (bytes don't match the extension), over-size, viewer, drafter on
  a designer-phase label, archived or completed project all refused with
  nothing stored (object discarded on a failed insert).
- Text style change; body edit refused on IMAGE/FILE; delete of an image/file
  element queues its object for cleanup.
- Ideas bridge reads a migrated image element by its old image id.
- Asset retention/cleanup covers element objects.
- Removed section commands are gone from the action schema.
- The existing Phase Engine and Workspace suites stay green (adjusted only
  where a section command was purged).

## Verification

`npm test`, typecheck, eslint, `check:boundaries`, `check:legacy-runtime`,
production build, `prisma migrate diff` (no drift), the full migration chain on
a fresh disposable rebuild database and incremental deploy on the standard test
database (`masterdata_test`), staged and unstaged whitespace. After the gates
pass, apply the migration to the rumah dev database (`masterdata` on
localhost:5433, verified rebuild-only). Browser acceptance belongs to the
Lead's board UI revision.

## Reviewer Acceptance (Lead, after the commit)

Old projects open with every former card, image and frame title present on one
board in the same places; paste/drop creates image and file elements; files
open; client feedback, star and labels survive on split elements.

## Non-goals

No board UI design, toolbar, multi-select, comment pins, drawing on images,
round lens/compare, photo tray, grouping, minimap, presentation export; no
change to `SfActivity` or the round feedback list; no stored element height;
no new permission; no new dependency; no change to Phase Engine meaning; no
push.

## Executor Prompt

You are the Backend Executor on the same checkout (location: rumah, use
`.env.rumah`). Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, `PLAN.md`
(WO-SF-WORKSPACE-04), the StudioFlow contract's Workspace section,
`CHANGELOG.md` R8.519–R8.538 and `src/apps/studioflow/workspace/service.ts`.
Implement the whole plan as one local revision commit R8.539 (confirm it is the
next unused number): the migration that adds element kinds and folds frames and
card images into standalone elements, the image and file element commands with
their limits, the purge of section commands, every reader's follow-through, the
contract update, minimal wiring that keeps the canvas usable, and every listed
test. Where the plan leaves an ordinary implementation choice, make it and note
it in the changelog; where completing it would change a locked decision or
invent product behaviour, stop with the full BLOCKED / CONFLICT report
(expected, actual with paths, the one conflict, options, recommendation). Database commands only
against verified rebuild-only databases. Run every gate in Verification, update
`CHANGELOG.md`, commit locally without pushing, and reply with only a
Planner/Reviewer prompt: commit, checks with results, limitations, dirty files,
and a request for verdict.
