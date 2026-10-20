# Active Plan

Plan ID: WO-PLATFORM-FORCE-DELETE-01
Scope: Platform Owner can permanently delete a user account (first slice of the owner's "Platform Owner can delete everything" decision).
Module(s): Platform (core RBAC/access, Settings → Access → Users).
Target revision: R9.165 (this plan is R9.164; R9.163 is claimed by the unmerged remote branch `claude/r9-163-timeline-fixes`; re-check `CHANGELOG.md` and use the next unused number if that changed).
Risk: high - irreversible destructive operation on the identity table; lockout risk; touches every reader that resolves a user id to a name.
Status: READY
Priority: P1
Owner: Product Owner (decisions 2026-10-20)
Last updated: 2026-10-20

The release-readiness plan that was active is parked unchanged at
`docs/agent/queued-plans/WO-REL-READINESS-01.md`; its owner actions still apply.

## Outcome

On Settings → Access → Users, a Platform Owner sees **Delete permanently** in a
user's row menu. After a typed-name confirmation the account is gone from the
database: it can no longer sign in, does not appear in the directory, pickers or
counts, and its personal platform data is removed. Every business record the user
created or touched in StudioFlow, Master Data, BQ, Ideas or Presentation stays
exactly as it was and still shows who did it (snapshotted label, otherwise
"Deleted user").

## Context and Evidence

- Today only Disable/Restore exist (`disableUser` in `src/platform/core/rbac/services.ts`, row menu in `users-directory.tsx`).
- `platform.User` relations: `Session`, `UserRole`, `IntegrationToken` are `onDelete: Restrict`; `UserPreference`, `UserTutorial` cascade. `IntegrationRequest → IntegrationToken` is Restrict.
- No other module has a database FK to `platform.User` (module rule); they store user ids as plain strings, mostly with a `*_label` snapshot (e.g. `AuditEvent.actor_label`, deletion requests' `requester_label`).
- Platform Owner gets every enabled `platform.*` permission (`owner-policy.ts`), and `platform.*` is Platform-Owner-only.

## Locked Decisions (owner, 2026-10-20)

1. Platform Owner must be able to delete everything; the owner chose **force delete** (hard delete with linked data) over a recoverable trash bin or delete-only-when-unused. This plan is the user slice; other entities follow as separate plans (see BACKLOG).
2. Deleting a user removes the account and the user's **personal** data only: sessions, role assignments, preferences, tutorials, integration tokens and their requests, notifications addressed to them, and their messenger participation. Business work they authored (projects, notes, MOM, schedules, BQ, master data, samples, audit history) is **kept** and keeps showing their name.
3. Lockout guards stay: a user cannot delete their own account, and the last active Platform Owner cannot be deleted.
4. New permission `platform.user.delete` (Platform-Owner-only by the `platform.*` rule). `platform.user.manage` alone does not allow deletion.

## Business Rules and Architecture Constraints

- REUSE the existing platform access service, last-administrator check, audit envelope and `ConfirmDialog`; ADD only the delete operation and permission.
- One transaction: delete personal rows, then the `User` row; audit event written in the same transaction with the deleted user's display name and email in the label/metadata (the audit row must survive and stay readable).
- Messages the user wrote in shared conversations stay visible to the other participants; the author shows as their snapshot name if stored, otherwise "Deleted user". A conversation left with no participants may be removed.
- Every place that resolves a user id to a display name (people lookups, assignee/owner columns, notes, messenger, audit views) must render "Deleted user" instead of crashing or showing a raw id. Find them; do not special-case only the ones you happen to see.
- No module may gain an FK to `platform.User`.

## Backend Contract

- `platformAccess.deleteUser({ grants, actor, userId, confirmName })`: requires `platform.user.delete`; refuses with safe messages when `userId === actor`, when the target is the last active Platform Owner, when the user does not exist, or when `confirmName` does not match the target's display name (trimmed, case-insensitive). Returns `{ deleted: true }`.
- Works for ACTIVE and DISABLED users.
- Server action `deleteUserAction(userId, confirmName)` next to the existing user actions, revalidating the directory.
- Migration only if a Restrict relation must become Cascade; otherwise delete explicitly inside the transaction. Do not change other modules' schemas.

## UI Contract

Minimal wiring: a danger row-menu item "Delete permanently" visible only with `platform.user.delete`, hidden on the actor's own row, opening a confirm dialog that requires typing the user's name. The Lead finishes copy and layout.

## Boundaries and Non-goals

- No deletion for roles, projects, master data, BQ or other entities in this plan.
- No trash/undo. No change to Disable/Restore behaviour.
- No bulk delete.

## Acceptance Criteria

- Platform Owner deletes a user who has sessions, roles, preferences, a token, notifications, messages and authored StudioFlow/BQ/Master Data records: user row gone; personal rows gone; business records unchanged and rendered with the name or "Deleted user"; one audit event recorded.
- A deleted user's existing session cookie is rejected on the next request.
- Refusals: self-delete, last Platform Owner, wrong confirm name, missing permission (including a role holding only `platform.user.manage`).
- Deleting the same id twice returns a safe "not found", not a 500.

## Verification

High tier per `docs/agent/VERIFICATION.md`: boundaries, legacy-runtime, whitespace, typecheck, lint, full `npm test` (integration tests against the rebuild test DB, both DBs migrated if a migration is added), Prisma generate, production build. Add integration tests in `src/platform/core/rbac/platform-access.integration.test.ts` for every acceptance criterion, plus a test that a cross-module reader shows "Deleted user". e2e: run the users/settings specs. Per-command timeout 15 min.

## Reviewer Acceptance

Lead walks: delete a test user from the row menu with the typed-name confirm; own row has no Delete; a project/notes item that user created still opens and names them.

## Regression Risks and Recovery

Irreversible by design. Risk is an unhandled reader crashing on a missing user; the "Deleted user" sweep and its test cover it. Never run this against owner data in tests; use the disposable test DB.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this `PLAN.md` (WO-PLATFORM-FORCE-DELETE-01), then
implement the entire READY backend outcome and nothing beyond it: Platform-Owner-only
permanent user deletion with the locked guards, personal-data removal, kept business
records, "Deleted user" rendering everywhere a user id is resolved, and the minimal
row-menu wiring. Inspect current repository evidence, preserve unrelated owner work,
run the high-tier checks, update `CHANGELOG.md`, and create the target local revision
commit (R9.165 unless the ledger shows it taken). Stop only for a material
locked-decision conflict or unsafe boundary, using the BLOCKED / CONFLICT report;
otherwise report the commit, checks, limitations, and remaining unrelated dirty files.
