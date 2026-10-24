# Active Plan

Plan ID: WO-SF-BOOK-01
Scope: The Project book becomes private to the project's PICs and invited members (workflow records excepted), and
the note-image "Use in schedule" moves from Ideas into StudioFlow.
Module(s): `studioflow` (workspace/notes service, project access policy, new member table, actions); `ideas` (its
note-image schedule path removed); `presentation` bridge read of note images (consumer).
Target revision: plan R9.239-R9.240 (Lead); backend + minimal wiring (Codex) R9.241; review correction (Codex) R9.242; UI (Lead) R9.243.
Branch: `feat/project-book` (never `main`; see PROJECT-BOOK-DECISION.md "Branch").
Risk: high - narrows read access on existing data and widens project-page access for invited members; a missed
read path leaks private notes, an over-narrow one hides the official client answers from managers. Escalate
(BLOCKED) if any notes read path cannot tell a workflow record from an ordinary card, or if invited-member access
would need a change to RBAC roles.
Status: READY
Priority: P1
Owner: Product Owner (decisions 2026-10-23, `docs/apps/studioflow/PROJECT-BOOK-DECISION.md` 5, 6, 8)
Last updated: 2026-10-23

Previous plan: `WO-PLATFORM-MODULE-USER-ACCESS-01` SUPERSEDED in R9.238 (not built).

## Locked Decisions

1. **Book reader** = the project's `pic_designer_id`, `pic_drafter_id`, or a book member of that project. Nothing
   else qualifies: not `projectManage`/`projectOverride`, not the Platform Owner. Put it in the single access
   policy (`projectAccessFromFacts` / `ProjectAccess`, e.g. `canReadBook`), not per call site.
2. **Workflow-record exception:** a card with `workflow_record = true` (client answer, site visit written by a
   phase step) stays readable by everyone with today's `canSeeWorkSections`. Every other card (and its replies,
   tags, item links, thread, image/file object and signed URL) needs book reader.
3. Every notes/workspace read and write path applies 1-2: `readWorkspace`, `listWorkspaceThreads`,
   `listProjectNotes` (all filters), `listNoteTags`, `listNotesForItem` (the Schedule side), `listStarredPhaseNotes`,
   thread/card/image/file writes, tag and item-link writes, the note image/file object read, and the Presentation
   bridge's note-image read. A non-reader asking for a private card gets the same NOT_FOUND as a missing card.
   `searchNoteItems` (Schedule item lookup) is unchanged. Phase-step writers (`recordClientAnswer`, site visits)
   keep working for whoever may run the step today.
4. **Book members:** new `studioflow` table (project id, user id, invited by id + name snapshot, invited at; unique
   per project+user; cascade with the project; user as a plain id). Only a PIC adds or removes; only an ACTIVE user
   with StudioFlow access may be added; a PIC is never stored as a member. Both changes are audited. Additive
   migration only; no data backfill.
5. **Member project access:** a member passes project-detail and work-section reads for that project (the page head,
   stage strip, the book) as if assigned, but gains no edit: `canEditProject`, `canEditDocuments`, phase
   `canTransition`/`canEditContent`, Schedule, MOM and Presentation writes stay as today for them. The project list
   may show the project to a member.
6. **Use in schedule from a note image** becomes a StudioFlow operation (workspace service + action): book reader
   AND the existing Schedule-edit rule; it creates the item or extra option exactly as the Ideas path does today
   (same copy semantics, idempotency key, refusals). The Ideas service's `useNoteImageInSchedule` and its action
   are removed; `saveNoteImageToIdeas` stays (Ideas is switched off, not deleted) but now also requires book reader.
7. No UI design work: minimal wiring only (the note-image button calls the new action; a temporary plain list to
   add/remove members may be exposed through an action without a screen). The Lead builds the screens in R9.243.

## Non-goals

No to-do, feedback, material-try, discussion or Ideas work (BOOK-02..06). Ideas is not deleted. No change to phases, Schedule
rules, roles or the Workspace board module state.

## Acceptance Criteria

1. PIC designer and PIC drafter read and write all cards of their project as today.
2. A Studio Manager with override and the Platform Owner, not PIC and not member: see only workflow records in
   notes lists, item notes and the phase view; a private card id, its image URL and its Presentation import answer
   NOT_FOUND; every notes write is refused.
3. Invited member: reads and writes the book, opens the project page, cannot change phases, Schedule, MOM or
   Presentation; removed member loses access on the next request.
4. Only a PIC can add/remove members; inactive or non-StudioFlow users refused; audit rows written.
5. Note-image "Use in schedule" works for a PIC with Schedule edit, refused for a member without it and for a
   non-reader, and no longer depends on the Ideas module being on.
6. Existing phase steps (client answer, site visit) still post their workflow records and remain visible to managers.

## Verification (Executor, before commit)

- `npm run typecheck`, `npm run lint`, boundary scan, `npx prisma validate` + migration generated and applied on the
  disposable rebuild test database only.
- Integration tests (new, real database): access matrix PIC / member / override manager / Platform Owner / outsider
  for every path in decision 3; workflow-record visibility; member add/remove + audit; note-image Use in schedule
  allowed/refused cases and idempotent retry.
- Existing suites: `src/apps/studioflow/**` integration, `note-actions.test.ts`, `asset-cleanup-actions.test.ts`,
  `module-gates.integration.test.ts`, ideas and presentation tests. Per-command timeout 10 min.
- `npm run build`.
- Safe checkpoint: migration + access policy + tests may be committed only together; never commit a state where
  a read path is unguarded.

## Reviewer Acceptance (Lead, after R9.241)

Browser on an isolated server with three accounts (PIC, override manager, invited member) walking criteria 1-6;
then the Lead's R9.243 UI (members list in the book panel header, the moved Use in schedule button).

## Executor Prompt

```text
Role: BACKEND EXECUTOR (Codex, cloud). Repository nyo95/studioflowrb, branch feat/project-book: check it out and
work only there; never commit to or push main. Location: cloud - per AGENTS.md create an ignored .env /
.env.test.local pointing at a PostgreSQL you start inside this container (studioflow_rebuild,
studioflow_rebuild_test); never any other database. Read AGENTS.md, docs/agent/EXECUTOR.md, PLAN.md
(WO-SF-BOOK-01) and docs/apps/studioflow/PROJECT-BOOK-DECISION.md. Implement the whole plan: book-reader policy in
the single StudioFlow access policy, workflow-record exception, every notes read/write path guarded, book member
table (additive migration) with audited PIC-only add/remove, member read-only project access, note-image Use in
schedule moved from Ideas into StudioFlow. Do not delete Ideas. Tests and checks per Verification; changelog
R9.241. No screen design (Lead R9.243). Commit as R9.241 on feat/project-book, push only feat/project-book, and
return the Planner/Reviewer prompt with outcome, commit, checks, limitations and dirty files.
```
