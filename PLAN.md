# Active Plan

Plan ID: WO-SF-DELIVERABLE-SAFETY-01
Scope: Safe deliverable deletion, deterministic working-version retention, and one-Final concurrency
Module(s): studioflow
Target revision: R9.106
Status: READY
Priority: P1
Owner: Product Owner; Codex temporarily acts as Lead for this plan, then as Backend Executor
Last updated: 2026-10-16

## Outcome

Project staff cannot accidentally delete a deliverable without a clear warning,
failed file commands are visible and retryable, the two newest working versions
are selected by the canonical stored version number, and concurrent Final choices
cannot leave two Final files in one phase/name slot.

## Context and Evidence

- The accepted file contract keeps one Final plus the two newest working files in
  each normalized phase/name slot; the stable increasing version number is the
  canonical upload order.
- Upload pruning currently orders working files by creation timestamp and id.
- Final changes clear the prior Final and set the requested row inside one
  transaction. Production uses serializable retries, but the database has no
  direct one-Final invariant and no concurrent-final regression.
- The Deliverables panel deletes immediately and ignores the safe failure result
  returned by delete, Final, and expiry-extension actions.

## Locked Decisions

- Managers may intentionally delete a Final file; this plan adds explicit
  confirmation rather than forbidding the workflow.
- A slot keeps the Final independently from exactly the two highest surviving
  non-Final version numbers. Timestamp and id never decide retention.
- Exactly one Final is allowed for a phase/name slot at database level. Normal
  service finalisation serializes per slot so competing requests finish safely;
  the later completed request may replace the earlier Final.
- Existing permission, expiry, audit, private-storage, cleanup-ledger, normalized
  slot-name, and stable-version meanings remain unchanged.
- No new dependency or cross-module relation is permitted.

## Business Rules and Architecture Constraints

- REUSE the existing durable deliverable-slot row as the per-slot coordination
  point and the existing UI Engine confirmation/error patterns.
- Keep all persistence and policy inside StudioFlow. The database migration must
  reject any future attempt to persist two Final rows for the same slot.
- Do not infer order from transaction timestamps; concurrent uploads may wait on
  the slot allocator after their transaction clock was established.

## Backend Contract

- Upload pruning keeps the two greatest `version_number` values among non-Final
  rows after the new upload.
- Finalisation obtains a per-slot database lock before reading/clearing the
  existing Final and setting the requested row. This must remain correct even
  when the injected transaction runner uses ordinary read-committed transactions.
- A forward-only migration adds the one-Final-per-slot database invariant without
  rewriting legitimate deliverables. If pre-existing duplicate Finals exist, the
  migration fails visibly rather than choosing a winner silently.
- Add deterministic regressions for timestamp/version disagreement and concurrent
  finalisation. Keep the existing concurrent upload and lifecycle coverage.

## UI Contract

Visual thesis: a calm operational file list where destructive intent and failure
state are unmistakable without adding permanent visual clutter.

Content plan: preserve the existing list; use one shared danger confirmation for
deletion and one nearby inline error for failed delete, Final, or Extend commands.

Interaction thesis: deletion performs no server call before confirmation; the
target row alone shows pending state; a safe server refusal remains visible and
the operator can retry without reloading.

The Lead owns this UI follow-through after the Executor backend commit. Reuse
`useConfirm`, `useCommand`, and `InlineError`; do not create a second dialog,
notification system, or new layout.

## Boundaries and Non-goals

- No change to who can upload, finalise, extend, download, or delete.
- No file restore/undo, bulk actions, renaming, retention-duration change, or
  broad Deliverables redesign.
- Presentation dangling-link reconciliation is a separate module outcome and is
  not mixed into this deliverable transaction.
- No legacy access, remote action, release, or push.

## Acceptance Criteria

- A Final and a working file both require the destructive confirmation before
  deletion; cancel leaves the row and object untouched.
- Safe failures from delete, Final/Clear final, and Extend are shown in the panel;
  success refreshes the list and clears the prior error.
- Deliberately inverted timestamps cannot cause a higher working version to be
  pruned while a lower one survives.
- Two simultaneous Final requests finish with exactly one Final, and the database
  itself refuses a manually attempted duplicate.
- Existing one-Final-plus-two-working behavior, permissions, expiry, version
  continuity, audit, and storage cleanup tests remain green.

## Verification

- Focused StudioFlow service integration tests for pruning, concurrent Final, and
  direct database invariant.
- Focused component/action tests for confirmation, cancel, pending state, safe
  errors, retry, and success.
- Mandatory Executor gates: `npm test`, typecheck, lint, boundary check,
  legacy-runtime check, production build, and staged/unstaged whitespace checks.
- Apply the migration to both verified office rebuild databases and regenerate
  the Prisma client before final verification.

## Reviewer Acceptance

- In the disposable browser fixture, cancel deletion of a working and Final file,
  then confirm deletion and observe the correct row disappear.
- Force one safe refusal for delete, Final, and Extend; each message is visible,
  the row remains usable, and retry succeeds.
- Confirm the list remains usable at 375 px and has no sideways overflow.

## Regression Risks and Recovery

- The partial unique index is intentionally stricter than service code; migration
  failure reveals pre-existing invalid data and must block rather than repair it.
- The slot lock must cover the read/clear/set sequence without changing the
  version allocator. Rollback is the normal local commit revert plus the
  forward-only migration policy; no destructive database rollback is authorized.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the entire READY
backend outcome and nothing beyond it. Inspect current repository evidence,
preserve unrelated owner work, make sound in-scope implementation decisions,
run the required checks, update `CHANGELOG.md`, and create R9.106 as one local
commit. Leave the Lead-owned confirmation/error presentation and browser
acceptance for the following Lead revision. Stop only for a material
locked-decision conflict or unsafe boundary, using the BLOCKED / CONFLICT report;
otherwise finish the coherent outcome and report the commit, checks, limitations,
and remaining unrelated dirty files.
