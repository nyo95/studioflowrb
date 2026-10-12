# Active Plan

Plan ID: WO-SF-WORKSPACE-01 (Workspace backend: one project Workspace of sections and cards replaces phase Notes)
Scope: StudioFlow phase Notes evolve into one Workspace per project with ordered sections and cards; phase and round are labels on a card; backend plus minimal functional UI wiring
Module(s): studioflow (core; Workspace is not an optional module), ideas (caller update through the StudioFlow public bridge only)
Target revision: R8.519
Status: IMPLEMENTED (R8.519, by the Lead on owner instruction) — AWAITING ACCEPTANCE
Priority: P1
Owner: owner Workspace plan 2026-10-12 (sequence: Executor backend first, Lead UI next); owner decisions 2026-10-12 recorded in R8.518; Presentation extraction accepted in R8.517
Last updated: 2026-10-12 (Lead, R8.518)

M3 is complete: Ideas (R8.512, PASS R8.513) and Presentation (R8.514, correction
R8.516, PASS R8.517) are separate modules. This slice is the first of two:
the Executor delivers the Workspace backend with minimal wiring as one commit;
the Lead then accepts it and builds the final UI (UI Engine `WorkspaceShell`
and generic reorder, full board, autosave/conflict UX, Phase details drawer,
Workspace/Drawing List lenses, responsive and accessibility acceptance) as the
next revision. Never combine the two.

## Outcome

Every project has one Workspace: ordered **sections** (free topics the team
names, such as "Client feedback", "Materials", "Site") holding ordered
**cards**. A card carries the formatted text, images, pin, client/visit
origin, author and the **phase and round labels** a phase note carries today;
the labels say where a card came from and let a phase page show "this phase's
cards", but they never decide where a card lives. All existing notes become
cards with their ids, text, images, storage keys, authors, times, pins, phase
and round labels intact, and the old note tables cease to exist (one source of
truth). Every Phase Engine behavior is unchanged.

## Owner decisions (2026-10-12, R8.518)

1. **One Workspace per project; phase is only a label.** Sections belong to the
   project, not to a phase, so the team is not forced into a per-phase filing
   structure. A card's phase label is set automatically from where it was
   written (the phase page, a client answer, a site visit) and can be changed
   or cleared; the round label follows the Phase Engine as today.
2. **Existing notes go into one "Notes" section per project**, oldest first,
   each keeping its phase and round label (Lead analysis in R8.518: one
   section per phase was rejected because it rebuilds the per-phase filing the
   owner chose to drop; one mixed section is safe because the phase label and
   a phase filter keep every note findable). New projects get a "Notes"
   section when their first card is created.
3. **A section can be deleted only when it is empty**
   (`WORKSPACE_SECTION_NOT_EMPTY`); a project's last section can never be
   deleted while the project has cards.

## Locked decisions

### Schema (one forward-only migration, `studioflow` schema)

- `SfWorkspaceSection` (`sf_workspace_section`): `id`, `project_id` (FK →
  `sf_project`, cascade), `title` (1–80 chars), `sort_order`, `created_by_id`,
  `created_at`, `updated_at`, `version` int default 1. Index
  `(project_id, sort_order)`.
- `SfWorkspaceCard` (`sf_workspace_card`): the renamed `sf_phase_note` table
  (`ALTER TABLE … RENAME`, ids kept) with: `section_id` (FK →
  `sf_workspace_section`, restrict), `sort_order` int, `is_pinned` (renamed
  from `is_starred`), `origin` enum `sf_workspace_card_origin`
  (`NOTE` | `CLIENT_ANSWER` | `SITE_VISIT`) replacing `is_client_feedback`
  (true → `CLIENT_ANSWER`; false and the note's round has a `visit_date` and
  the note was written by the visit command → `SITE_VISIT`; otherwise `NOTE`),
  `version` int default 1, `updated_at`, and a new `project_id` (FK →
  `sf_project`, cascade; backfilled from the phase). `phase_id` becomes
  nullable with FK → `sf_phase` **SetNull** (the phase label; a card outlives a
  label), and `iteration_id` stays FK → `sf_revision` SetNull (the round
  label). Invariants enforced in the service: a card's section and phase
  belong to the card's project; when `iteration_id` is set, `phase_id` equals
  that round's phase. Keep `body`, `author_id`, `author_name`, `created_at`,
  `edited_at`. Indexes `(section_id, sort_order)`, `(project_id, created_at)`,
  `(phase_id, created_at)`, `(iteration_id)`.
