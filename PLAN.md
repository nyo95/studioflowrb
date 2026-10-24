# Active Plan

Plan ID: WO-SF-BOOK-03
Scope: Client feedback points in the Project book: record what the client said for the round that is with them, turn
each point into a to-do, show "n of m handled", all without leaving the book.
Module(s): `studioflow` (book service, one new table, one additive column on `sf_book_todo`, a small shared helper
from the phase service, actions). No other module.
Target revision: plan R9.249 (Lead); backend + minimal wiring (Codex, Executor) R9.250 or the next free number;
UI (Lead) after it.
Branch: `feat/project-book` (never `main`).
Risk: HIGH - it records the client's answer, which moves a round's status (workflow record and phase state), and it
adds private-book data derived from a workflow record. A wrong guard either leaks private points or lets a member
change a phase. Escalate (BLOCKED) if answering a round from the book would need a change to an existing phase
status rule.
Status: READY (owner answered decision 3 on 2026-10-24: yes, both ways)
Priority: P1
Owner: Product Owner (`docs/apps/studioflow/PROJECT-BOOK-DECISION.md` decisions 3, 4, 5)
Last updated: 2026-10-24 (READY)

Previous plan: `WO-SF-BOOK-02` PASS (R9.245 Executor, R9.246-R9.247 Lead UI; owner browser check owed).

## Locked Decisions

1. **A round is a phase iteration** (`SfRevision`). A round "with the client" is `SENT`; "answered" is `ANSWERED`.
   Feedback points belong to one round. The existing phase "Client answered" dialog keeps working unchanged.
2. **Write once, status follows.** `recordClientFeedback` takes the round and one or more points. If the round is
   `SENT` it becomes `ANSWERED` exactly as `recordClientAnswer` does today (same event, same audit, same undo data:
   extract the shared step from `phases/service.ts` and call it from both; behaviour and existing tests unchanged).
   If the round is already `ANSWERED` and no outcome was chosen, more points are appended (late feedback). Any other
   round state is refused. The full text is also posted as the one workflow-record card (`origin CLIENT_ANSWER`,
   `workflowRecord true`) as today, so managers keep seeing the client's answer and the record stays complete.
3. **"Handled" (owner, 2026-10-24: yes, both ways).** A point is handled when someone ticks it, or when the
   to-do made from it is done. Reopening that to-do makes the point open again unless it was ticked itself. The round
   shows "n of m handled" from this rule. A point can be dealt with in a meeting without becoming a to-do, and a to-do
   closing closes its point without a second click.
4. **Point to to-do:** one to-do per point (`feedback_point_id` unique). Defaults: label = the point text (trimmed to
   the label limit), assignee and due date optional as for any to-do; it keeps `source_card_id` = the card the point
   came from. A second request for the same point is refused (`BOOK_POINT_ALREADY_TODO`) and returns the existing
   to-do id.
5. **Who:** reading points and handling or converting them needs a book reader (PIC or invited member), written
   exactly like to-do writes (`studioflow.phase.work`, open project, member only when ACTIVE). **Recording** the
   client's answer also needs what `recordClientAnswer` needs for that round's phase today (the phase's PIC seat or
   manager authority as `writableIteration` decides), so an invited member can never change a phase. A non-reader is
   refused like an unknown project on reads and `PERMISSION_DENIED` on writes, as BOOK-02.
6. **Two rounds out:** the caller names the round (`iterationId`); the read returns every open round so the screen
   can ask "which one?" in one click. The server never guesses.
7. **Points are split by the caller**, one per non-empty line, 1-30 points, each up to 500 characters; a duplicate
   line inside one request is kept (the client may repeat themselves).
8. **Not changed:** the phase checklist, blockers, completion, templates, `chooseIterationOutcome`, the workspace
   card model beyond the one new card per answer.

## Data

Additive migration: new `studioflow.sf_book_feedback_point` (id; project id cascade; iteration id cascade; card id
nullable, SetNull; body; sort order; `handled_at` nullable; `handled_by_id` + name snapshot nullable; created by id +
name; created at; version) with indexes on (project, iteration, sort order); and nullable unique `feedback_point_id` on
`sf_book_todo` (SetNull). Users are plain ids. Nothing else changes.

