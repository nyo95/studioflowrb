# Active Plan

Plan ID: WO-HARDEN-AUDIT-01 (open `[BUG]` / `[CLEANUP]` items and the 14 October audit leftovers, backend lane)
Scope: five independent backend fixes, one local commit each
Module(s): studioflow (core), presentation (optional), ideas (optional, only to move the moodboard path out), masterdata (tests only), platform (Prisma schema annotations only)
Target revisions: Executor R9.30–R9.34 on branch `codex/harden-audit-01` in its own worktree
Executor: Codex
Status: READY

## Why

Owner 2026-10-14: "planning pekerjaan2 dan penyelesaian KB / error dari audit - bagi yg mana codex kerjakan ... kerjakan sekaligus". The Lead takes the UI items (R9.25–R9.29) on `main` at the same time; this plan is the backend lane. Items deliberately left out (accepted P3 risks, items waiting for the estimator) are listed in the Lead's plan and are not in scope here.

## Running in parallel with the Lead (same rules as WO-BQ-SLICE3-UI-01)

- Work only in the worktree `D:\Misc\ProjectsHUB\studioflowrb-codex` on branch `codex/harden-audit-01` (created by the Lead from the commit holding this plan). Never edit, stage, commit or check out anything in `D:\Misc\ProjectsHUB\studioflowrb`.
- Revisions **R9.30–R9.34** are yours (the Lead uses R9.24–R9.29). The Lead reviews and merges.
- Test database: the existing disposable `studioflow_rebuild_test_bq` in the rebuild-only container `studioflowrb-gateb-test-db` on `localhost:5433` (never `studioflow-db-1` on :5432, legacy and forbidden). The worktree's own uncommitted `.env.test.local` points `DATABASE_URL` and `PLATFORM_TEST_DATABASE_URL` at it (derive from the main checkout's `.env.test.local`; never print or commit credentials). Run `prisma migrate deploy` against it first and after each migration you add. Never point a test or migration at `studioflow_rebuild_test` or `studioflow_rebuild`.
- No dev server on :3001, no Playwright. `npm ci` in the worktree is fine. Production build with `NEXT_DIST_DIR=.next-verify`, delete that folder, restore `tsconfig.json` / `next-env.d.ts` if the build rewrote them.
- Do not touch: `PLAN.md`, `src/platform/ui_engine/**`, `src/platform/authenticated-shell/**`, Master Data screens, `e2e/**`, `docs/agent/**` other than an append to `BROWSER-ACCEPTANCE-BACKLOG.md`. Those are the Lead's lane right now.

## R9.30 — Iteration kinds read from the project's snapshot (`[BUG][P3]`, contract §5.1)

Problem: `iterationKinds(phase.definition.default_iteration_kinds)` reads the live phase definition, so editing a template's iteration kinds changes the CD Mall → CD Final workflow, step names and rename lock of projects already running.
Fix: add a snapshot column on `sf_phase` (e.g. `iteration_kinds_snapshot Json`, not null after backfill), filled at project creation from the definition, backfilled for existing phases in a forward-only migration named `<timestamp>_studioflow_phase_iteration_kinds_snapshot`. Read the snapshot everywhere the live definition is read today: `src/apps/studioflow/phases/service.ts` (around lines 269, 349, 381, 600, 642), `src/apps/studioflow/projects/service.ts` (around 543, 753), `src/apps/studioflow/workspace/service.ts` (around 497, 616) — search `default_iteration_kinds` to be complete. Keep `iterationKinds()` as the parser. Tests: the existing CD chain test that edits the definition after the project exists must now show the old project unchanged; a migration test (pattern: `src/apps/studioflow/workspace/workflow-record-migration.integration.test.ts`) proves the backfill.

## R9.31 — "Add to moodboard" from a Workspace image without Ideas (audit P3, module independence)

