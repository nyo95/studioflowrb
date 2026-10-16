# Active Plan

Plan ID: WO-SF-OWNER-CORRECTIONS-01
Scope: Owner-reported Notes identity, limited project viewing, file safety, and SKU Brand correction
Module(s): studioflow, presentation, masterdata
Target revision: R9.110
Status: COMPLETE — Lead PASS
Priority: P1
Owner: Product Owner
Last updated: 2026-10-16

## Outcome

People can identify who sent every Notes message; their own messages appear on the left and other people's on the right. A project viewer who is neither a PIC nor a manager sees only Schedule, Presentation (when enabled), Timeline, and History, all read-only. Archived-file cleanup cannot be triggered before its authorization check. Manual file deletion is audited. Final, expiry extension, and deletion are rejected for a locked phase. Staff can correct a mistaken SKU Brand as an ordinary edit, even when prices already have source links.

## Locked Decisions

- A manager for this workflow holds `studioflow.project.manage`. The `studioflow.project.override` grant alone no longer gives a non-PIC write access; effective assignment override requires both grants. PIC write access continues to follow the established phase and document rules. Reads still require `studioflow.project.read`.
- A non-PIC without manager rights sees the four named project sections only. Direct links to hidden Phases and MOM views do not reveal their content. The restriction applies regardless of `project.override`.
- Notes alignment is relative to the signed-in viewer's immutable author ID, never a display name. Own message left, others right; show sender name on each message, including image/file messages and board threads. Historic notes without a resolvable author show a neutral fallback.
- An archived-file cleanup attempt checks StudioFlow authority before any Presentation cleanup. A rejected request performs no cleanup work.
- Manual deliverable deletion records the actor and deleted file identity in the audit trail in the same database transaction.
- A locked phase rejects Final, expiry extension, and manual deletion, as it already rejects upload. Existing project completion/archive gates remain.
- When staff changes a SKU's Brand, detach live material-price source links that point to the old Brand, preserving price values and an audit record of the detached references. Do not rewrite historical BQ snapshots. Use the existing automatic Brand-Supplier association behavior where needed so supplier links do not make correction impractical. Preserve identity uniqueness and archived-Brand checks. The owner accepted the consequences of prior staff errors in existing BQ snapshots.

## Architecture and Backend Contract

- EXTEND StudioFlow's canonical project access gate and read projection. Do not create a new role enum or duplicate project policy in app routes. Update the durable StudioFlow contract to reflect the changed override meaning.
- REUSE the existing author ID/name in StudioFlow Notes. No schema change is needed.
- REUSE the existing phase writable guard and audit writer for deliverables; no new audit mechanism.
- Use existing module boundaries. StudioFlow calls Presentation only through its public door.
- EXTEND Master Data's existing SKU edit service inside its transaction, with explicit audit of SKU Brand and affected price source links. Do not add a one-off migration or cross-app write.

## UI Contract

The Lead completes Notes bubble alignment, sender labels, the restricted navigation/direct-route behavior, and clear SKU correction feedback after backend integration. The Executor may add minimal wiring needed to exercise the updated access facts. Presentation remains hidden when its module is disabled.

## Acceptance Criteria

- Two users with the same display name still get different left/right alignment from their IDs; the name is visible on every note.
- A non-PIC with `project.override` but without `project.manage` cannot mutate phase, documents, Schedule, or Presentation and only sees/opens the four read-only sections. A manager or PIC keeps authorized paths.
- A user without cleanup authority cannot trigger Presentation retry or StudioFlow purge.
- Successful manual file deletion leaves actor/file audit evidence; failed audit leaves the file intact.
- Final, expiry extension, and deletion on locked phases fail without file/audit change; unlocked cases still work.
- Editing a SKU to a different active Brand succeeds with existing live prices, detaches old-Brand source links, keeps amounts, records what was detached, and establishes any needed supplier associations. A new BQ snapshot uses corrected Master Data; an existing BQ snapshot remains as originally captured.

## Verification

Focused tests for permission combinations, Notes identity/layout logic, cleanup side-effect ordering, deliverable lock and audit behavior, and SKU correction with sourced prices. Run the Executor's full required gate: test, typecheck, lint, boundary, legacy-runtime, production build, and staged/unstaged whitespace check.

## Reviewer Acceptance

Browser check with two user identities and a viewer holding override but no manager permission: Notes placement/name, project tabs/direct routes, and read-only controls. Exercise SKU Brand correction and file actions on locked/unlocked phases in the browser where practical.

Result: PASS. The Notes, restricted-viewer, and SKU browser journeys passed 3/3; the combined responsive browser suite passed 83/83. Backend tests passed 1226/1226, including file lock/audit and hidden-image bridge checks. Typecheck, lint, boundary, legacy-runtime, production build, and whitespace checks passed. File lock and audit behavior was verified by integration tests; no separate browser file-action case was added.

## Boundaries

No legacy, remote, push, publication, or unrelated refactor.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this READY `PLAN.md`; implement the backend outcome with the smallest correct change. Preserve unrelated work, run required checks, update `CHANGELOG.md`, and commit R9.110 locally. The Lead completes UI and browser review in the same owner-requested run.
