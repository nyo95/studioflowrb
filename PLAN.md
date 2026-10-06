# Active Plan

Plan ID: WO-SF-SAFE-01 / 02 / 03 (production-safety closure) + WO-SETTINGS-01 (DRAFT)
Scope: Close three confirmed StudioFlow data-integrity gaps found at c6f1cb7 (R8.368) without changing the iteration or project flow; plan the Settings rework separately.
Target revisions: R8.369 (this plan), R8.370 / R8.371 / R8.372 (WO-SF-SAFE-01/02/03), R8.373 (WO-SETTINGS-01).
Status: DONE — owner (2026-10-06) had the Lead execute as Planner + Executor on branch `claude/sf-safety-settings-rework`; all four commits pushed. Owner review of the Settings layout in the browser is the remaining acceptance.
Priority: P0 (01), P1 (02, 03), P2 (follow-ups)
Owner: Product Owner.
Last updated: 2026-10-06

## Carry-over

WO-UI-V2-03 was implemented in R8.367; its Lead browser acceptance is still open (CHANGELOG R8.368 note). This plan replaced it in `PLAN.md` only; that review stays owed.

## Verdict on the three findings (verified against code, not docs)

| # | Finding | Class | Evidence |
|---|---|---|---|
| 1 | Deleting a never-sent round can destroy/detach attached work | **Confirmed bug (P0)** | `phases/service.ts:385-387` deletes the `SfRevision` after only *recording* activity/deliverable ids. Schema: `SfActivity.revision` `onDelete: Cascade` (studioflow.prisma:240) → activities are hard-deleted; `SfDeliverable.revision` `onDelete: SetNull` (:412) → file stays but loses its round. `undoPhaseEvent` (:442) recreates only the revision row and never reads the snapshot ids → not restorable. Reachable: `saveDeliverable` (:927-940) attaches uploads to the active round, which is `NOT_SENT` on a fresh phase, so "upload then delete the empty-looking round" works today. |
| 1b | `bypassPhase` empty-round check | **Confirmed (partial)** | `:124-125` counts deliverables and note but **not activities**; a NOT_SENT round holding activities is treated as empty and deleted → activities cascade-lost, and undo cannot bring them back. (`createSupervisionVisit` :402-406 already counts both — the correct pattern.) |
| 2 | `setProjectStatus` bypasses reopen lifecycle | **Confirmed bug (P1)** | `projects/service.ts:536-549` loads with `allowCompleted: true` and accepts all of `ACTIVE/ON_HOLD/COMPLETED`: `COMPLETED→ACTIVE/ON_HOLD` works with no PIC check, no `reopened` audit action; `→COMPLETED` works for any `projectManage` holder, while the dedicated `markProjectCompleted`/`reopenProject` (`phases/service.ts:452-476`) require a project PIC. Two paths, different authorization, different audit action (`status-changed` vs `completed`/`reopened`). The UI never sends COMPLETED (edit dialog offers only Active/On hold and skips completed projects, `edit-project-dialog.tsx:65,90`), but `actions.ts:220` still accepts it. Existing test `service.integration.test.ts:180-183` exercises the generic path for completion. |
| 3 | Physical deletes bypass the failure ledger | **Confirmed bug (P1)** | Bare `storage.remove(...).catch(...)`: `deleteDeliverable` (`phases/service.ts:1097`, swallowed silently), expiry sweep (`:1073`, console.warn only), upload prune of older versions (`:946`), upload rollback (`:948`); MOM `removeObjects` (`mom/service.ts:137`, 7 call sites incl. committed document/image deletes at :357, :480, :573); Presentation upload rollback (`presentation/service.ts:258`); Schedule image rollback (`schedule/service.ts:766`). `removeUnreferenced` + `SfAssetCleanupFailure` + `retryFailedAssetCleanup` are correct but used only by schedule/presentation deletes and archive retention. A failed delete after the row is gone leaves an untracked blob. |
| 3b | `removeUnreferenced` still protects shared keys | **Confirmed OK** | Counts deliverable, MOM image, schedule option/template, client logo, presentation slide (`asset-cleanup.ts:37-47`); covered by `asset-sweep.test.ts` / `asset-cleanup.test.ts`. Not MOM snapshot JSON — MOM computes that itself (`mom/service.ts:150-160`), so MOM must keep its own decision and only swap the *removal* step. |
| Ops | Lifecycle timers | **Intentional, acceptable** | `deliverable-sweep.ts`/`asset-sweep.ts` use boot timers from `instrumentation.ts`. Production is an always-on PC (owner, R8.205; `docs/operations/LOCAL-PC-SCHEDULER.md`) and storage is a local filesystem root (`storage-root.ts` probes a writable folder at boot), which a serverless host cannot satisfy anyway. `vercel.json` is only a build stub. No change; see Follow-ups. |

