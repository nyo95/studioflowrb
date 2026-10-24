# Active Plan

Plan ID: WO-SF-BOOK-02
Scope: To-dos in the Project book (who, when, done) and one "My tasks" read across projects.
Module(s): `studioflow` (new book to-do table, workspace/book service, actions). No other module.
Target revision: plan R9.244 (Lead); backend + minimal wiring (Codex) R9.245; UI (Lead) R9.246.
Branch: `feat/project-book` (never `main`; see PROJECT-BOOK-DECISION.md "Branch").
Risk: medium - a new private record type; a missed guard leaks private to-dos, and touching the phase checklist by
mistake would change approval blocking. Escalate (BLOCKED) if a to-do would need to block a phase, or if "My tasks"
cannot be bounded to the caller's own book projects.
Status: READY
Priority: P1
Owner: Product Owner (decisions 2026-10-23, `docs/apps/studioflow/PROJECT-BOOK-DECISION.md` 1, 4, 5)
Last updated: 2026-10-24

Previous plan: `WO-SF-BOOK-01` PASS (R9.241, R9.242 by Codex; UI R9.243 by the Lead); owner browser check owed.

## Locked Decisions

1. **Own table, not the phase checklist** (Lead, 2026-10-24; amends the storage wording of decision 4 only, the
   product behaviour is unchanged): the phase checklist stays the approval gate (templates, blocking, phase lock,
   completion). A book to-do never blocks anything, so it lives in a new `studioflow` table, e.g. `sf_book_todo`:
   id, project id (cascade with the project), label (same max as a checklist label), assignee user id (nullable,
   plain id), due date (nullable, date only, the project's existing date-only convention), done at (nullable),
   source card id (nullable, the workspace card it came from, `SetNull` on delete; filled by WO-SF-BOOK-03, not
   now), created by id + name snapshot, created at, sort order, version (optimistic concurrency like workspace
   cards). Additive migration only. No change to `sf_checklist_*`, blockers, completion or templates.
2. **Who:** every read and write needs a book reader of that project (`requireBookAccess`). Writes also need the
   project open (not archived, not completed) like other book writes; a member writes under the same rule as a
   member's note (WO-SF-BOOK-01 `writableForMember`); a PIC needs only the open project (a to-do has no phase).
3. **Assignee** must be a book reader of that project at the time of assignment (a PIC or a member), or empty.
   Removing a member leaves their to-dos assigned to them but they disappear from that person's "My tasks"
   because they no longer read the book.
4. **Operations:** create, update label / assignee / due date (version-checked), mark done / not done, reorder,
   delete. Every write is audited (`book-todo`). Delete is allowed to any book reader.
5. **Project list read:** open to-dos first in sort order, then done ones (most recent first, bounded, e.g. last 50).
6. **My tasks read:** the caller's open to-dos where they are the assignee, across every non-archived project whose
   book they read, plus open unassigned to-dos they created; each row carries project id and name, label, due date,
   source card id. Bounded (e.g. 200), ordered by due date (empty last) then created at. No "late" computation on
   the server: the screen compares the date with today in the platform time zone.
7. No UI design: minimal wiring through server actions only. The Lead builds the book section and Home in R9.246.

## Non-goals

No feedback points, no feedback-to-to-do conversion (BOOK-03), no material tries, no notifications, no change to
the phase checklist or its screens, no Todoist sync.

## Acceptance Criteria

1. A PIC and a member create, edit, complete, reopen, reorder and delete to-dos; each write is audited.
2. A manager / override holder / Platform Owner who is not PIC or member: every to-do read and write is refused
   (lists answer the same as for an unknown project).
3. Assigning a non-reader is refused; assigning a member or PIC works.
4. "My tasks" returns only the caller's own open to-dos from books they read; a removed member's tasks vanish.
5. A stale version is refused; an archived or completed project refuses writes.
6. Phase approval, blockers and completion behave exactly as before (existing tests unchanged and green).

## Verification (Executor, before commit)

- `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, `npm run check:legacy-runtime`,
  `npx prisma validate`, migration applied on the disposable test database only.
- New integration tests (real database) for criteria 1-6; existing StudioFlow suites unchanged and green.
- Full `npm test` and `npm run build`. Per-command timeout 10 min.
- Safe checkpoint: migration + service + guards + tests committed together only.

## Reviewer Acceptance (Lead, after R9.245)

Lead UI R9.246: the To-do section of the book (DESIGN.md §6.3, the "Client asked" block arrives with BOOK-03) and
"My tasks" on Home; browser walk with a PIC, a member and a manager.

## Executor Prompt

```text
Role: BACKEND EXECUTOR (Codex, cloud). Repository nyo95/studioflowrb, branch feat/project-book: check it out and
work only there; never commit to or push main. Location: cloud - per AGENTS.md create an ignored .env /
.env.test.local pointing at a PostgreSQL you start inside this container (studioflow_rebuild,
studioflow_rebuild_test); never any other database. Read AGENTS.md, docs/agent/EXECUTOR.md, PLAN.md
(WO-SF-BOOK-02) and docs/apps/studioflow/PROJECT-BOOK-DECISION.md. Implement the whole plan: new book to-do table
(additive migration), book-reader guards on every read and write, assignee rule, audited operations, the project
list read and the cross-project My tasks read, minimal server actions. Do not touch the phase checklist. Tests and
checks per Verification; changelog R9.245. No screen design (Lead R9.246). Commit as R9.245 on feat/project-book,
push only feat/project-book, and return the Planner/Reviewer prompt with outcome, commit, checks, limitations and
dirty files.
```
