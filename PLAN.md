# Active Plan

Plan ID: WO-SF-NOTES-CHAT-01 (Notes as one project chat: replies, `#` topic tags, `@` item codes)
Scope: backend + minimal wiring, one local commit
Module(s): studioflow only (Notes/Workspace cards and Product Schedule entries, both in the `studioflow` schema). The `workspace-board` module manifest is unchanged.
Target revision: Executor **R9.57** on `main` (the Lead used R9.56 for this plan)
Status: DONE — Executor R9.57 (0c2356b) + correction R9.59 (3e00b30), Lead review PASS R9.60. Next: Lead UI slice (chat stream + fixed project frame)
Baseline: `main` at the R9.56 plan commit; working tree clean

## Why

Owner 2026-10-14, after the mockup https://claude.ai/artifact/7ns7QpSUBxSY6c1FYYJvbF
(artboards *Notes — gaya chat* and *Workspace — klik dua kali*), approved "aku sudah oke":

- Notes becomes a WhatsApp-like chat: **one stream per project**, not one per phase.
  Several images sent together read as one album; a message can reply to another.
- Only the phase PIC writes notes, so there is **no @person**.
- `#` = phase or topic. The phase tag is filled in automatically from the phase
  being worked on; topic tags (`#lampu`) are free but autocompleted.
- `@` = a project item by its Product Schedule code, prefix + number
  ("@HT1 << menarik sih"). Typing `@HT1`, `@ht1` or `@HT-01` means the entry whose
  code is `HT-01`.
- Notes vs Workspace stays the Developer module switch (R9.09); the Workspace board
  uses the same notes. The board's double-click note thread is a later Lead slice.

## Locked decisions

1. **Notes are the existing `SfWorkspaceCard` rows.** No new note table. The phase
   label (`phase_id`, `iteration_id`) stays the phase tag; the existing client-answer
   flag (`origin = CLIENT_ANSWER`, read as `clientFeedback`) stays `#feedback`.
2. **Write rule unchanged.** A note is still created under a phase the writer may
   write (`writablePhase`), exactly as today. The project-wide stream only changes
   reading and filtering. No RBAC change, no new permission.
3. **Reply.** New nullable `reply_to_id` on `sf_workspace_card`, self-relation,
   `ON DELETE SET NULL`; the target must be a card of the same project (else
   `VALIDATION`). Create paths for text, image and file accept an optional
   `replyToId`. Reads return `replyTo: { id, kind, excerpt, authorName,
   clientFeedback } | null`, `excerpt` = the target body as plain text cut to 120
   characters (file name for a file, empty for an image). A deleted target reads
   as `null`.
4. **Topic tags.** New tables in `studioflow`:
   - `sf_note_tag` (`id`, `project_id` → project cascade, `name` ≤ 32, `key` =
     lower-case name, `created_at`; unique `(project_id, key)`).
   - `sf_note_tag_link` (`card_id` → card cascade, `tag_id` → tag cascade; PK
     both).
   A tag name is 1–32 characters of letters, digits, `-` or `_` after stripping a
   leading `#`; anything else is `VALIDATION`. `feedback` is reserved (it is the
   client-answer flag) and refused as a topic tag. Setting a note's tags
   find-or-creates by key in the same transaction and deletes tags left with no
   link. At most 5 topic tags per note.
5. **Item links.** New table `sf_note_item_link` (`card_id` → card cascade,
   `entry_id` → `sf_schedule_entry` cascade, `code_snapshot` text; PK both). The
   note body keeps the typed `@HT-01` as plain text; the link rows are the meaning.
   The client sends the chosen entry ids; the server checks each entry belongs to
   the note's project (else `VALIDATION`), stores the code at save time as
   `code_snapshot`, and replaces the note's links on every text update. At most 10
   per note. Reads return the live code, `section`, product name of the active
   option and `location`, falling back to `code_snapshot` only for display.
6. **Code matching.** The canonical code is the existing `scheduleCode(prefix,
   increment)` output in `domain/schedule.ts` (`HT-01`). Add one pure helper beside it
   that turns a typed token (`HT1`, `ht1`, `HT-01`, `HT-1`, `@HT01`) into
   `{ prefix, increment }` or null, with unit tests. No second code format anywhere.
7. **Reads.**
   - `listProjectNotes({ projectId, phaseId?, clientFeedback?, starred?, tag?,
     entryId?, cursor?, limit? })`: newest first, `limit` default 50, max 100,
     opaque cursor; same note view the phase stream returns today plus `phase`
     label (id, name), `iteration` (id, name), `tags` (names), `items` (decision 5)
     and `replyTo`. Read access is the project's existing notes read access.
   - `searchNoteItems({ projectId, query })`: up to 10 Product Schedule entries
     whose code starts with the parsed token or whose active option name contains
     the query (case-insensitive), each `{ entryId, code, section, name,
     location }`.
   - `listNoteTags({ projectId, query? })`: the project's tags by usage count,
     then name, up to 20.
   - `listNotesForItem({ projectId, entryId })`: the notes linking that entry,
     newest first, same view, for the Product Schedule item later.
8. **Writes** (service + server action each, existing audit style, card `version`
   respected where the card path already uses it): create note/image/file gain
   `replyToId`, `tags`, `itemEntryIds` (images and files take `replyToId` and
   `tags` only); `updateCardText` gains `tags` and `itemEntryIds`; new
   `setNoteTags({ cardId, tags, version })`.