Not a finding, but noted: `SfActivity` has no runtime creator in app code (only the integration test at :679 and the HARD_RESET snapshot). The guard in WO-01 is cheap and keeps the invariant true if activities return.

## Locked Decisions

1. Never-sent-round deletion is **rejected, not restored**, when any `SfActivity` or `SfDeliverable` is attached. New domain conflict `ITERATION_HAS_ATTACHED_WORK` ("Remove its files and notes first."). No silent detach, no cascade.
2. `bypassPhase` treats a NOT_SENT round as empty only when note, deliverables **and activities** are all absent; otherwise it keeps the round and marks it `DONE` (existing branch). No new error there.
3. `setProjectStatus` owns only `ACTIVE ↔ ON_HOLD`. Input type narrows to those two. Completion is `markProjectCompleted` only; reopen is `reopenProject` only. A COMPLETED project given to the generic command fails with the existing `PROJECT_COMPLETED` conflict (load without `allowCompleted`). Requesting `COMPLETED` through it fails validation (new `PROJECT_STATUS_USE_COMPLETION_FLOW`, message points to the completion action). No data migration: stored statuses are unchanged; historical `status-changed → COMPLETED` audit rows stay and the history label keeps reading them.
4. Physical blob deletion has **one primitive family in `asset-cleanup.ts`** (REUSE + EXTEND, no new infrastructure): `removeUnreferenced` (decides by references) delegates to a new `discardObjects(db, storage, keys)` (caller already decided; removes, records failure, clears prior failure). For **committed row deletions** (deliverable manual delete, expiry sweep, prune of older versions, MOM deletes/replacements) the key is **enqueued in the same transaction** as the row delete (`SfAssetCleanupFailure` upsert via the tx client), then removal is attempted after commit and the entry resolved on success. This makes "row gone ⇒ key retained in the ledger" true even across a process crash. Rollback paths where no row ever committed (upload failure in deliverables, MOM, presentation, schedule) call `discardObjects` (failure-recorded, no pre-enqueue).
5. MOM keeps its own snapshot-aware "what is still referenced" decision; only its removal step changes.
6. No schema migration. `onDelete` rules stay (HARD_RESET override deliberately relies on them and snapshots first).

## WO-SF-SAFE-01 — Round deletion cannot lose attached work (P0, R8.370)

- **Invariant:** a round is deleted only if nothing persisted hangs off it.
- **Scope:** `deleteNeverSentIteration` counts `activities` and `deliverables` for the round inside the transaction (use `_count`, drop the full `include`); throws `ITERATION_HAS_ATTACHED_WORK` (conflict) if either > 0. Snapshot keeps `iterationUndo` only. `bypassPhase` empty check adds the activity count (Locked Decision 2). Lead checks (UI, after commit) whether the delete control should be hidden/disabled when files exist; backend is the authority.
- **Non-goals:** restoring attachments in undo; changing `overrideRevision`; schema/cascade changes; restoring Internal/External Review; deliverable upload rules.
- **Acceptance / required tests** (extend `service.integration.test.ts`):
  1. empty NOT_SENT round deletes as before;
  2. round with a deliverable → `ITERATION_HAS_ATTACHED_WORK`; the round, deliverable row, its `revision_id` and storage key are all unchanged;
  3. round with an activity (create via `testDb.prisma.sfActivity.create`) → same rejection, activity intact;
  4. undo of a valid empty deletion restores the identical round row (id, major, name, status, note) and the phase can add no extra round;
  5. `bypassPhase` on a NOT_SENT round with an activity keeps the round as `DONE` and the activity intact; with a deliverable likewise (existing behaviour pinned); empty round still deleted and undo still restores it;
  6. existing delete/add/undo/bypass tests (:255-330, :2288) unchanged and green.
