# Active Plan

Plan ID: WO-SF-ITER-01
Scope: StudioFlow backend — replace revision/phase-status tracking with client-sent iterations, explicit project completion, and the read models behind the new project-card home. Backend, migration, and the minimum wiring needed to keep the app compiling and its tests green. The Lead builds all screens afterwards.
Target revision: three ordered phases, one local revision each, starting at the next unused number in `CHANGELOG.md` (derive it; do not guess).
Status: READY
Priority: P1
Owner: owner (Product Owner). Direction agreed 2026-10-01; mockup approved by the owner the same day; the two open questions are decided (see Locked Decisions 9 and 10).
Last updated: 2026-10-01

## Outcome

StudioFlow tracks only what is sent to the client. Each phase has numbered iterations (Layout 1, Layout 2; 3D D1, D2 …); a project is completed only when a person presses "Mark as completed"; the home page can be rebuilt as one card per project from a single read. KB-060 disappears because automatic completion is removed.

Read first: `docs/BACKLOG.md` → StudioFlow → "Iteration-based phase tracking + project-card home" (the agreed spec), `docs/BACKLOG.md` KB-060, `src/apps/studioflow/phases/service.ts` (the current state machine), `src/apps/studioflow/today/service.ts`, `src/apps/studioflow/projects/service.ts` (`getAccess`), and `docs/apps/studioflow/`.

## How to run this program

- Three phases, in order, each its own cohesive local commit with a changelog entry and a Review Card appended to `docs/audits/WO-SF-ITER-01-REVIEW-CARDS.md` (what changed in plain words; requirement → evidence table with test names; three commands the Lead can run; rows migrated; deviations). `npm test`, `npm run check`, and `npm run lint` must be green before the next phase starts.
- Re-run `npm test` yourself and report the real counts; an earlier Executor report of "all pass" was wrong twice.
- Start from a clean committed tree; record HEAD and dirty files first. Use only the rebuild databases after verifying the target (`studioflow_rebuild`, `studioflow_rebuild_test` on `localhost`); never the legacy database. Apply every migration to both. Do not run `npm run build` (or restore `next-env.d.ts` before staging).
- The existing screens (phase page, Today, project list) will change meaning under you. Keep the app compiling and the existing tests meaningful by adapting call sites with the smallest honest change, mapping new states onto what the screens show; do **not** design new screens. The Lead replaces those screens right after this plan, so a degraded look in between is expected. List every screen you had to touch in the Review Card.
- Stop with a `BLOCKED / CONFLICT` report if a locked decision cannot be met.

## Locked Decisions

