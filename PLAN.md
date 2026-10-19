# Active Plan

Plan ID: WO-SF-DELIVERABLE-ONE-PHASE-01
Scope: Replace StudioFlow deliverable version slots with one private file per phase
Module(s): StudioFlow
Target revision: R9.139
Risk: high — this changes persisted file cardinality, removes historical deliverable records, and must keep private-object cleanup and audit recovery reliable. Stop for a conflict in existing migration state, ownership, or cleanup safety.
Status: READY
Priority: P1
Owner: Product Owner
Last updated: 2026-10-19

## Outcome

Every StudioFlow phase has zero or one private deliverable. Uploading a file replaces that phase's existing file, so storage and the visible phase panel never retain versions, Final state, expiry state, or same-name slots.

## Context and Evidence

- Owner confirmation, 2026-10-19: "di penyimpanan hanya menyimpan 1 file tiap phase."
- The current `SfDeliverable` model permits many files per phase through file-name slots and version numbers; `phases/deliverables.ts` retains Finals and working versions.
- The pinned legacy behavior replaces old phase files. The KB records that evidence and the existing private streaming, assignment, audit, and cleanup safety floor.

## Locked Decisions

- REPLACE the StudioFlow-only version-slot capability with one phase-owned file. There is no project-wide dashboard, external-link type, download-public path, or new module in this work order.
- A successful upload replaces the stored file irrespective of name; the newly uploaded file is the sole current file for the phase and is attached to the active round.
- Existing data migration retains the newest uploaded record per phase (`created_at`, then id) and removes older deliverable rows. Every removed object key is placed in the existing cleanup retry ledger within the migration before its row disappears; object removal remains best-effort and retryable after deployment.
- The one retained/new file has no Final flag, expiry date, version number, or manual extension. Deletion remains an explicit Studio Manager operation; upload continues to require the existing phase-work grant plus matching PIC/phase access.
- Keep authenticated signed reads, streamed private storage, input limits/types, active-round requirement, database transaction, assignment access, and audit events. Do not add a new role or weaken project privacy.

## Business Rules and Architecture Constraints

- EXTEND the existing StudioFlow private ObjectStorage and cleanup ledger; no shared-layer substitute and no cross-app relation.
- The database enforces at most one `SfDeliverable` per phase. Migrations may remove only obsolete Deliverable-version metadata and rows made obsolete by that cardinality rule.
- Upload writes the object before its short transaction as today; after the transaction commits the replacement's old key is removed through the existing retry-safe cleanup path. If upload or the transaction fails, the new unreferenced object is cleaned through the same path and the old deliverable remains.
- Audit replacement must identify the new file and whether an older file was replaced, without exposing signed URLs or file contents.

## Backend Contract

- `listDeliverables` returns at most one item and preserves phase status calculation against its round.
- Both upload entry points atomically replace the phase record after re-authorizing; concurrent uploads cannot leave two records.
- Remove obsolete Final, expiry, sweep, and slot-facing service operations and their transport/UI consumers. Preserve the explicit manager delete operation and its cleanup/audit guarantees.

## UI Contract

- Executor may make the existing phase Deliverables panel accurately exercise the backend: it renders one file when present, offers upload to the authorized PIC, and manager deletion with confirmation.
- Executor removes controls and explanatory copy for versions, Final, expiry, and extension. Layout, visual redesign, and a project-wide dashboard are Lead work and excluded.

## Boundaries and Non-goals

- No Timeline work, schedule model change, external link support, public file URLs, legacy import, new permissions, or UI redesign.
- No direct legacy database access and no manual deletion of object-storage contents outside the existing cleanup boundary.

## Acceptance Criteria

- A phase accepts one supported private upload and lists exactly that file; a subsequent upload leaves exactly the new file row and schedules/removes the former object through the cleanup ledger.
- Parallel or failed replacement cannot leave two rows, lose the former file before a successful commit, or leave a deleted key untracked.
- Existing multi-file phases migrate to their newest file only; older rows are gone and their keys are pending safe cleanup.
- Readers keep signed private download access; unauthorized users and inactive phases are still refused before bytes are accepted.
- The panel no longer presents versions, Final, expiry, or extension actions; manager deletion remains confirmed and user-visible errors remain surfaced.

## Verification

- Tier: high (schema/data migration, private storage, authorization, audit and transactions). Per-command timeout: 15 minutes; checkpoint after migration generation and focused tests before the full gate.
- Read the installed Next.js guide before editing routes/components. Verify the selected `kantor` database target is explicitly rebuild-only before applying any migration or running database-backed tests.
- Add/update direct service integration coverage for replacement, rollback/failure, concurrency, migration retention/cleanup-ledger behavior, permissions and signed reads; update the panel/static safety test and affected Playwright deliverable scenario.
- Run `node scripts/verify.mjs --tier high` after migration deployment to the disposable test target, plus Prisma generation. The required high gate includes full test, typecheck, lint, boundaries, legacy-runtime, production build, and whitespace. Owner deferred browser acceptance on 2026-10-19; its scenarios remain in the Reviewer backlog.
- Apply a new migration to every rebuild-only local database actually used this session (dev and test) only after explicit target verification, regenerate Prisma, and restart any local development server if one is running.

## Reviewer Acceptance

- On a disposable migrated database: authorized PIC uploads a second file and sees only the replacement; a manager confirms deletion; an unauthorized viewer cannot upload; signed download remains private.
- Browser acceptance is Reviewer-owned after the Executor commit. Record its backlog entry rather than making it an Executor commit blocker.

## Regression Risks and Recovery

- The migration is irreversible for removed historical deliverable rows; it deliberately retains the newest row and logs every discarded object key for retry-safe cleanup. Revert the application commit only before migration deployment; after deployment, restore only through a specifically authorized data-recovery procedure.
- Existing archive cleanup must continue to see the surviving deliverable and cleanup-ledger rows must remain retryable.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, the installed Next.js guide, and this READY `PLAN.md`, then implement the entire one-file-per-phase Deliverables outcome and nothing beyond it. Preserve unrelated owner work, verify each rebuild-only database target before any Prisma command, run the required high gate, update the changelog and durable StudioFlow contract, then create target local revision R9.139. Stop only for a material locked-decision conflict or unsafe boundary; otherwise report the commit, checks, limitations, and remaining unrelated dirty files.
