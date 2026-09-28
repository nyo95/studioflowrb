# Active Plan

Plan ID: WO-BE-03
Scope: StudioFlow — correct the archive-retention lifecycle and expose what the Lead's UI needs (backend only)
Status: EXECUTED in R8.181 by the Lead (Codex was at its limit; owner combined lanes). Awaiting independent review. Do NOT re-execute.
Priority: P2
Owner: owner (Product Owner); Lead: Claude
Target revision: R8.181
Last updated: 2026-09-28

## Outcome

WO-BE-02 (R8.178) is reviewed: gate re-run independently (558/558), logic read in full. One lifecycle
defect and a few gaps the Lead's UI needs remain. After this plan, retention keeps working after a project has
been archived, restored, and archived again, and the backend exposes exactly the data and commands the retention
screens need.

## Context and Evidence

Authority: `AGENTS.md`, `docs/agent/EXECUTOR.md`, `docs/MODULE-BOUNDARIES.md`, `CHANGELOG.md` R8.178,
`docs/BACKLOG.md` "Decision gates". Code: `projects/asset-retention.ts`, `projects/service.ts`
(`archiveProject`, `restoreProject`, `listProjects`, `getProject`), `asset-sweep.ts`,
`app/(platform)/studioflow/actions.ts`. Re-verify each finding before changing code; report any that does not
reproduce.

## Business Rules and Architecture Constraints

- `SfProject.assets_purged_at` means "this archive cycle's files were purged". A project restored after a purge
  and archived again starts a new cycle and must become eligible again once the retention window elapses.
- Purge stays irreversible, claim-based, and audited exactly as locked in WO-BE-02. No change to what is deleted.
- Everything stays inside StudioFlow; no Master Data, no BQ.

## Backend Contract (locked)

**C1 — Reset the marker when a new archive cycle starts (the defect).** Today nothing clears
`assets_purged_at`, so archive → purge → restore → new files → archive again leaves the marker set and the eligibility
filter `assets_purged_at IS NULL` skips the project forever; the new files are never purged. Fix: in `archiveProject`,
set `assets_purged_at: null` in the same update that sets `archived_at`. Do **not** clear it in `restoreProject`
(its audit metadata `assetsPurged` reads the marker at restore time and must stay accurate). Test the full cycle with
fake storage: archive, sweep purges, restore (audit says `assetsPurged: true`), add a file, archive again, advance
time beyond the window, sweep purges the new file and the audit shows a second pair of purge events.

**C2 — Sweep drains its backlog.** `startAssetSweep` currently runs one batch of at most 25 projects per day, so many
projects maturing together would take days. The scheduled run must call the use case repeatedly while a batch returns
exactly `limit` purged projects, up to 10 batches per run, then stop. Keep the 10 s initial delay, the 24 h interval,
the `unref()`, and the swallow-and-log error handling. Test with an injected runner.

**C3 — Preview command.** Add `previewAssetCleanup` (requires `studioflow.project.manage`) returning
`{ eligibleProjects: number, retentionDays: number }`, using the same cutoff and eligibility predicate as the purge
(share one helper; do not duplicate the rule). It deletes and writes nothing. Add a server action
`getAssetCleanupPreviewAction` beside the existing actions.

**C4 — Manual run action.** Add server action `runAssetCleanupAction(limit?)` in `app/(platform)/studioflow/actions.ts`
calling `runAssetCleanup`, validating `limit` as an integer from 1 to 100 (default 25), through the existing
`runSafeAction`/`context()` pattern, returning the nine-field summary. It must refresh the same project paths the
archive/restore actions refresh.

**C5 — Read models for the UI.** Add `assetsPurgedAt: Date | null` to the `listProjects` row shape and to the
`getProject` result (both already expose `archivedAt`). Do not change any other field. `getStudioSettings` already
returns `archiveRetentionDays`; leave it.

## UI Contract

None from you. The Lead will build the settings field, archive-dialog copy, the archived-project line ("files kept
until <date>" / "files removed on <date>"), and the cleanup control with preview and confirmation, using only the
data and actions above. Do not touch layout, styling, or copy in any route component.

## Boundaries and Non-goals

- No schema change and no migration (the column already exists). If you conclude one is needed, report
  `BLOCKED / CONFLICT`.
- No Master Data, no BQ, no new dependency, no new abstraction layer.
- Do not add per-file purge, undo, or a trash model. Do not change retention validation (7 to 730).
- Do not rename `setAutoNaming`; that naming is a known smell and is not in scope.

## Acceptance Criteria

1. The archive → purge → restore → archive → purge cycle in C1 passes, and a project archived once is still purged
   exactly once (the existing WO-BE-02 tests still pass).
2. A sweep with more than `limit` eligible projects purges them all in one scheduled run (up to the 10-batch cap) and
   stops when a batch is short.
3. `previewAssetCleanup` counts exactly the projects the sweep would purge at the same instant and changes nothing;
   without `studioflow.project.manage` it is refused.
4. `runAssetCleanupAction` rejects a limit outside 1 to 100 with the standard validation payload and returns the
   summary otherwise.
5. `assetsPurgedAt` is present on list rows and on `getProject`, and no other field of either changed.
6. Full `npm test` passes, boundary check passes, no test weakened or deleted.

## Verification

Run the full commit gate in `docs/agent/EXECUTOR.md`. Database safety: integration tests use the rebuild-only
`masterdata_test` on the local `masterdata-db` container named in the ignored `.env.test.local`; the dev database is
`masterdata` on the same container. Verify names before any database command; never touch a legacy database. The
owner's dev server may be running on port 3001: stop it before `npm run build`, restart it afterwards with the sweep
off, restore `next-env.d.ts` to its owner-modified state, and never stage it.

## Reviewer Acceptance

After the commit the Lead re-runs the suite, then builds the retention UI against these actions and runs the browser
batch (the R8.173 and R8.178 items in `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md`) with a disposable QA project.

## Regression Risks and Recovery

Low. C1 touches only the archive update; C2 only the scheduler wrapper; C3 to C5 are additive reads and actions.
Recovery is a plain revert of the single commit; no migration or data change to undo.

## Executor Prompt

You are the Backend Executor. Location: rumah. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and the root `PLAN.md`
(WO-BE-03), then implement the entire READY backend outcome (C1 to C5) and nothing beyond it. Re-verify each finding
first and report any that does not reproduce. Do not touch Master Data or BQ, and do not change any layout, styling, or
copy. No migration is expected. Run the required commit gate, update `CHANGELOG.md`, and create the local revision
commit `R8.181`. Never push and never stage `next-env.d.ts`. Stop only for a material locked-decision conflict or
unsafe boundary, using the `BLOCKED / CONFLICT` report; otherwise finish and reply with one copy-ready
Planner/Reviewer prompt naming the commit, checks, limitations, and remaining unrelated dirty files.
