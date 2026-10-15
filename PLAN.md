# Active Plan

Plan ID: WO-SF-BOARD-THREADS-01
Scope: Workspace board note threads — double-click anywhere on the board to open a small Notes chat at that spot, a speech-bubble marker with its count, and "All notes · N" in the board toolbar
Module(s): studioflow (data, services, actions); `workspace-board` feature module (board UI, board-only actions gated by it)
Target revision: Executor backend **R9.76**; Lead board UI R9.77 (Lead plan R9.75)
Status: READY (Executor backend slice)
Priority: P1
Owner: Product Owner; Lead locks and reviews
Last updated: 2026-10-15

## Outcome

On the Workspace board (module on), double-clicking empty space or an element opens a small chat window at that spot — the same chat as Notes (bubbles, albums, replies, the auto phase tag, `#` topics, `@` Schedule codes). Sending the first message creates a **thread** at that point; the point keeps a speech-bubble marker with its message count (amber when any message is client feedback); clicking it reopens the thread. A marker placed on an element moves with that element; a free marker can be dragged. "All notes · N" in the toolbar lists every thread's messages as one stream. Thread messages are ordinary project notes: they also appear in the Notes stream, so switching the board off never hides or loses them.

This plan: the **Executor delivers the backend** (schema, migration, services, actions, tests). The **Lead builds the board UI** afterwards as R9.77 (marker, chat window, double-click change, All notes drawer). No UI work in the Executor slice beyond what compiling callers need.

The previous Work Order (WO-SF-NOTES-PRESENTATION-IMAGE-01) is complete in code through R9.74; its browser groups stay pending in `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md` and its full plan is in git history (`ec86b48:PLAN.md`).

## Context and Evidence

