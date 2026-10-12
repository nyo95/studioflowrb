# Active Plan

Plan ID: WO-MODULES-M3-PRESENTATION-01-C1 (Presentation extraction correction: archive retention restore race)
Scope: composition-owned archive retention around the Presentation purge hook
Module(s): studioflow (retention claim), presentation (unchanged), application composition
Target revision: R8.516
Status: READY
Priority: P1
Owner: direct decision 2026-10-12 (M3 Presentation extraction); Reviewer verdict R8.515
Last updated: 2026-10-12 (Lead)

## Reviewer verdict on R8.514 (`6e53966`): CORRECTION REQUIRED

Accepted as built (no change wanted): Presentation schema/module/public door,
migration, retained URLs, permission and module identity, Schedule link
tolerance and post-commit cleanup, Moodboard through the composition
coordinator, Presentation audit prefix, object-cleanup ledger and retry,
module gates, print/editor parity, navigation count and boundary ownership.
Evidence: populated pre-extraction fixture re-run by the Reviewer (board,
slide and annotation ids, links, keys, ratios, order, creators and timestamps
byte-equal; no Presentation table or enum left in `studioflow`; only the two
internal cascades remain); full 105-migration chain from zero with no
Presentation drift; `npm test` 1,027 passed; typecheck, boundaries,
legacy-runtime, lint (0 errors); browser acceptance passed (see R8.515).

### Finding 1 (High, data loss): a restored project can lose its Presentation slides

`purgeExpiredArchivedAssets` (`src/apps/studioflow/projects/asset-retention.ts`)
selects up to 25 eligible projects, then for each one calls the Presentation
hook **before** the claim transaction re-checks eligibility. The hook deletes
every slide row and image of the project unconditionally. If a user restores a
project after the batch was selected and before its hook runs (the batch
removes files project by project, so the window is seconds to minutes), the
hook still deletes that restored project's slides; the core claim then
correctly skips it, so the project is live and unmarked but its Presentation
images are gone. Reproduced by the Reviewer on a disposable database: project A
and B archived 120/119 days ago, B restored during A's hook → B's slide row and
object deleted, B `archived_at` null, `projectsPurged` 1.

Before R8.514 this could not happen: slide deletion ran inside the claim
transaction behind the eligibility re-check.

### Finding 2 (Low, robustness): the Presentation hook is optional

`purgeExpiredArchivedAssets(input, beforeProject?)` and
`runAssetCleanup(input, beforeProject?)` accept a missing hook. A future caller
that omits it would mark projects purged while their Presentation slides stay
forever (the project is never eligible again). Both current callers pass it.

## Locked correction

1. In `purgeExpiredArchivedAssets`, immediately before calling the hook for a
   project, re-read that one project with the same `eligible` filter (one
   `findFirst`/`count` on `id` + `eligible`, using the same cutoff as the
   batch). If it is no longer eligible, skip the project entirely: no hook, no
   claim, no counts. Keep the existing claim-transaction re-check unchanged.
2. Make the hook a required parameter of both `purgeExpiredArchivedAssets` and
   `runAssetCleanup` (name and type unchanged). Update the existing tests that
   call them without a hook to pass an explicit no-op hook
   (`async () => ({ presentationSlides: 0 })`) only where the test is about
   core-only behavior.
3. Keep every other locked R8.514 decision: Presentation still runs first and
   even while disabled; a hook failure still leaves the project eligible; core
   still never marks the project purged after a Presentation failure; no new
   column, lock, migration, dependency or Presentation change.

The residual window after this fix is the few milliseconds between the
re-check and Presentation's delete transaction; record it once in
`docs/BACKLOG.md` as an accepted `[CLEANUP][P3]` note (closing it fully would
need a purge-in-progress marker, not justified for one office).

## Tests (disposable database)

- Regression for Finding 1: two eligible archived projects with one slide
  each; the hook for the first restores the second (set `archived_at` null)
  before purging its own; assert the second project keeps its slide row and
  object, its `assets_purged_at` stays null, `projectsPurged` is 1 and
  `presentationSlides` is 1.
- A hook that throws leaves the project's `assets_purged_at` null and its
  slides intact; the next run with the real hook purges it (this passed in
  review; keep it as a permanent test).
- Existing retention, Presentation and module-gate suites stay green.

## Verification

`npm test`, typecheck, eslint, `check:boundaries`, `check:legacy-runtime`,
production build, staged/unstaged whitespace. No browser work is needed for
this correction; the Reviewer re-runs the retention probes and records the
R8.514 browser-backlog item PASS.

## Non-goals

No Workspace work (blocked until this correction is accepted), no Presentation
UI change, no schema change, no change to restore behavior or copy.

## Executor Prompt

You are the Backend Executor on the same checkout (location: kantor). Read
`AGENTS.md`, `docs/agent/EXECUTOR.md` and `PLAN.md`
(WO-MODULES-M3-PRESENTATION-01-C1), then implement exactly the locked
correction as one local revision commit R8.516 (confirm it is the next unused
number in `CHANGELOG.md`): in `purgeExpiredArchivedAssets` re-check the one
project against the same `eligible` filter immediately before the Presentation
hook and skip it when no longer eligible; make the hook a required parameter of
`purgeExpiredArchivedAssets` and `runAssetCleanup`; add the restore-race
regression test and the hook-failure test on the disposable database; add the
one-line `[CLEANUP][P3]` residual-window note to `docs/BACKLOG.md`; update
`CHANGELOG.md`. No migration, dependency, Presentation, UI or Workspace change.
Run every gate in Verification, commit locally without pushing, and reply with
only a Planner/Reviewer prompt: commit, checks with results, limitations, dirty
files, and a request for verdict.
