# WO-SF-ITER-01 Review Cards

## Phase 1 — iteration model and migration (R8.285)

Delivered by the Lead (the Executor wrote the schema and migration, then reached its limit; the Lead found and fixed a migration defect, finished the callers, and verified).

### What changed

A phase now has only three states: Not started (`PENDING`), Active (`ACTIVE`) and Done (`DONE`). Each phase carries numbered iterations (for example "Layout 1", "Layout 2") that track only what was sent to the client: not sent, sent, answered, revised, done. Internal review is gone: "send for internal review", "approve internally" and "needs changes (internal)" no longer exist. The remaining client steps (start, skip, send to client, client approved, client asked for changes, reopen, finish supervision) now write the new states. A client change request marks the sent iteration "revised" and opens the next one. Requirements (unticked checklist items) no longer stop any step; they remain visible as reminders.

The new tables and columns for later phases (note per phase, dismissed requirements, default iteration kinds such as CD Mall → CD Final, the append-only phase event log) are in place but not used yet. Automatic project completion, undo, and the new commands arrive in Phase 2.

### Requirement → evidence

| Requirement | Evidence | Result |
| --- | --- | --- |
| Iteration table with name, state, sent/answered/done dates, no minor | Migration `20261001120000_sf_iteration_model`; `SfRevision` in `prisma/schema/studioflow.prisma` | PASS |
| Phase status PENDING / ACTIVE / DONE | Same migration; `domain.test.ts` — "follows the phase transition table" | PASS |
| One open iteration per phase | Partial unique index `sf_revision_one_open_iteration_per_phase` (exercised by the scratch run below) | PASS |
| Client steps write correct states | `service.integration.test.ts` — "sends iterations to the client, records client changes, and approves", "runs a custom phase through the normal state machine with its own prefix" | PASS |
| Requirements never gate a step | `service.integration.test.ts` — "never blocks a client step on unchecked checklist items" | PASS |
| Data migration per decision 12, with pre-check and reconciliation | Scratch run below | PASS |
| App compiles, all readers adapted | `npm run check`, 750/750 tests | PASS |

### Migration evidence (scratch database, since dropped)

All 80 earlier migrations applied to an empty scratch database, old-model rows were seeded, then the new migration ran. The Lead's seed covered six phases: two majors with minors in a phase waiting for the client, a finished phase, a not-started phase with no revisions, a working phase with two majors, an internally-approved phase, and a completed phase.

| Check | Before | After |
| --- | ---: | ---: |
| Revisions / iterations | 9 | 7 (two majors merged into their highest minor) |
| Activities attached | 4 | 4 (re-pointed to the survivor; 0 orphans) |
| Deliverables attached | 1 | 1 (re-pointed to the survivor) |

Mapping seen: the lower major of a phase waiting for the client became `REVISED` and the highest `SENT` with `sent_at` taken from the phase's last status change; finished and completed phases became `DONE` with `done_at`; working and internally-approved phases became `ACTIVE` with a `NOT_SENT` iteration; a phase with no revisions stayed `PENDING` with none; names are "<phase name> <major>".

Full chain diffed against the Prisma schema: the only difference is the old, unrelated `platform.user_preference.updated_at` default (recorded in the backlog).

**Defect found and fixed by the Lead.** The Executor's version of the migration mapped every iteration of a phase waiting for the client to `SENT`, so a phase with an earlier major would have failed to create the "one open iteration" index, and every earlier major of a finished phase would have become `DONE` instead of `REVISED`. The lower-major rule now comes first. The office and test databases held only three and one `NOT_SENT` iterations with nothing earlier, so no data was wrong; both databases' recorded checksum was updated to match the corrected file.

Rows migrated in the real databases: `studioflow_rebuild` 3 iterations (all `NOT_SENT`, none merged), `studioflow_rebuild_test` 1.

### Lead re-check commands

1. `npm test` — expect 750 tests, 0 failing.
2. `npm run check` and `npm run lint` — expect 0 errors (two existing image warnings).
3. `npx prisma migrate status` against the rebuild database — expect up to date.

### Screens touched (kept compiling; the Lead replaces them next)

