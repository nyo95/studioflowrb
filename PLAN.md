# Active Plan

Plan ID: WO-PRESENTATION-SCHEDULE-LINK-RECONCILE-01
Scope: Retry-safe cleanup of Presentation links to deleted Product Schedule entries
Module(s): presentation, studioflow
Target revision: R9.109
Status: COMPLETE — R9.109 built and Lead review PASS
Priority: P3
Owner: Product Owner; Codex temporarily acts as Lead for this plan, then as Backend Executor
Last updated: 2026-10-16

Reviewer outcome: PASS. R9.109 satisfies the locked ownership, read-only board,
bounded bridge, failure/retry, disabled-module maintenance, and keyset-drain
criteria. No next Work Order is selected by this completed plan.

## Outcome

If immediate cleanup fails after a Product Schedule entry is deleted,
Presentation eventually removes the stored link from its pins without relying on
a user opening the board. Live links remain untouched and normal reads remain
read-only.

## Context and Evidence

- Schedule deletion currently attempts to clear Presentation links after the
  StudioFlow delete commits, but `Promise.allSettled` discards a cleanup failure.
- Presentation board reads resolve links through StudioFlow and already project a
  missing entry as no linked item, so users do not see an old code, name, or image.
- The stored `schedule_entry_id` can nevertheless remain indefinitely. The
  accepted R9.68 read contract intentionally performs no repair write during
  `getBoard`, so opening a board cannot be the retry mechanism.
- The existing production maintenance sweep already runs application-composed,
  bounded cleanup for StudioFlow and optional Presentation data.

## Locked Decisions

- Presentation owns its annotation rows and is the only module that may clear
  their stored links. StudioFlow exposes only a narrow read-only existence fact.
- Reconciliation is idempotent: clear only IDs that are absent from StudioFlow;
  never alter a link that still resolves. Each cross-module read is bounded, and
  one maintenance pass advances by keyset through all IDs present at its start so
  stable live links cannot starve later dangling IDs.
- A failed StudioFlow existence read performs no Presentation write and remains
  eligible for the next scheduled attempt.
- Keep the immediate post-delete best-effort cleanup for fast normal behavior,
  but correctness must no longer depend on that one attempt.
- Maintenance must still run when the optional Presentation module is disabled;
  disabling a module does not abandon its retained data.
- No cross-app foreign key, cross-app database write, new dependency, or write on
  a user-facing read path is permitted.

## Business Rules and Architecture Constraints

- EXTEND the existing StudioFlow-to-Presentation public bridge with one trusted,
  read-only existence projection for a bounded set of Schedule entry IDs.
- EXTEND Presentation's lifecycle surface with app-owned reconciliation and
  compose it into the existing maintenance runner. Do not create a generic
  outbox, queue framework, or second scheduler for this hygiene task.
- Do not expose deleted entry details, user grants, or Presentation internals
  through the existence projection.

## Backend Contract

- Presentation selects distinct non-null Schedule entry IDs in bounded,
  lexicographically ordered keyset pages and asks StudioFlow which still exist.
- One reconciliation call drains those pages to the end of the current result
  set. It must not restart at the first page between chunks or use offset paging
  that can skip rows after stale links are cleared.
- It clears only links whose IDs are absent from that result and returns explicit
  counts sufficient for maintenance tests and observability.
- If existence resolution throws or returns an invalid response, fail the batch
  closed before changing any annotation.
- Application maintenance invokes this reconciliation on the established
  boot/daily schedule alongside existing Presentation asset retry and StudioFlow
  archive retention. Repeated runs converge without duplicate effects.

## UI Contract

None. Missing Schedule entries continue to render as unlinked pins exactly as
they do today. No new button, message, loading state, or user workflow.

## Boundaries and Non-goals

- No change to Schedule deletion, Presentation pin editing, permissions, module
  switches, board rendering, or audit vocabulary.
- No Ideas usage cleanup redesign; option-usage cleanup is separately owned and
  is not evidence for this exact entry-link outcome.
- No durable generic integration queue, manual repair UI, or schema migration
  unless repository evidence proves the bounded reconciliation cannot work.
- No legacy access, remote action, release, or push.

## Acceptance Criteria

- A missing Schedule entry's stored ID is cleared by maintenance without a board
  read and remains cleared on repeated runs.
- A live Schedule entry link survives reconciliation unchanged.
- A simulated StudioFlow read failure leaves every Presentation link unchanged;
  a later successful run clears the stale link.
- Immediate post-delete cleanup still clears normally, while an injected failure
  is repaired by maintenance.
- Reconciliation runs through the existing production maintenance composition
  even when Presentation is disabled.
- Existing board reads remain write-free and continue projecting a missing link
  as `null` before reconciliation has run.

## Verification

- Focused Presentation integration tests for live, dangling, failure, retry, and
  idempotent batches; focused maintenance-composition test.
- Level 3 gates: relevant integration tests, typecheck, lint, architecture
  boundaries, legacy-runtime, full test suite, production build, and staged/
  unstaged whitespace checks.
- Capture verbose successful output in local ignored logs and report concise
  summaries; expose the relevant excerpt and log path only on failure.

## Reviewer Acceptance

Browser review is not applicable: the stored dangling ID is already hidden from
the UI and this plan deliberately changes no rendered or interactive behavior.
Reviewer verifies the service diff, ownership boundary, scheduled composition,
and failure/retry evidence.

## Regression Risks and Recovery

- A resolver that falsely reports a live ID absent would clear a useful link, so
  the public projection and failure validation need exact tests. Recovery is to
  relink the pin manually; never guess from deleted Schedule content.
- Each bridge call and database page stays bounded, while one maintenance pass
  examines the finite current set. Do not add a durable cursor or queue unless
  measured scale later proves this indexed keyset scan insufficient.
- Normal rollback is the local commit revert; no data rollback or remote action
  is authorized.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the entire READY
backend outcome and nothing beyond it. Inspect only the named Presentation/
StudioFlow bridge, lifecycle, maintenance composition, and relevant tests;
preserve unrelated owner work. Run the required checks with concise logged
output, update `CHANGELOG.md`, and create R9.109 as one local commit. Stop only
for a material locked-decision conflict or unsafe boundary, using the BLOCKED /
CONFLICT report; otherwise finish the coherent outcome and report the commit,
checks, limitations, and remaining unrelated dirty files.