Problem: a Workspace/Notes image reaches the Presentation moodboard through `src/application/presentation-image-coordinator.ts` → `ideas.readNoteImageSource`, so the button needs the Ideas module on and the Ideas permission.
Fix: Presentation reads the image source itself through StudioFlow's public bridge (`src/apps/studioflow/public/presentation-bridge.ts` / `-runtime.ts`; add a `readWorkspaceImageSource` there with the same checks as the Ideas bridge's), and exposes its own public action (under `src/apps/presentation/public/`) gated by the Presentation module and `STUDIOFLOW_PERMISSIONS.presentationManage`, reusing `addStoredImageToMoodboard`. Minimal wiring: `src/app/(platform)/studioflow/projects/[projectId]/round-labels.tsx` shows "Add to moodboard" when Presentation is enabled and the user may manage presentations, independent of Ideas. The Ideas *card* → moodboard path (`addIdeaImageToMoodboard`) stays. Remove `addNoteImageToPresentationMoodboard` and Ideas' `addNoteImageToMoodboardAction` once nothing calls them. Update manifests' `requires` so `check:boundaries` passes. Tests: the existing "adds a card or a note image to the project's Moodboard board" integration test, split so the note-image half runs with Ideas disabled.

## R9.32 — Schedule and Presentation image deletes enqueue their cleanup inside the transaction (`[CLEANUP][P3]`)

Problem: they decide and remove after commit (`removeUnreferenced`); a crash between commit and removal leaves an orphaned object that the cleanup ledger never heard of.
Fix: follow the deliverable/MOM pattern of R8.372 — `enqueueUnreferencedCleanup(tx, keys)` inside the deleting transaction, `discardObjects(db, storage, keys)` after it (`src/apps/studioflow/asset-cleanup.ts`; example `deleteCard` in `src/apps/studioflow/workspace/service.ts`). Presentation keeps its own copy of the pattern behind its own boundary if it cannot import StudioFlow internals. Tests: a storage failure after commit leaves a ledger entry that the sweep later removes; an object still referenced elsewhere is kept.

## R9.33 — Schema drift (`[CLEANUP][P3]`)

`platform.developer_access`, `developer_recovery_code`, `developer_session` timestamps are `timestamptz` in the migrations but plain `DateTime` in `prisma/schema/platform.prisma`; `studioflow.sf_holiday` differs in id type, timestamp precision and the `updated_at` default. Align the schema annotations to what the migrations created (`@db.Timestamptz(…)`, the id type, `@default`); add a corrective migration only where the database itself must change. Evidence: `prisma migrate diff --from-config-datasource --to-schema prisma/schema --script` against a freshly migrated `studioflow_rebuild_test_bq` prints nothing. Never pass any database as `--shadow-database-url`.

## R9.34 — Fault-injection test for the several-suppliers grid (`[CLEANUP][P3]`, R8.421)

The unexpected-error branch of the several-suppliers grid has no test (the per-row isolation of R8.419 has none either). Add tests that inject an unexpected failure and prove the grid reports it without saving partial state, following the existing Master Data service test style. Tests only; no behavior change unless a test proves a defect (then stop and report it).

## Executor verification (each commit)

`npm test` (on `studioflow_rebuild_test_bq`), typecheck, lint, `check:boundaries`, `check:legacy-runtime`, production build (separate folder), `git diff --check` staged and unstaged. Changelog entry per revision; close the matching BACKLOG line in the same commit. No push, no merge.

## Reviewer acceptance (Lead)

Code review of each commit; after merge the Lead migrates the kantor dev and test databases and re-runs the full suite. Browser checks, if any, go to `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md` (likely only: "Add to moodboard" visible with Ideas off and Presentation on).

## Executor Prompt

```text
You are the BACKEND EXECUTOR (Codex) for StudioFlowRB. Location: kantor.
Read AGENTS.md, docs/agent/EXECUTOR.md, then PLAN.md (WO-HARDEN-AUDIT-01) in the worktree D:\Misc\ProjectsHUB\studioflowrb-codex, branch codex/harden-audit-01.
The Lead works in parallel on main in D:\Misc\ProjectsHUB\studioflowrb: never touch that checkout, its dev server (:3001), Playwright, or the shared test databases. Follow "Running in parallel with the Lead" in PLAN.md exactly (test database studioflow_rebuild_test_bq in the rebuild-only container on :5433; never the legacy container on :5432; never use a database as a Prisma shadow database).
Deliver R9.30-R9.34 as five local commits on codex/harden-audit-01, each with the full commit gate passing. No push, no merge.
Stop with BLOCKED / CONFLICT if an item needs a file outside the scope in PLAN.md or contradicts the repository.
End with one copy-ready Planner/Reviewer prompt: outcome per revision, commits, exact check results, browser-backlog additions, limitations, dirty files.
```