## Operations (service `studioFlow.bookFeedback`, plus actions)

- `listOpenRounds({projectId})`: the project's rounds that are `SENT`, or `ANSWERED` without an outcome, each with
  phase label, round name, status, answered at, its points in order (id, text, handled flag with the reason ticked or
  to-do done, linked to-do id/assignee/due/done) and counts `handled`/`total`. Book readers only.
- `recordClientFeedback({projectId, iterationId, points[]})`: decision 2 and 5; audited `book-feedback.recorded`.
- `convertPointToTodo({projectId, pointId, label?, assigneeId?, dueDate?})`: decision 4; reuses the BOOK-02 create
  rules (assignee must be a reader); audited `book-feedback.converted`.
- `setPointHandled({projectId, pointId, handled, version?})`: ticks or unticks the point itself; audited.
- `listMyTasks` and the to-do reads additionally return the linked round name and point id so the screen can say
  "client point, 3D R2" (no new permission).

## Non-goals

No screens, no composer, no material tries, no discussion, no notifications, no change to the phase dialog, no
automatic revise or approve (offered later by the UI), no parsing of images.

## Acceptance Criteria

1. A phase PIC records feedback for a `SENT` round: the round becomes `ANSWERED` exactly as the existing command
   does (same event and audit; existing phase tests unchanged and green), the points appear in order, the workflow
   card exists and a manager still sees that card.
2. Recording again on an `ANSWERED` round appends points; on any other state it is refused; two rounds out require
   `iterationId`.
3. An invited member can read points, convert and tick them, but cannot record the client's answer; a manager,
   override holder and Platform Owner who are not readers cannot read or write points.
4. Convert makes one linked to-do; a second convert is refused with the existing id; deleting the to-do leaves the
   point (SetNull) and it can be converted again.
5. "n of m handled" follows decision 3 under tick, untick, to-do done and reopened.
6. Stale or foreign ids (point of another project, round of another project) are refused as not found.
7. Phase approval, blockers, completion and the phase checklist behave exactly as before.

## Verification (Executor, before commit; tier HIGH per `docs/agent/VERIFICATION.md`)

`npm run typecheck`, `npm run lint`, `npm run check:boundaries`, `npm run check:legacy-runtime`, `npx prisma validate`,
migration on the disposable test database only; new real-database integration tests for criteria 1-7; the phase
suites unchanged and green; full `npm test`; `npm run build`; `node scripts/verify.mjs --tier high --e2e` when the
environment allows it, otherwise name it as not run. Per-command timeout 10 min.

## Reviewer Acceptance (Lead)

Code read of the extracted shared step, of every guard, and of the migration; own run of the full suite and build;
then the Lead UI: "Client asked" block with the progress ring and the typed composer's "Client said" kind (DESIGN.md
§6.3, UI Engine `ProgressRing` and `TypedComposer` activated), browser walk with PIC, member and manager.

## Executor Prompt

```text
Role: BACKEND EXECUTOR (Codex). Work on branch feat/project-book (never main; push only when the owner says so).
Location: home -> load .env.rumah, STUDIOFLOW_LOCATION=rumah, use only the rebuild databases (masterdata,
masterdata_test); verify the target before any database command. Read AGENTS.md, docs/agent/EXECUTOR.md,
docs/agent/VERIFICATION.md, PLAN.md (WO-SF-BOOK-03) and docs/apps/studioflow/PROJECT-BOOK-DECISION.md. Implement the
whole plan: the additive migration, the shared "answer a round" step extracted from phases/service.ts without
changing existing behaviour, studioFlow.bookFeedback with the four operations, the linked-round fields on the to-do
reads, minimal server actions, audit, tests per Verification. Do not build screens. Changelog entry with the next free
revision number. Commit locally and return the Planner/Reviewer prompt with outcome, commit, checks (with numbers),
limitations and dirty files.
```