9. **Albums are UI only.** The Lead groups consecutive image notes from one author
   within 60 seconds. No batch column.
10. **The phase page keeps working.** The current per-phase `NotesStream` may call
    `listProjectNotes` with `phaseId` or keep its current read; either is fine. The
    Lead replaces the UI after this commit.

## Implementation (Executor chooses ordinary local structure)

- `prisma/schema/studioflow.prisma` + one migration
  `<timestamp>_studioflow_note_chat`: `reply_to_id` + index, the three tables and
  their indexes (`sf_note_tag_link(tag_id)`, `sf_note_item_link(entry_id)`).
- `src/apps/studioflow/domain/schedule.ts`: the token parser (decision 6) + tests.
- `src/apps/studioflow/workspace/service.ts` (or a sibling file in the same folder
  if it reads better): decisions 3–8; `cardView` gains `replyTo`, `tags`, `items`
  without an N+1 per card (batch per page).
- Expose the new reads/writes through the existing StudioFlow runtime/public
  surface the phase notes already use; server actions beside the current note
  actions in `src/app/(platform)/studioflow/actions.ts`.
- Minimal wiring only: no new UI. Existing screens must keep compiling and working.

## Tests (integration unless pure)

- reply: same-project reply ok; other-project target refused; deleting the target
  leaves the reply with `replyTo = null`.
- tags: create with tags; find-or-create by case-insensitive key; `feedback` and bad
  characters refused; 6th tag refused; an orphan tag is removed; filter by tag.
- items: link by entry id; entry from another project refused; `code_snapshot`
  stored; renumbered/removed entry behaviour (cascade removes the link); filter by
  `entryId`; `listNotesForItem`.
- `searchNoteItems`: `HT1`, `ht-01`, a name fragment.
- `listProjectNotes`: across two phases, newest first, cursor paging, each filter.
- write rule: a user who cannot write phase B cannot post a note labelled B.
- parser unit tests (decision 6).

## Executor verification

Migrate the dev and test databases (both, see docs/agent/README.md "Local database
sync after new migrations"), `prisma generate`, typecheck, eslint on touched files,
`npm test` (whole suite; report the count), `check:boundaries`. No browser walk.

## Reviewer acceptance (Lead, after R9.57)

Review the diff against decisions 1–10; then the Lead builds the chat UI (stream,
albums, reply, `#`/`@` autocomplete, phase chips) and the fixed project frame
(DESIGN.md §6.2) as the next revision, and walks it in the browser.

## Lead review of R9.57 (R9.58): CORRECTION REQUIRED

Accepted as is: schema and migration (reply self-relation SET NULL, tag tables,
item links cascade), `parseTypedScheduleCode`, same-project checks, tag
normalisation/limits/reserved `feedback`, cursor paging, filters, actions, the
read access (same `requireRead` as `readWorkspace`). Minor, accepted: the reply
excerpt is the stored body cut to 120 characters (the Lead's UI renders it with
`FormattedText`, clamped).

Corrections (one pass, revision R9.59):

1. **Owner file committed.** R9.57 changed `next-env.d.ts` (`.next/dev/types` →
   `.next/types`). It is generated by Next and must never be committed. Restore it
   to its R9.56 content in R9.59 and never stage it.
2. **Orphan tag cleanup is global.** `syncTags` runs
   `sfNoteTag.deleteMany({ where: { links: { none: {} } } })` across every project.
   Scope it to the note's `project_id` (decision 4: "deletes tags left with no
   link" means this project's).
3. **Wrong product name for an item.** `items[].name` and `searchNoteItems` take
   `options[active_index]` from options ordered by `label` in the database, but
   `active_index` indexes the Schedule's own order (`compareOptionLabels`, then
   `created_at`, see `orderedOptions` in `schedule/service.ts`). With labels such
   as `A2`/`A10` or `B`/`AA` the name is another option's. Use the same order
   (one small shared helper in the schedule domain or service, not a copy) or the
   `is_final` option with that order as the fallback.
4. **Tests the plan named are missing.** Add integration cases for: reply to a
   card of another project refused; item entry of another project refused; a 6th
   tag refused and a bad-character tag refused; an orphan tag removed while the
   same key in another project survives (covers 2); filters `phaseId`,
   `clientFeedback`, `starred` and `entryId`; cursor paging across two pages
   without duplicates; a user who cannot write phase B cannot post a note labelled
   B; item name with options `A2` and `A10` where `A10` is final (covers 3).

## Executor prompt

```text
You are the BACKEND EXECUTOR (docs/agent/EXECUTOR.md). Apply the Lead's
CORRECTION REQUIRED for WO-SF-NOTES-CHAT-01 in PLAN.md ("Lead review of R9.57")
as revision R9.59 on main: restore next-env.d.ts to its R9.56 content (never stage
it again), scope the orphan-tag cleanup to the project, make note item names use
the Schedule's own option order (compareOptionLabels then created_at, or the final
option), and add the missing integration tests listed there. No schema change
expected; if one is needed, stop with BLOCKED / CONFLICT. Run typecheck, eslint
on touched files, npm test (report the count), check:boundaries; add the R9.59
CHANGELOG entry; one local commit; no push. End with the Planner/Reviewer prompt
(outcome, commit, checks, limitations, dirty files).
```
