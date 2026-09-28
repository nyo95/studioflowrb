# Active Plan

Plan ID: WO-BE-02
Scope: StudioFlow — keep archived-project files for a retention window, then purge them (backend only)
Status: READY
Priority: P2
Owner: owner (Product Owner); Lead: Claude
Target revision: R8.176
Last updated: 2026-09-28

## Outcome

A project's own files are no longer left forever after it is archived, and they are also **not**
deleted at once. Files are kept for a retention window (owner: 90 days, provisional, adjustable
in studio settings). Restoring the project inside the window keeps everything. After the window a
server-side sweep removes that project's files. Nothing outside the project's own files is ever
removed.

WO-BE-01 (R8.173) was reviewed and accepted by the Lead (R8.174). Master Data is unlocked and BQ is
still on hold; this plan touches neither.

## Context and Evidence

Authority: `AGENTS.md`, `docs/agent/EXECUTOR.md`, `docs/MODULE-BOUNDARIES.md`, `docs/BACKLOG.md`
"Decision gates" (owner answers of 2026-09-28) and the "Purge STORED file assets on project archive"
entry. `archiveProject` / `restoreProject` in `src/apps/studioflow/projects/service.ts` only set or
clear `archived_at`. Files are removed today only by per-feature deletes that call
`storage.remove(key)` after the database write (`mom/service.ts`, `phases/service.ts`,
`schedule/service.ts`); follow that pattern. Re-verify the model list below against
`prisma/schema.prisma` before coding.

## Business Rules and Architecture Constraints