- **Likely files:** `phases/service.ts`, `service.integration.test.ts`. **Depends on:** nothing. **Risk:** low; a previously "working" delete of a round that held files now errors — intended, and the message must tell the user what to do.

## WO-SF-SAFE-02 — Explicit completion/reopen ownership (P1, R8.371)

- **Invariant:** only `markProjectCompleted` completes, only `reopenProject` reopens; the generic status command cannot touch a COMPLETED project nor produce one.
- **Scope:** `projects/service.ts` `setProjectStatus` (type `"ACTIVE" | "ON_HOLD"`, no `allowCompleted`, drop `assertProjectCompletionReady`/override branch and the completion metadata); `actions.ts` zod enum → `["ACTIVE","ON_HOLD"]` and remove the `overrideReason` argument; check every caller of `setProjectStatusAction` (only `edit-project-dialog.tsx`, which already sends ON_HOLD/ACTIVE) and any e2e/seed use; update the doc comment on `setProjectStatus`. Keep `PROJECT_STATUSES` (still the stored enum).
- **Non-goals:** moving `markProjectCompleted`/`reopenProject` out of the phases service; changing readiness, override, PIC rules or their UI; audit renaming.
- **Acceptance / required tests:**
  1. ACTIVE→ON_HOLD and ON_HOLD→ACTIVE succeed (existing :831, :930-932 stay green);
  2. generic `COMPLETED` request rejected (`PROJECT_STATUS_USE_COMPLETION_FLOW`), project unchanged;
  3. COMPLETED→ACTIVE and COMPLETED→ON_HOLD via generic command rejected (`PROJECT_COMPLETED`), project stays COMPLETED;
  4. `markProjectCompleted` completes (PIC), still enforces readiness and `PROJECT_COMPLETION_OVERRIDE_REASON_REQUIRED` / override semantics unchanged, audit `studioflow.project.completed` with `completionOverrideReason`;
  5. `reopenProject` reopens (`studioflow.project.reopened`) and a phase write works again (existing :160-167 stays);
  6. rewrite the :174-184 test to drive completion + override through `markProjectCompleted` (override path needs `projectManage`), asserting the `completed` audit metadata instead of `status-changed`.
- **Likely files:** `projects/service.ts`, `actions.ts`, `service.integration.test.ts`; check `history-list.tsx` labels still render old rows. **Depends on:** nothing (independent of 01). **Risk:** a non-PIC manager can no longer complete via the generic path — intended. Any external caller passing COMPLETED gets a clear validation error.

## WO-SF-SAFE-03 — Every blob delete goes through the failure ledger (P1, R8.372)

- **Invariant:** a row disappears only if its blob is gone or its key is in `SfAssetCleanupFailure`; shared keys are never deleted.
- **Scope:** per Locked Decisions 4-5. Add `discardObjects` and a tx-aware `enqueueObjectCleanup(tx, keys)` to `asset-cleanup.ts`; refactor `removeUnreferenced` to use `discardObjects` (behaviour and return shape unchanged). Wire: `deleteDeliverable`, `sweepDeliverableExpiry`, `saveDeliverable` prune + rollback, MOM `removeObjects` (enqueue in the existing transactions that already compute `keys`/`orphaned`), Presentation :258 and Schedule :766 rollbacks. Retry stays in `retryFailedAssetCleanup` (already invoked by the daily asset sweep); confirm the deliverable expiry runner does not need its own retry call (it shares the daily cadence; record the conclusion).
- **Non-goals:** new tables or queues; cron/serverless; changing retention windows; MOM snapshot policy; client-logo paths unless the Executor finds a bare remove there (report, do not widen).
- **Acceptance / required tests** (`asset-cleanup.test.ts`, `asset-sweep.test.ts`, integration):
  1. successful delete: row gone, blob gone, ledger entry resolved/absent;
  2. storage failure on `deleteDeliverable` → row gone, ledger entry unresolved, no exception to the user;
  3. same for `sweepDeliverableExpiry` (deleted count unchanged) and for MOM delete;
  4. `retryFailedAssetCleanup` later removes it and sets `resolved_at`; a still-failing key stays pending with `attempts` incremented;
  5. a key still referenced by another row (and a MOM snapshot-retained key) is not removed;
  6. simulated crash between commit and removal (skip the remove step) leaves a pending ledger entry;
  7. archive-retention tests and the existing 842-test baseline stay green.
