# Active Plan

Plan ID: WO-BE-01
Scope: Backend correctness and hardening — Platform (auth/RBAC/transactions) and StudioFlow. No Master Data, no BQ.
Status: READY
Priority: P2
Owner: owner (Product Owner); Lead: Claude
Target revision: R8.173
Last updated: 2026-09-28

## Outcome

Eight verified backend defects from `docs/BACKLOG.md` are fixed with tests, without
changing any product behavior, permission meaning, route, or schema. Each item
below was re-verified by the Lead against `main` @ `aa182d2` before this plan was
written.

## Context and Evidence

Authority: `AGENTS.md`, `docs/agent/EXECUTOR.md`, `CORE.md` §2 (transactions) and §3
(identity), `docs/MODULE-BOUNDARIES.md`. Origin: the 2026-09-26 audit in
`docs/BACKLOG.md` ("Full-repo logic + UI/UX audit"). **Re-verify each finding against
the current code before changing it.** If a finding no longer holds, do not change
the code; report it as "not reproducible" in the handoff.

## Business Rules and Architecture Constraints

- Every fix is behavior-preserving except where an item says otherwise.
- Cross-app access stays through `public/`; `platform` stays domain-neutral;
  database ownership per `docs/MODULE-BOUNDARIES.md` (the boundary checker enforces it).
- REUSE existing helpers; ADD nothing generic unless an item names it.

## Backend Contract (locked, per item)

**A1 — KB-042: hash outside the transaction.** `hashPassword()` currently runs inside
the `runTransaction` callback at `platform/core/rbac/services.ts` (create-user and
reset-password paths, ~L429 and ~L502), `platform/core/auth/account.ts` (~L87), and
`platform/core/auth/bootstrap.ts` (~L87). Compute the hash before opening the
transaction. Locked constraints: (a) hash only *after* every non-transactional check
that could already fail the call (permission, input validation), so error precedence
and who pays the CPU cost do not change; (b) in `account.ts` the current-password
check happens inside the transaction — do not move that check or the error it raises;
(c) no change to transaction isolation, audit content, or return values.

**A2 — KB-049: a corrupt hash is a failed verification, not an exception.**
`@node-rs/argon2` throws on a non-PHC string. Make the canonical
`verifyPassword` in `platform/core/auth/password.ts` return `false` when verification
throws, and make `platform/core/auth/login.ts` use that same function instead of calling
argon2 `verify` directly (one canonical path). Locked outcomes: a corrupt stored hash
yields the same generic `LOGIN_FAILED` as a wrong password; `changePassword` yields
`CURRENT_PASSWORD_INCORRECT`; the dummy-hash timing path for unknown users is kept.

**A3 — KB-048: validate the role id at the boundary.** In
`app/(platform)/settings/access/roles/actions.ts`, `archiveRoleAction` must parse its id with
the same `z.string().uuid()` helper its sibling actions use, so a garbage id returns the
clean `VALIDATION` payload, not a DB error. No other change to that action.

**A4 — KB-044: direct tests for the transaction runner.** Add
`platform/core/db/transactions.test.ts` for `runSerializableTransaction` **as it is
implemented**: commit returns the callback value; a throwing callback propagates and is not
retried; a `P2034` conflict is retried and succeeds within `SERIALIZABLE_TRANSACTION_MAX_ATTEMPTS`;
`P2034` on every attempt is rethrown after the last attempt; a non-`P2034` error is never
retried. Use a fake `InteractiveTransactionClient`; no database needed. Do **not** add
nesting or reuse rejection: the backlog mentions it but the contract does not implement
it. If you believe the contract requires it, report `BLOCKED / CONFLICT`. Also add one
StudioFlow integration test that starts two concurrent project creations and asserts two
distinct project codes (the row-lock guarantee in `projects/service.ts`, ~L149-165, has only
sequential coverage today).

**B1 — SF-08: a typed project number must not drift from `project_code`.** In
`studioflow/projects/service.ts` `updateProject` (~L483-491), when the submitted name
`looksFormatted` and its leading code differs from the project's stored `project_code`, reject
with a `VALIDATION` `AppError` (stable code `PROJECT_CODE_IMMUTABLE`, plain-language message
saying the project number cannot be changed). When the leading code equals the stored
`project_code`, behavior is unchanged. Do not touch `edit-project-dialog.tsx`; the Lead
fixes its hint afterwards.

**B2 — SF-09: batch blocker counts.** Add a batched reader in
`studioflow/phases/blocker-query.ts` taking a list of phase ids and returning the same count
shape per phase from a constant number of statements (one `findMany` over `phase_id in ids`
plus two `groupBy`, joined in memory). Replace the serial per-phase loop in
`phases/service.ts` `listProjectPhases` and in `today/service.ts` `listPhaseAttention`.
`listNavPhases` (same file) counts *open root checklist items* per phase with one `count`
per phase (`1 + P` statements on every project sub-page): replace those with a single
`groupBy` on `phase_id`; that count is not the blocker count and its meaning stays the same.
Keep the single-phase `readBlockerCounts` for its transactional callers (`phases/service.ts`
~L112, ~L176). Results must equal what the per-phase reader returns for the same data (prove with
a multi-phase test); no ordering or shape change.

