# Active Plan

Plan ID: WO-CLEANUP-01
Scope: Converge duplicated table-row/pagination machinery onto one canonical implementation; drop an unused enum member
Target revision: R8.210
Status: READY
Priority: P3
Owner: owner (Product Owner), delegated to the Lead
Last updated: 2026-09-29

## Outcome

1. The seven private `runRowAction` wrappers and the two private `const pageCount = Math.max(1, Math.ceil(...))` blocks are
   replaced by one shared implementation, with **no visible behavior change** (same pending state, same error text, same
   success handling, same page size and clamping).
2. `SfActivityMode.TODO` no longer exists in the schema, after proving no row anywhere uses it.
3. `APP_DUPLICATE_MACHINERY` in `scripts/check-boundaries.mjs` is an empty list (or the entries are deleted) and
   `npm run check` passes.

## Context and Evidence

- The R8.208 harness (`collectDuplicateMachineryViolations`, ratchet) lists every remaining copy in its `baseline`. It fails on
  a new copy and on any baseline file that no longer matches, so finish by deleting each entry as you converge it.
- `runRowAction` copies: `masterdata/{brands,categories,skus,units,vendors}/*-directory.tsx` and
  `settings/access/{roles,users}/*-directory.tsx` under `src/app/(platform)/`. They are the same ~10-line pending/error/success wrapper.
- Page-count copies: `src/app/(platform)/bq/page.tsx` and `masterdata/pricing/pricing-directory.tsx`. Canonical pagination is
  `buildPageMeta` / `usePagination` in `src/platform/utilities/pagination/index.ts` and the UI Engine pattern
  `src/platform/ui_engine/patterns/pagination.ts`. `docs/UTILITY-INVENTORY.md` lines ~86-90 record the old "PURGE-merge" verdict;
  the real difference is only `pageCount` 1 vs 0 for empty and the local clamp, so EXTEND the canonical one, do not keep copies.
- `SfActivityMode.TODO`: `prisma/schema.prisma` (enum near line 1259, comment near line 1432). Zero application references.

## Locked Decisions

- REUSE/EXTEND, never a private substitute: the shared row-action hook lives in the UI Engine public export
  (`@/platform/ui_engine`), generic and domain-free (no app names, no roles). The owner authorizes this small UI Engine
  extension for this plan only; visual output must not change.
- No new dependency, no new abstraction layer beyond the one hook.
- Enum removal follows the migration rules below; never edit an applied migration.

## Business Rules and Architecture Constraints

- Shared layers never own business policy. The hook takes a command and callbacks; it owns only pending id, error string and
  transition handling.
- Database: verify emptiness against **both** rebuild databases (`masterdata` dev and `masterdata_test`) using the selected
  location env. Confirm the target is rebuild-only before any command. If any row uses `TODO`, STOP and report
  BLOCKED / CONFLICT (do not migrate the rows).
- PostgreSQL cannot drop one enum value in place: create the new type without `TODO`, cast the column, drop the old type, in one migration.

## Acceptance Criteria

- No file outside `src/platform/**` defines `runRowAction` or the private page-count pattern; `APP_DUPLICATE_MACHINERY` baselines removed.
- Each converged directory behaves as before (row action pending indicator, inline error, page clamp when deleting the last row on a page).
- Migration applied to both local databases; Prisma client regenerated; `SfActivityMode` has one member.

## Verification

`npm run check`, `npm run test:boundaries`, `npm run test:legacy-runtime`, `npx eslint src scripts`, full `npm test`
(needs `PLATFORM_TEST_DATABASE_URL`; run against `masterdata_test` only). Add a unit test for the new hook. Report skipped checks as skipped.

## Reviewer Acceptance

The Lead walks Master Data brands/categories/SKUs/units/vendors and Settings users/roles in the browser (archive/restore a row,
paginate, delete the last row on a page). Not required for the Executor commit.

## Regression Risks and Recovery

Risk is a subtle change in error/pending timing in the seven directories. Recovery: revert the single commit; the enum migration is separate and
must be reversible by a follow-up migration only if no rows changed (none should).

## Executor Prompt

You are the Backend Executor. Location: <rumah|kantor>. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the entire READY outcome
and nothing beyond it. Inspect current repository evidence, preserve unrelated owner work, run the required checks, update `CHANGELOG.md`, and create the target
local revision commit R8.210. Stop only for a material locked-decision conflict or an enum value still used by a row, using the BLOCKED / CONFLICT report.
Report the commit, checks, limitations, and remaining unrelated dirty files.
