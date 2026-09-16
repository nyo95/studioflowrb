# Ready for Review

Status: active verification ledger, reconciled through R8.81 on 2026-09-16.
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
- **R8.80 code review:** The old note that F5 still needed implementation is
  stale. BQ exposes `requestPromotion`, `listPromotionRequests`,
  `approvePromotion`, and `rejectPromotion` through the runtime/public command
  boundary; Master Data approval consumes that command boundary rather than
  importing BQ internals. R8.80 adds an integration test for the promotion
  state machine and Master Data approval grant.
- **R8.80 calculator review:** The calculator already exists and is not a
  roadmap gap. `calc-expression` parses decimal expressions with exact shared
  decimal utilities and does not evaluate arbitrary JavaScript.
- **R8.80 source-picker debt correction:** BQ no longer asks Master Data for
  all work prices before filtering. Master Data's public work-price read now
  accepts backward-compatible `search` and `limit` filters, and BQ uses those
  filters from its source picker action.
- **Needs:** A real browser walkthrough (add/edit/import at every level,
  confirm totals recompute correctly, confirm one unpriced item doesn't blank
  the document, confirm calculator input from inline numeric cells, and confirm
  promotion status/review controls in BQ Library/Master Data). No `InlineEdit`
  browser interaction evidence is recorded yet.
- **Not blocking review, already tracked in `roadmap.md`:** no reorder for
  Sections/L1/L2/L3 inside a project; no unit-conversion helper for
  `purchase_to_base_factor`.
- **Status:** Ready for review, not yet verified.

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
- **Status: PASS — SF-RF browser acceptance (R8.75, 2026-09-15).** Owner
  walked the kantor machine with real data at 1440 px and 375 px: Today
  (projects grouped, filters, saved filter views, quick-add with due date
  and assignee, show done), Projects list and detail, phase workflow
  (checklist subtasks, labels, move up, to-do defer, feedback badge), Clients
  (list, detail, edit, archive blocked while running project). MOM "Plain"
  note with no number approved. Corrections R8.74 verified.

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
- **Status: PASS — SF-RF browser acceptance (R8.75, 2026-09-15).** MOM list,
  editor, photo upload, and print flow walked on kantor. Owner decision locked:
  "Plain" note type shows no number and does not advance numbering (approved).
  Google Drive activation and stored-file retention policy deferred (see KB-002
  and Platform decision gates in `roadmap.md`).

### SF-R3 — Product Schedule (R8.73)

- **Built:** per-project Product Schedule tables (migration
  `20260915150000_sf_r3_schedule`), `schedule` service, project Schedule page,
  StudioFlow settings controls for prefixes/default categories/template items,
  typed snapshots, option finalization, cross-project reuse search, legacy CSV
  import, and Master Data Brand read through the public port.
- **Verified on the kantor rebuild DB:** 366/366 tests including 4 Product
  Schedule integration tests and 2 schedule rule tests; typecheck, lint,
  production build, boundary fixtures, legacy-runtime fixtures,
  `prisma migrate deploy` on rebuild test and kantor DBs, and clean Prisma
  migration diff against the rebuild shadow DB.
- **Status: PASS — SF-RF browser acceptance (R8.75, 2026-09-15).** Schedule
  page walked on kantor at desktop and 375 px: entries, options, finalization,
  template application, settings, drafter read-only, archived-project
  read-only. Corrections R8.74 (option labels, Google Sheets import, seeding
  on new projects, Schedule UI) verified.

### Review corrections (R8.74)

- Pre-acceptance code review of SF-R1…SF-R3 fixed reopen/start rules,
  former-assignee edits, archived-client project edits, carried-forward
  feedback, template sync on locked phases, overlapping command state, MOM
  photo size, schedule option labels, the Google Sheets import, schedule
  seeding on new projects, and the Schedule UI (see CHANGELOG R8.74).
- Verified in the cloud workspace: 372/372 tests, typecheck, lint, boundary
  checks, production build, and a production-build Playwright smoke of the
  Schedule flow with zero console errors. Local checks and the SF-RF browser
  pass remain with the local executor.

### Owner review corrections — Schedule photos and template settings (R8.81)

- **Built:** option photos (add/change/remove, 4:5 crop, thumbnails in the
  schedule list and item panel), reference-counted object cleanup, template
  item edit, "Save as template item" from a schedule row, "Template settings"
  link on the schedule page, and table layout for the Product Schedule
  settings (KB-032). Contract §11.5 and §11.7.
- **Verified (rumah, agent VM):** typecheck, lint, boundary and legacy-runtime
  checks, and the non-database unit suites passed. Two new Product Schedule
  integration tests were added but **not run** — the rebuild test database is
  not reachable from the agent VM.
- **To check:** `npm test` on a machine with the rebuild test DB; browser walk
  of the schedule page (upload/replace/remove photo, drafter read-only,
  archived read-only) and `/studioflow/settings#product-schedule` at desktop
  and 840 px.

### Wave 1 parity gate

- **Status: PASS — SF-RF accepted in R8.75 (2026-09-15).** All SF-R1–SF-R3
  features walked at desktop (1440 px) and 375 px with the owner account
  (berkah.rad@gmail.com) and drafter account. Temporary legacy redirects
  removed. Owner decisions locked in this pass: MOM "Plain" note approved
  as-is; phase accent palette approved for SF-R4 (R8.76); stored-file
  retention and Google Drive activation deferred. SF-R1–SF-RF marked done in
  `roadmap.md`.

### Round 3 design system pass (R8.83)

- **Built:** `--ui-radius-pill` → 3 px, `--ui-surface-muted` → #edece9.
  Avatar and Switch preserved circular/capsule shape. Empty-state icon ring,
  and circular "+" icon badges in creatable-search / multi-select set to
  `rounded-full` explicitly. Legacy files status spans updated to
  `rounded-[3px]`. Tab underline and left-bar nav indicator confirmed already
  in place in `templates.tsx` / `shells.tsx` (no edit required).
- **Verified (agent VM):** `tsc --noEmit` clean. No migration, no new
  dependencies.
- **To check:** Browser walk of any page with Badge, FilterChip, Avatar,
  Switch, multi-select tags, empty-state panel, and the sidebar at desktop
  and 840 px — confirm sharper chip edges, darker sidebar, circular avatars.

### SF-R4 phase accent palette (R8.84)

- **Built:** five phase accent CSS tokens, StudioFlow `phaseAccentDotClass`
  helper, accent-aware `PipelineStrip` markers, phase-color project rail dots,
  and Today task phase markers.
- **Verified (rumah, agent VM):** `npm test` (391 tests), typecheck, lint,
  boundary check, legacy-runtime check, and production build passed. No
  migration, no new dependencies.
- **To check:** Browser walk of StudioFlow project overview, project rail, and
  Today at desktop and 840 px — confirm phase colors are visible but restrained
  and that status remains readable without relying on color alone.