**B3 — SF-10: bound the header quick-search.** Add a dedicated service method for the
quick-search that returns only `{ projects: [{id, name, clientName}], clients: [{id, name}] }`
with `take: limit` (default 6) and a minimal `select`, reusing the same permission check,
match semantics, and archived-record handling as `listProjects`/`listClients` today. Point
`globalSearchAction` (`app/(platform)/studioflow/actions.ts`) at it; its
`GlobalSearchResult` type and the values returned stay identical. Leave `listProjects` and
`listClients` untouched for the directory pages. Prove equivalence with a test.

**B4 — SF-15: stop shipping a phase's whole revision history.** In
`studioflow/phases/service.ts` (~L638-695) return, for closed revisions, `activityCount` from
`_count` instead of the full `activities` list, and add a service method that returns one
revision's activities on demand under the same read permission. Add the matching server
action and the minimal wiring in
`app/(platform)/studioflow/projects/[projectId]/phases/[phaseId]/revision-history.tsx` so
opening a `<details>` loads and shows the same list it shows today. Locked UI limit: keep the
existing markup and classes; add only what loading needs (a loading and an error line). The
Lead redoes presentation afterwards.

## UI Contract

Only B1 (none), B3 (action wiring) and B4 (`revision-history.tsx`) touch route files, and only as
described above. No layout, copy, or styling change. Anything else in `app/` is out of scope.

## Boundaries and Non-goals

- **Master Data is LOCKED** by the owner (2026-09-24): do not modify any file under
  `src/apps/masterdata/**` or `src/app/(platform)/masterdata/**`. This also excludes KB-025.
- **BQ is on hold** by the owner (2026-09-28): do not touch `src/apps/bq/**`,
  `src/app/(platform)/bq/**`, or BQ tests.
- No schema change and no migration. If any item would need one, stop with `BLOCKED / CONFLICT`.
- Not in this plan (Lead or owner decisions, do not pick them up): KB-047 (owner must confirm the
  behavior is not intentional), KB-037a/b, KB-055(b) (drops an enum member), KB-040/053/054
  (checker work), and every UI-only item (SF-11..SF-14, MD-01, KB-038, KB-043, KB-050).
- No new abstraction layer, dependency, or refactor beyond the items above.

## Acceptance Criteria

1. Each of A1–A4 and B1–B4 behaves as its contract states, or is reported "not reproducible".
2. Each fixed item has a test that fails on the old behavior and passes on the new one
   (A4 and the concurrency test are new coverage, not fixes).
3. `npm test` passes fully (532 tests green at the start); no test was weakened or deleted.
4. All four `hashPassword()` call sites named in A1 run outside `runTransaction`, and error
   precedence for permission and validation failures is unchanged.

## Verification

Run the full commit gate in `docs/agent/EXECUTOR.md` (`npm test`, typecheck, lint, boundary
check, legacy-runtime check, production build, whitespace check). Database safety: integration
tests use the rebuild-only test database named in the ignored `.env.test.local`
(`masterdata_test` on the local `masterdata-db` container). Verify the target name before any
database command; never touch a legacy database. Stop the dev server before `npm run build`
(a build during `next dev` disturbs the dev server's `.next`), and restore `next-env.d.ts` to
its owner-modified state afterwards; never stage it.

## Reviewer Acceptance

The Lead will, after the commit: review the diff and run the full suite; browser-check the
project overview and phase page (revision history opens and loads), the header quick-search, and
project rename with a mismatched number; then fix the edit-dialog hint and polish the
revision-history UI as the next revision.

## Regression Risks and Recovery

Highest risk is A1 (accidentally changing error precedence) and B4 (changing what users see in
closed revisions). Recovery is a plain revert of the single commit; there is no migration or data
change to undo.

## Executor Prompt

You are the Backend Executor. Location: rumah. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this
`PLAN.md`, then implement the entire READY backend outcome (WO-BE-01) and nothing beyond it.
Re-verify each finding against current code first; report any that no longer reproduces instead of
changing it. Do not touch Master Data or BQ. Run the required checks, update `CHANGELOG.md`, and
create the local revision commit `R8.173`. Never push. Stop only for a material locked-decision
conflict or unsafe boundary, using the `BLOCKED / CONFLICT` report; otherwise finish and reply with
one copy-ready Planner/Reviewer prompt naming the commit, checks, limitations, and remaining
unrelated dirty files.
