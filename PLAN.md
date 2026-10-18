# Active Plan

Plan ID: WO-SF-WORKSPACE-ACCESS-01
Scope: StudioFlow Notes/Workspace read authorization
Module(s): studioflow; workspace-board consumer
Target revision: R9.134
Risk: high — project assignment authorization and private asset URLs
Status: IMPLEMENTED — Executor gate incomplete at the pre-existing BQ fixture
Priority: P1
Owner: Product Owner
Last updated: 2026-10-18

## Outcome

Notes and Workspace data cannot be read through a direct service or server-action call by a staff member who is neither the project's assigned Designer/Drafter nor a StudioFlow manager. Assigned PICs and managers retain access. Schedule-derived item search stays available under its existing Schedule/read contract.

## Locked Decisions and Reuse

- REUSE `requireWorkSectionAccess` and the canonical `projectAccessFromFacts` policy. Do not create a second assignment policy.
- The restricted read contract requires the authenticated caller's user id at the service boundary and fails closed when it is absent.
- Gate `readWorkspace`, `listWorkspaceThreads`, `listProjectNotes`, `listNoteTags`, and the `listNotesForItem` path before querying restricted rows or creating signed asset URLs.
- Keep `searchNoteItems` outside the assignment gate because its result is Schedule-derived and Schedule remains visible to permitted read-only users.
- Keep phase-label/Schedule reads unchanged. No schema, migration, dependency, UI, or product-flow change.

## Implementation

- Add one assigned-read context type beside the existing StudioFlow read context.
- Pass the authenticated user id from server actions and server components into every restricted read.
- Add service integration regressions for refusal of an unassigned non-manager before any Notes/Workspace data is returned, plus retained Designer, Drafter, and manager access.
- Add action-level regression assertions that the authenticated identity reaches the service boundary.
- Move the P1 backlog entry to `[UNVERIFIED]` until the full gate and independent browser acceptance close it; record exact evidence and limitations in `CHANGELOG.md`.

## Verification

Location `rumah` when a matching rebuild-only configuration exists. High gate: `node scripts/verify.mjs --tier high`. Before database-backed tests, verify the target is explicitly disposable/rebuild-only. Browser acceptance is required after implementation for the affected Notes and Workspace page reads; if browser prerequisites are unavailable in this cloud checkout, record it as pending rather than claiming acceptance.

## Acceptance and Recovery

- Direct service reads and server actions refuse an unassigned caller with `PERMISSION_DENIED`.
- Assigned Designer/Drafter and a manager can still read Notes/Workspace.
- Refusal happens before note/thread/tag rows or signed asset URLs are returned.
- `searchNoteItems` retains its current read-only Schedule behavior.
- Revert R9.134 to recover; no data conversion is involved. No push, publication, deployment, or remote mutation.

## Execution Checkpoint

- Focused StudioFlow integration passed 226/226; Notes action transport passed 7/7; typecheck passed.
- The high gate passed boundaries, legacy-runtime, whitespace, typecheck and lint. Its test command passed 1,234/1,235 and reproduced only the recorded BQ `lock-empty-prices` fixture failure; generation/build were not run after the runner stopped.
- Implementation is ready for its local R9.134 checkpoint. Independent browser acceptance and a fully green high gate remain before Reviewer closure; the BQ fixture is the next separate correction.

## Executor Prompt

Implement this READY security correction as Backend Executor. Preserve the canonical assignment policy, add the required service/action regressions, run the high gate against an explicitly disposable rebuild-only target, inspect the staged diff, update the ledgers, and create one local R9.134 commit. Report browser acceptance separately and do not push.