- `SfWorkspaceCardImage` (`sf_workspace_card_image`): the renamed
  `sf_phase_note_image` (ids, `storage_key` unique, `content_type`, `bytes`,
  `sort_order`, uploader snapshot, `created_at` kept) with `note_id` renamed
  `card_id`, cascade from the card.
- Migration steps: create the section table and enum; insert one "Notes"
  section per project that has notes; rename tables, columns and constraints;
  backfill `section_id`, `sort_order` (by `created_at`, `id`), `origin`,
  `version`, `updated_at`, `project_id`; then set `section_id` and
  `project_id` NOT NULL. Card `sort_order` inside the one "Notes" section
  follows `created_at`, `id` across all phases of the project. For `SITE_VISIT`
  use the exact rule: the note's `iteration_id` points to a round with a
  non-null `visit_date` and the note's `created_at` is within the same second
  as that round's `created_at` (the visit command writes both in one
  transaction); every other non-client note is `NOTE`. Guards: refuse when a
  note row has a `phase_id` that does not exist. No row copy, no object copy,
  no table left behind; existing storage keys stay valid and are not renamed.
- Migration-isolation: StudioFlow-internal only; no cross-module FK.

### Services and actions

- Replace `phases/notes.ts` with a `workspace` service inside StudioFlow
  (`src/apps/studioflow/workspace/`), composed where the notes service is
  today. Read = project read. Write on a card labelled with a phase = as notes
  today (`phaseWork` + project access `transition` on that phase + writable,
  ACTIVE project); write on a card with no phase label and every section
  command = `phaseWork` + project access `document` + writable, ACTIVE
  project. Changing a card's phase label needs the write right for both the
  old and the new label.
- Commands: create/rename/reorder/delete section; create card (in a section,
  appended, optional phase label), update card text, set/clear phase label
  (clearing a phase label also clears the round label), pin/unpin, move card
  (to another section and/or position), reorder cards within a section,
  delete card; add/remove card
  images (same limits, sniffing, key prefix and cleanup ledger as note images
  today). Reads: the project Workspace (sections in order with their cards and
  signed image URLs, optional filter by phase label) and the existing
  per-phase chronological feed projection (cards labelled with that phase) so
  the current notes UI keeps working.
- **Concurrency:** every card and section update/move/delete carries the
  `version` the client read; a mismatch returns `CONFLICT`
  `WORKSPACE_CARD_STALE` / `WORKSPACE_SECTION_STALE` and changes nothing; each
  successful write increments `version`. Reorders lock the parent rows in the
  transaction (`SELECT … FOR UPDATE` on the section or phase) and validate the
  full id list like Presentation's `orderIds`.
- **Phase Engine integration (atomic, same transaction as today):** "client
  answered" with text creates a `CLIENT_ANSWER` card and "add site visit" with
  a note creates a `SITE_VISIT` card, both labelled with the phase and round
  and appended to the project's first section (creating "Notes" when none
  exists). The
  empty-round checks (`emptyNeverSent`, `emptyAutoStart`) count the round's
  cards (and through them their images) instead of notes. Hard reset keeps
  every card and clears only its round link (unchanged SetNull meaning). Undo,
  skip, auto-advance, CD Mall → CD Final, explicit completion and every
  permission and audit of the Phase Engine are unchanged.
- **Audit:** `studioflow.workspace-section.*` and `studioflow.workspace-card.*`
  with ids, phase/project ids, counts and moves; never card text or image
  content. Historical `studioflow.phase-note.*` events are not rewritten.
