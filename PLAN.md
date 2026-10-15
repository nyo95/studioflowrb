# Active Plan

Plan ID: WO-SF-DELIVERABLE-VERSION-01
Scope: Stable upload-order version numbers for StudioFlow phase deliverables
Module(s): studioflow
Target revision: **R9.91** Executor backend, after Lead plan R9.90; Reviewer acceptance afterward
Status: COMPLETE — R9.91 built; R9.92 Reviewer PASS
Priority: P3
Owner: Product Owner; Lead locks and reviews
Last updated: 2026-10-15

## Outcome

In one phase, files with the same normalized name form a slot. Every successful upload in that slot receives the next integer version, and that number stays attached to the file even after other files expire or are removed. The latest surviving version is marked “newest.” A final file keeps its original number when newer working files arrive. Example: Final Version 1, then working Versions 2 and 3; after Version 2 is pruned and Version 4 is uploaded, the visible files read Versions 1, 3, and 4, with only Version 4 marked newest.

This corrects the verified R9.87 browser defect in `docs/BACKLOG.md`. The current list calculates Version 1 for the newest row on every read; inverting that calculation is insufficient because the lifecycle deletes older working rows.

## Locked decisions and boundaries

1. Version identity is **per phase + normalized slot key** (the existing lowercased, trimmed name); it does not reset when the last file is deleted or expires. It is not a project-wide or iteration-wide number. Do not change the existing Final, two-working-file retention, expiry, access, storage, or audit behavior.
2. Persist the assigned version on each deliverable and a durable last-used counter per phase/slot. Allocate atomically inside the existing upload database transaction. A failed transaction must not consume a version; a committed upload keeps its version even if later object cleanup fails. Concurrent uploads must not receive the same number. A unique constraint on phase/slot/version is defense-in-depth.
3. Existing surviving files receive a **one-time migration backfill** in ascending `(created_at, id)` order within each phase/slot, numbered from 1. Seed the counter from the resulting maximum. Versions of previously pruned/deleted files cannot be recovered from the remaining table, so the backfill does not claim their historical ordinals. After migration, surviving files' numbers do not change.
4. `listDeliverables` returns the stored `versionNumber` and an `isNewest` boolean for the highest surviving version in each slot; the UI uses `isNewest` for the badge. Do not infer newest from `versionNumber === 1` or from the first item in a phase-wide list.
5. StudioFlow owns the new data; no cross-module table, dependency, permission, or shared-platform abstraction. No remote operation, push, or production deployment. Leave the ignored root `test/` fixtures untouched.

## Executor implementation (R9.91)

- Add a non-null integer `version_number` to `SfDeliverable`, plus a StudioFlow-owned slot-counter model/table with `(phase_id, slot_key)` primary key, `last_version`, and phase cascade deletion. Add the matching SQL migration. Backfill surviving file versions and seed counters without touching storage objects. Define a unique index on `(phase_id, slot_key, version_number)`.
- In the existing upload transaction in `src/apps/studioflow/phases/deliverables.ts`, atomically insert-or-increment the slot counter (`INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` or an equivalently atomic query) and write that number on the new deliverable before the existing pruning and audit steps. Never use `MAX(version_number) + 1` from surviving rows as the allocator.
- Read stored numbers and calculate `isNewest` per slot from the highest surviving number. Adjust the minimal UI type and label in the existing deliverables panel to show the returned badge without redesigning the panel.
- Update StudioFlow contract §5.4 with this meaning. Update `CHANGELOG.md` and close this `[BUG]` in `docs/BACKLOG.md` only after the required automated checks. No new dependency.

## Executor verification

- Integration test: repeated upload of one normalized slot, including Final, automatic pruning, explicit delete/expiry where supported, and a later upload. Assert visible numbers retain gaps and only the highest surviving number is newest. Separate slot and phase each start at 1. A refused/failed upload does not consume a number.
- Concurrent same-slot uploads: assert distinct consecutive numbers and no duplicate row/number (or report a precise blocker if the current transaction harness cannot prove concurrency). Check migration on the disposable rebuild-only test database and Prisma client generation.
- Mandatory Executor gate: `npm test`, typecheck, lint, boundary check, legacy-runtime check, production build, staged and unstaged whitespace checks. Set `STUDIOFLOW_LOCATION=kantor`; verify `.env.kantor` and the test URL target rebuild-only databases before any database command. Never access legacy PostgreSQL.

## Reviewer acceptance

After the Executor commit, inspect the schema/service/migration and test evidence, then use the browser on a disposable rebuild-only project: upload the same named deliverable three times, mark an older one Final, upload again so a working version is pruned, and confirm stable displayed numbers and the single newest badge after reload. Browser acceptance belongs to the Reviewer and does not block an otherwise valid Executor commit; queue it in the browser ledger if deferred. Only Reviewer records PASS.

The original `[BUG]` row remained open until the R9.92 browser check passed, following the bootstrap acceptance rule over the shorter close-after-automated-check instruction above.

## Copy-ready Executor prompt

Implement READY `PLAN.md` WO-SF-DELIVERABLE-VERSION-01 as R9.91 on the current committed tree. Keep the StudioFlow deliverable scope exact: durable per-phase/slot version allocation, safe backfill, stored list numbers/newest badge, focused integration evidence, contract, backlog and changelog. Use only the verified rebuild-only office database targets, run the mandatory Executor gates, commit locally, and return the result and any precise limitations for Lead review. Do not push or touch root `test/`.
