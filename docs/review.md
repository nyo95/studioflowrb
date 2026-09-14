# Ready for Review

Status: active verification ledger, reconciled through R7.56 on 2026-09-10.
New file, split out of `roadmap.md`/`knownbug.md` on 2026-09-10 at owner
request, so status is visible at a glance:

- [`roadmap.md`](roadmap.md) — **not built yet.** Planned features and decision
  gates.
- **This file** — **built, not yet checked.** Code, schema, and/or tests exist
  and are believed to satisfy the contract, but nobody has walked it through a
  real browser and no integration test has run against it. Treat anything
  listed here as "should work", not "works".
- [`knownbug.md`](knownbug.md) — **checked, and it's wrong.** An observed,
  reproducible defect against the contract.

An item leaves this file one of two ways: verification confirms it behaves —
delete the entry and note the evidence in `CHANGELOG.md`; or verification finds
a real defect — move it to `knownbug.md` with what was actually observed.

## Platform Foundation

### F-B / PF-2+PF-3 — Application ownership and navigation

- **Observed (R8.36):** Permission vocabularies were moved behind the public
  boundaries of Master Data, BQ, and StudioFlow, and central registration no
  longer duplicates permission literals.
- **Missing:** The READY plan also requires app-owned route helpers and
  navigation definitions, plus regression evidence that launcher/sidebar
  visibility and route behavior remain unchanged. R8.36 does not implement or
  verify those parts.
- **Status:** Correction required. Continue the same coherent F-B outcome;
  do not mark it accepted until route/navigation ownership and browser evidence
  are complete.
- **R8.40 correction:** BQ no longer registers Master Data's
  `masterdata.promotion.approve`; its retained promotion approval checks import
  the public Master Data permission contract instead. A registration test now
  composes the full app set and asserts that this permission has one owner.
  `npm run dev` boots successfully and unauthenticated Master Data, BQ, and
  StudioFlow route checks all redirect to `/login`.
- **Remaining review:** Typecheck, lint, boundary, legacy-runtime, production
  build, and focused registry tests pass. Full integration coverage is blocked
  because kantor has no disposable test-database configuration, and authorized
  browser navigation/launcher checks still need a supplied test account. The
  unrelated local-filesystem signed-read failure is tracked as KB-030.
- **Status:** BLOCKED: ACCEPTANCE ENVIRONMENT REQUIRED. F-B remains
  unaccepted until a disposable rebuild-only test database and an approved
  non-production browser test account are supplied; then run the active
  `PLAN.md` acceptance recipe.

### PF-1 — Core purity and managed Brand mark storage

- **Observed:** R8.25 (`c4061f3`) moved storage behind the provider-neutral
  boundary and R8.26 (`358c61c`) corrected request-size headroom, the storage
  contract, cleanup reporting, and the revision ledger. The owner then changed
  the final deployment target to self-hosted/local on 2026-09-14; Supabase is
  now deferred and the local filesystem provider is the next PF-1 outcome.
- **Verified:** Full test suite 343/343 passed. Typecheck, lint, architecture
  boundary, legacy-runtime, production build, and commit whitespace checks
  passed. The previous Supabase URL tests remain evidence for the parked
  adapter, not a deployment requirement.
- **R8.29 review finding:** The local adapter and routes were implemented and
  the reported automated checks passed, but the private signed URL contract
  has a material mismatch: the adapter emits a duration while the route reads
  it as an epoch timestamp. MOM URLs therefore expire immediately. Symlink
  escape behavior is also not covered by the committed tests.
- **Status:** Correction required. See KB-027 and the active correction plan
  in `PLAN.md`; PF-1 is not accepted yet.
- **R8.31 review finding:** Expiry semantics are now aligned, but symlink
  protection is still not proven. The symlink assertion is swallowed by a broad
  catch, and the public/private route handlers bypass the adapter boundary
  check.
- **Status:** Correction required. See KB-028 and the active correction plan
  in `PLAN.md`; PF-1 remains unaccepted.
- **R8.33 verification:** `resolveSafePath` is now shared by the filesystem
  adapter and both application asset routes. The symlink test only skips
  explicit OS permission errors and no longer catches failed assertions.
  Reported 346 tests, typecheck, boundaries, legacy-runtime check, and build
  all passed.
- **Status:** PASS — PF-1 local storage and public/private asset boundaries
  are accepted. Supabase remains deferred and is not a release dependency.

### Configurable main-route settings