- Project overview and phase page: `projects/[projectId]/page.tsx` (active phase lookup), `inline-phase-action.tsx`, `phases/[phaseId]/phase-actions.tsx` (internal-review buttons removed; reopen asks only for a reason; the admin reset takes an iteration number instead of "major.minor"; requirement hints no longer disable buttons).
- Server action: `studioflow/actions.ts` (internal-review commands removed from the command list).
- Other readers adapted without a visible change: `today/service.ts` (phase attention and per-project feed use `ACTIVE` and the open iteration), `phases/blocker-query.ts`, `projects/service.ts` (new projects start with an `ACTIVE` first phase and `NOT_SENT` iteration).

### Deviations and limitations

- No automated test seeds old-model rows and checks the mapping (decision 12 asked for one). The old enum no longer exists in the test database, so the check was run as a scripted scratch-database exercise, recorded above. A reusable automated check is a candidate for Phase 2.
- `completeProjectIfLast` still exists; it is removed in Phase 2 together with the KB-060 backlog entry.
- Requirements still show as "blockers" in the read models for display; they gate nothing.

## Phase 2 — commands, completion, undo (R8.286)

### What changed

Iterations now move through send, client answer, and an explicit client outcome. A revision opens the next numbered iteration only after the answer; a completed phase starts the next eligible phase automatically. CD starts with its configured first kind and can continue from CD Mall to CD Final. Supervision records dated visits. Completing a project is now a separate deliberate action, so finishing any phase never hides other live work.

### Requirement → evidence

| Requirement | Evidence | Result |
| --- | --- | --- |
| Iteration commands, CD first kind, and explicit completion lock | `service.integration.test.ts` — `WO-SF-ITER-01 phase 2 iteration commands` | PASS |
| Auto-advance and reversal of generated work | Same test; `SfPhaseEvent` event payload plus `undoPhaseEvent` | PASS |
| No automatic project completion | Existing phase completion integration cases now assert `ACTIVE`; `completeProjectIfLast` removed | PASS |
| Phase/project PIC access and completed-project rejection | `writableIteration`, `markProjectCompleted`, `reopenProject` | PASS |

### Lead re-check commands

1. `npm test`.
2. `npm run check`.
3. `npm run lint`.

### Rows migrated

None. Phase 2 has no migration; `studioflow_rebuild` reported all 81 migrations up to date.

### Screens touched

None. Existing phase actions remain as temporary compatibility wiring until the Lead replaces the screens.

### Deviations and limitations

The old temporary phase commands remain callable for the existing screens during the Lead's UI replacement, but their automatic project-completion path is removed. New command actions are service-surface ready; the new UI owns their final server-action wiring.

## Phase 3 — project-card and My tasks reads (R8.287)

### What changed

The new home can load one card for every live project without querying per card. Each card carries the project facts, phase/iteration chips, requirement and note markers, waiting time, and the gentle "review dependents" signal. The compact personal task strip reuses Today, so it applies the same due-date and retention rules.

### Requirement → evidence

| Requirement | Evidence | Result |
| --- | --- | --- |
| One card per non-archived project with iteration/note fields | `projects.listProjectCards` and `service.integration.test.ts` — `WO-SF-ITER-01 phase 3 card reads` | PASS |
| My tasks retains Today rules | `today.myTasksSummary` delegates to `getToday`; same test | PASS |
| No per-project query loop | One `sfProject.findMany` with relation includes in `listProjectCards` | PASS |

### Lead re-check commands

1. `npm test`.
2. `npm run check`.
3. `npm run lint`.

### Rows migrated

None. Phase 3 has no migration.

### Screens touched

None.

### Deviations and limitations

The `mine` filter accepts the signed-in `actorId` alongside grants because permission grants alone do not identify a person. The Lead's new home supplies that identity when it wires the read.

## Correction — R8.288

The correction makes the existing CD definition's stored `{ name: "CD Mall" }` values authoritative in both commands and cards. Undo events now carry exact prior values and generated-row snapshots; reversals restore those values, feedback carry-forward items, notes, and dismissed requirements, while refusing to remove iterations that have acquired attached work. Revision and closing outcomes again convert open client feedback into phase checklist work. Iteration writes reject held projects, and project completion access uses the normal forbidden error.

| Lead finding | Evidence | Result |
| --- | --- | --- |
| CD JSON shape and matching card choices | `domain/iteration-kinds.ts`; phase/project services | PASS |
| Exact event reversal and feedback carry-forward | `phases/service.ts` event snapshots and undo path | PASS |
| ON_HOLD and permission normalization | `writableIteration`, project completion commands | PASS |

No migration and no screens changed.