- Backlog item `[PLANNED][P1] Workspace board: a note thread where you double-click` (owner 2026-10-15, R9.63) and mockup artboard *Workspace — klik dua kali untuk catatan* (`project/WorkspaceChat.dc.html` in https://claude.ai/artifact/7ns7QpSUBxSY6c1FYYJvbF).
- Every note and board element is an `SfWorkspaceCard` (`prisma/schema/studioflow.prisma:308`). Notes posted from the chat have no canvas point; `readWorkspace` (`src/apps/studioflow/workspace/service.ts:611`) returns **every** card and the board lays unplaced ones out automatically (`_workspace-canvas/canvas.tsx:172–181`). Thread messages must therefore be excluded from the board's element read, or they would become loose cards.
- Card writes are gated by `writableScope` (phase label → that phase's `phaseWork`+`transition`; unlabelled → `phaseWork`+`document`; open ACTIVE project); every mutation names its read `version` (R9.66 `noteAction`). Deletion cleans storage through `enqueueUnreferencedCleanup` + `discardObjects` (service.ts:355–365).
- Replies (`reply_to_id`), tags, item links, client-feedback origin, albums and the shared mention resolver exist (WO-SF-NOTES-CHAT-01, R9.66, R9.73).
- Board actions refuse with `MODULE_DISABLED` while `workspace-board` is off (`actions.ts` `workspaceAction`); Notes actions (`phaseNoteAction`, `noteAction`, `postPhaseImageAction`) stay on (MODULES-DECISION D11: switching never loses data).
- Current board double-click on empty space opens a new text draft (`canvas.tsx:298–302`); this changes in the Lead UI slice (owner decision below).
- Archived-project asset retention deletes image cards in bulk (`src/apps/studioflow/projects/asset-retention.ts:76`).
- Latest migration `20261014230000_studioflow_note_chat`. Baseline R9.74 `ec86b48`; untracked owner files `test/BOQ TEST.xlsx`, `test/BOQ TEST 2 - PDF.pdf` must be preserved.

## Locked Decisions

1. **Storage (Lead).** A new StudioFlow table `sf_workspace_thread`; messages are ordinary `sf_workspace_card` rows with a new nullable `thread_id`. Not a new card kind and not `reply_to_id` (replies keep their quoting meaning inside a thread).
2. **Anchor (Lead).** A thread is either free (`anchor_card_id` null, point `x`,`y`) or anchored to a board element (`anchor_card_id` + `offset_x`,`offset_y` from that element's top-left, board px). `x`,`y` are always stored too (the absolute point at creation, refreshed on move) as the fallback position.
3. **Deleting the anchor element deletes its threads and their messages (owner 2026-10-15: "Ikut terhapus").** Done explicitly in the service in the same transaction as the element deletion, with storage cleanup for message images/files. The UI confirms with the message count (Lead UI; the read model exposes the count). **Security (Lead):** the cascade is refused (`WORKSPACE_THREAD_LOCKED`, nothing deleted) unless the actor passes the write gate of every message's label — deleting an element must never become a way to delete notes the actor could not delete one by one. Official workflow records follow G1 (deletable).
4. **Non-user deletions do not cascade.** At the database level `anchor_card_id` is `ON DELETE SET NULL` (asset retention, project-level purges): the thread survives at its stored `x`,`y` and its text messages are kept.
5. **Double-click = note thread (owner: "Ya, ikut mockup").** On empty space and on elements. New text boxes come from the toolbar's **+ Text** (Lead UI).
6. **Free markers can be dragged (owner: "Boleh digeser").** Anchored markers follow their element and cannot be moved on their own.
7. **No empty threads.** A thread is created only together with its first message (text or image) in one transaction; deleting a thread's last message deletes the thread in the same transaction.
8. **Phase stays required for new messages (G3).** A thread message carries the phase label chosen in the window (default: the page's selected phase) exactly like a Notes post; the thread itself has no phase.
9. **Board off:** thread messages appear in the Notes stream as ordinary notes and stay editable/deletable there through `noteAction`; markers and thread commands are board-only (`MODULE_DISABLED` while off). No data is hidden or lost.
10. No new dependency, no shared UI Engine change, no cross-module relation, no legacy, no remote operation.

## Business Rules and Architecture Constraints

- **EXTEND** StudioFlow workspace service/actions; **REUSE** `insertWorkspaceCard`, `createImage`, `writablePhase`/`writableProject`/`writableScope`, `syncTags`, `syncItemLinks`, `validateReply`, `enqueueUnreferencedCleanup`/`discardObjects`, version/stale errors, `runSafeAction`, `requireModuleEnabled(WORKSPACE_BOARD)`.
- Thread rows are project-level: creating one requires the first message's phase gate; moving a free marker requires `phaseWork` + project `document` access on an open ACTIVE project (same as unlabelled cards).
- An anchor must be a board element of the same project that is **not itself a thread message**; a thread message can never be an anchor.
- Thread messages are excluded from the board element read and from `placeItems` (refuse placing a thread message: `WORKSPACE_THREAD_MESSAGE`).

## Backend Contract

**Schema + migration** (one migration, e.g. `20261015…_studioflow_workspace_threads`, applied to the kantor dev and test databases after verifying both are rebuild-only):
- `SfWorkspaceThread`: `id` uuid, `project_id` (FK project, cascade), `x` Int, `y` Int (0…`WORKSPACE_CANVAS_MAX`), `anchor_card_id` String? (FK `SfWorkspaceCard`, `onDelete: SetNull`), `offset_x` Int?, `offset_y` Int? (both set iff anchored), `created_by_id` String?, `created_at`, `updated_at`, `version` Int default 1. Indexes on `project_id` and `anchor_card_id`.
- `SfWorkspaceCard.thread_id` String? (FK thread, `onDelete: Cascade` as an integrity net; the service deletes explicitly with storage cleanup), index on `thread_id`.

**Service (workspace service) and transport:**
1. `postThreadMessage({ projectId, thread, phaseId, body, clientFeedback?, replyToId?, tags?, itemEntryIds? })` where `thread` is `{ threadId }` or `{ x, y }` (new free thread) or `{ anchorCardId, offsetX, offsetY }` (new anchored thread; `x`,`y` computed from the anchor's canvas point, or the offset alone when the anchor is unplaced). Same validation and phase gate as `postPhaseNote` (body, tags, items, reply in the same project), creates the thread when new, inserts the message with `thread_id` and no canvas point. Returns `{ threadId, noteId }`. A reply must target a message of the same thread.
2. `postThreadImage(FormData: projectId, phaseId, thread spec as fields, file, clientFeedback?, replyToId?, tags?)` — reuse `createImage` with the same thread creation rule. Returns `{ threadId, imageId }`.
3. `moveThread({ projectId, threadId, version, x, y })` — free threads only (`WORKSPACE_THREAD_ANCHORED` otherwise); bounds-validate coordinates; stale version → `WORKSPACE_THREAD_STALE`.
4. Deleting a message (existing `deleteCard` via `noteAction`, single and album groups): if it was the thread's last message, delete the thread in the same transaction.
5. Deleting an element (`deleteCard` from any door, board multi-delete included): load threads anchored to it and their messages; check every distinct message label with `writableScope` (refuse `WORKSPACE_THREAD_LOCKED` before any write); delete messages (collect storage keys), threads, then the element; queue storage cleanup for all keys; audit `workspace-thread` `deleted` with message count.
6. `readWorkspace` excludes thread messages. New `listWorkspaceThreads({ projectId })` → `[{ id, version, x, y, anchorCardId, offsetX, offsetY, messageCount, clientFeedback (any message CLIENT_ANSWER), lastMessageAt }]`. `listProjectNotes` gains filters `threadId` and `inThreads: true` (for "All notes"); its notes gain `threadId`. `cardView` gains `anchoredThreadMessages` (count of messages in threads anchored to this element; 0 otherwise) for the delete confirmation.
7. Asset retention (`asset-retention.ts`): after its bulk image deletion, delete threads left without messages (no empty markers); anchors cleared by SET NULL keep their threads.
8. Actions (`actions.ts`, board section, all behind `requireModuleEnabled(WORKSPACE_BOARD)`): `threadCommandAction` strict union `post` / `move`; `postThreadImageAction(FormData)`; `listWorkspaceThreadsAction(projectId)`. `listProjectNotesAction` accepts `threadId`/`inThreads` (not gated: Notes reads stay on). Edits/flags/deletes of messages keep using `noteAction`.
9. Audit: `workspace-thread` `created` / `moved` / `deleted`; messages as today's `workspace-card` events.

## UI Contract

Executor: none beyond types/callers that must compile. Do not change the board or Notes UI.
Lead (R9.77, after review): double-click opens the thread window at the point/element (replacing the text draft; + Text stays in the toolbar), marker with count/amber/drag for free threads, chat window reusing the Notes bubble/composer pieces, "All notes · N" drawer, delete confirmations naming the thread message count, English copy.

## Boundaries and Non-goals

No change to Notes stream behaviour except that thread messages carry `threadId`; no thread labels in Notes in this WO; no person mentions, thread titles, resolving/closing threads, notifications, cross-project threads or thread print/export. No new dependency, no shared UI Engine change, no legacy, no remote operations.

## Acceptance Criteria

1. A thread exists only with ≥1 message; the first message (text or image) creates it atomically in each of the three spec forms; replies stay inside the thread.
2. Thread messages never appear in `readWorkspace` and cannot be placed; they appear in `listProjectNotes` (all, `threadId`, `inThreads`).
3. Free threads move with version checks; anchored threads refuse moves.
4. Deleting the last message removes the thread; deleting an anchor removes its threads and messages with storage cleanup, or refuses entirely when any message is outside the actor's rights.
5. Retention keeps text messages and threads (anchor cleared) and removes only emptied threads.
6. Board off: thread commands refuse `MODULE_DISABLED`; Notes reads and `noteAction` keep working on thread messages.

## Verification

Executor: integration tests on the guarded test DB for 1–6, including: phase gate on post (other phase's writer, outsider, completed/archived/non-ACTIVE refused), reply from another thread refused, anchor that is a thread message or in another project refused, moveThread stale/anchored/bounds, last-message deletion (single and album group), anchor delete with mixed-label messages refused with nothing deleted vs. allowed, storage cleanup queued for message images, retention behaviour, `MODULE_DISABLED` on every thread action, Notes filters. Then `npm test`, typecheck, full lint, `check:boundaries`, `check:legacy-runtime`, production build, staged/unstaged whitespace. Load `.env.kantor`, set `STUDIOFLOW_LOCATION=kantor`, verify both DB targets are rebuild-only before `prisma migrate`; apply the migration to dev and test; regenerate the client. Read the installed Next.js server-action docs before adding actions.

Reviewer (Lead): code review and re-run checks, then the UI slice R9.77; browser acceptance by the owner after R9.77.

## Regression Risks and Recovery

The board element read now filters by `thread_id` — confirm no other board consumer needs thread messages. Cascade deletion is destructive: the permission pre-check and one transaction are mandatory. Notes stream size grows with thread messages (expected). Recovery: revert the revision and roll back the migration on the rebuild databases only.

## Executor Prompt

```text
ROLE: BACKEND EXECUTOR. Location: kantor (load .env.kantor, set
STUDIOFLOW_LOCATION=kantor, verify the dev and test databases are
rebuild-only before any prisma command). Read AGENTS.md,
docs/agent/EXECUTOR.md and PLAN.md WO-SF-BOARD-THREADS-01. Implement the
backend exactly as locked: sf_workspace_thread table + sf_workspace_card.
thread_id (one migration, applied to dev and test), postThreadMessage /
postThreadImage creating a thread only with its first message (free point or
anchored to a non-thread element), moveThread for free threads with version,
last-message deletion removes the thread, anchor deletion removes its threads
and messages with storage cleanup but refuses entirely (WORKSPACE_THREAD_LOCKED)
unless the actor may write every message's label, anchor FK ON DELETE SET NULL
for non-user deletions, retention removes only emptied threads, readWorkspace
excludes thread messages, listWorkspaceThreads, listProjectNotes threadId /
inThreads filters, cardView anchoredThreadMessages, board-gated actions. No
board or Notes UI changes (the Lead builds the UI next). No new dependency,
shared UI Engine change, legacy or remote operation. Preserve untracked owner
files under test/. Finish with the listed tests and all checks, CHANGELOG
R9.76, one local commit. Return only the Planner/Reviewer prompt: outcome,
commit, checks, migration applied (dev/test), limitations, remaining dirty
files. Stop with BLOCKED / CONFLICT if the plan contradicts the repository.
```