- **Observed:** Implemented 2026-09-10 per `roadmap.md`'s "Add configurable
  main-route settings" item. Adds `mainAppId`/`landingAppId` (nullable,
  shape-validated, not registry-validated — Core stays domain-neutral) to
  `PlatformGeneralSettings` and its schema/migration, a pure
  `resolveMainRoute()` in `src/app/(platform)/main-route.ts` (with a colocated
  unit test) that the launcher's `page.tsx` now calls instead of its old
  hardcoded "masterdata first" default, and two new selects in
  General Settings (Main application / Landing page for other users) wired
  through `actions.ts`.
- **Accepted R7.56:** Check, lint, Prisma validation/generation, 314 tests, and
  production build pass. All migrations deploy to a fresh isolated rebuild
  browser-test database; the new two-column migration also deploys to kantor.
  Browser evidence covers main BQ/StudioFlow redirects, inaccessible-main
  landing, null-main Master Data priority, stale-id preservation/fallback,
  read-only settings, and successful saves at desktop and 375px width.
  Fixed the post-save stale selection, registry path validation, default-main
  precedence, and authorization before brand-mark upload. This entry is retained
  as a short handoff receipt; it is no longer pending review.
  Pre-existing office migration-history drift is tracked separately as KB-020.

## UI Engine and Shared Utilities

No item currently ready for review.

## Master Data

### Supplier Category dictionary and vendor assignment

- **Observed:** Implemented in R8.08. Adds a **Supplier Category** dictionary
  distinct from Supplier Type: Supplier Type remains the capability dimension
  (Material/Labor eligibility and pricing guard), while Supplier Category is a
  plain classification label (e.g. fabric supplier, hardware supplier) with no
  capability or pricing consequence. A supplier may carry more than one
  category (owner-confirmed many-to-many).
- **Scope:** new `SupplierCategory` + `VendorSupplierCategory` join model and
  additive migration `20260911150000_add_supplier_category` (deployed to the
  rebuild-only kantor database via `prisma migrate deploy`); service CRUD with
  the same duplicate/soft-delete rename, reference, audit, and shared
  deletion-request/direct-delete behavior as Supplier Type; vendor create/edit
  `supplierCategoryIds` passthrough with atomic join maintenance; a
  **Supplier categories** tab in Settings → Master Data; and the Supplier
  directory gaining a creatable category multi-picker (type a name and it is
  created inline when the actor holds `masterdata.dictionary.manage`), table
  badges, and a category filter.
- **Needs:** A real browser walkthrough of Settings → Master Data →
  Supplier categories (create, render, edit, archive, restore, request
  deletion, and `masterdata.deletion.approve` direct delete), plus the
  Supplier directory flow (assign categories on create and edit — including
  typing a new name and confirming it is created inline and added — save,
  badges in the table, category filter, fallback read for non-managers) and
  the duplicate-code guard on create.
- **Status:** Ready for review, not yet verified.

## BQ

### BQ-F1 through BQ-F5 — inline editing, all three L3 sources, live totals

- **Observed:** Implemented as of R4.56 (`eadd693`) per the owner decisions
  locked 2026-09-03 in [`apps/bq/bq-contract.md`](apps/bq/bq-contract.md):
  inline editing for every value at every level (this is what activated
  `InlineEdit` in the UI Engine out of its deferred registry), and all three L3
  sources including Master Data import (BQ-F4). Totals stay live without
  client-side arithmetic — every mutation returns the server-recomputed
  `BqProjectDetail` and the client swaps state; each L1 is computed
  independently so one unpriced item does not blank the document.
- **Needs:** A real browser walkthrough (add/edit/import at every level,
  confirm totals recompute correctly, confirm one unpriced item doesn't blank
  the document) and at least one integration test. No `InlineEdit` interaction
  test exists yet — only markup and source-contract assertions.
- **Not blocking review, already tracked in `roadmap.md`:** no reorder for
  Sections/L1/L2/L3 inside a project; import picker filters client-side and
  caps at 80 rows with no paging; no unit-conversion helper for
  `purchase_to_base_factor`.
- **Status:** Ready for review, not yet verified.

## StudioFlow

No item currently ready for review beyond what the R7.55 audit already
reconciled — that audit read code against
[`apps/studioflow/studioflow-project-contract.md`](apps/studioflow/studioflow-project-contract.md)
and either fixed what it found immediately or opened it as a dated defect in
`knownbug.md` (KB-012…KB-019). Nothing from that pass is sitting in an
unverified middle state.

## Rules

- An item belongs here only when code, schema, and/or tests actually exist for
  it — a roadmap idea with no implementation stays in `roadmap.md`.
- Don't claim something "works" because a table exists or a component was
  imported — see the minimum product bar in this directory's `README.md`.
- Closing an item here requires the same evidence closing a roadmap item does:
  end-to-end verification, not a code read.
