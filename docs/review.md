# Ready for Review

Status: active verification ledger, reconciled through R8.71 on 2026-09-15.
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

### F-C / PF-4+PF-5 — Settings, Appearance, and UI Engine (closed R8.56)

- **Observed:** R8.53 implemented the F-C Foundation outcome on 2026-09-14:
  typed global `PlatformTheme` on the `PlatformGeneralSettings` singleton (sole
  approved value `"light"`), additive migration
  `20260914090000_platform_appearance_theme` (SQL CHECK constraint), General
  Settings page split into General and Appearance sections, and `SettingsShell`
  applied with a boundary-explicit navigation enforcing the D-SF-02 settings
  ownership split. No app-workflow behavior, StudioFlow feature, or destructive
  migration was activated.
- **Automated checks:** typecheck, lint, boundaries, legacy-runtime, 349/349
  tests (settings integration suite and SQL CHECK constraint test), additive
  migration deployed to all rebuild-only databases, and production build all
  passed.
- **Reviewer acceptance (R8.56):** Passed in the approved local kantor fixture.
  The authorized account reached `/settings/general` and its Appearance
  section; after sign-out, the same protected route redirected to `/login`.
  Save reported no pending changes and a reload retained the sole canonical,
  disabled `Light` Theme value. `SettingsShell` rendered correctly at desktop
  width and 375 px. Master Data, BQ, and StudioFlow each opened their normal
  entry page with their expected navigation and no visual or permission
  regression observed.
- **Status:** Closed. F-C is accepted; F-D is now the active Foundation slice.

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

## StudioFlow

### SF-R1 — Legacy project backbone (R8.71)

- **Built:** archive cutover of the rebuild StudioFlow, new `studioflow`
  schema (migration `20260915100000_sf_r1_legacy_rework_cutover`), modular
  services (projects, phases, tasks, today), Today, Projects, Clients, project
  workspace (overview, five phase pages, history), Studio Settings, temporary
  legacy redirects, people directory, `ContextNavLink`.
- **Verified in the cloud workspace (owner-approved lane change):** 354/354
  tests including 12 new StudioFlow integration tests on a disposable
  PostgreSQL 16; typecheck, lint, boundaries, legacy-runtime, production build
  (Google Fonts stubbed only for that sandbox build); Playwright smoke on the
  production build at 1440 px and 375 px: login, empty Today, create project
  with new client, general to-do, blocked internal submit, tick and submit,
  feedback → send back → v1.1, history, Today, projects, clients, settings,
  platform settings link, Master Data/BQ pages, drafter cannot create
  projects, signed-out and legacy `/projects` redirects — zero console errors.
- **Deferred to owner acceptance (end of wave 1):** the same walk on the
  kantor machine and data, client approval → locked phase, parallel Layout/3D/CD,
  skip/reopen/admin reset dialogs, archive/restore, saved Today filters,
  checklist labels/subtasks/move up-down, and a check of the migration with
  `npx prisma migrate deploy` plus `npx prisma migrate diff` (the cloud
  sandbox could not download Prisma's schema engine, so migration SQL was
  applied with `psql` and proven by the integration suite, not by Prisma's
  diff).

### SF-R2 — MOM (R8.72)

- **Built:** MOM tables (migration `20260915120000_sf_r2_mom`), `mom`
  service, project MOM list/editor, shell-less print view, UI Engine
  `DocumentSheet`/`DocumentBlock`/`PrintButton`, `ImageWorkspace` aspect and
  JPEG output.
- **Verified in the cloud workspace:** 360/360 tests (4 MOM integration
  tests: legacy defaults and header, section/note order and the one-note rule,
  two-photo limit with slot shifting, swap and storage cleanup, permission /
  scope / archive rules with no orphan objects); production-build Playwright
  smoke covering create, header, notes, photo crop/upload, text-only section,
  print + A4 PDF, 375 px, drafter read-only, and delete — zero console errors.
- **Deferred to owner acceptance (end of wave 1):** a real site-visit MOM on
  kantor with phone photos, annotation marks, printing to PDF, and
  `prisma migrate deploy/diff` for the new migration.