- **Media and retention:** archive retention and asset cleanup read
  `sfWorkspaceCardImage` instead of `sfPhaseNoteImage` with identical
  semantics (`iterationImages` count name may stay for compatibility of the
  summary). The cleanup reference check includes card images.
- **Public bridge:** rename `readPhaseNoteImageSource` to
  `readWorkspaceImageSource` (same input/output contract, `imageId` is a card
  image id) and update the Ideas callers and the composition Moodboard
  coordinator in this revision; no compatibility alias.
- **Minimal UI wiring:** the existing phase notes UI keeps working on the new
  service (post, edit, pin, client-answer flag display, images, Ideas/
  Moodboard/Schedule image actions). Add only plain controls needed to
  exercise the new commands (section list with add/rename/delete, move card
  to section, up/down reorder). No drag-and-drop, no new dependency, no visual
  design; the Lead replaces this UI next revision.

## Tests (disposable database)

- Populated migration fixture: notes with text only, images only, pinned,
  client answers, visit notes, notes without a round (after hard reset),
  across two phases of one project and a second project; compare ids, text, authors, times, round links, image
  ids/keys/order before and after; assert sections created, origins as the
  rule says, one "Notes" section per project with cards ordered across
  phases, phase and round labels kept, old tables gone, `prisma migrate diff` shows no drift for these
  tables.
- Section and card commands, ordering, move between sections, phase-label
  set/clear (clearing also clears the round label), cross-project section or
  phase refusal, the phase filter, stale-version conflicts, permission/PIC/archived/completed refusals, image limits and
  rollback, cleanup ledger.
- Phase Engine: the whole existing phase suite stays green; plus client answer
  and site visit create the right card atomically (failure rolls back both),
  empty-round checks use cards, hard reset keeps cards and clears round links,
  undo restores as before.
- Ideas: note-image → Ideas, → Schedule, → Moodboard through
  `readWorkspaceImageSource`. Retention purges card images.

## Verification

`npm test`, typecheck, eslint, `check:boundaries`, `check:legacy-runtime`,
production build, full migration chain on a fresh disposable rebuild database
and incremental deploy on the standard disposable test database, staged and
unstaged whitespace. Append the browser items (notes feed parity, section and
card commands, client answer and visit cards, 375 px) to
`docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md`; browser acceptance belongs to the
Lead's next revision.

## Non-goals

No final Workspace UI, no `WorkspaceShell`, no drag-and-drop library, no
Drawing List or Requirements changes, no Phase Engine meaning change, no new
module, no cross-module FK or internal import, no new permission, no push or
release.

## Executor Prompt

You are the Backend Executor on the same checkout (location: kantor). Read
`AGENTS.md`, `docs/agent/EXECUTOR.md`, `PLAN.md` (WO-SF-WORKSPACE-01), the
StudioFlow contract sections on phases, rounds and notes, and
`docs/apps/platform/MODULES-M2-COUPLING-REPORT.md` (phase-note image source).
Implement exactly the locked Workspace backend as one local revision commit
R8.519 (confirm it is the next unused number in `CHANGELOG.md`): the one
forward-only migration that turns phase notes into one project Workspace of
sections, cards and card images (phase and round as card labels) without a
second source of truth; the StudioFlow workspace
service, actions, access, version-based concurrency, audit, media and
retention; atomic client-answer and site-visit cards; empty-round checks on
cards; hard reset keeping cards; the `readWorkspaceImageSource` rename with
its callers; minimal functional UI wiring; and every test in the plan,
including the whole Phase Engine suite and the populated migration fixture.
Stop with BLOCKED / CONFLICT if a locked decision cannot be met as written.
Database commands only against verified disposable rebuild-only databases.
Run every gate in Verification, append the browser items, update
`CHANGELOG.md`, commit locally without pushing, and reply with only a
Planner/Reviewer prompt: commit, checks with results, limitations, dirty
files, and a request for verdict.