- The project's own files are exactly: `SfDeliverable` (has `project_id`, `storage_key`),
  `SfMomImage` (`storage_key`, reached through its MOM document's project), and
  `SfScheduleOption.image_key` (reached through its entry's project). **Never** touch
  `SfClient.logo_storage_key`, `SfScheduleTemplateItem.image_key` (studio-wide templates), Master Data
  brand marks, or any file of a non-archived project.
- Everything stays inside StudioFlow (its own models and its own `ports.storage`); no cross-app access.
- Purge is **irreversible**, so it must be idempotent, claim-based, and audited. It must be safe if
  two sweeps run at once or the process restarts mid-way.

## Backend Contract (locked)

**Schema (one additive migration, `studioflow` schema, no data rewrite).**
`SfSettings.archive_retention_days Int @default(90)`; `SfProject.assets_purged_at DateTime?`.
Apply the migration to **both** local databases (`masterdata` dev and `masterdata_test`) and run
`prisma generate`; verify each target name before any database command.

**Retention setting.** Extend the existing studio-settings read and update
(`getStudioSettings` / its update command in `projects/service.ts`, and the settings server action)
to carry `archiveRetentionDays`. Validation: integer, 7 to 730, otherwise a `VALIDATION` error with a
plain-language message. Same permission as the existing settings update; audit as
`studioflow.settings.updated`. Do not add a settings screen field; the Lead does that.

**Purge use case.** Add `purgeExpiredArchivedAssets({ now?, limit? })` (StudioFlow project or a small
sibling module; local structure is yours). It selects projects with `archived_at` older than the
retention window and `assets_purged_at IS NULL`, oldest first, at most `limit` (default 25) per call.
For each project it:
1. **Claims** it atomically (`UPDATE ... SET assets_purged_at = now WHERE id = ? AND assets_purged_at IS NULL`
   or the Prisma equivalent inside a transaction); if the claim affects zero rows, skip it silently.
2. In the same transaction, collects the storage keys of the three file kinds above, **deletes** the
   `SfDeliverable` and `SfMomImage` rows, sets the project's `SfScheduleOption.image_key` to `null`, and
   writes one audit event `studioflow.project.assets_purged` with a `SYSTEM` actor and counts only
   (deliverables, MOM images, option photos, and how many blobs could not be removed); no filenames.
3. After commit, removes each blob with `ports.storage.remove(key)`, tolerating failures (count them in a
   second audit note or log line; an unreferenced private blob is acceptable, a dangling row is not).
Return a summary `{ projectsPurged, deliverables, momImages, optionPhotos, blobFailures }`.

**Restore.** `restoreProject` behavior is unchanged except its audit metadata records
`assetsPurged: boolean` (true when `assets_purged_at` was set). A restore never re-creates files.

**Manual run.** Expose the use case as a command requiring `studioflow.project.manage`, returning the
summary, so the owner can trigger it (the Lead builds the button).

**Automatic run (no cron exists; this app is self-hosted).** From `src/instrumentation.ts` (Node runtime
only) start a sweep shortly after boot and then every 24 hours using an unreferenced timer
(`unref()`), calling the use case with a `SYSTEM` context and catching every error (log one line, never
crash the server, never log secrets or file names). Controlled by `STUDIOFLOW_ASSET_SWEEP`
(`on` or `off`); default `on` when `NODE_ENV === "production"`, otherwise `off`. Document the variable in
`.env.example` without a value. The claim in step 1 is what makes multiple processes safe.

## UI Contract

None from you. The Lead will add: the retention field in settings, "kept for N days" copy in the archive
dialog, a "files removed on <date>" line on an archived project, and the manual "Run cleanup" button. The
only route-file change you may make is passing `archiveRetentionDays` through the existing settings
action so the backend is reachable.

## Boundaries and Non-goals

- No Master Data, no BQ, no platform storage changes, no new dependency.
- Do not purge on a project that is not archived, or when `archive_retention_days` has not elapsed.
- Do not add a soft-delete or "trash" model, a per-file purge, or a way to undo a purge.
- Do not change how archive or restore behave for users beyond the audit field above.
- No new abstraction layer; reuse `ports.storage`, the audit writer, and `runTransaction`.

## Acceptance Criteria

1. Integration tests (fake storage): an archived project older than the window loses its deliverable rows,
   MOM image rows and option photo keys, and its blobs are removed; a project inside the window, a non-archived
   project, a client logo, and a template image are untouched.
2. A second run is a no-op; two concurrent runs purge each project exactly once.
3. Changing the setting changes which projects qualify; values outside 7 to 730 are rejected.
4. Restore inside the window changes nothing about files; restore after a purge succeeds and records
   `assetsPurged: true`.
5. The purge audit event has a `SYSTEM` actor and counts only; a blob-removal failure does not roll back or
   crash the run.
6. Boot wiring is off by default outside production and never throws into server startup.
7. Full `npm test` passes; the boundary check passes (database ownership rule included).

## Verification

Run the full commit gate in `docs/agent/EXECUTOR.md`. Database safety: integration tests use the
rebuild-only `masterdata_test` on the local `masterdata-db` container named in the ignored
`.env.test.local`; the dev database is `masterdata` on the same container. Confirm names before any
database command; never touch a legacy database. Stop the dev server before `npm run build`, restore
`next-env.d.ts` to its owner-modified state afterwards, and never stage it.

## Reviewer Acceptance

The Lead will, after the commit: review the diff and re-run the suite; build the settings field, archive
dialog copy, archived-project line and manual button; then browser-check archive, restore, and the manual
run against a disposable project.

## Regression Risks and Recovery

Highest risk is deleting something that is not the project's own file, so the model list above is exhaustive
and tests assert the exclusions. The purge itself cannot be undone; the migration is additive and the code
path is disabled outside production by default, so recovery before release is a plain revert.

## Executor Prompt

You are the Backend Executor. Location: rumah. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this
`PLAN.md`, then implement the entire READY backend outcome (WO-BE-02) and nothing beyond it. Re-verify the
model list against `prisma/schema.prisma` first. Do not touch Master Data or BQ. Apply the additive migration
to both local databases after verifying their names, run the required checks, update `CHANGELOG.md`, and create
the local revision commit `R8.176`. Never push and never stage `next-env.d.ts`. Stop only for a material
locked-decision conflict or unsafe boundary, using the `BLOCKED / CONFLICT` report; otherwise finish and reply
with one copy-ready Planner/Reviewer prompt naming the commit, checks, limitations, and remaining unrelated
dirty files.