1. **An iteration is a client-sent unit.** Internal iterations, internal review states, and minor (internal-reject) revisions are dropped. The existing `SfRevision` table becomes the iteration table (keeps its relations to activities and deliverables): add `name` (auto-named from the phase name and number, e.g. "Layout 2"; renameable), `state`, `sent_at`, `answered_at`, `done_at`; `major` is the iteration number, `minor` is removed.
2. **Iteration states:** `NOT_SENT` → `SENT` (waiting for the client; `sent_at` set; "days waiting" derives from it) → `ANSWERED` (`answered_at` set) → then exactly one of `REVISED` (a new `NOT_SENT` iteration with the next number is created at that moment, never earlier) or `DONE`. No empty next iteration is created automatically. An iteration may go back one step only through the undo in decision 7.
3. **Phase status becomes** `PENDING` (no iteration yet), `ACTIVE`, `DONE`. A phase is `DONE` when its closing iteration is `DONE`. Reopening an earlier phase is "+ iteration" on it (creates the next `NOT_SENT` iteration, phase returns to `ACTIVE`); there is no reason-required Reopen; history is kept; other phases keep running. A phase may have only one open iteration at a time. When a reopened phase has dependent later phases that are `DONE`, set a soft flag `dependents_review_suggested` on the project read (no blocking, no automatic change).
4. **Requirements never gate anything.** Phase checklist items stay as non-blocking reminders: stop reading `is_blocking` anywhere in phase transitions (keep the column); unticked items are only counted for the card marker ("N requirements waiting"). They stay visible after a phase is done until ticked or dismissed (add a dismissal that does not delete: `dismissed_at`).
5. **One free-text note per phase** (`note` text on `SfPhase`, edited by the phase's seat owner or override), replacing the old "sub todo" idea. Existing sub-items are left in place and unread by the new model.
6. **CD phase.** The CD definition defaults to two iteration kinds in order: **CD Mall** (civil only) then **CD Final** (civil + interior fixture). CD Mall's outcomes are `REVISED` ("Revision") or **"Continue to CD Final"** (which closes CD Mall as `DONE` and creates `CD Final` as `NOT_SENT`); it has no plain "Done", so it cannot close the phase. Only CD Final `DONE` closes the phase. CD Mall may be deleted/skipped when a project goes straight to Final (a command that removes an iteration that was never sent). Model this with a per-definition list of default iteration kinds (a column on the phase definition) so other phases can opt in later; existing phase definitions without it behave as plain numbered iterations.
7. **Auto-advance with undo.** When a phase becomes `DONE`, the next `PENDING` phase in order becomes `ACTIVE` with a first `NOT_SENT` iteration automatically (parallel phases, `allow_parallel`, keep their current meaning). Every iteration/phase transition writes an append-only row to a new `SfPhaseEvent` table (project, phase, iteration, from, to, actor, at, plus what the transition auto-created). `undoPhaseEvent(eventId)` is valid only for the **latest** event of the project, by the **same actor**, within **5 minutes**, and reverses exactly that transition including what it auto-created; it is audited. Anything else is rejected with a clear code.
8. **Supervision** is dated site visits: each visit is an iteration-like entry with `visit_date`, a note, and (later) photos; outcomes are "Next visit" (creates the next visit) or "Done (handover)". The read model exposes "last visit N days ago". Photos are out of scope here (non-goal); leave the field/relationship ready only if trivial.
9. **Project completion is explicit only** (owner, 2026-10-01). Remove `completeProjectIfLast` and every automatic path to `COMPLETED`; add `markProjectCompleted` (project PIC or override holder; allowed even when phases are not all done; audited) and `reopenProject`. While `COMPLETED`, phase commands are rejected with a clear code until the project is reopened. This closes KB-060 by removal; delete the `[BUG]` entry from `docs/BACKLOG.md` when verified, with the revision recorded in the changelog.
10. **No "all phases done — mark completed?" prompt** exists anywhere in the backend or read model: do not return a flag whose purpose is to suggest completion. (An `all_phases_done` boolean for display is fine; it must not drive any command.) The per-person task feed that Today carried moves to a compact "My tasks" strip on the new home.
11. **Access.** Reuse the PIC rules from R8.220 (`getAccess`): iteration and phase commands need the phase's seat owner (designer or drafter by `seat_snapshot`) or `studioflow.project.override`; `markProjectCompleted`/`reopenProject` need the project PIC (either seat) or override; reads need project read. Do not invent new permissions unless unavoidable (3-part IDs only).
12. **Migration of existing data** (destructive, owner-approved; take the same care as the V2-E migration): per phase, group its `SfRevision` rows by `major`; the surviving row of each major is its highest `minor`; re-point activities and deliverables from the other rows of that major to the survivor, then delete them. State of the highest major: phase `IN_PROGRESS`/`ON_REVIEW_INTERNAL`/`APPROVED_INTERNAL` → `NOT_SENT`; `ON_REVIEW_CLIENT` → `SENT` with `sent_at = status_changed_at`; `READY_FOR_NEXT`/`COMPLETED` → `DONE` (`done_at = status_changed_at`); every lower major → `REVISED`. Phase status: `PENDING` → `PENDING`; the four middle statuses → `ACTIVE`; `READY_FOR_NEXT`/`COMPLETED` → `DONE`. A phase with no revision rows gets none (it stays `PENDING`/gets its first iteration lazily only if `ACTIVE`). Names: "<phase name snapshot> <major>". Projects already `COMPLETED` stay `COMPLETED`. The migration begins with pre-checks that print counts per table (phases, revisions to merge, activities and deliverables to re-point) and aborts with a clear message if any activity or deliverable would end up unattached; it reports before/after counts in the Review Card. Run it first against a copy-equivalent check on the disposable test database with seeded old-model data (include a test that seeds old rows and asserts the mapping).

## Business Rules and Architecture Constraints

- Capability labels: REUSE the PIC access read model, `writeAudit`, the platform notifications writer already used by phases (keep the existing notifications that still make sense: client-answered, assigned items), and the existing checklist and CD item tables; EXTEND `SfRevision`, `SfPhase`, `SfPhaseDefinition`, and the `today` read; ADD `SfPhaseEvent`. Policy stays app-owned inside `src/apps/studioflow`.
- StudioFlow keeps its boundaries: no foreign keys to other apps; BQ and Master Data are not touched. Other readers of phase status (timeline, portfolio, tasks, presentation, schedule, projects list, notifications) must be found by search and adapted; list them in the Review Card.
- Migrations: pre-check first, then the change; no silent data loss.

## Phases

### Phase 1 — model and migration
Schema (iteration columns on `SfRevision`, phase status values, `SfPhase.note`, checklist `dismissed_at`, `SfPhaseDefinition` default iteration kinds, `SfPhaseEvent`), the data migration per decision 12 with its pre-checks, and adaptation of every reader/writer of the old fields so the app compiles. The old transition commands may still exist at the end of this phase only if they now write the new states correctly; they are replaced in Phase 2.

### Phase 2 — commands, completion, undo
Commands: add iteration, send to client, record client answer, choose Revision / Done / Continue to CD Final, rename iteration, delete a never-sent iteration, phase note edit, requirement dismiss, supervision visit create/choose, auto-advance, `undoPhaseEvent`, `markProjectCompleted`, `reopenProject`. Remove `completeProjectIfLast` and the review/approve/reject commands and their notifications' obsolete cases. Access per decision 11. Every command is transactional, audited, idempotent where a retry could double-apply, and returns a clear error code for invalid state.

### Phase 3 — read models
- `listProjectCards({ grants, filter: "all" | "mine" })` → one entry per non-archived project: id, name, client, status, pic ids, `all_phases_done`, `dependents_review_suggested`, `can_mark_completed`, `note_phases` (which phases have a note), `requirements_waiting` count, `last_update_at`, and per phase: id, name, order, status, `current_iteration` (id, name, state, `sent_at`, `waiting_days`, available choices), `iteration_count`, `has_note`, and for Supervision `last_visit_days_ago`.
- `myTasksSummary({ grants })` → counts for today and overdue plus the item list, reusing the existing Today task logic (`today/service.ts`) so nothing the Today page showed is lost.
- Keep both reads index-friendly (no per-project loops over queries); a test with many projects asserts a bounded query count or at least correct results at volume.

## Backend Contract

Public (service) surface for the Lead's screens: the commands above, `listProjectCards`, `myTasksSummary`, and the existing project/phase reads adapted. Server actions are not required in this plan; add only the minimal ones needed to keep existing screens working.

## UI Contract

None to build. The Lead builds the project-card home (approved mockup: phase chips with iteration chips, waiting-for-client chip with days, inline Revision/Done after an answer, undo toast, "My tasks" strip above the cards, notes icon, supervision visit actions, "Mark as completed" only in the project menu) and the new phase page. The Executor may touch existing screens only as described under "How to run this program".

## Non-goals

Photos on supervision visits; any new screen; the BQ and Master Data apps; email/push notifications; changing permissions beyond decision 11; the Today page redesign (Lead).

## Regression Risks

- Many readers use phase status or revision numbers (timeline, portfolio, tasks, presentation, schedule, notifications, `blocker-query.ts`): find them all with search, not memory.
- The migration re-points activities and deliverables: a missed row leaves an orphan; the pre-check and post-check counts must reconcile exactly.
- Undo must not resurrect deleted rows or double-send notifications: reverse only what the event recorded.
- Parallel phases and the CD Mall/Final chain are the easiest places to get the auto-advance wrong; test them explicitly.

## Verification

Per phase: `npm test` (report the real counts before and after), `npm run check`, `npm run lint`, `git diff --cached --check`, both rebuild databases migrated, and the Review Card complete. After Phase 1 also run all migrations from an empty scratch database on the rebuild server (create it, apply, diff against the Prisma schema with `prisma migrate diff --from-config-datasource --to-schema prisma/schema`, drop it) and report the result.

## Reviewer Acceptance

After each phase the Lead reads the Review Card, reruns its three commands and the full suite, spot-checks the migration mapping and the state machine, and records PASS or one consolidated correction. Browser acceptance happens after the Lead builds the screens.

## Executor Prompt

You are the BACKEND EXECUTOR for this checkout (D:\Misc\ProjectsHUB\studioflowrb, office computer, `STUDIOFLOW_LOCATION=kantor`). Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, the root `PLAN.md` (WO-SF-ITER-01), and the files it names. Implement the three phases in order, one local commit per phase, each with its migrations and pre-checks, tests, changelog entry, and Review Card. Re-run `npm test` yourself and report real counts. Use only the rebuild databases after verifying the target; never the legacy database. Do not run `npm run build` (or restore `next-env.d.ts` before staging). Keep the backlog current (delete KB-060 with the revision recorded once verified). Stop with a `BLOCKED / CONFLICT` report if a locked decision cannot be met. Finish with one Planner/Reviewer prompt: outcome per phase, commit hashes, checks with real counts, rows migrated, screens touched, limitations, dirty files.
