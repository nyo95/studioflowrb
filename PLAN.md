# Active Plan

Plan ID: WO-SF-PHASE-MENU-01
Scope: Let a phase that has already started be skipped (e.g. a Moodboard the client supplied), make skip undoable, and give each phase on the Home card a ⋯ menu (client notes, new round, skip, open). Use one word — "round" — on every StudioFlow screen.
Target revisions: R8.353 (this plan, Lead), R8.354 (implementation, Executor), R8.355 (Lead review and polish).
Status: READY
Priority: P1
Owner: Product Owner.
Last updated: 2026-10-06

## Lane note

Same arrangement as WO-SF-RELAYOUT-01 and WO-SF-SCHED-RELAYOUT-01: the Executor builds backend and UI wiring; the Lead polishes in R8.355. If the plan contradicts the repository or a recorded owner decision, stop with `BLOCKED / CONFLICT` and send a prompt back to the Lead.

## Problem (owner, 2026-10-06)

- The studio's phases start at Moodboard, but on some projects the client supplies the moodboard. Moodboard is `ACTIVE` from project creation (bootstrap opens round 1), and `bypassPhase` only accepts a `PENDING` phase, so it can never be skipped. The phase page's More menu then offers only "Rename round" and "Delete (never sent)".
- Wording is mixed: buttons say "+ iteration", menus say "round", the admin reset says "iterations".
- On Home, the extra phase actions (client notes, a new round, skip) are only reachable by opening the phase.

## Locked Decisions (owner answers, 2026-10-06)

1. **Skip any time ("Kapan saja").** `bypassPhase` accepts a phase that is `PENDING` or `ACTIVE` (still refused when `DONE`, and when the project is not `ACTIVE`). A reason is required (placeholder: "e.g. Moodboard supplied by the client"). Permission stays `studioflow.phase.review` plus the phase assignment gate.
   - **Round history is kept**: every round that was sent stays exactly as recorded (state, dates, client notes, files).
   - The open round, **if it was never sent and holds nothing** (no client notes, no files), is removed; any other round is left as it is.
   - The phase becomes `DONE` and locked, the same way an OK on the last round finishes a phase — including the existing next-phase auto-advance.
   - A `PENDING` phase skip keeps today's behaviour (a closed round 1 is recorded).
2. **Skip is undoable** like every phase command: it writes an `SfPhaseEvent` whose undo restores the phase status, lock, any removed empty round and any auto-advanced next phase, within the existing five-minute, same-person rule. The audit event keeps the reason.
3. **Skipped is visible.** The phase read models used by Home and the project page expose that the phase was finished by a skip and its reason (derived from the latest finishing event or audit; no new column unless the Executor proves one is needed — then stop and report). Home and the phase strip show "Skipped" instead of "Done", with the reason as a tooltip/secondary line on the phase page.
4. **⋯ menu per phase on the Home card**, beside the phase's main action (`PipelineStrip` `action` slot), only for people who can act on that phase. Items, each shown only when the server allows it:
   - **Client notes…** — opens the existing notes editor for the phase's current round (`setIterationNote`); hidden while the round is `SENT` (the main button "Client answered" already records notes).
   - **+ New round** — `addIteration`, when the server's choices allow it (finished phase) — same rule as today's "+ iteration".
   - **Skip phase…** — the skip dialog with the reason (decision 1), when the phase is `PENDING` or `ACTIVE` and the viewer holds `phase.review`.
   - **Open phase** — the project page with `?phase=`.
   The phase page's More menu offers the same Skip phase… for an `ACTIVE` phase.
5. **One word: "round".** Every StudioFlow screen, toast and dialog says round: "+ New round", "New round added", "Rename round", "Delete round (never sent)", "Admin: reset rounds…", "Reset rounds (admin)" and its description. Code identifiers and commands keep their names.

## Boundaries and Non-goals

- No schema migration unless decision 3 truly needs one (then stop and report first).
- No change to send / client answered / outcome / CD Mall / supervision visit rules, completion, or permissions beyond decision 1.
- Pinned note stays on the project-level notes icon; it is not added to the phase menu.
- No browser acceptance by the Executor.

## Contract update (same commit)

`STUDIOFLOW-REWORK-CONTRACT.md` §5.3 (skip: any time, history kept, empty unsent round removed, undoable, shown as Skipped) and §7 (the per-phase ⋯ menu on Home). Note "round" as the screen word in §5.2.

## Acceptance Criteria

- On a new project, Moodboard (active, empty round 1) can be skipped with a reason; round 1 disappears, Moodboard shows Skipped, Layout/Design/CD behave as after a normal finish; Undo restores everything.
- A phase with a sent round can be skipped; the sent round and its notes remain in Earlier rounds.
- A `DONE` phase cannot be skipped; a viewer without `phase.review` never sees Skip.
- The Home card ⋯ menu shows only the allowed items per phase and each works.
- No screen says "iteration".

## Verification

`npm run typecheck`, `npm run lint`, `npm run check:boundaries`, `npm run check:legacy-runtime`, full `npm test` (baseline 829). New integration tests: skip an `ACTIVE` phase with an empty unsent round (removed), with a sent round (kept), refuse on `DONE`, auto-advance after skip, undo of each, permission refusal. Report counts before/after.

## Reviewer Acceptance (Lead, R8.355)

Browser: skip Moodboard on a fresh test project and undo it; skip a phase with a sent round; Home ⋯ menu per phase state; wording sweep for "iteration".

## Executor Prompt

You are the Backend Executor, assigned WO-SF-PHASE-MENU-01 by the owner (same rules as the previous two Work Orders). Location: kantor unless the owner says otherwise; load the matching .env file, set STUDIOFLOW_LOCATION, and verify the database target belongs only to studioflow-rebuild before any database command. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, `UI_ENGINE.md` (§3.5, §11, §15–17), `docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md` §5 and §7, and this `PLAN.md`, then implement the whole plan as revision R8.354 and nothing beyond it. If you find an inconsistency, need a schema change, or the plan contradicts the code, stop with BLOCKED / CONFLICT and send it back to the Lead. Do not polish visuals beyond the plan; the Lead does that in R8.355. Run the checks in `## Verification` (baseline 829 pass), update the contract and `CHANGELOG.md`, commit locally once, and reply with a Planner/Reviewer prompt containing outcome, commit, checks (test counts before/after), limitations and dirty files.
