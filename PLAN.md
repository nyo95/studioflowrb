# Active Plan

Plan ID: WO-SF-NOTEFEED-01 (phase notes as a chat to yourself)
Scope: StudioFlow phase notes: schema, migration with backfill, service, actions, phase page, project card, answer/visit flows.
Target revisions: next unused revision at commit time; one commit.
Status: READY — owner asked the Lead to build it directly (no Executor hand-off), 2026-10-08 (kantor).
Priority: P1
Owner: Product Owner. Decisions approved in chat on 2026-10-08.
Last updated: 2026-10-08

Previous plan WO-MD-SKUBULK-01 was built by the Executor (R8.441).

## Outcome

The Notes card on the phase page becomes a stream of messages, like sending
WhatsApp messages to yourself: type, Enter, it is posted with time and author.
Images are pasted, dropped or picked into the composer and sent with the message.
Every message is labelled with the iteration running when it was written (D1,
D2...). A message can be starred (starred ones are the phase's pinned notes and
sit on top), marked "Client feedback", edited or deleted. Posting never shows the
phase Undo bar: notes are not phase steps.

## Locked decisions (owner, 2026-10-08)

1. One stream per phase; each message carries its iteration label.
2. Existing notes are converted, nothing is lost: every iteration's client
   notes (+ its images) become one message on that iteration marked Client
   feedback (a visit's note becomes an unmarked message on the visit); every
   phase's pinned note becomes a starred message without an iteration.
3. Messages may be posted while an iteration is with the client.
4. Anyone allowed to work the phase may post, edit, star, mark or delete any
   message (same rule as the old notes). Delete asks first. Project must be open
   (writable and ACTIVE) for every change.
5. Lead defaults (owner may revisit): the project card's "Client notes…" becomes
   "Add note…" (posts to that phase's stream); recording "Client answered" with
   text posts it as a Client feedback message; the card's pinned-notes dialog
   lists starred messages per phase; a visit's note is posted as a message.

## Data

- ADD `sf_phase_note` (id, phase_id → sf_phase CASCADE, iteration_id →
  sf_revision SET NULL, body text default '', is_starred, is_client_feedback,
  author_id, author_name nullable snapshot, created_at, edited_at).
- ADD `sf_phase_note_image` (same columns as `sf_iteration_image`, `note_id` →
  sf_phase_note CASCADE). At most 12 per message, 3 MB each, PNG/JPEG/WebP.
- Backfill as in decision 2 (migrated message id = revision id / phase id, so
  images map 1:1), then DROP `sf_iteration_image`, `sf_revision.note`,
  `sf_phase.note`. Old undo payloads that still carry `note` are ignored.
- An iteration with messages counts as having attached work (never deleted,
  undo of its creation refused), as images did.
- Asset reference count and archived-project retention read note images.

## Interfaces

Service (`phases/notes.ts`): `postPhaseNote`, `editPhaseNote`,
`setPhaseNoteFlags` (starred / client feedback), `deletePhaseNote`,
`addPhaseNoteImage`, `removePhaseNoteImage`, `listPhaseNotes` (stream with
signed image links), `listStarredNotes` (project, per phase). Removed:
`setIterationNote`, `setPhaseNote`, iteration image commands. Actions are
separate from `phaseCommandAction`, so no undo outcome.

## Checks

tsc, lint, full `npm test` against `studioflow_rebuild_test`, build; migration
applied to `studioflow_rebuild` and `studioflow_rebuild_test` (localhost:5433).
Browser acceptance by the owner.