- **Likely files:** `asset-cleanup.ts`, `phases/service.ts`, `mom/service.ts`, `presentation/service.ts`, `schedule/service.ts`, their tests. **Depends on:** nothing, but run after 01 to avoid conflicting edits in `phases/service.ts`. **Risk:** ledger writes join existing transactions (small extra work); `removeUnreferenced` signature must not change for its existing callers.

## Follow-ups (not in these WOs)

- **P2 browser coverage:** Playwright happy path for "upload → try deleting the round → friendly error → remove file → delete succeeds", and "complete → edit dialog cannot reactivate → reopen". Lead-owned acceptance after each commit.
- **P2 deployment hardening:** document in `docs/operations` that the lifecycle sweeps are in-process and assume an always-on Node host with a local storage root; add a one-line `/api/health` style check only if the owner wants one. Moving to serverless would first need object storage off the local disk, then real scheduled triggers — record it as `PARKED` in `BACKLOG.md`, no work now.
- **Note:** `retryFailedAssetCleanup` deletes without re-checking references; safe because keys are random per upload, but add the check if keys ever become reusable.

## WO-SETTINGS-01 — Settings rework (DONE, R8.373)

Owner (2026-10-06): navigation inconsistent, no way back, settings reachable across owners (platform ↔ StudioFlow), templates should be separate pages, only for people with access. Decisions taken as Lead on the owner's behalf, recorded in `UI_ENGINE.md` §SettingsShell:

1. Three owners, never one merged sidebar: **My preferences** (`/account`, personal), **Platform settings** (`/settings/*`: General, Users, Roles & Access), **app settings** inside each app (`/studioflow/settings/*`, `/masterdata/settings/*`).
2. A settings page shows only to people who may change or decide something on it. StudioFlow templates (phase, checklist, schedule) → `studioflow.settings.manage`; Archived files → that or `studioflow.project.manage`. Master Data dictionaries → `masterdata.dictionary.manage`; Deletion review → `deletion.approve`; BQ approvals → `promotion.approve`. Read-only roles no longer see settings.
3. Every settings page: capsule breadcrumb back, same rail (now also on `/settings` and `/account`, with an "Apps" group), app Settings in the rail's utility area, Platform settings in the rail footer with its own icon.
4. Old URLs redirect (`/settings/general/masterdata`, `/masterdata/units|categories|deletions`, `/studioflow/schedule-templates`).
5. My preferences gains the personal Display section (date/number format, timezone; empty = organisation default). Theme and start page stay unexposed (`BACKLOG.md` [BLOCKED]).

## Verification (each WO, before commit)

`npm run typecheck`, `npm run lint`, `npm run check:boundaries`, `npm run check:legacy-runtime`, full `npm test` (baseline 842, long timeout/background), disposable rebuild-only test database only. Report counts before/after.

## Reviewer Acceptance (Lead, after each commit)

Diff review against the invariants above; browser pass of Phase panel (delete round with/without files), project Edit dialog and completion/reopen at desktop and 375px.

## Production verdict (at c6f1cb7)

Not blocked for a closed internal pilot **only if** staff are told not to delete a round that already holds uploads and not to rely on the generic status command; otherwise release **should wait for WO-01 and WO-02**. Reasoning: WO-01 is real, reachable data loss (activities hard-deleted, files orphaned from their round, undo cannot restore) — block a general internal release on it. WO-02 is an authorization/lifecycle bypass that no current UI reaches, so it is a hardening gate, not a pilot blocker. WO-03 leaves orphan blobs (storage leakage), not data loss — release with it as a tracked P1.

## Executor Prompt

You are the Backend Executor. Location: kantor unless the owner says otherwise; verify every database target belongs only to studioflow-rebuild before any database command. Read `AGENTS.md`, `docs/agent/EXECUTOR.md` and this `PLAN.md`. Implement WO-SF-SAFE-01, WO-SF-SAFE-02, WO-SF-SAFE-03 in that order, each as its own local revision commit (R8.370, R8.371, R8.372; confirm the next unused number from `CHANGELOG.md` first), each with its tests, `CHANGELOG.md` entry and the checks in `## Verification`. Do not touch WO-SETTINGS-01, schema, cascade rules or UI layout. If the code contradicts the plan, stop with `BLOCKED / CONFLICT`. Reply with a Planner/Reviewer prompt containing outcome, commits, test counts before/after, limitations and dirty files.
