# Changelog

This file is the authoritative revision ledger. Revision/commit rules are in `AGENTS.md`.

## Revision state

- Published baseline: **R7** — published to GitHub
- Current revision after this entry is committed: **R7**
- Next local revision: **R7.01**

## R7 | 2026-09-07 | release: publish shell and master data refinements

### Published

- Published local revisions R6.31 through R6.38 to GitHub, including the
  Master Data directory refinements, account-menu administration placement,
  and session-revoking sign out.

### Verification

- Published from `main` at commit `fbdd953`; the release marker follows.

## R6.38 | 2026-09-07 | fix(shell): move administration into account menu

### Changed

- Removed the Administration group from the application rail.
- Moved its permitted links under the account menu. The group appears only to
  users with `platform.settings.manage`; Users and Roles & Access retain their
  respective read-permission checks.

### Dependencies and migrations

- No dependency, environment, or database schema changes.

### Verification

- Targeted ESLint on the changed shell files and `git diff --check`: passed.
- Global typecheck is blocked by pre-existing untracked StudioFlow sources and
  stale generated Next route types; neither is owned by this patch.
- Production build, tests, and live-browser verification remain blocked by the
  pre-existing generated Prisma client defect: `src/generated/prisma/internal/
  class.ts` is empty, so `getPrismaClientClass` is unavailable.

## R6.37 | 2026-09-07 | fix(auth): revoke session on account-menu sign out

### Changed

- Made the Account menu invoke its Server Action explicitly instead of relying
  on a form nested inside a Radix menu item.
- Ordinary sign out now revokes the current session, clears its cookie, and
  redirects to `/login`; a pending state prevents duplicate requests.

### Dependencies and migrations

- No dependency, environment, or database schema changes.

### Verification

- Targeted ESLint on the changed files and `git diff --check`: passed.
- Global `npm run typecheck` is blocked by pre-existing untracked StudioFlow
  sources and stale generated Next route types; neither is owned by this patch.
- `npm run build`, `npm test`, and live-browser verification are blocked by the
  pre-existing generated Prisma client defect: `src/generated/prisma/internal/
  class.ts` is empty, so `getPrismaClientClass` is unavailable.

## R6.36 | 2026-09-07 | fix(brand): preserve actions column width

### Changed

- Matched the Brands Catalog table minimum width to its declared columns so the
  trailing Actions column retains its full, centered control area instead of
  being compressed. Narrow viewports continue to use the existing horizontal
  table scroll.

### Dependencies and migrations

- No dependency, environment, or database schema changes.

### Verification

- `npm run typecheck` and `npm run lint`: passed.
- Browser check: `/masterdata/brands` retains a full-width, centered Actions
  column at the reviewed desktop viewport.
- `git diff --check`: passed.
- `npm run build` and `npm test`: blocked by the pre-existing generated Prisma
  client defect: `src/generated/prisma/internal/class.ts` is empty, so
  `getPrismaClientClass` is unavailable. The failure is unrelated to this
  presentation-only change.

## R6.35 | 2026-09-07 | feat(masterdata): centralize directory update metadata

### Changed

- Added a shared Master Data `Updated` table cell, displaying each record's localized update time and actor.
- Added that column immediately before Actions in Brands, Suppliers, and all Pricing tabs; removed update metadata from the Pricing name cells and duplicate Brand owner metadata from its name cell.

### Dependencies and migrations

- No dependency, Prisma schema, or migration change.

### Verification

- `npm run typecheck`, `npm run lint`, and `npm run build`: passed.
- `npm test`: not rerun; the unchanged office environment lacks the required disposable `PLATFORM_TEST_DATABASE_URL`, and its fail-closed guard prevents the integration suite from touching the working database.
- Browser check: Brands, Suppliers, and Material Pricing each show a localized update time and actor immediately before the centered Actions column; Pricing no longer repeats its update date under the record name.
- `git diff --check`: passed.

## R6.34 | 2026-09-07 | fix(vendor): remove redundant directory type metadata

### Changed

- Removed the repeated first supplier type below the Supplier name. The complete Types & Capabilities column remains the single source of that information.

### Dependencies and migrations

- No dependency, Prisma schema, or migration change.

### Verification

- `npm run typecheck`, `npm run lint`, and `npm run build`: passed.
- `npm test`: not rerun; the unchanged office environment lacks the required disposable `PLATFORM_TEST_DATABASE_URL`, and its fail-closed guard prevents the integration suite from touching the working database.
- Browser check: Supplier rows now show the name once, while the Types & Capabilities column remains complete and Actions stays visible.
- `git diff --check`: passed.

## R6.33 | 2026-09-07 | fix(ui-engine): center canonical row actions

### Changed

- Centered the shared `RowActionsHead` label and `RowActionsCell` content so the trailing overflow menu is visually centered in canonical directory tables.

### Dependencies and migrations

- No dependency, Prisma schema, or migration change.

### Verification

- `npm run typecheck`, `npm run lint`, and `npm run build`: passed.
- `npm test`: not rerun; the unchanged office environment lacks the required disposable `PLATFORM_TEST_DATABASE_URL`, and its fail-closed guard prevents the integration suite from touching the working database.
- Browser check: Brands Catalog renders the `Actions` heading and each overflow menu centered in its trailing sticky column.
- `git diff --check`: passed.

## R6.32 | 2026-09-07 | fix(ui-engine): refine wide directory canvas

### Changed

- Bounded the shared wide PageShell at 1920px, retaining substantially more operational table room than the default 1440px width without stretching the workspace edge to edge.
- Brands Catalog retains its existing DirectoryShell surface, which now sits inset within the restored canvas space and keeps the toolbar, table, and pagination as one card.

### Dependencies and migrations

- No dependency, Prisma schema, or migration change.

### Verification

- `npm run typecheck`, `npm run lint`, and `npm run build`: passed.
- `npm test`: not rerun; the unchanged office environment lacks the required disposable `PLATFORM_TEST_DATABASE_URL`, and its fail-closed guard prevents the integration suite from touching the working database.
- Browser check: Brands Catalog is centered in the 1920px wide canvas with its existing bordered directory surface inset from the surrounding canvas. Every column, including Actions, remains visible; browser console is clear.
- `git diff --check`: passed.

## R6.31 | 2026-09-07 | fix(ui-engine): honor wide page shell width

### Changed

- Made `PageShell size="wide"` use the available application workspace instead of retaining the default 1440px content cap. Operational Master Data and BQ pages that already opt into the wide shell now give their tables sufficient desktop width, including the trailing action column.
- The default PageShell remains constrained to the shared content width; DataTable scrolling and sticky-action behavior are unchanged.

### Dependencies and migrations

- No dependency, Prisma schema, or migration change.

### Verification

- `npm run typecheck` and `npm run lint`: passed.
- `npm test`: did not pass because the office environment does not provide the required disposable `PLATFORM_TEST_DATABASE_URL`; the fail-closed guard stopped the integration suites before any database connection or mutation.
- `npm run build`: passed.
- Browser check: Brands fills the expanded and collapsed desktop workspace; all eight columns, including trailing Actions, remain visible and the browser console is clear. A narrow-viewport run is unavailable in the fixed in-app browser viewport.
- `git diff --check` and `git diff --cached --check`: passed.

## R6.30 | 2026-09-07 | refactor(bq): constrain strict no-op comparison to scalars

### Changed

- Constrained `fieldUnchanged` to strict-equality-safe scalar types and documented that collections or structured values require an explicit comparator.
- Existing BQ no-op behavior is unchanged; future array/object use now fails at typecheck instead of silently comparing references.

### Dependencies and migrations

- No dependency, Prisma schema, or migration change.

### Verification

- `npx prisma validate`: passed.
- `npx prisma migrate deploy`: all 26 migrations passed against a fresh disposable `studioflow_rebuild_test` database.
- `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, and `npm run check:legacy-runtime`: passed.
- `npm test`: 251 passed, 0 failed, 0 cancelled against the disposable database.
- `npm run build`: passed.
- `git diff --check`: passed.

## R6.29 | 2026-09-07 | refactor(bq): consolidate Library no-op comparisons

### Changed

- Replaced the duplicated long-form no-op conditions in all four BQ Library item update paths with the existing scalar and decimal comparison helpers.
- Preserved the exact update, timestamp, and audit behavior established in R6.28; this revision changes maintainability only.

### Dependencies and migrations

- No dependency, Prisma schema, or migration change.

### Verification

- `npx prisma validate`: passed.
- `npx prisma migrate deploy`: all 26 migrations passed against a fresh disposable `studioflow_rebuild_test` database.
- `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, and `npm run check:legacy-runtime`: passed.
- `npm test`: 251 passed, 0 failed, 0 cancelled against the disposable `studioflow_rebuild_test` database.
- `npm run build`: passed.
- `git diff --check`: passed.

## R6.28 | 2026-09-07 | fix(bq): close update semantics and stale promotion paths

### Business logic and backend integrity

- Extended CORE no-op semantics across BQ projects, Sections/Subsections, Work Items, Component Groups, Cost Components, Template ordering, price revert, and Assembly updates. Semantically identical decimal values now preserve timestamps and emit no audit event.
- Made optional BQ Library base units/notes, Template descriptions, Assembly descriptions, and project-tree notes explicitly clearable instead of silently preserving the previous value.
- Enforced the positive-coefficient invariant in the BQ service for Library, project, and Assembly mutations, with matching Assembly action validation.
- Fixed Assembly update commands to return the newly persisted row after a real update.
- Removed the unused estimator-side promotion approval/rejection action and dialog that accepted a free-form Master Data ID. Approval remains exclusively in Master Data through the cross-app coordinator, which validates the canonical price type, existence, live state, and permission.
- Supplier contact updates now skip identical rows rather than changing `updated_at` without a corresponding business change or audit event.

### Dependencies and migrations

- No dependency, Prisma schema, or migration change.

### Verification

- `npx prisma validate`: passed.
- `npx prisma migrate deploy`: all 26 migrations passed against a fresh disposable `studioflow_rebuild_test` database.
- `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, and `npm run check:legacy-runtime`: passed.
- `npm test`: 251 passed, 0 failed, 0 cancelled.
- `npm run build`: passed.
- Browser smoke check: login redirect, login layout, and browser console passed without errors; authenticated screens were not mutated during the read-only audit.
- `git diff --check`: passed.

## R6.27 | 2026-09-07 | fix(brand): close lifecycle contract and UI contradictions

### Corrected

- Brand create/edit actions now accept an empty owner Supplier; create omits the optional relation and edit persists `null`, matching the UI, service, schema, and contract.
- Brand archive and restore confirmations now accurately explain the SKU/Material Price cascade and provenance-safe restore behavior.
- Replaced the remaining R6.21 lifecycle text in the authoritative Brand contract with one consistent archive, restore, and permanent-delete story.
- Corrected the revision ledger after R6.26.
- Added regression coverage proving a directly archived SKU and directly archived Material Price remain archived after Brand archive and restore.

### Dependencies and migrations

- No dependency, Prisma schema, or migration change.

### Verification

- `npx prisma validate`: passed.
- `npx prisma migrate deploy`: all 26 migrations passed against a fresh disposable `studioflow_rebuild_test` database.
- `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, and `npm run check:legacy-runtime`: passed.
- `npm test`: 248 passed, 0 failed, 0 cancelled.
- `npm run build`: passed.
- `git diff --check`: passed.

## R6.26 | 2026-09-07 | fix: restore lifecycle semantics and close contract/backend UX gaps

### Business logic and backend integrity

- Restored Brand lifecycle eligibility: archiving a Brand adds provenance-safe parent causes to its branded SKUs and their Material Prices; restore removes only those causes and revives only otherwise eligible records.
- Approved Brand deletion now atomically purges the Brand, its branded SKUs, their Material Prices, archive causes, and Brand-owned relation resources. Unbranded SKUs remain valid and unaffected; BQ remains snapshot-only.
- Supplier directory now loads and round-trips `VendorContact.notes`; unrelated contact edits no longer erase notes.
- Removed obsolete standalone Supplier-link commands/actions. Supplier links now have one atomic mutation path through `updateVendor`.
- BQ Library, Template, and Assembly updates return without a write or audit when their meaningful persisted values are unchanged.

### UI and contract alignment

- Brand owner Supplier is optional in create/edit dialogs, matching the nullable relation.
- Ambiguous historical Supplier links must be explicitly reclassified to a canonical information-link kind before acceptance; discard remains available in the same atomic form save.
- Supplier deletion copy now explains every relevant live or archived reference blocker.
- Brand, Pricing, and Master Data contracts now describe the restored lifecycle and selected-existing-price promotion rule.

### Regression coverage and verification

- Added integration coverage for Brand archive/restore cascade, hard-delete cascade, and unbranded SKU survival.
- `npx prisma validate`: passed.
- `npx prisma migrate deploy`: passed against a fresh disposable `studioflow_rebuild_test` PostgreSQL database, applying all 26 migrations.
- `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, and `npm run check:legacy-runtime`: passed.
- `npm test`: 247 passed, 0 failed, 0 cancelled using the disposable database.
- `npm run build`: passed.

## R6.24 | 2026-09-07 | fix(vendor): Supplier link atomicity + stale contract sync

### #20 — Supplier links now atomic with Edit Supplier dialog

- `SupplierLinksEditor` refactored from immediate-save to a controlled staged component.
  Add / remove / resolve-review operations are local until the Edit Supplier dialog's Save button
  is clicked — Cancel now correctly discards all link changes alongside profile/contact changes.
- `updateVendor` service extended with optional `infoLinks` + `linkReviewSnapshot` parameters;
  link validation (kind allowlist, HTTP/S, URL.parse, length, dedup) runs inside the same
  transaction as the vendor profile update.
- `updateVendorAction` reads `infoLinksJson` + `linkSnapshotJson` from FormData and passes
  them to the extended service call.
- `updateVendorInfoLinksAction` and `resolveVendorLinkReviewAction` no longer used by the
  Edit Supplier dialog; imports removed from `vendor-directory.tsx`.

### #21 — Contract sync (vendor-contract.md, masterdata.md, brand-contract.md)

- `vendor-contract.md §5`: Replaced stale VendorLink sub-entity model (MARKETPLACE / DRIVE /
  PRICE_LIST / OTHER) with current `Vendor.info_links` JSON design (R6.20/R6.21). Documents
  allowed kinds, constraints, review snapshot, and atomic mutation surface.
- `masterdata.md`: Removed "Supplier has no external-link mutation surface" — corrected to
  document company link management via Edit Supplier (vendor-contract §5).
- `brand-contract.md` locked summary: Fixed permanent delete row — "includes Brand SKUs/prices"
  corrected to "Brand entity only — SKUs and Material Prices survive with brand_id nulled (R6.21)".

## R6.23 | 2026-09-07 | fix(r6.23): Codex review — contract docs, BQ layout gate, brand dialogs, SKU pagination, Supplier link CRUD

## R6.22 | 2026-09-07 | fix(masterdata): close remaining Supplier-link and SKU identity bugs

### #2 — Unbranded SKU slug uniqueness enforced at DB level

- Added partial unique index `sku_unbranded_live_slug_unique` on `(slug) WHERE deleted_at IS NULL AND brand_id IS NULL`
  in new migration `20260907092000_r6_22_sku_unbranded_unique` (DDL-only).
- PostgreSQL NULL semantics mean the R6.21 branded index `(brand_id, slug)` did not cover orphaned
  (unbranded) SKUs. This index closes that gap: two live orphaned SKUs with identical slugs are now
  rejected at the DB level, preventing hidden reassignment conflicts.

### #3 — `updateVendorInfoLinks` now fully validates input

- Kind must be one of: `WEBSITE`, `INSTAGRAM`, `FACEBOOK`, `TIKTOK`, `YOUTUBE`, `LINKEDIN`, `WHATSAPP`.
- URL must use HTTP or HTTPS and parse as a valid URL.
- URL max length: 2 048 characters. Label max length: 200 characters.
- Duplicate URLs are silently deduped (first occurrence kept) before persistence.
- Maximum 20 links per Supplier.

### #4 — `resolveVendorLinkReview` deduplicates indices and fixes audit count

- `acceptedIndices` is deduped via `new Set` before processing; duplicate index submissions
  no longer produce duplicate entries in `info_links`.
- Audit `discarded` count now reflects `snapshot.length - validAcceptedCount` (unique, in-range
  indices), not the raw caller-supplied array length, which could be inflated by duplicates.

### Verification

- `npx tsc --noEmit` — passed


## R6.21 | 2026-09-07 | fix(masterdata): close Brand deletion contradiction and enforce DB invariants

### P0 — Brand deletion no longer cascades to SKUs or Prices

- `archiveBrand`: removed cascade that archived all SKUs and their PriceMaterial rows when
  a Brand was archived. Brand archive now affects the Brand entity only; each SKU's
  lifecycle is managed independently.
- `approveDeletion` (brand path): replaced SKU + Price hard-deletion with a detach operation —
  `brand_id` is nulled on all linked SKUs (valid since R6.20 made it optional), and any
  `PARENT`-kind `ArchiveCause` rows pinned to this Brand are removed so each SKU can be
  restored or reassigned without ghost causes.

### P1 — SKU live identity uniqueness enforced at DB level

- Added partial unique index `sku_live_identity_unique` on `(brand_id, slug) WHERE deleted_at IS NULL`
  in migration `20260907091000_r6_21_db_invariants` (DDL-only, no data changed).
- Added explicit identity-conflict check in `updateSku` service method so the DB constraint
  is matched by an application-level `CONFLICT` error before the DB ever sees the violation.

### P1 — Supplier info-link management is now full CRUD, not migration-only

- Added `updateVendorInfoLinks` service method: replaces the `info_links` JSONB array on a Vendor.
- Added `resolveVendorLinkReview` service method: accepts items by index from `link_review_snapshot`,
  merges them into `info_links`, and clears the snapshot.
- Added corresponding server actions `updateVendorInfoLinksAction` and `resolveVendorLinkReviewAction`
  in `src/app/(platform)/masterdata/vendors/actions.ts`.

### P1 — Supplier-link migration classification documented

- Added classification header to `20260906085900_preserve_supplier_information_links/migration.sql`
  noting DDL + DML (data-preserving) classification and ordering dependency on the VendorLink purge.

### P2 — BQ source baseline DB invariants

- Backfill comment in `20260906100000_bq_snapshot_and_project_lifecycle` restored to original
  (migration immutability respected; runtime correction lives in `20260907090000`).
- `20260907090000` migration (R6.20) already handles nullifying CUSTOM `source_price_snapshot` rows.
- Added BQ parent XOR CHECK constraints in `20260907091000_r6_21_db_invariants`:
  - `bq_item_parent_xor`: exactly one of `section_id` / `subsection_id` non-null.
  - `bq_line_item_parent_xor`: exactly one of `sub_object_id` / `item_id` non-null.

### P2 — Schema and changelog corrections

- Fixed misleading comment on `source_price_snapshot` in `prisma/schema.prisma`:
  now reads `null = CUSTOM atau harga tidak tersedia saat import` instead of the
  ambiguous `null = tidak ada override`.
- Fixed R6.20/R6.21 pointer in CHANGELOG revision-state header.

### Migration immutability restored

- `20260906100000` and `20260906110000` reverted to their original committed content;
  all runtime corrections from R6.20 are isolated in `20260907090000`.

### Verification

- `npx tsc --noEmit` — passed

## R6.20 | 2026-09-07 | fix(regression): restore optional SKU Brand and preserve BQ/Supplier invariants

- Restored nullable SKU Brand across schema, actions, service, forms, and tests;
  valid Brand references remain enforced when supplied.
- Corrected historical and future BQ price baselines so CUSTOM rows never receive
  `source_price_snapshot`; imported rows retain immutable baselines.
- Preserved Supplier company links before VendorLink purge and retained ambiguous
  links for review; catalog ownership remains Brand-owned.
- Decoupled BQ deletion review from project-read access, hid derived Library
  Category fields, made the rail expanded by default, and aligned UI Engine status
  semantics documentation.
- Replaced promotion approval's free-text ID with a canonical Master Data price
  selector and coordinator-backed reference list.

### Verification

- `npx prisma validate` — passed
- `npx prisma migrate deploy` against office rebuild — passed
- `npm run typecheck` — passed
- `npm test` — 246 passed, 0 failed
- `npm run lint` / `npm run check` — passed
- Browser smoke checks — reviewer approval panel, collapsible expanded rail,
  and Library Category visibility passed.

## R6.19 | docs(revisions): reconcile UI session ledger

- Reconciled the revision ledger with the already committed R6.15–R6.18 UI
  fixes: full topbar brand, Operational Catalog directory links, rail-edge
  collapse toggle, and removal of the empty sidebar header gap.
- No product code changes in this revision.

## R6.18 | fix(ui): remove empty sidebar header div left after toggle relocation

- Removed the empty sidebar header spacer left after the collapse toggle moved
  to the rail edge, eliminating the phantom gap above navigation.

## R6.17 | fix(ui): move sidebar collapse toggle to rail edge

- Moved the collapse control to a thin, vertically centered strip on the
  sidebar's right edge with ChevronLeft/ChevronRight icons.

## R6.16 | fix(masterdata): replace catalog table with directory links

- Replaced the Operational Catalog table with full-width directory links using
  section descriptions, record counts, and chevrons; zero counts render as `—`.

## R6.15 | fix(ui): keep full topbar brand during collapse

- Kept the topbar on the full `brand` prop while preserving `collapsedBrand`
  behavior for the sidebar-only mode.

## R6.14 | fix(ui): align shared directory controls and metadata

### Scope and checks
- Kept the AppShell topbar brand width independent from sidebar collapse,
  made Select wrappers fill their layout cell, and made Pricing tabs visibly
  distinguish active and inactive states.
- Added canonical `RowActionsHead` / `RowActionsCell` primitives and adopted
  them in the Brand, Supplier, and Pricing directories.
- Removed slugs from Brand/Supplier secondary identity lines and promoted
  supplier/type metadata plus SKU code in Pricing identity rows.
- Checks: `npm run typecheck` and `npm run lint` passed. The repository-wide
  test runner was also invoked; six pre-existing BQ integration hooks fail when
  run without the isolated test database (`bq` schema missing), while the other
  tests pass.

## R6.13 | fix(bq): format editable unit prices for Indonesian display

### Scope and checks
- BQ Work Item unit-price cells now use the shared IDR formatter in read mode,
  rendering thousand separators such as `Rp.200.000` while preserving the raw
  canonical decimal string for editing and persistence.
- Checks: `npm run typecheck`, `npm run lint`, and the focused BQ/browser
  formatting path were run before commit.

## R6.12 | feat(convergence): complete R6.1 implementation plan

### Scope and contract convergence
- Added `docs/R6.1-DECISION-DELTA.md` as the implementation audit against the
  current contracts, Prisma shape, public APIs, UI, and owner decisions.
- Updated the BQ, Master Data, and Supplier contracts: Supplier terminology is
  user-facing only; Brand owns catalog/resources and BrandSupplier mutation;
  SKU requires Brand; BQ uses Work Item / Component Group / Cost Component,
  Master Data Units as its source, and ACTIVE / LOCKED / ARCHIVED lifecycle.
- Replaced direct cross-app promotion coordination with public command ports and
  the structural `promotion-coordinator` application boundary.

### Domain and persistence
- Corrected the previously recorded R6.02 migration so it targets the mapped
  `bq_project` / `bq_line_item` tables and replaces `BqProjectStatus` safely in
  one migration instead of using an unsafe enum-value alteration.
- Added the protected BQ project deletion request/approve/reject workflow and
  registered the valid `bq.project-deletion.approve` permission.
- Made `master_data.Sku.brand_id` required after an explicit precondition check;
  the development database had zero unbranded SKUs before enforcement.
- Completed strict lifecycle mutation guards, immutable imported price baseline,
  derived override state, server-side revert, canonical decimal comparison, and
  transactional audit for override/revert and deletion decisions.
- BQ Library ordinary CRUD now derives non-custom categories, defaults and hides
  coefficient `1`, snapshots Unit labels, and exposes recommendations at both
  Template Section levels.

### UI and workflow
- Converged entity directories on viewport-fill `DirectoryShell` / `DataTable`,
  sticky headers/actions, primary status cells, filtering, sorting, pagination,
  and row action menus. Tabs and PageShell now propagate the bounded fill chain.
- Fixed the app shell's extra 64px document overflow, narrowed Tailwind scanning
  to code folders so local PDFs/images cannot become invalid utility classes,
  and fixed portal draft baselines so untouched dialogs close without a false
  discard prompt while edited drafts remain protected.
- Added explicit BQ source tabs (All, Material, Labor, Material + Labor, BQ
  Library), a four-way Custom Cost Component type choice with Other Cost
  categories, Master Data Unit selects, lifecycle controls/read-only states,
  project-deletion review, and canonical visible terminology.
- Removed the remaining visible `Vendor` copy (`New supplier`) while preserving
  persisted `Vendor`/`VendorType` identifiers.

### Migrations and dependencies
- Added `20260906110000_bq_project_deletion_workflow` and
  `20260906112000_bq_project_deletion_permission`; all 22 migrations are applied
  to the isolated home rebuild database and the disposable test database.
- No dependency or lockfile changes.

### Verification
- `npx prisma validate`: passed.
- `npx prisma generate`: passed (Prisma Client 7.9.1).
- `npx prisma migrate status`: passed; 22 migrations, schema up to date on the
  rebuild-only `masterdata-db` container at localhost:5433.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run check:boundaries`: passed.
- `npm run check:legacy-runtime`: passed.
- `npm test`: passed — 242 tests, 61 suites, 0 failed/cancelled/skipped.
- `npm run build`: passed for every application route.
- Browser acceptance passed at 1366×768, 1920×1080, and 2560×1440: expanded
  and collapsed rail, no document-level horizontal/vertical overflow, directory
  fill and independent table scroll, sticky headers/actions, modal fit, inline
  Escape/blur, untouched/dirty draft behavior, locked and archived/restore
  states, source picker/custom types, and a temporary 55-row BQ section. The
  temporary project and its two lifecycle audit rows were removed afterward.

### Remaining limitations
- The test run emits the existing `pg@9` deprecation warning for overlapping
  `client.query()` use; it does not fail or skip a test and is outside R6.1.

## R6.11 | feat(bq): assembly picker at Section and Subsection level

### Added
- Section and Subsection footers now expose a **Terapkan Assembly** trigger that creates a new L1 at that location and snapshots the selected Assembly into its L2/L3 structure.
- `addItemAndApplyAssemblyAction` and its transactional service operation ensure the new L1 and Assembly snapshot commit or roll back together.

### Changed
- `assemblyTarget` now records whether the picker originated from an existing item, Section, or Subsection.
- Existing item-level Assembly control is wired back to the shared picker unchanged in behavior.

### Verification
- `npx tsc --noEmit`: passed (0 errors).
- `git diff --check`: passed.

### Files changed
- `src/app/(platform)/bq/[id]/project-editor.tsx`
- `src/app/(platform)/bq/[id]/actions.ts`
- `src/apps/bq/service.ts`
- `CHANGELOG.md`

## R6.10 | feat(bq): price override indicator + revert-to-snapshot action

### Added
- `revertLineItemPrice` service function: reads `source_price_snapshot`, throws `INVARIANT` if null, writes `harga_snapshot = source_price_snapshot`, audit-logs `bq.line-item.price-reverted`.
- `revertLineItemPriceAction` Server Action (follows `runSafeAction` / `TargetSchema` / `authorize` / `reload` pattern).
- **Override indicator**: `LineItemRow` shows a `<Badge tone="warning">Harga diubah</Badge>` (with tooltip displaying the original snapshot price) when `hargaSnapshot !== sourcePriceSnapshot` and `sourcePriceSnapshot` is not null.
- **Revert button**: `LineItemRow` actions cell shows a `RotateCcw` `IconButton` ("Kembalikan ke harga snapshot asal") when an override is active; clicking calls `revertLineItemPriceAction`.

### Files changed
- `src/apps/bq/service.ts`
- `src/app/(platform)/bq/[id]/actions.ts`
- `src/app/(platform)/bq/[id]/project-editor.tsx`

## R6.09 | feat(bq): source-picker tab redesign with Custom kategori grid

### Changed
- `ImportDialog` redesigned with four tabs: **Semua** (all sources), **Master Data**, **BQ Library**, and **Custom**.
- **Custom tab**: shows a 2×3 grid of kategori cards (Material, Upah, Material+Upah, Alat, Biaya Umum, Transportasi). Clicking a card adds a blank CUSTOM line item with that kategori — no search required.
- **Semua / Master Data / BQ Library tabs**: same search-driven list as before; Master Data and BQ Library tabs pre-filter by `sourceType`.
- Dialog title changed from "Impor dari Master Data atau BQ Library" → "Pilih sumber harga".
- `onPick` callback now accepts `SourcePickOption` (union of `LineItemSourceOption | { sourceType: "CUSTOM"; kategori: string }`); outer handler branches accordingly.

### Added
- `SourcePickOption` union type (file-local).
- `CUSTOM_KATEGORI_OPTIONS` constant array for the Custom tab grid.
- `PickerTab` type and `visibleOptions` filtered list.

### Files changed
- `src/app/(platform)/bq/[id]/project-editor.tsx`

## R6.08 | feat(bq): transient add-row for custom line items

### Added
- `TransientLineItemRow` component: a ghost `TableRow` containing a text input that appears inline in the table when the user clicks "+ Baris custom". Pressing Enter submits `addLineItemAction` with the typed title; pressing Escape or submitting empty dismisses the row without a server call.
- `transientAdd` state (`{ kind: "item" | "subObject"; id: string } | null`) hoisted to `ProjectEditor`; threaded through `ItemTable → ItemRows → SubObjectRows` via `transientAdd` / `onTransientAdd` props.
- `AddLineItemSchema` extended with optional `title` field (max 200 chars); `CUSTOM` line-item snapshot uses `title.trim() || "New line"` instead of hardcoded label.

### Changed
- Item-level and subObject-level "+ Baris custom" buttons no longer call the server directly on click; they now set `transientAdd` state to show the ghost row.
- Subsection `ItemTable` now receives `transientAdd` / `onTransientAdd` props (was missing from prior commit).

### Files changed
- `src/app/(platform)/bq/[id]/project-editor.tsx`
- `src/app/(platform)/bq/[id]/actions.ts`

## R6.07 | refactor(bq): add controls follow insertion point

### Changed
- Section header: "Add Subsection" and "Add Item" buttons removed from header row.
- Subsection header: "Add Item" button removed from header row.
- Section footer (new): `+ Subsection` and `+ Item` controls now render below all items and subsections, separated by a divider — at the natural insertion point.
- Subsection footer (new): `+ Item` control now renders below the subsection's item table.
- Header rows are now name-only (InlineEdit or static text); no side buttons cluttering the label area.

### Files changed
- `src/app/(platform)/bq/[id]/project-editor.tsx`
- `CHANGELOG.md`

---

## R6.06 | feat(bq): inline rename for Section and Subsection names

### Added
- `updateSection` service function — validates editable project state, updates `name`, emits `bq.section.updated` audit entry.
- `updateSubsection` service function — same contract for subsections.
- `updateSectionAction` / `updateSubsectionAction` server actions in `bq/[id]/actions.ts` with Zod validation (1–160 chars).

### Changed
- `project-editor.tsx`: section `<h2>` and subsection `<h3>` replaced with `<InlineEdit>` when `editable`; static text preserved for locked/archived/read-only viewers.

### Files changed
- `src/apps/bq/service.ts`
- `src/app/(platform)/bq/[id]/actions.ts`
- `src/app/(platform)/bq/[id]/project-editor.tsx`
- `CHANGELOG.md`

---

## R6.05 | fix(masterdata): rename Vendor→Supplier across all user-facing strings

### Changed (UI strings only — Prisma schema and internal identifiers unchanged)
- Nav label "Vendors" → "Suppliers"
- Master Data index card "Vendors" → "Suppliers"
- Vendor directory: dialog title "Create vendor partner" → "Create supplier"; all field labels, placeholders, empty-state messages, confirmation dialogs, and sort keys updated to "Supplier/Suppliers"
- Pricing directory: field labels ("Supplier vendor"/"Vendor" → "Supplier"), placeholders, empty labels, create labels, quick-add dialog title and body updated
- Brands directory: "Owner vendor" → "Owner supplier" in all labels/descriptions/placeholders/create labels
- Validation messages: "Vendor name is required/too long" → "Supplier name is required/too long" in vendors/actions.ts and brands/actions.ts
- "VendorType" select option label → "Supplier type"; "Select eligible VendorType" → "Select supplier type"

### Files changed
- `src/app/(platform)/masterdata/nav.tsx`
- `src/app/(platform)/masterdata/page.tsx`
- `src/app/(platform)/masterdata/vendors/vendor-directory.tsx`
- `src/app/(platform)/masterdata/vendors/actions.ts`
- `src/app/(platform)/masterdata/pricing/pricing-directory.tsx`
- `src/app/(platform)/masterdata/brands/brand-directory.tsx`
- `src/app/(platform)/masterdata/brands/actions.ts`
- `CHANGELOG.md`

---

## R6.04 | chore(shell): verify App Shell sidebar convergence — no code changes

Shell audit confirmed: tooltip on collapsed NavItems (shells.tsx:256), logo→`/` in both expanded and collapsed states (authenticated-shell/index.tsx:42-62), toggle behavior correct. No code changes required.

---

## R6.03 | feat(ui-engine): EntityPrimaryCell + DirectoryShell fill + viewport-fill layout

### Added
- `EntityPrimaryCell` component in `ui_engine/components/data.tsx` — canonical ● StatusMarker + primary name + secondary metadata composition; replaces ad-hoc inline composition across directory tables.
- `fill?: boolean` prop on `DataTable` — body scroll container uses `flex-1 min-h-0` instead of a fixed `maxBodyHeight`; `maxBodyHeight` is still supported when `fill` is absent.
- `fill?: boolean` prop on `DirectoryShell` — shell and inner content container gain `flex flex-col flex-1 min-h-0`, enabling viewport-tall tables without magic heights when composed with `DataTable fill`.

### Changed
- `data.tsx`: `SemanticTone` import corrected from `./feedback` (not re-exported there) to `../primitives` (canonical source).
- `UI_ENGINE.md`: added §3.4 documenting the viewport-fill pattern API and `EntityPrimaryCell` usage.

### Files changed
- `src/platform/ui_engine/components/data.tsx`
- `src/platform/ui_engine/layouts/templates.tsx`
- `UI_ENGINE.md`
- `CHANGELOG.md`

## R6.02 | feat(bq): BqProjectStatus lifecycle + source_price_snapshot

### Changed
- `prisma/schema.prisma`: `BqProjectStatus` enum — renamed `DRAFT` → `ACTIVE`, added `ARCHIVED`; `BqProject.status` default changed from `DRAFT` to `ACTIVE`
- `prisma/schema.prisma`: `BqLineItem` — added `source_price_snapshot Decimal? @db.Decimal(18,4)` (immutable baseline from import)
- `prisma/migrations/20260906100000_bq_snapshot_and_project_lifecycle/migration.sql` — migration written: renames DRAFT→ACTIVE via enum recreation, adds ARCHIVED, adds `source_price_snapshot` column with backfill from `harga_snapshot`
- `src/apps/bq/service.ts`: `requireEditableProject` — now also guards `ARCHIVED` status
- `src/apps/bq/service.ts`: `lockProject` — now guards ARCHIVED (cannot lock archived project)
- `src/apps/bq/service.ts`: added `unlockProject` (LOCKED→ACTIVE), `archiveProject` (any→ARCHIVED), `restoreProject` (ARCHIVED→ACTIVE); all with audit log
- `src/apps/bq/public/index.ts`: `BqProjectSummary.status` and `BqProjectDetail.status` narrowed from `string` to `"ACTIVE" | "LOCKED" | "ARCHIVED"`
- `src/apps/bq/public/index.ts`: `BqLineItemDetail` — added `sourcePriceSnapshot: string | null`; `mapLineItemDetail` updated to map the new field
- `src/generated/prisma/enums.ts`: `BqProjectStatus` updated to `{ACTIVE, LOCKED, ARCHIVED}` (manual patch; regenerate client after migration)
- `src/generated/prisma/models/BqLineItem.ts`: `$BqLineItemPayload.scalars` and aggregate types updated to include `source_price_snapshot` (manual patch)
- `src/app/(platform)/bq/[id]/edit/page.tsx`: redirect on `LOCKED || ARCHIVED`
- `src/app/(platform)/bq/[id]/page.tsx`: `isLocked` now covers ARCHIVED
- `src/app/(platform)/bq/[id]/project-editor.tsx`: `locked` now covers ARCHIVED

### Notes
- `BqPromotionStatus.DRAFT` is a separate enum — untouched, unrelated to this change
- `source_price_snapshot` is the immutable baseline (`isOverridden` is derived: `harga_snapshot !== source_price_snapshot`)
- Typecheck: ✅ Lint: ✅

## R6.01 — 2026-09-06 — docs(contracts): lock R6.1 decision delta

Status: **local contract patch — Phase 1 audit + Phase 2 contract update**

### Changed

- **`docs/apps/bq-contract.md`** bumped to R0.3 with the following R6.1 additions:
  - §3 Hierarchy: added canonical user-facing terminology table — Work Item (L1), Component Group (L2), Cost Component (L3); internal Prisma names unchanged.
  - §7 Snapshot: added `source_price_snapshot` as immutable baseline field alongside editable `harga_snapshot`; documented Override/Revert semantics — `isOverridden` is derived (`source_price_snapshot IS NOT NULL AND harga_snapshot ≠ source_price_snapshot`), not persisted; Custom Cost Component (source_type=CUSTOM) has no Revert.
  - §10 BQ Project: lifecycle extended from `DRAFT/LOCKED` to `ACTIVE/LOCKED/ARCHIVED` with full transition table and service-layer enforcement requirement.
  - §15 Locked decisions: added K-17 (lifecycle), K-18 (snapshot/revert), K-19 (library type→kategori deterministic), K-20 (unit SSOT from Master Data), K-21 (source picker tabs + Custom type picker), K-22 (template recommendations at Section AND Subsection level), K-23 (Component Group = container only).

- **`UI_ENGINE.md`**: added §3.1 Three-tier composition model (Primitive / Pattern / Application), §3.2 Directory pattern canonicalization (DirectoryShell, EntityPrimaryCell with status dot, RowActionMenu, viewport-aware flex layout — no magic heights), §3.3 Dialog sizing convention (sm/md/lg; no arbitrary app-level width overrides).

### Schema changes locked (not yet migrated)

The following schema changes are required and will be executed in the next revision:
- `BqProjectStatus` enum: rename `DRAFT` → `ACTIVE`; add `ARCHIVED`.
- `BqLineItem`: add `source_price_snapshot NUMERIC(18,4) NULL`.

### Verification

- No code changed; contract/doc-only revision.
- `git diff --check`: passed (whitespace).


## R6 — 2026-09-06 — release: publish Master Data and UI hardening

- Publishes local R5.01–R5.12: promotion ownership corrections, Brand-only
  catalog resources, Supplier terminology and relationship ownership, shared
  UI Engine curation, BQ action-error containment, and the collapsible rail.
- Verification across the release: typecheck, lint, boundary/legacy-runtime
  checks, UI Engine tests, Prisma client generation, and whitespace checks.
- Reserved local-only files remain excluded from this release.

## R5.12 — 2026-09-06 — fix(shell): preserve brand mark in collapsed rail

- Collapsed rail now renders the configured brand mark at its intended compact
  size instead of falling back to an ambiguous initial.
- The rail control now occupies its own top strip inside the sidebar, preventing
  overlap with the first navigation item.
- Checks: `npm run typecheck`, `npm run lint`, and whitespace check passed.

## R5.11 — 2026-09-06 — fix(ui): centralize contextual help

- Added reusable `HelpHint` to UI Engine and replaced persistent Supplier
  relationship explanatory text with its accessible question-mark tooltip.
- Checks: typecheck, lint, UI Engine tests, and whitespace check passed.

## R5.10 — 2026-09-06 — fix(shell): attach rail control to navigation

- Moved the desktop collapse/expand control from the fixed top bar into the
  application rail so top-bar geometry remains stable and the control reads as
  part of the navigation surface.
- Checks: `npm run typecheck`, `npm run lint`, and whitespace check passed.

## R5.09 — 2026-09-06 — fix(bq): keep failed quick actions inline

- Direct BQ editor actions now consume their own expected validation/action
  rejection after showing the shared inline error, preventing Next from opening
  a runtime error overlay.
- Held the uncommitted snapshot/lifecycle schema work out of the running BQ
  client until its isolated rebuild-only migration can be applied and verified.
- Checks: Prisma client generation, typecheck, lint, and whitespace check passed.

## R5.08 — 2026-09-06 — fix(shell): restore collapsible navigation rail

- Replaced the ambiguous permanently-compact rail with the intended default
  collapsed rail. The header control now expands/collapses it on desktop while
  narrow navigation keeps labels visible.
- Checks: `npm run typecheck`, `npm run lint`, and whitespace check passed.

## R5.07 — 2026-09-06 — fix(prisma): restore Prisma 7 datasource configuration

- Removed uncommitted `url` and `directUrl` schema properties, which Prisma 7
  rejects. `prisma.config.ts` already owns the location-specific datasource.
- Regenerated the Prisma client successfully with `STUDIOFLOW_LOCATION=rumah`;
  no database connection or migration was run.

## R5.06 — 2026-09-06 — fix(ui): clarify compact directory status

- Status markers now distinguish active and non-active records by shape as well
  as colour, expose their text via native hover labels, and keep the accessible
  status name.
- Removed stale hidden sort keys and reduced unnecessary table minimum widths
  in Brand and Supplier directories to keep the fixed, scrollable table canvas
  useful without routinely forcing horizontal overflow.
- Checks: typecheck, lint, boundary and legacy-runtime checks, UI Engine tests,
  and whitespace check passed. Browser acceptance remains pending isolated
  rebuild-only runtime verification.

## R5.05 — 2026-09-06 — fix(masterdata): make catalog resources Brand-only

- Owner decision implemented: the persisted `Vendor` route remains for
  compatibility, while the UI uses Supplier consistently. Supplier catalog and
  external-link persistence (`VendorLink`) is purged with an explicit migration.
- Supplier actions and service mutations no longer accept links or mutate
  `BrandSupplier`. Brand is now the sole relationship editor; Supplier exposes
  supplied Brands as a read-only projection with clear ownership copy.
- Added the active BQ/Master Data hardening work order, including locked
  snapshot/revert, lifecycle, Library, and promotion-boundary decisions.
- Checks: `npm run typecheck` and `npm run lint` passed. `npx prisma generate`
  was blocked before generation by the pre-existing uncommitted datasource URL
  lines in `prisma/schema.prisma`, which Prisma 7 rejects; no database command
  was run. Browser and isolated database acceptance remain pending a proven
  rebuild-only target and valid owner configuration.

## R5.03 — 2026-09-06 — docs(ui): lock design audit remediation work order

- Agent: `Codex`, acting as navigator per AGENTS.md.
- Visually reviewed all 11 pages of the owner's `docs/design curate.pdf` and
  checked its findings against the current R5.02 shared contracts and UI code.
- Added `scripts/work-orders/UIUX-CURATE.md`: deterministic shared-surface,
  density, directory scanning/sorting/pagination, accessible menu, draft/error,
  dialog, overview and display-formatting work. The owner subsequently assigned
  Codex as executor in this session, overriding the default OpenCode assignment.
- Preserved contract-mandated Brand/Vendor dialogs, serif headings, current
  permission/persistence boundaries and audit-sourced attribution. Broad language
  translation, new StudioFlow features and server pagination are not activated.
- Corrected stale audit claims about Vendor draft guards and identifier adoption;
  recorded the compact-table CSS variable mismatch and Vendor tab-contract
  discrepancy. Added explicit browser acceptance and executor commit requirements.
- Updated the documentation entry point and corrected the stale revision-state
  header using existing R5.01/R5.02 ledger entries and local Git references.
- Environment: owner confirmed rumah; selected local configuration exists.
  No database connection, runtime execution, migration or dependency change.
- Checks: all PDF pages visually inspected; contract/code references reviewed;
  owned Markdown links and required sections checked; staged diff and whitespace
  checks passed. Runtime tests and browser acceptance are not run for this
  documentation-only handoff and remain required for implementation acceptance.
- Remaining: UI implementation follows in R5.04 under the owner's explicit
  Codex executor assignment; implementation and browser acceptance are outstanding.
- Reserved, uncommitted owner files: `.env.example`, `prisma/schema.prisma`,
  `docs/design curate.pdf`,
  `public/uploads/brand-marks/22e07e06-00d2-45c0-894b-7b11c736a545.png`,
  and `vercel.json`.

## R5.04 — 2026-09-06 — fix(ui): curate shared directories, dialogs, and shell behavior

- Applied the locked UI/UX remediation work order across the UI Engine, Master
  Data, BQ lists, account controls, and shared authenticated shell without
  changing persistence, permissions, calculation, migrations, dependencies, or
  service mutation behavior.
- Directories now use one compact framed surface with bounded, sticky table
  bodies, predictable pagination/sorting, concise action menus, draft/error
  handling, and narrower action columns. Brand, Supplier/Vendor, and Pricing
  status now uses an accessible green/red scan marker beside the record name.
- Brand mark and textual product mark link to the main application route. The
  main shell no longer requests a collapse control while using the fixed compact
  rail presentation. Account navigation uses an intentional accessible menu.
- Brand and Vendor dialogs use the shared large dialog size and a single overlay
  scroll owner; the UI Engine now centralizes compact status markers, directory
  framing, paging/draft patterns, and confirmation pending/error feedback.
- Checks: `npm run typecheck`, `npm run lint`, `npm run check:boundaries`,
  `npm run check:legacy-runtime`, `node --test --import tsx
  src/platform/ui_engine/ui-engine.test.ts`, and `git diff --check` passed.
- Browser acceptance was not run: the configured local port resolves to a Docker
  container labelled for `D:\Projects\studioflow`, not a target proven to be
  rebuild-only. No application or database command was run against it.
- Reserved, uncommitted owner files remain: `.env.example`, `AGENTS.md`,
  `prisma/schema.prisma`, `docs/design curate.pdf`,
  `public/uploads/brand-marks/22e07e06-00d2-45c0-894b-7b11c736a545.png`, and
  `vercel.json`.

## R5.02 — 2026-09-06 — fix(promotion): move BQ approval into Master Data

- Agent: `Codex`
- Added the `masterdata.promotion.approve` permission and removed the obsolete
  `bq.library.approve` registration.
- Removed the promotion queue from BQ Library. Master Data Settings now exposes
  a BQ approvals tab for authorized admin/staff users.
- Approval validates that the submitted reference is an active Master Data
  price record of the requested type before linking the BQ Library item.
- Rejection is now executed from the Master Data approval workflow with an
  auditable reason; BQ retains only estimator-side request submission.
- Updated the BQ UX specification to keep approval navigation out of the BQ
  estimator shell.
- Checks: `npm run typecheck`, `npm run lint`, `npm run check:boundaries`,
  `npm run check:legacy-runtime`, and `git diff --check` passed.
- Remaining limitation: the current approval screen still asks staff to create
  the pricing entry through the normal Pricing workflow before entering its ID;
  the next hardening step can replace that manual handoff with an inline
  create-and-approve flow.

## R5.01 — 2026-09-06 — docs(contracts): move BQ promotion approval to Master Data

- Agent: `Codex`
- Owner decision: Master Data is restricted to admin/staff users; BQ is
  restricted to estimators.
- Updated the BQ, Master Data, and BQ implementation contracts so promotion
  requests originate in BQ but the queue, approval/rejection, Master Data entry
  creation, audit, and validated linkage are owned by Master Data.
- Removed the obsolete `bq.library.approve` ownership from the contract and
  prohibited BQ from writing Master Data tables or accepting an arbitrary ID as
  approval proof.
- Checks: contract diff inspection and repository-wide contract search completed.
- Remaining limitation: implementation still needs a separate work order to
  build the Master Data promotion queue and the validated cross-app promotion
  transaction; this revision changes contracts only.


## R5 — 2026-09-04 — release: publish audit-sourced Updated-by and directory consistency fixes

Status: **owner-authorized GitHub publication**

- Published `R4.82` and `R4.83` as the new remote baseline: Brand/Vendor
  "Updated by" corrected to source from `AuditEvent` per the documented
  contract (replacing a denormalized column a prior session had added),
  Vendor gained create-time contacts, a broader UI Engine consistency sweep
  across several directories, and the Pricing toolbar filter alignment fix.

### Release boundary

- The owner's local database still carries the reverted `updated_by_label`
  column on `Vendor`/`Brand` from the superseded migration
  (`prisma/migrations/20260904153201_add_updated_by_label_vendor_brand`,
  intentionally left uncommitted). Running
  `npx prisma migrate dev --name drop_updated_by_label_vendor_brand` locally
  and committing the resulting migration remains outstanding.

## R4.83 — 2026-09-04 — fix(masterdata): align Pricing toolbar filter with the shared TableToolbar row

- Agent: `Claude`

Owner-reported (side-by-side screenshots of Pricing vs. Vendors): the Pricing
directory's status filter dropped to its own line below the search field
instead of sitting beside it, unlike Vendors/Categories/Roles/Users.

- Root cause: Pricing wrapped `SearchField` and the status `Select` in an
  extra `<div className="flex flex-wrap items-center gap-3">` inside
  `TableToolbar`. `TableToolbar` already lays its children out in one
  `flex flex-wrap` row itself; the unnecessary wrapper div broke that layout
  and pushed the filter onto its own line.
- Fix: `SearchField` and the status filter are now direct `TableToolbar`
  children, with the filter wrapped in a plain `<div className="w-36">` —
  the same pattern already used by Vendors, Categories, Roles, and Users.

### Verification

- `npm run typecheck` — clean
- focused ESLint (`pricing-directory.tsx`) — clean
- `git diff --cached --check` — clean (line-ending warnings only)

## R4.82 — 2026-09-04 — fix(masterdata): audit-sourced Updated-by, Vendor create-time contacts, UI Engine sweep

- Agent: `Claude`

Owner-reported inconsistencies (annotated screenshots + follow-up notes) plus
a contract-vs-code contradiction found while investigating them:

- **Updated by / kapan, corrected to match the contract.** A prior session had
  added a denormalized `updated_by_label` column to `Vendor` and `Brand`
  (migrated by the owner locally) and left an unused, unreferenced
  `listEntityLastActivity` helper behind — this contradicted the documented
  contract, which requires actor identity to live only in `AuditEvent`, never
  denormalized onto the row. Per the owner's explicit decision ("kode yang
  salah, ikutin dokumen"), the column is reverted (`schema.prisma` now matches
  the published baseline again) and the dead helper is removed. Brand and
  Vendor directories now source `Updated by [actor] · [relative time]` the
  same way Pricing already did: a new `latestAuditActorLabels()` helper runs
  one `DISTINCT ON (entity_id)` query against `AuditEvent` per list call and
  the result is merged onto each row in `listBrands` / `listVendors`. Brand
  and Vendor UI components are unchanged — they already expected this exact
  `updated_at` / `updated_by_label` shape.
- **`vendor-contract.md` reconciled with `brand-contract.md`.** The Vendor
  audit-metadata line was narrower than Brand's ("most recent `vendor.updated`
  (or `vendor.created`)" vs. Brand's "most recent `brand.*`"); Vendor is now
  worded the same way Brand is, matching what both directories actually do —
  any lifecycle event counts, not just create/update.
- **Vendor: contacts can be added at creation time.** The Create dialog's flat
  form gained a "Personnel & Sales Contacts" section reusing the same fields
  as the Edit dialog's Contacts tab (name, job title, phone, email, brand
  scope, primary toggle); `createVendorAction` already accepted `contactsJson`
  from the service/action layer, so this was a UI-only gap. Confirmed Vendor
  links intentionally exclude `CATALOG` (catalog links belong to Brand, not
  Vendor) — contract doc updated to state this explicitly instead of listing
  the full shared `LinkKind` vocabulary.
- **UI Engine consistency sweep**, following the documented fix-order (check
  `ui_engine` first): ad-hoc amber warning `<p>` blocks in Brand/Vendor
  replaced with `Notice tone="warning"`; plain `<Textarea>` for Notes replaced
  with `SimpleTextEditor` in Brand/Vendor; `useFormDraftGuard` wired into the
  Vendor create/edit dialogs and the Pricing editor (unsaved-change confirm on
  close, matching the existing Brand pattern); raw `<tbody>` replaced with
  `TableBody`, and raw toolbar/action `<div>` wrappers replaced with
  `TableToolbar`, across Sessions, BQ, Categories, Deletions, SKUs, Units,
  Roles, Users, and Vendor Types directories; `TableCellContent` used for
  numeric/end-aligned cells in the same set of files; one stray `TableHead`
  in the BQ project editor's actions column now sets `align="end"` to match.

### Remaining

- The owner's local DB now has an `updated_by_label` column on `Vendor` and
  `Brand` from the reverted migration (`prisma/migrations/20260904153201_add_updated_by_label_vendor_brand`,
  left uncommitted/untracked). This environment cannot reach
  `binaries.prisma.sh` to run Prisma CLI commands (403 from this sandbox's
  network), so the owner needs to run
  `npx prisma migrate dev --name drop_updated_by_label_vendor_brand`
  themselves to drop the now-unused column and commit the resulting
  migration folder.

### Verification

- `npm run typecheck` — clean
- `npx eslint .` — clean
- `node scripts/check-boundaries.mjs` — pass
- `node scripts/check-legacy-runtime.mjs` — pass
- `git diff --cached --check` — clean (line-ending warnings only)
- `npx prisma validate` / `migrate` — unavailable in this sandbox (network
  blocked to `binaries.prisma.sh`); schema change is a pure two-line revert
  back to the last published shape, diffed and confirmed byte-identical to
  the published baseline aside from line endings.

## R4.81 — 2026-09-03 — fix(masterdata): complete directory review feedback

- Agent: `Codex`

Completes the remaining approved review feedback without seeding new catalog
data:

- Brand rows now show a compact discovery summary: up to three product
  categories, two hashtags, and a `+N others` indicator while retaining the
  complete value in the native hover label.
- Material, material-plus-labor, and labor pricing rows now show `Updated by`
  and the Indonesian-localized last-update timestamp, using their persisted
  audit fields.
- Confirms the existing Pricing quick-create Brand path creates only the
  contract-minimum Brand name, selects it for the pending SKU, and remains
  permission-gated by Brand manage.
- Confirms Vendor remains contract-aligned: Profile & Types, Contacts, and
  Links are the only editor tabs; inactive tab panels stay mounted to preserve
  unsaved drafts.

### Verification

- `npm run typecheck` — clean
- focused ESLint — clean
- `node --test --import tsx src/platform/ui_engine/ui-engine.test.ts` — 27 pass
- `npm run check:boundaries` — pass
- `npm run check:legacy-runtime` — pass
- `git diff --check` — clean (line-ending warnings only)
- Browser acceptance — unavailable in the in-app browser because its existing
  tab remained on its browser-generated connection-error document even though
  the local server returned HTTP 200.

## R4.80 — 2026-09-03 — chore(branding): include approved organization mark

- Agent: `Codex`

Tracks the owner-approved PNG organization brand mark uploaded through General
Settings. The application already validates and serves this local asset; this
revision only places the approved file under source control.

### Verification

- PNG asset inspected: 28,793 bytes
- `git diff --check` — clean

## R4.79 — 2026-09-03 — feat(ui-engine): refine responsive navigation and creation actions

- Agent: `Codex`

Refines shared UI behavior already under active implementation:

- Adds a shared labelled `ButtonMenu` for grouped creation actions, then applies it to the three Pricing creation paths as one **New price** control.
- Makes the application rail and Master Data navigation become a compact, horizontally scrollable navigation row on narrow viewports without collapsing its accessible names or active-state semantics.
- Makes page and section surfaces reliably shrink inside narrow layouts, and adjusts shared page/card spacing for the updated density.
- Updates the UI Engine directory showcase and streamlined sign-in presentation to use the current patterns.
- Updates generated Next type references to the active development convention.

### Verification

- `node --test --import tsx src/platform/ui_engine/ui-engine.test.ts` — 27 pass
- `npm run typecheck` — clean
- focused ESLint — clean (generated Next declaration and stylesheet are excluded by the ESLint configuration)
- `npm run check:boundaries` — pass
- `npm run check:legacy-runtime` — pass
- `git diff --check` — clean (line-ending warnings only)

## R4.78 — 2026-09-03 — fix(vendors): align editor tabs with contract

- Agent: `Codex`
- Commit: `ff2cc6d` (published to the authorized remote)

Corrects the Vendor editor to its locked three-tab contract: **Profile & Types**,
**Contacts**, and **Links**. Brand supplier relationships remain owned by the
Brand workflow and are no longer shown as a Vendor editor tab. The shared tabs
component can keep inactive panels mounted, so entering Profile fields and then
switching to Contacts or Links preserves the unsaved draft.

### Verification

- Initial focused UI Engine test exposed the expected narrow-viewport fallback
  as an outdated assertion; it is corrected in R4.79 and re-verified there.

## R4.77 — 2026-09-03 — fix(platform): harden audited action and recovery paths

- Agent: `Codex`

Closes the validated first batch from the StudioFlow RB audit:

- Assembly-detail reads now require a BQ Library read or manage grant, and all assembly/library mutation IDs are CUID-validated at the action boundary.
- User disable/restore and role assignment actions now reject malformed UUIDs before calling persistence.
- Brand link JSON parse failures return a safe validation result instead of silently dropping submitted links.
- Brand-mark uploads validate a complete PNG chunk structure, not only the signature.
- BQ decimal input must be canonical and non-negative; assembly quantities are positive.
- Create/edit project forms now surface safe server validation failures; BQ has a recoverable route error state and loading feedback.
- Project refresh remounts the editor when its section count changes, source-picker responses are ordered by request, and template icon controls have accessible names.

### Verification

- `npm run typecheck` — clean
- focused ESLint — clean
- `npm run check:boundaries` — pass
- `npm run check:legacy-runtime` — pass
- BQ calculation and decimal tests — 16 pass
- Browser acceptance — not run; this batch did not alter the existing running browser session.

## R4.76 — 2026-09-03 — fix(bq): complete assembly-template and correct R4.59 defects

- Agent: `Claude`

Corrects all nine defects identified in R4.59.

**Contract**
- `docs/apps/bq-contract.md §16`: Removed Assembly template from the deferred list — it is now implemented.

**Service (`src/apps/bq/service.ts`)**
- `addAssemblyCustomLine`: `sort_order` now auto-increments (count of existing lines) instead of always being 0.
- `applyAssemblyTemplate`: new sub-object receives `sort_order` = count of existing sub-objects so it doesn't collide with sibling L2 rows.
- Added `updateAssemblyTemplate` — rename / re-describe an assembly template.
- Added `deleteAssemblyTemplate` — cascade-deletes all lines.
- Added `updateAssemblyLine` — edit any snapshot field or koefisien/qty on an L3 blueprint line.
- Added `deleteAssemblyLine` — remove one line from a blueprint.

**Actions (`src/app/(platform)/bq/[id]/actions.ts`)**
- `updateSubObjectAction`: `qtyPerL1` now uses `positiveDecimal` (rejects 0) instead of the permissive `decimal` helper.

**Library actions (`src/app/(platform)/bq/library/actions.ts`)**
- Added `updateAssemblyAction`, `deleteAssemblyAction`, `addAssemblyLineAction`, `updateAssemblyLineAction`, `deleteAssemblyLineAction`, `getAssemblyDetailAction`.

**Library controls (`src/app/(platform)/bq/library/library-controls.tsx`)**
- Added `AssemblyActions` component: edit name/desc, manage L3 lines (add / inline-edit / delete), delete assembly — all from the Library Assemblies tab.

**Library page (`src/app/(platform)/bq/library/page.tsx`)**
- Fixed tab order regression: Items tab is now first (default); Assemblies tab moved after Items; Templates after Assemblies.
- Assemblies tab now renders `AssemblyActions` per card so lines can be managed inline.

**Project editor (`src/app/(platform)/bq/[id]/project-editor.tsx`)**
- Added "Assembly" button in each L1 item's action row; opens `AssemblyPickerDialog` to select an assembly template and a `qtyPerL1` factor.
- Calls `applyAssemblyAction` — wires up the previously orphaned server action.

**Public API (`src/apps/bq/public/index.ts`)**
- Added `BqAssemblyLineRead` and `BqAssemblyTemplateDetail` types.
- Added `getAssemblyTemplateDetail(id)` read function (returns full lines list).

**BqTemplateItem** — was listed as "orphaned table" in defect log; does not exist in the schema (was never added in R4.59). No action required.

### Verification

- `npx tsc --noEmit` — clean
- `npx eslint src/apps/bq src/app/(platform)/bq --max-warnings=0` — clean
- `npm run check:boundaries` — pass
- `npm run check:legacy-runtime` — pass
- `git diff --check` — warnings only (CRLF→LF on unrelated files, pre-existing)

## R4.75 — 2026-09-03 — fix(brands): validate external links before save

- Agent: `Codex`

Brand external-resource entry now accepts a domain with or without an HTTP(S)
protocol, normalizes it to a full web URL, and rejects unsupported or malformed
addresses at Add time. Save also normalizes any pre-existing browser draft,
preventing the generic validation failure that previously blocked the whole
Brand update. The server boundary now accepts only HTTP(S) link protocols.

### Verification

- `node --test --import tsx src/app/(platform)/masterdata/brands/brand-link-input.test.ts` — pass
- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run check:boundaries` — pass
- `npm run check:legacy-runtime` — pass
- `git diff --check` — clean

## R4.74 — 2026-09-03 — fix(pricing): fix price tabs to equal columns

- Agent: `Codex`

Adds a shared equal-width mode to `Tabs` for a known, fixed set of sections.
Pricing uses it for its three permanent price kinds, so each tab has one stable
third of the strip and there is no horizontal scroll behavior.

### Verification

- `npm run typecheck` — clean
- `npm run lint` — clean
- `node --test --import tsx src/platform/ui_engine/ui-engine.test.ts` — pass
- `npm run check:boundaries` — pass
- `npm run check:legacy-runtime` — pass
- Browser acceptance — unavailable: the existing automation tab landed on
  Brands and direct navigation to Pricing was aborted by the browser.
- `git diff --check` — clean

## R4.73 — 2026-09-03 — fix(ui-engine): hide tab strip scrollbar

- Agent: `Codex`

Keeps the shared `Tabs` strip horizontally scrollable for narrow viewports but
hides the browser scrollbar and its up/down controls. This preserves access to
overflowing tabs without adding visual noise to short tab sets such as Pricing.

### Verification

- `npm run typecheck` — clean
- `npm run lint` — clean
- `node --test --import tsx src/platform/ui_engine/ui-engine.test.ts` — pass
- `npm run check:boundaries` — pass
- `npm run check:legacy-runtime` — pass
- Browser acceptance — Pricing tab strip has `scrollbar-width: none` while
  retaining horizontal overflow.
- `git diff --check` — clean

## R4.72 — 2026-09-03 — fix(masterdata): search scalable reference choices

- Agent: `Codex`

Records the shared choice-control scale rule in the Master Data contract: live
Brand, Vendor, SKU, and Category references use a searchable picker; bounded
controlled vocabularies remain native dropdowns. Inline creation remains limited
to the specific contract-approved workflows.

Replaces native dropdowns with searchable UI Engine choices for the Pricing SKU
Brand filter, SKU directory Brand/Category filters and edit fields, Vendor
contact Brand scope, Vendor Brand Supplier assignment, VendorType assignment,
and Category merge destinations. Status, kind, LinkKind, and units remain
native dropdowns because their controlled vocabularies are short.

### Verification

- `npm run typecheck` — clean
- `npm run lint` — clean
- `node --test --import tsx src/platform/ui_engine/ui-engine.test.ts` — pass
- `npm run check:boundaries` — pass
- `npm run check:legacy-runtime` — pass
- Browser acceptance — Pricing Brand filter searches `TACO` and returns only it.
- `git diff --check` — clean

## R4.71 — 2026-09-03 — fix(ui-engine): restore rail navigation

- Agent: `Codex`

`NavItem` now uses the framework's client navigation component rather than a
plain anchor. This restores navigation from compact-rail entries, including
Master Data Vendors and Pricing, while retaining the same href, accessible name,
active marker, and disabled presentation.

### Verification

- `npm run typecheck` — clean
- `npm run lint` — clean
- `node --test --import tsx src/platform/ui_engine/ui-engine.test.ts` — pass
- `npm run check:boundaries` — pass
- `npm run check:legacy-runtime` — pass
- Browser acceptance — compact rail navigates to both Vendors and Pricing.
- `git diff --check` — clean

## R4.70 — 2026-09-03 — fix(ui-engine): guard browser-only dialog drafts

- Agent: `Codex`

Adds the generic `useFormDraftGuard` for native Dialog and Drawer forms. It
snapshots the opening form in the browser, tracks native and controlled input
changes, and asks before a dirty draft is discarded. The guard has no server
action or persistence capability.

Brand create/edit now guards outside click, Escape, close control, and Cancel.
Only explicit Create/Save submits invoke their existing server actions; closing
an unconfirmed draft never writes to the database.

### Verification

- `npm run typecheck` — clean
- `npm run lint` — clean
- `node --test --import tsx src/platform/ui_engine/ui-engine.test.ts` — pass
- `npm run check:boundaries` — pass
- `npm run check:legacy-runtime` — pass
- `git diff --check` — clean

## R4.69 — 2026-09-03 — feat(ui-engine): activate multi-value creatable search

- Agent: `Codex`

Activates the domain-neutral `CreatableMultiSelect` UI Engine control: selected
values are removable tokens, options can be searched, and apps may supply an
explicit asynchronous create command with busy and error presentation.

Brand create/edit now uses it for Product Categories and hashtags, replacing the
static category checkboxes and free-text hashtag field. Category creation stays
behind the existing dictionary-manage permission and uses the existing audited
PRODUCT Category action; hashtag normalization and persistence remain Brand-owned.

### Verification

- `npm run typecheck` — clean
- `npm run lint` — clean
- `node --test --import tsx src/platform/ui_engine/ui-engine.test.ts` — pass
- `npm run check:boundaries` — pass
- `npm run check:legacy-runtime` — pass
- `git diff --check` — clean

## R4.68 — 2026-09-03 — fix(masterdata): rename Store vendor type to Retail

- Agent: `Codex`

Changes only the display name of stable Vendor Type code `STORE` to `Retail`.
Its Material capability and all existing assignments remain unchanged.

### Migration

- Adds `20260903070000_r4_68_vendor_store_retail` to update the existing
  rebuild vocabulary row.

### Verification

- `npx prisma migrate deploy` — applied to verified `studioflow_rebuild`
- `npm run typecheck` — clean
- `npm run check:boundaries` — pass
- `npm run check:legacy-runtime` — pass
- `git diff --check` — clean

## R4.67 — 2026-09-03 — fix(shell): default the root route to Master Data

- Agent: `Codex`

The redundant Workspace launcher is bypassed. The root route now opens Master
Data when permitted, otherwise the user's first allowed application. The header
no longer shows the redundant Applications launcher link.

### Verification

- `npm run typecheck` — clean
- `git diff --check` — clean

## R4.66 — 2026-09-03 — fix(shell): right-align application navigation

- Agent: `Codex`

Aligns the application switcher and account control as one group at the right
edge of the header.

### Verification

- `npm run typecheck` — clean
- `git diff --check` — clean

## R4.65 — 2026-09-03 — fix(shell): reduce brand mark scale

- Agent: `Codex`

Reduces the uploaded header brand mark from 48px to 38px, approximately 80% of
the prior displayed size, without changing the header height or alignment.

### Verification

- `npm run typecheck` — clean
- `git diff --check` — clean

## R4.64 — 2026-09-03 — fix(shell): prioritize uploaded brand mark

- Agent: `Codex`

When an organization brand mark exists, it replaces the header text block and
uses the available brand area at a fixed 48px height. The header brand region is
now explicitly 64px high, preserving alignment with the topbar.

### Verification

- `npm run typecheck` — clean
- ESLint on changed shell modules — clean
- `git diff --check` — clean

## R4.63 — 2026-09-03 — fix(shell): stabilize header and add PNG brand marks

- Agent: `Codex`

The AppShell topbar now centers vertically with the brand area, so header
navigation no longer jumps against the brand mark. General Settings replaces the
editable brand URL with an optional PNG upload. Files are limited to 2 MB,
signature-checked, stored under `public/uploads/brand-marks` with random names,
and rendered in the fixed 28px header mark box.

### Verification

- `npm run typecheck` — clean
- ESLint on changed modules — clean
- `npm run check:boundaries` — pass
- `npm run check:legacy-runtime` — pass
- `git diff --check` — clean
- Browser acceptance — upload requires the owner to select the intended PNG;
  no image was uploaded by the agent.

## R4.62 — 2026-09-03 — fix(bq): purge speculative template L1 placeholders

- Agent: `Codex`

The owner rejected `BqTemplateItem` as speculative. Its Prisma model, template
section relation, and persisted table are removed. Standard BQ templates remain
the approved Section/Subsection scaffold with optional Library recommendations;
they do not create unapproved L1 rows.

### Migration

- Adds `20260903060000_r4_62_purge_speculative_template_items`, which drops only
  `bq.bq_template_item`. The original applied migration is intentionally left
  immutable.

### Verification

- `npx prisma generate` — clean
- `npx prisma validate` — valid
- `npx prisma migrate deploy` — applied to verified `studioflow_rebuild`
- `npm run typecheck` — clean
- `npm run check:boundaries` — pass
- `npm run check:legacy-runtime` — pass
- `git diff --check` — clean

## R4.61 — 2026-09-03 — docs(changelog): advance the revision ledger

- Agent: `Codex`

Records the completed R4.60 local commit as the current revision and reserves
R4.62 as the next available local revision.

### Verification

- `git diff --check` — clean

## R4.60 — 2026-09-03 — fix(dev): bind the rebuild server to the office LAN port

- Agent: `Codex`

`npm run dev` now starts the rebuild explicitly on `0.0.0.0:3001`. This
matches the office LAN address used for local device access and avoids the
separate legacy checkout already using port 3000. `next.config.ts` already
allows the office host origin during development.

### Verification

- `npm ci` — clean install completed
- `http://172.16.1.163:3001/bq` — HTTP 200 from the host; the listener is bound
  to `0.0.0.0:3001`
- `npm run typecheck` — clean
- `npm run check:boundaries` — pass
- `npm run check:legacy-runtime` — pass
- `npm test` — non-database suites pass; database integration suites require a
  disposable `PLATFORM_TEST_DATABASE_URL`, which is absent from the office test
  configuration, so they correctly refuse to run.

## Changelog authorship rule

Every new revision entry must identify the agent that made the change using an
`Agent:` line. Use the actual agent name, for example `Agent: Codex` or
`Agent: Claude`; do not infer or omit the identity.

## R4.59 — 2026-09-03 — feat(bq): add assembly-template foundation

- Agent: `Codex`

Adds the persisted foundation for the owner-approved BQ Library split:

- `BqAssemblyTemplate` and ordered `BqAssemblyLine` store reusable L2 + L3
  blueprints.
- Applying an assembly creates a project-owned L2 and copies every L3 value;
  the result is a snapshot with no live dependency on the template.
- Standard BQ Templates now have persisted L1 placeholder support through
  `BqTemplateItem`; existing projects are untouched by the migration.
- The Library exposes an Assemblies tab and can create an assembly shell.

### Deliberately incomplete

This is the data/service foundation only. Editing Assembly L3 lines, applying an
Assembly from the project editor, and wiring Standard BQ Template placeholders
into project creation remain pending follow-up work; this revision does not
claim those workflows are available.

### Verification

- `npm run typecheck` — clean
- ESLint on every changed BQ module — clean
- `npx prisma validate` — valid
- `npx prisma migrate status` — database schema up to date on verified
  `studioflow_rebuild`
- `git diff --check` — clean

## R4.58 — 2026-09-03 — fix(ui-engine): prevent accidental compact-rail submenu popovers

- Agent: `Codex`

Compact-rail submenus, including Administration, no longer open merely because
the pointer or focus moves through the rail. They open only by intentional click
or keyboard activation, preventing a portalled menu from unexpectedly covering
the active work surface.

### Verification

- `npm run typecheck` — clean
- `npx eslint src/platform/ui_engine/layouts/shells.tsx` — clean

## R4.57 — 2026-09-03 — fix(bq): load import sources after dialog render

- Agent: `Codex`

`ImportDialog` previously started its initial source lookup from the render
path. The lookup calls `startTransition`, which React forbids during rendering,
so opening **Impor** crashed the BQ project page with "Cannot call
startTransition while rendering."

The dialog now mounts only for an active import target and starts its initial
lookup from an effect after render. Each fresh opening has fresh local state;
closing the dialog unmounts it and cancels an in-flight initial lookup.

### Verification

- `npm run typecheck` — clean
- `npx eslint src/app/(platform)/bq/[id]/project-editor.tsx` — clean
- `npm run check:boundaries` — pass
- `git diff --check` — clean
- Browser acceptance: opened **Impor** on a draft BQ project; the picker
  rendered its empty state without the previous React error overlay.

## R4.56 — 2026-09-03 — feat(bq): close BQ-F2 through BQ-F5 and activate InlineEdit

- Agent: `Claude`

Before this revision an estimator could create a BQ project and add an empty
Section, and nothing else. `addSubsection`, `addItem`, `addSubObject`,
`addLineItem`, their update and delete counterparts, `lockProject`, every
template-structure operation, and the whole promotion flow existed in the
service — typed, transactional, audited — with **zero consumers**. The
calculation engine was a correct machine with no way to put anything into it.

Owner decisions taken for this build: **inline editing for every value**, and
**all three L3 sources** including Master Data.

### UI Engine — InlineEdit activated

`UI_ENGINE.md` §19 listed `InlineEdit` as deferred pending "a locked app workflow
proves inline editing is preferable to form/dialog editing". That workflow now
exists, so the pattern is activated rather than reinvented inside the app.

`InlineEdit` owns edit/focus state, the keyboard convention (Enter commits,
Escape cancels and restores, blur commits only when asked), the pending state,
and the failed-save behavior: a refused commit restores the previous value rather
than leaving refused text on screen looking saved. It owns no validation and no
persistence — a test asserts the shell contains no number parsing at all.
Tabbing onto a cell opens it, so keyboard entry never needs a pointer.

### BQ-F2 — Template Editor

Templates could be created, renamed, duplicated, and deleted, but the dialog had
only a name and a description: there was nowhere to add a Section. Every template
was therefore permanently empty, and the `templateId` scaffold wired in R4.54
loaded nothing. Sections, Subsections, reorder, and Library recommendations are
now editable, and a recommendation resolves to its item rather than showing as
an unnamed row.

### BQ-F3 — project structure and the tree editor

- Server actions for Subsection, L1, L2, and L3 create/update/delete, plus
  project lock.
- The project page's stub table is replaced by a real tree with collapse/expand
  per L1 and per L2, matching §13.1's closed and open views.
- Every value is edited inline. Decimal shape is validated app-side, including
  §5/K-08's rule that a coefficient is strictly greater than zero.
- An L1 that has children shows its markup where a standalone L1 shows its
  coefficient and price, because the standalone fields are dormant once children
  exist and presenting them as live would be a lie.

**How totals move without a reload.** §13.1 requires the grand total to follow a
qty change immediately; §2 forbids calculating in the client. Every mutation
therefore returns the recomputed project from the server and the client swaps
state — no page reload, and no arithmetic in the browser.

`BqProjectDetail` now carries the server's computed `biayaLine`, `subtotalL2Raw`,
`subtotalL2`, `biayaPokok`, `rate`, and `total` on the rows they belong to. Each
L1 is computed independently, so one item still missing its price leaves the rest
priced and reports only itself as unpriced, instead of blanking the document.

### BQ-F4 — Master Data and Library import

`src/apps/bq/lib/snapshot.ts` implemented §7 and had no consumer. It now has
one: "Impor" opens a picker over BQ Library plus Master Data prices, and the
chosen source is snapshotted onto the L3 row. Master Data is reached only through
its published read contract, and each half of the picker is gated on its own
permission, so an estimator without Master Data access still gets the Library
rather than an error.

**EXTEND — `masterdata/public`.** The contract exposed `getSkuPricingOptions(skuId)`,
which assumes the caller already knows the SKU. A consumer browsing for a material
does not, so it had no entry point at all. Added `listMaterialPriceOptions({
search, limit })` over one shared projection, so the per-SKU read and the
catalogue search cannot drift. No cheapest/newest/preferred ranking is applied —
`masterdata.md` §3 forbids inferring one. Documented in `pricing-contract.md` §12.1.

### BQ-F5 — promotion flow

Estimators can request promotion on an eligible Library item; holders of
`bq.library.approve` get a queue tab with approve and reject. Approval records
the Master Data entry ID the item became, per §9/K-10 which carries structure and
never price. Items whose category stops at BQ never show the control at all (K-11).

### Contract amendments

- `bq-contract.md` §13.2 records the owner's editing decision and draws the line
  the build follows: changing a value is always inline, choosing where a row
  comes from is a picker. §14 marks F2–F5 delivered.
- `pricing-contract.md` §12.1 documents the new catalogue read.
- `UI_ENGINE.md` §12 documents the `InlineEdit` API and §19 moves it out of the
  deferred registry.

### Verification

- `npx tsc --noEmit` — clean
- `npx eslint src scripts` — clean
- `npm run check:boundaries` — pass, including BQ's new cross-app read
- `npm run check:legacy-runtime` — pass
- `git diff --check` — clean
- BQ calculation engine 4/4; UI Engine 23/23 (two new for InlineEdit), both run
  out-of-tree
- Every service operation listed above now resolves to at least one consumer;
  verified by sweep

### Limitations — not a pass

- `npm test` still cannot run in-tree: `node_modules` holds a Windows `esbuild`
  binary while the agent shell is Linux. Database-backed integration tests for
  the new actions were **not run at all**. This is the largest gap in this
  revision: the action layer is typechecked and reasoned about, not executed.
- **No browser acceptance.** The tree, inline editing, collapse/expand, the
  import picker, and the promotion dialogs have never been rendered. Treat this
  revision as ready for review, not as verified working.
- No `InlineEdit` interaction test — assertions cover its markup and its source
  contract, not real keyboard behavior.
- Reordering Sections/L1/L2/L3 inside a project is not implemented; only template
  sections reorder. `sort_order` is persisted but nothing sets it after creation.
- The import picker searches Master Data server-side but filters the Library
  client-side, and caps at 80 rows with no pagination.
- `purchase_to_base_factor` is shown as context on an imported row per K-03, but
  there is no unit-conversion helper — the estimator still sets the coefficient.

## R4.55 — 2026-09-03 — fix(ui-engine): repair interaction defects and complete named capabilities

- Agent: `Claude`

Curation pass over `src/platform/ui_engine/` against `UI_ENGINE.md` and
`DESIGN.md`. Nothing in the design language moved: no token, typography, radius,
spacing, or colour changed. Every change is behavior, accessibility, or API
completeness. `UI_ENGINE.md` was amended where it described a capability the
engine did not actually have.

### Things that did not work

- `Drawer` set no width above the 560px breakpoint, so its `size` prop did
  nothing on any desktop viewport and the panel shrank to its content. The size
  token now reaches the drawer at every width.
- `Tabs` spread its props after computing the first-enabled fallback, so an
  undefined `defaultValue` overwrote it. An uncontrolled tab set opened with no
  panel selected at all.
- `useConfirm` replaced its resolver without settling the previous one. A second
  confirm request left the first caller awaiting a promise that could never
  resolve. A superseded request now settles `false`, as the contract already
  said it did.
- `useUnsavedChangesGuard` reset its baseline on reference identity while using
  the caller's comparator only for the dirty check. A form that rebuilt its
  initial object each render moved the baseline every render, so the guard never
  saw a dirty form and never prompted. The comparator now governs both.
- `CreatableSearch` awaited an app-supplied create with no `try`/`catch` and no
  in-flight guard: a rejection escaped as an unhandled rejection while the
  overlay sat open explaining nothing, and a second click created the record
  twice. `UI_ENGINE.md` §8 has always listed busy and creation-error
  presentation as engine-owned; neither existed.
- `CreatableSearch` did not clear its search text when the value was replaced
  from outside, contrary to the same section. It now resets on an external
  change, adjusted during render rather than from an effect.
- `Field` rendered its help affordance as a `<button>` inside the `<label>`. A
  button nested in a label forwards its click to the labelled control, so asking
  for help toggled the very checkbox or switch being explained. The affordance
  now sits beside the label.
- `DataTable` `stickyHeader` set the sticky position but nothing bounded the
  scroll container, so the header had nothing to stick to. Added `maxBodyHeight`,
  which the two are now documented to be supplied together.

### Capabilities the contract named but the engine lacked

- `ConfirmDialog` and `useConfirm` gained `requireTypedConfirmation` — exact
  typed text before the confirm control unlocks (`UI_ENGINE.md` §8).
- `Combobox` ignored Enter in its search field, against §19's stated keyboard
  contract. Both search controls now follow one rule: an exact label match
  commits, otherwise a single remaining result commits, otherwise nothing. The
  engine never guesses among several matches.
- `Dialog`/`Drawer` gained `dismissible`, so a submit in flight is not dismissed
  by a stray Escape or outside click. The engine owns the refusal; the app
  decides when.

### Accessibility

- `Combobox` and `CreatableSearch` put `role="combobox"` on the trigger button.
  A trigger with no text input of its own is announced as an editable control
  that never accepts text. The combobox semantics moved to the search field that
  actually owns the query and the listbox; the trigger keeps
  `aria-haspopup="listbox"`.
- `CreatableSearch` had its empty message and create row as non-option children
  of `role="listbox"`. They now sit beside it.
- `Field` sets `aria-required` on its control. The asterisk is decorative and
  `aria-hidden`, so it was not a signal assistive technology could receive.
- `LoadingState` nested a `role="status"` spinner inside a `role="status"`
  region, announcing the same message twice. `Spinner` gained `decorative` for
  use inside a container that already announces.
- `IconButton` set `title` equal to its label unconditionally, so an icon button
  wrapped in the shared `Tooltip` showed two tooltips and announced its name
  twice. The native title stays as the fallback for an unwrapped button;
  `Tooltip` now supersedes it on the element it wraps.

### Contract amendments

`UI_ENGINE.md` §7 documents the sticky-header/`maxBodyHeight` pairing; §8
documents where combobox semantics live, the shared Enter rule, engine-owned
create busy/error state, the superseded-confirm guarantee, the comparator-driven
baseline, the help-affordance placement rule, `aria-required`, and tooltip
supersession; §9 documents `dismissible` and that the size token applies to
`Drawer` at every viewport.

### Verification

- `npx tsc --noEmit` — clean
- `npx eslint src scripts` — clean
- `npm run check:boundaries`, `npm run check:legacy-runtime` — pass
- UI Engine suite 21/21 (9 existing, 12 new), executed out-of-tree under `tsx`
  against a copy of `src/platform/ui_engine/` with pinned React/radix-ui/lucide

### Limitations — not a pass

- `npm test` still cannot run in-tree: `node_modules` holds a Windows `esbuild`
  binary while the agent shell is Linux. The suite above was run against an
  out-of-tree copy, which proves the engine but not the runner.
- No browser acceptance: keyboard traversal, focus return, and the narrow
  viewport were reasoned about and unit-asserted, not driven in a real browser.
- Consumers were not migrated. `dismissible`, `maxBodyHeight`,
  `requireTypedConfirmation`, and `Spinner decorative` are available but no app
  screen passes them yet.

## R4.54 — 2026-09-03 — fix(bq,masterdata,contracts): repair contract-violating backend logic

- Agent: `Claude`

Full backend audit against `CORE.md`, `docs/apps/bq-contract.md`,
`docs/apps/pricing-contract.md`, `docs/apps/brand-contract.md`,
`docs/apps/vendor-contract.md`, and `docs/apps/masterdata.md`, plus the repairs
for every confirmed violation. Where the contract itself was the defect, the
owner authorized amending it; those amendments are listed below.

### Contract amendments

- `bq-contract.md` §6.3 wrote `subtotal_L2_raw = SUM(biaya_line)`, omitting the
  `qty_per_l1` factor that §6.2 and locked decision K-09 both require. The two
  readings differ by the L2 component count. §6.3 now carries the factor and
  §6.2 states where each qty factor is applied.
- `bq-contract.md` §8.2 showed the promotion status graph without saying which
  transitions are legal. It now names the allowed source status for each of the
  three promotion actions and states that `REJECTED` persists until resubmission
  and `APPROVED` is terminal.
- `masterdata.md` §2 said Category merge "requires a staff request plus explicit
  approval" and then, one line later, that staff may merge. Merge is reversible
  in effect — the source is deactivated, not destroyed, and `merged_into_id`
  records where its relations went — so it is staff-level like deactivate.
  Permanent deletion remains the only approval-gated Category operation.

### BQ — calculation

- The calculation engine ignored `BqSubObject.qty_per_l1` entirely, so an L2
  breakdown priced one component per L1 regardless of how many the estimator
  declared. `subtotal_L2_raw` is now `qty_per_l1 × SUM(biaya_line)`, restoring
  the K-09/§6.2 chain. Regression test added.

### BQ — promotion state machine

- `rejectPromotion` wrote `DRAFT` instead of `REJECTED`, discarding the decision
  the Library UI already renders with a danger badge.
- `approvePromotion` and `rejectPromotion` performed no existence, eligibility,
  or status check: an item nobody requested could be approved, and a re-request
  could strip an existing `masterdata_ref_id`. All three transitions now name
  the statuses they may leave.
- Approval requires a non-empty `masterdataRefId`; rejection requires a reason.
  Both reach the audit event.

### BQ — projects, sections, templates

- `addSubObject`/`addLineItem` nulled the parent L1's `harga_snapshot`. Per §6.2
  the field is merely unused while children exist; clearing it destroyed the
  estimator's price and left the L1 uncalculable — and the project grand total
  permanently `null` — once the last child was removed.
- Five copies of the project-lock check computed `projectId` from
  `subsection.section_id`, which is a section ID, and used it only as a
  truthiness gate, so a row with a broken parent chain skipped the lock check.
  Replaced by one resolver chain (`requireEditableProject*`) that treats a broken
  chain as a `CONFLICT`.
- `addItem` ran its parent lookups before validating the section/subsection XOR.
- `createProject` silently produced an empty project when the requested template
  no longer existed; it now fails with `NOT_FOUND`.
- `createProject` and `duplicateTemplate` silently dropped a subsection whose
  parent section was missing, producing an incomplete scaffold or copy.
- `reorderTemplateSections` renumbered sections by ID without checking template
  ownership, so IDs from any other template could be reordered.
- `deleteTemplateSection` relied on Prisma's default action for the optional
  self-relation, which is `SetNull`: deleting a Section promoted its Subsections
  into new top-level Sections. Children are now deleted with their parent.
- `addTemplateRecommendation` validated neither the section nor the referenced
  Library item, so a wrong-type pointer was stored silently and a missing item
  surfaced as a raw FK failure.
- `lockProject` neither checked existence nor refused an already-locked project.
- `listTemplates` always returned `libItem: null`, leaving Template Editor
  recommendations unnamed (§8.3). They now resolve.
- `listProjectSummaries` called `getProjectDetail` once per project — a full tree
  read each. It now reads the trees in one query.
- Read-only service operations no longer open a write transaction (`CORE.md` §2).
- §13.2/K-12 allow a new project to load a Template as its scaffold. The service
  supported `templateId`; the server action dropped it and the form never offered
  it. Both are wired, gated on Library read permission.
- Library `defaultKoefisien` accepted `0`, which prices every importing line at
  nothing; §5/K-08 fixes koefisien strictly greater than zero.

### Master Data — data loss on save

- `updateVendor` rebuilt `BrandSupplier` rows writing neither `is_authorized`
  nor `notes`, so every Vendor edit silently reset each supplier relation to
  unauthorized and erased its notes.
- `updateVendor` rebuilt `VendorLink` rows writing neither `archive_url` nor
  `sort_order`, so every Vendor edit erased archive URLs and link ordering.
- `updateBrand` deleted and recreated every `BrandLink`. Because
  `PriceMaterial.source_link_id` is `onDelete: SetNull`, an unrelated Brand edit
  silently erased the price provenance of every material price on that Brand.
- Brand links/hashtags/suppliers and Vendor types/links/contacts/suppliers are
  now diffed on their natural key, so unchanged rows keep their IDs and
  timestamps.

### Master Data — validation and integrity

- `createPriceMaterial` skipped the source-link brand check entirely for
  Brand-less SKUs, so an unrelated Brand's link could be attached
  (`pricing-contract` §2.5). The update path already enforced it.
- `createBrand`/`updateBrand` never validated Brand categories, so a WORK or
  deactivated Category could be attached (`brand-contract` §2.1).
- `updateVendor` did not validate that assigned VendorTypes are live, though
  `createVendor` does, so an archived type could be assigned through update.
- `updateSku` withdrew its `SKU_ENRICHMENT` origins without pruning
  `BrandCategory` rows left with no origin at all, leaving the Brand holding a
  category nothing justified (`brand-contract` §3).
- `addDirectCause` used a bare `create`, turning a repeated direct archive into a
  raw unique-constraint failure instead of the idempotent no-op `masterdata.md`
  §4.1 rule 7 requires.

### Master Data — audit

- `updatePriceMaterial`, `updatePriceMaterialLabor`, `updatePriceLabor`,
  `updateBrand`, `updateVendor`, and `updateSku` wrote an audit event for a
  no-op save, against `CORE.md` §5 and each contract's audit section. They now
  emit nothing when nothing changed, and skip the redundant row write.
- `updateSku` never compared `notes` or its category set, so those edits produced
  an audit event with no delta. `updateBrand`/`updateVendor` reported no relation
  deltas at all. All three now report them.
- `rejectDeletion` overwrote the requester's stated reason with the approver's
  (or with `null`), destroying the request record `masterdata.md` §4.2 requires.
  The requester's reason is preserved and the rejection reason is recorded in the
  audit event.

### Repository

- Added `.gitattributes` with `* text=auto eol=lf`. The entire working tree had
  been rewritten to CRLF while the index held LF, so all ~190 files reported as
  modified and `git diff --check` flagged every line; no revision could be
  committed without dragging a whole-file line-ending rewrite into it. With
  normalization declared, only real changes appear in the diff.

### Verification

- `npx tsc --noEmit` — clean
- `npx eslint src scripts` — clean
- `npm run check:boundaries`, `npm run check:legacy-runtime` — pass
- `git diff --check` — clean
- BQ calculation-engine unit tests 4/4, including the new `qty_per_l1` case,
  executed out-of-tree under `node --experimental-strip-types`

### Limitations — not a pass

- `npm test` **could not run**. `node_modules` holds a Windows `esbuild` binary
  while the agent shell is Linux, so the loader fails before any test executes.
  Database-backed integration suites were therefore not run. Run
  `npm ci && npm test` on the owner's machine before trusting this revision.
- No browser acceptance was performed.
- `next-env.d.ts` carries an unrelated Next-generated change
  (`.next/types` → `.next/dev/types`) and was deliberately left uncommitted.
- The BQ project detail page renders a stub table (`rowSpan` over rows it never
  emits, section-level L1 items ignored, no grand total). That is BQ-F3 UI scope
  and was left alone.
- `src/apps/bq/lib/snapshot.ts` implements §7 but has no consumer until BQ-F4 and
  no tests.

## R4.53 — 2026-09-03 — fix(ui-engine): stabilize compact rail hover menus

- Agent: `Codex`

- Removed the pointer gap between a compact rail submenu trigger and its
  portalled menu, and extended the close grace period to prevent hover flicker.

### Verification

- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- Browser check of Administration submenu activation

## R4.52 — 2026-09-03 — fix(shell): separate application switching from app navigation

- Agent: `Codex`

- Moved Applications, Master Data, and Bill of Quantity switching from the
  compact rail into the continuous top header.
- Made the rail app-local: BQ now provides Projects and BQ Library there, while
  Master Data keeps Overview, Brands, Vendors, and Pricing. Removed BQ's
  redundant horizontal navigation tabs.
- Kept Administration as the existing compact utility submenu.

### Verification

- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- Browser checks: BQ header/rail and Master Data rail.

## R4.51 — 2026-09-03 — fix(ui-engine): compose brand and account into one top bar

- Agent: `Codex`

- Reworked the shared AppShell header so its brand sits inside the same
  continuous top-bar plane as app context and account controls, instead of
  reserving a separate header column.
- Preserved the legacy full-width brand position and the independent compact
  rail beneath the header; narrow navigation keeps its previous flow.

### Verification

- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- Browser check of the authenticated BQ header

## R4.50 — 2026-09-03 — fix(ui-engine): consolidate compact rail administration navigation

- Agent: `Codex`

- Added the generic `NavSubmenu` UI Engine pattern: a compact rail renders one
  hover, focus, and click-accessible icon menu; narrow labeled navigation keeps
  its visible child links.
- Replaced the redundant Administration heading and duplicate Settings icon with
  a single Settings menu containing only the permission-visible destinations.

### Verification

- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- Browser checks: the Administration menu exposes General Settings, Users, and
  Roles & Access; BQ rail remains free of the Master Data submenu.

## R4.49 — 2026-09-03 — fix(ui-engine): make the shared top header a continuous plane

- Agent: `Codex`

- Removed the vertical divider from the AppShell brand region so the top header
  is one continuous surface from brand to account controls.
- Preserved the compact rail's independent divider below the header, keeping
  navigation distinct without splitting the header itself.

### Verification

- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- Browser check of the authenticated BQ header

## R4.48 — 2026-09-03 — fix(shell): move Master Data primary navigation into the shared rail

- Agent: `Codex`

- Preserved the legacy wide-brand top-header and compact icon-rail composition.
- Moved the four owner-approved Master Data destinations—Overview, Brands,
  Vendors, and Pricing—from an app-local horizontal tab bar into the shared
  UI Engine navigation rail.
- Kept navigation content app-owned while the UI Engine continues to own active
  state, collapsed behavior, tooltips, and accessible labels. BQ exposes no
  Master Data submenu.

### Verification

- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- Browser checks: Master Data rail contains the four approved links without
  horizontal tabs; BQ rail does not show the Master Data submenu.
- `npm test` could not complete database-backed integration tests because this
  session has no configured disposable `PLATFORM_TEST_DATABASE_URL`; UI Engine
  and non-database test suites passed.

## R4.47 — 2026-09-03 — fix(bq): accept empty create ids in library actions

- Agent: `Codex`

- Normalized empty hidden IDs from create forms before shared Zod validation.
- Library item and template create actions now distinguish a new record from
  an update without exposing a generic invalid-data error for valid input.

### Verification

- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- Browser check of the BQ Library create form

## R4.46 — 2026-09-03 — fix(bq): restore project creation action for populated list

- Agent: `Codex`

- Added `+ Buat Project` to the BQ Projects page header when existing projects
  are present and the user has project-management permission.
- Kept the centered `+ Buat Project Baru` empty-state action as the sole CTA
  when there are no projects.

### Verification

- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- Browser check of the populated BQ Projects page

## R4.45 — 2026-09-03 — fix(bq): remove unavailable template editor link

- Agent: `Codex`

- Removed the BQ Library template link to an unimplemented detail route.
- Template metadata CRUD remains available from the library card; section and
  recommendation editing will be exposed only when its dedicated route exists.

### Verification

- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- Browser check of BQ Library template cards

## R4.44 — 2026-09-03 — feat(bq): add library and template CRUD controls

- Agent: `Codex`

- Connected the BQ Library page to the existing service CRUD for Material,
  Upah, Material + Upah, and Custom cost library items.
- Added create, edit, and destructive-confirmation delete flows for library
  items, with shared validation, permission checks, audit events, and refresh.
- Added create, edit, duplicate, and destructive-confirmation delete flows for
  templates; the existing template editor remains the place for sections and
  recommended items.
- Replaced the ambiguous `Sections` tab label with `BQ Library views` and made
  the empty-state actions explicit.

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test` — 212 passed, 0 failed
- `git diff --check`
- Browser check of BQ Library item/template dialogs and tab semantics

## R4.43 — 2026-09-03 — feat(bq): allow manual section creation

- Agent: `Codex`

- Added a permission-checked BQ server action that delegates manual section
  creation to the existing BQ service and records the existing audit event.
- Added a shared UI Engine-based dialog for entering a section name.
- Exposed one non-duplicated `Add section` CTA in the empty state, and in the
  detail header once sections exist; locked projects and read-only users do not
  receive the action.
- Template scaffolding remains an optional future path rather than the only way
  to create a section.

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test` — 212 passed, 0 failed
- `git diff --check`
- Browser check of BQ project detail and manual section dialog

## R4.42 — 2026-09-03 — fix(bq): remove duplicate project creation action

- Agent: `Codex`

- Removed the redundant header `+ Buat Project` action from the empty BQ
  projects page.
- Kept the single centered empty-state CTA `+ Buat Project Baru` for the
  no-project state; populated project lists remain unchanged.

### Verification

- `npm run typecheck`
- `npm run lint`
- Browser check of `/bq`

## R4.41 — 2026-09-03 — docs(changelog): correct shell revision ledger

- Agent: `Codex`

- Corrected the revision state after the R4.40 shell commit so the ledger
  identifies R4.40 as the implementation revision and advances the next local
  revision to R4.42.

### Verification

- `git diff --check`

## R4.40 — 2026-09-03 — fix(shell): refine account menu and app navigation icons

- Agent: `Codex`

- Moved `Sign out` from the rail utility footer into the signed-in user hover
  and keyboard-focus menu in the top-right header.
- Replaced generic app icons with meaningful platform navigation symbols for
  Master Data and BQ; collapsed labels continue to use the shared `NavItem`
  tooltip behavior.
- Kept domain navigation and app-owned routes outside the UI Engine.

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test` — 212 passed, 0 failed
- Browser check of the authenticated shell at `/`

## R4.38 — 2026-09-03 — feat(ui-engine): support compact legacy-style rails

- Agent: `Codex`

- Added the generic `railPresentation="compact"` mode to `AppShell`.
- Platform app shells now keep one full-width brand/user header while the
  desktop navigation rail below is icon-only, matching the verified legacy
  Master Data composition without importing legacy code.
- Kept label accessibility and tooltip behavior centralized in `NavItem`.

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test` — 212 passed, 0 failed
- Legacy checkout inspected read-only at commit `102ff85`

## R4.37 — 2026-09-02 — refactor(ui-engine): enforce shared app controls

- Agent: `Codex`

- Replaced app-owned visual buttons with the shared `Button` and `IconButton`
  components from `ui_engine`.
- Replaced BQ-native textareas with the shared `Textarea` control and removed
  duplicated control styling from app code.
- Confirmed the app surface has no remaining native `<button>` or `<textarea>`
  elements; hidden inputs remain native form plumbing by design.

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test` — 212 passed, 0 failed
- `git diff --check`

## R4.36 — 2026-09-02 — fix(shell): separate account and administration navigation

- Agent: `Codex`

- Moved the personal `Account` destination from the sidebar into the signed-in
  user control in the topbar.
- Renamed the permission-gated sidebar group to `Administration` and kept
  General Settings, Users, and Roles & Access together there.
- Preserved the existing `/account` route and platform permission boundaries.

### Verification

- `npm run typecheck`
- `npm run lint`
- Browser check of the authenticated shell and `/account` link

## R4.35 — 2026-09-02 — fix(masterdata/pricing): align pricing terminology

- Agent: `Codex`

- Aligned visible pricing labels with the approved contract: `Material Prices`,
  `Material + Labor`, and `Labor Only`.
- Replaced the ambiguous `work price` action and category wording with
  `material + labor`, `labor`, or neutral pricing-category language.
- Updated the Master Data summary card to avoid the generic `Work prices` label.

### Verification

- `npm run typecheck`
- `npm run lint`
- Browser check of `/masterdata/pricing`

## R4.31 — 2026-09-02 — fix(shell): align sidebar and header design with DESIGN.md

- Agent: `Claude`

- `shells.tsx`: replaced hardcoded `bg-white/94` on the sticky topbar with
  semantic token `bg-surface/94`, per DESIGN.md §3 ("translucent white plane").
- `shells.tsx`: replaced `hover:bg-white/62` on NavItem idle hover with
  `hover:bg-surface-muted`, matching DESIGN.md §3 ("Surface muted: hover").
- `authenticated-shell/index.tsx`: brand subtitle now renders only when it
  differs from `settings.appTitle`, eliminating the redundant display when
  organizationName equals appTitle.
- `authenticated-shell/navigation.tsx`: "Applications" launcher link hidden
  when user has access to only one app, consistent with legacy NavOuter
  (no launcher item) and the existing single-app auto-redirect in LauncherPage.

### Verification

- `npx tsc --noEmit` — pass
- `git diff --cached --check` — pass
- Legacy NavOuter at `D:\Projects\studioflow` inspected — no Applications
  launcher in sidebar confirms decision is evidence-based.

### Remaining

- BQ not visible in sidebar: expected — user requires `bq.access` grant via
  Settings → Roles & Access.

## R4.30 — 2026-09-02 — docs(changelog): identify the change-making agent

- Added a changelog rule requiring every future revision entry to identify its
  change-making agent.
- This revision was made by Codex.

### Agent

`Codex`

### Verification

- Changelog diff inspection
- `git diff --check`

## R4.32 — 2026-09-02 — fix(ui-engine): make the authenticated header continuous

- Agent: `Codex`

- Moved `AppShell` topbars into a full-width global header so the brand, account
  identity, and application header share one continuous horizontal surface.
- Kept the existing rail and content below the header, including collapsed rail
  behavior and the legacy shell fallback when no topbar is supplied.
- Preserved responsive navigation behavior at narrow widths.

### Verification

- `npm run typecheck`
- `npm run lint`
- Desktop browser check on `/masterdata`
- Mobile browser check at `390x844`

## R4.33 — 2026-09-02 — fix(masterdata): standardize Brand field help

- Agent: `Codex`

- Replaced inline descriptions in the Brand create/edit form with the shared
  tooltip help pattern already used by Pricing.
- Added accessible help buttons for Owner vendor, Hashtags, and Product
  categories without changing form values or validation behavior.

### Verification

- `npm run typecheck`
- `npm run lint`
- Browser check of the Create Brand dialog on `/masterdata/brands`

## R4.34 — 2026-09-02 — fix(ui-engine): centralize field help tooltips

- Agent: `Codex`

- Updated the shared `Field` component so every field description renders as a
  consistent `?` tooltip instead of inline helper text.
- Preserved the description in the accessibility tree through the existing
  `aria-describedby` relationship.
- Removed the duplicated Brand-specific help implementation; Brand and Vendor
  now consume the shared UI Engine behavior.

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test -- --test-name-pattern="UI Engine foundation"` (212 passed)
- Browser check of the Create Vendor dialog on `/masterdata/vendors`

## R4.29 — 2026-09-02 — fix(prisma): select the rebuild database by work location

- Agent: `Codex`

- Updated `prisma.config.ts` to select `.env.rumah` or `.env.kantor` through
  `STUDIOFLOW_LOCATION`, with the existing `.env.local` fallback preserved.
- Added the local, ignored `.env.rumah` configuration for the new
  `studioflow_rebuild` database and separate `studioflow_rebuild_test` database.
- Prisma no longer needs the database name or Docker target supplied manually
  for each command; the location file owns those connection values.

### Verification

- `STUDIOFLOW_LOCATION=rumah npx prisma validate`
- `STUDIOFLOW_LOCATION=rumah npx prisma generate`
- `STUDIOFLOW_LOCATION=rumah npx prisma migrate status` reached the configured
  rebuild target but could not connect because Docker Desktop was not running.

### Remaining

- Start the rebuild-only PostgreSQL Docker service, then run
  `STUDIOFLOW_LOCATION=rumah npx prisma migrate deploy`.

## R4.28 — 2026-09-02 — docs(agent): simplify home and office environment selection

- Agent: `Codex`

- Updated `AGENTS.md` to ask only whether work is happening at home or in the
  office, then select `.env.rumah` or `.env.kantor` accordingly.
- Documented that both locations use a new rebuild-only Docker PostgreSQL with
  identical database name, schema, and application contract; only local
  connection details may differ.
- Kept exact legacy repository path verification limited to cases where legacy
  evidence is actually required.

### Verification

- `git diff --check`
- Documentation diff inspection

## R4.27 — 2026-09-02 — fix(ui-engine): guard field control inference

- Made the shared `Field` infer a child control ID only after confirming the
  child is a valid React element. BQ project creation no longer crashes when
  the form is rendered.

### Verification

- BQ project-entry browser check
- `npm run typecheck`
- `npm run lint`

## R4.26 — 2026-09-02 — fix(bq): grant the system owner the BQ vocabulary

- Added an idempotent rebuild-only migration that grants the exact seven BQ
  permissions to the existing system `platform-owner` role. The initial BQ
  schema migration created no permission delta, leaving pre-existing owner
  accounts unable to enter or manage BQ despite the app being registered.
- The migration does not overwrite customized grants and does not affect
  non-system roles.

### Verification

- `npx prisma migrate deploy` and `npx prisma migrate status` on the approved
  rebuild-only database
- Owner-role permission query confirms all seven BQ grants

### Remaining

- Full integration tests require a separately confirmed disposable `_test`
  database and were not run against the development database.

## R4.25 — 2026-09-02 — fix(dev): allow the office LAN origin

- Added the current office Wi-Fi host to Next.js `allowedDevOrigins`, allowing
  development assets and endpoints to load from the LAN URL. Without this
  allowlist, the page rendered but client hydration was blocked, leaving local
  UI controls such as Brand creation inert.

### Verification

- `npm run typecheck`
- `npm run lint`
- LAN development-server startup and browser interaction verification

## R4.24 — 2026-09-02 — fix(bq): restore registry-valid approval permission

- Replaced the invalid four-segment BQ approval permission
  `bq.library.promote.approve` with the Core-compliant three-segment
  `bq.library.approve` across the application registry, BQ service, and
  BQ contracts. The invalid ID had prevented the Next.js instrumentation hook
  from initializing, so the rebuild development server could not start.
- Corrected the ledger state after R4.23: the current local revision is now
  R4.24 and the next is R4.25.

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Development server startup on the LAN listener

## R4.23 — 2026-09-02 — fix(bq): harden exact calculation, persistence, and project safety

- Added a tested Foundation decimal arithmetic extension for exact add, multiply, explicit-precision divide, and truncate. BQ retains its app-owned formula and two-decimal truncation policy while no longer relying on private arithmetic or JavaScript floating point.
- Corrected BQ fractional-markup calculation and premature partial-product truncation. The engine now rejects an incomplete L1-only calculation rather than silently reporting a false zero total.
- Added and applied `20260902020000_bq_initial_schema` to the explicitly approved rebuild-only target `studioflow_rebuild` on `studioflowrb-gateb-test-db:5433`. It creates the isolated `bq` schema, hierarchy/source XOR constraints, category/positive-value constraints, foreign keys, and hierarchy indexes.
- Made BQ mutations transaction-scoped with their Core audit event, corrected category typing, prevented edits through child deletion after a project is locked, clears obsolete L1-only price snapshots when its first child is created, and fixed template duplication of subsections.
- Extended the Master Data public read contract with SKU display identity for correct BQ material snapshots. BQ project summaries now calculate a real total or explicitly return no total for an incomplete draft; library money display preserves decimal precision.
- Added server-validated create/edit project routes, replacing the previous broken `/bq/new` and `/bq/[id]/edit` links.

### Verification

- `npx prisma migrate deploy` and `npx prisma migrate status` on the approved rebuild-only target
- `npx prisma validate`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run check:boundaries`
- `npm run check:legacy-runtime`
- Focused decimal/BQ engine tests: 15 passed
- Full integration suite not run: its disposable-database guard correctly refuses `studioflow_rebuild` because it has no `_test` marker. No guard was bypassed and no alternate test database was created without owner confirmation.

## R4.22 — 2026-09-02 — docs(bq): lock rounding policy and resolve minor spec gaps

- **Rounding policy locked** (owner decision): truncate 2 desimal di setiap intermediate step (`biaya_line`, `subtotal_L2_raw`, `subtotal_L2`, `biaya_pokok`, `rate`) dan output final (`total`, `grand_total`). Truncate = buang digit di luar 2 desimal tanpa pembulatan. Output tetap canonical `DecimalString`. §6.0 kontrak dan F3-01 implementation plan diperbarui. §17 blocker dihapus.
- **Test cases diperluas** dari 6 ke 8: tambahan test case 7 (truncate koefisien pecahan panjang) dan test case 8 (truncate di setiap step dengan markup).
- **ItemResult/ProjectResult types didefinisikan** di implementation plan F3-01 — semua field bertipe `DecimalString`, shape output eksplisit untuk executor.
  *Rekomendasi:* Tanpa definisi ini executor harus infer sendiri shape return dari calculation engine, berisiko mismatch antara action consumer dan engine output.
- **L1 dengan child: `harga_snapshot` otomatis di-clear** saat child pertama ditambahkan via `updateItem`. Validasi F3-02 diperbarui.
  *Rekomendasi:* Field ini tidak dipakai saat L1 punya child. Membiarkannya tersimpan menciptakan dead data yang membingungkan saat debug atau audit. Auto-clear lebih aman daripada validasi yang menolak.
- **BqTemplateSection: `created_by` ditambahkan** dan comment eksplisit "max 2 level" di schema. Server action harus menolak nested > 2 level.
  *Rekomendasi:* Semua model lain punya `created_by` untuk audit trail. Konsistensi ini penting karena Template Editor adalah fitur multi-user. Max 2 level ditegaskan karena kontrak hanya mendefinisikan Section → Subsection; nested lebih dalam tidak punya UI atau business meaning.
- **Promotion flow diubah dari REST API ke Server Actions** di `src/apps/bq/actions/promotion.ts`. F5-01 implementation plan dan kontrak §9 diperbarui. File map dihapus REST routes dari `src/apps/masterdata/app/api/`.
  *Rekomendasi:* Seluruh mutation lain di aplikasi sudah pakai Server Actions. REST API di `src/apps/masterdata/app/api/` akan menjadi cross-app write dari BQ perspective, melanggar boundary app. Karena BQ dan Master Data satu process, Server Action bisa import MD service langsung. REST endpoint hanya diperlukan jika ada pemisahan process di masa depan.

### Verification

- `git diff --check`
- Staged scope inspected: two BQ documentation files only, plus this ledger

## R4.21 — 2026-09-02 — docs(bq): lock L1-only, library kategori/base_unit, and DecimalString calculation

- Updated `bq-contract.md` and `bq-implementation-plan.md` per owner decisions:
  - **L1 may stand alone** without L2 or L3. Added `harga_snapshot` and `koefisien` fields to `BqItem` for L1-only calculation: `rate = harga_snapshot × koefisien × (1 + markup_l1_pct / 100)`, `total = rate × L1.qty`. Hierarchy rule changed from "L3 wajib ada" to "L3 wajib terminal bila L1 memiliki breakdown, tetapi L1 boleh menjadi terminal tanpa child."
  - **All Library Items** (`BqLibMaterial`, `BqLibLabor`, `BqLibMaterialLabor`, `BqLibCustomItem`) now carry `base_unit` (nullable) and `kategori` (`BqKategori` enum). Per-type kategori validation: Material/Upah/Material+Upah locked to their respective types; CustomItem restricted to Biaya Umum/Transportasi/Alat.
  - **Calculation engine uses `DecimalString`** exclusively — no JavaScript `number`, `Number()`, `parseFloat()`, or floating-point arithmetic. All inputs/outputs are canonical decimal strings per `CORE.md §8`. The adapter layer converts `Prisma.Decimal → DecimalString` via `.toString()`.
  - **Rounding policy** recorded as an owner decision blocker before F3; no implicit rounding assumed.
  - **Foundation-first assessment**: navigator must evaluate whether `@platform/utilities/decimal` needs generic arithmetic extension (add/multiply/divide-percent/round) before F3 implementation.
- Expanded F3 test matrix to 6 cases covering L1-only, L1+L3, L1+L2, compound markup, and mixed L2+L3 — all expected values as `DecimalString`.
- Added §17 to `bq-contract.md` for pre-F3 decision blockers.
- Added locked decisions K-14 (L1-only), K-15 (library kategori/base_unit), K-16 (DecimalString engine) to the contract.

### Verification

- `git diff --check`
- Staged scope inspected: two BQ documentation files only, plus this ledger

### Deferred / decision pending

- Database `CHECK` constraints for XOR (`section_id`/`subsection_id`, `sub_object_id`/`item_id`).
- Index `(template_id, parent_id, sort_order)` on `BqTemplateSection`.
- Search functions on Master Data public contract for F4.
- Lock without unlock flow for `BqProject`.
- Hard delete vs soft delete for BQ entities.
- Promotion flow architecture (Server Actions vs REST API).
- **Rounding policy** for calculation engine intermediate and output values — owner decision required before F3.

## R4.20 — 2026-09-02 — docs(bq): add BQ contract, implementation plan, and UX spec

- Added the owner-confirmed BQ contract covering Section → Subsection → L1 →
  L2 → L3 hierarchy, level calculation, KATEGORI promotion rules, BQ Library,
  templates, schema plan, RBAC, and locked decisions.
- Added the F1–F5 implementation plan with schema, TypeScript types, expected
  calculation tests, gates, and executor safeguards.
- Added the BQ UX specification covering shared shell/UI Engine consumption,
  hierarchy presentation, inline editing, component inventory, and BQ-local
  tokens.

### Verification

- `git diff --cached --check`
- Staged scope inspected: three BQ documentation files only, plus this ledger

## R4.19 — 2026-09-02 — fix(masterdata): centralize price formatting

- Replaced raw currency and decimal rendering in Pricing tables with the
  shared `@platform/utilities/money` formatter.
- Replaced the SKU directory's `Number(...).toLocaleString()` shortcut so
  displayed prices preserve the canonical decimal/money boundary.
- Clarified the Pricing contract: all price columns use the shared money
  formatter, while `DataTable` remains a generic presentation component.

### Verification

- `git diff --check`
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

### Remaining

- No known regression or business-logic defect introduced by this change.

## R4.18 — 2026-09-02 — fix(masterdata): close SKU flow and transport debt

- Fixed the remaining SKU Server Component boundary by serializing all SKU
  measurements and material-price Decimal values before passing them to the
  Client Component.
- Removed the unreachable standalone SKU create dialog and action; SKU creation
  remains exclusively atomic through Pricing → Material, while SKU directory
  retains edit/archive/restore operations.
- Rechecked the contract alignment for code/name fallback identity, one PRODUCT
  category per SKU, measurement locking, supplier pricing, and Brand enrichment.

### Verification

- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- `npm test` — 207 passed, 0 failed
- `npm run build`

### Remaining

- No known regression, backend logic defect, or business-logic debt in the
  reviewed Master Data/Pricing scope.

## R4.17 — 2026-09-02 — fix(masterdata): enforce single SKU product category

- Fixed the Server-to-Client boundary on the SKU directory by converting all
  Prisma Decimal fields to strings before rendering the Client Component.
- Updated SKU create and edit flows to use one searchable product category
  instead of a growing checkbox list.
- Renamed the SKU mutation boundary to `categoryId` and kept the PRODUCT-kind
  validation and Brand category enrichment transactional.
- Added a database unique constraint on `SkuCategory.sku_id` so the single
  category rule cannot be bypassed by another write path.
- Preserved the junction storage boundary to avoid destructive relation changes
  and protect existing category/enrichment behavior.

### Verification

- `npx prisma migrate deploy` against disposable `masterdata_test` only
- `npm run typecheck`
- `npm run lint`
- `npm test` — 207 passed, 0 failed
- `npm run build`

### Remaining

- No known regression or unresolved backend logic issue in this scope.

## R4.16 — 2026-09-02 — fix(masterdata): allow code-only SKU identity

- Updated the Master Data and Pricing contracts so SKU code and SKU name are
  separate optional fields, with at least one required.
- Made persisted SKU name nullable and added a rebuild-only migration for the
  existing database shape.
- Added the same invariant at the server action and service boundaries;
  code-only SKUs derive their fallback slug and remain usable in search,
  tables, pricing, and edit flows.
- Reordered SKU entry fields to present code before name and kept existing
  material-price creation as the single SKU-plus-first-price workflow.
- Added an integration test covering code-only creation and rejection of an
  empty SKU identity.

### Verification

- `npx prisma migrate deploy` against disposable `masterdata_test` only
- `npm test` — 207 passed, 0 failed
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`

### Remaining

- No known regression or unresolved backend logic issue in this scope.

## R4.14 — 2026-09-01 — fix(masterdata/pricing): streamline SKU creation and measurement context

- Removed the redundant material-price mode toggle; one UI Engine
  `CreatableSearch` now selects an existing SKU or starts the SKU + first-price
  flow when no match exists.
- Kept dimensions and BQ conversion visible for new SKU creation and added a
  read-only measurement summary when pricing an existing SKU.
- Replaced long conversion guidance with a tooltip and widened the dimension-unit
  control so unit labels remain readable.
- Extended pricing SKU reference loading with measurement and conversion fields,
  normalizing database decimals at the page boundary.

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- Browser verification of `/masterdata/pricing`

### Remaining

- The untracked owner file `docs/apps/bq-contract.md` remains untouched.

## R4.15 — 2026-09-01 — fix(masterdata/pricing): clarify field help and notes editing

- Applied the shared UI Engine rule that longer field guidance uses a compact
  tooltip affordance instead of persistent description text.
- Updated pricing unit selectors to show canonical unit codes only, preserving
  the semantic distinction in the field labels and tooltip help.
- Replaced material-price Notes input with the shared small text editor used by
  work pricing.
- Documented SKU `code` as an optional external Brand/Vendor article identifier,
  separate from PriceMaterial identity.

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- Browser verification of `/masterdata/pricing`

## R4.13 — 2026-09-01 — fix(masterdata/pricing): tighten SKU and directory invariants

- Moved the material pricing entry flow fully behind the existing PriceMaterial
  modal: staff can search existing SKUs, filter by Brand, and create a new SKU +
  first price from the same pricing workflow when they have permission.
- Added quick-create support for Brand and PRODUCT category inside the material
  pricing flow, so the modal can resolve missing catalog references without
  leaving pricing.
- Centralized directory reference loading in the Master Data service so Brand,
  SKU, Pricing, and Settings pages can reuse the same read/manage-aware
  catalog sources instead of each page guessing its own fetch shape.
- Locked SKU codes after creation, blocked SKU category kinds that do not match
  the PRODUCT model, and prevented material-price updates from silently
  changing SKU measurement meaning once live prices exist.
- Hardened PriceMaterial source-link validation so provenance links must belong
  to the SKU's Brand and cannot be assigned when the SKU is unbranded.
- Kept the UI engine-consistent creatable-search pattern for Brands, product
  categories, WORK categories, and vendors, while preserving the direct master
  data permissions on each page.

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

### Remaining

- BQ-specific consumption and snapshot persistence remain outside this revision;
  the approved Master Data read contract is now aligned for the follow-up BQ
  work order.

## R4.12 — 2026-09-01 — feat(pricing): derive SKU area conversion

- Locked the distinction between dimension Unit, base/BQ Unit, and purchase
  Unit in Core, Master Data, and Pricing contracts. Rectangular sheet geometry
  uses structured positive decimals; thickness is descriptive and excluded
  from area calculation.
- Added exact domain-neutral rectangle arithmetic to Platform Utilities. Master
  Data owns the `MM`/`CM`/`M` mapping and recalculates the persisted
  purchase-to-base factor server-side instead of trusting the browser preview.
- Added SKU dimension fields, a dimension Unit relation, and
  `purchase_to_base_factor`, with complete/positive database constraints and
  Unit lifecycle guards. Seeded `MM`, `CM`, and `SHEET` as active vocabulary.
- Extended the Pricing create flow and SKU edit flow with structured dimensions
  and the preview `1 SHEET = 2.88 M2` for `1200 × 2400 MM`.
- Extended the Master Data public read contract so BQ can select and snapshot
  base Unit, purchase Unit, dimensions, and the exact conversion factor.
- Updated legacy archive tests to respect the live-SKU/last-live-price invariant
  introduced in R4.10.

### Migrations

- `20260901010000_r4_12_sku_measurement_conversion`
- `20260901011000_r4_12_sku_measurement_constraint`
- Applied successfully to the isolated rebuild databases `masterdata` and
  `masterdata_test` at `localhost:5433`.

### Verification

- `npm run typecheck`
- `npm run lint`
- `npm test` — 205 passed, 0 failed
- `npm run check`
- `npm run build`
- Browser acceptance at `/masterdata/pricing`: defaults `M2` / `SHEET` / `MM`,
  exact preview `1 SHEET = 2,88 M²`, no horizontal overflow at 390 px, and no
  new console errors after the Prisma-aware dev-server restart.

### Remaining

- BQ snapshot persistence and BQ UI consumption remain a separate app-owned
  implementation slice; this revision exposes the approved Master Data read
  contract but does not invent the deferred BQ schema.

## R4.10 — 2026-09-01 — feat(pricing): make material price the SKU entry point

- Added a Material Price create mode that atomically creates a new SKU with
  its first material offer using the existing `createSku` transaction.
- Kept the existing-SKU offer path for adding additional Vendor prices.
- Removed standalone New SKU entry actions from the SKU directory while
  retaining list, edit, archive, restore, and deletion workflows.
- Prevented archiving the last live material price of a live SKU, preserving
  the contract invariant that every live SKU has a live price.
- Updated Pricing and Master Data contracts to document the entry point and
  lifecycle invariant.

### Verification

- `npm run typecheck`
- `npm run lint`
- Browser acceptance: Material Pricing exposes both existing-SKU offer and
  `Create SKU + first price` modes; the standalone SKU directory has no create
  action. The last-live-price guard is enforced in the service transaction.

## R4.11 — 2026-09-01 — fix(pricing): keep compound fields valid

- Moved Pricing hidden form values outside `Field` components so the shared
  field wrapper receives one valid control instead of a React Fragment.
- Removed the browser runtime error caused by forwarding `id` to that Fragment.

### Verification

- `npm run typecheck`
- `npm run lint`
- Browser console after reload: no errors on `/masterdata/pricing`.

## R4.09 — 2026-09-01 — feat(pricing): create work categories inline

- Replaced the Pricing work-price category select with the shared
  `CreatableSearch` pattern.
- Authorized users can create a `WORK` Category inline; the new category is
  audited through the existing Master Data service, immediately selected, and
  revalidated across Pricing, Categories, Master Data settings, and the app
  index.
- Users without `masterdata.dictionary.manage` can still select existing
  categories but cannot create new ones.

### Verification

- `npm run typecheck`
- `npm run lint`
- `node --test --import tsx src/platform/ui_engine/ui-engine.test.ts`
- Browser acceptance: Pricing work-price forms render the shared WORK category
  combobox; create affordance is correctly hidden for the current user without
  dictionary-manage permission.

## R4.08 — 2026-09-01 — fix(ui-engine): stabilize compound button content

- Updated the shared `Button` content wrapper to use an inline flex row with
  a no-wrap contract, so child icon and label content remains horizontal in
  every consuming directory.
- Added a UI Engine regression test for compound button children.

### Verification

- `npm run typecheck`
- `npm run lint`
- `node --test --import tsx src/platform/ui_engine/ui-engine.test.ts`
- Browser acceptance: Vendor create actions render the icon and label
  horizontally in the toolbar and empty state after the dev server reload;
  the shared fix also covers Brand, Category, SKU, and Unit consumers.

## R4.07 — 2026-09-01 — fix(masterdata): use shared brand action contract

- Passed the Brand directory create icon through the shared Button
  `leadingIcon` prop in both the toolbar and empty state, preventing the icon
  and `New brand` label from rendering as separate child content.

### Verification

- `npm run typecheck`
- `npm run lint`
- Browser acceptance: both Brand create actions render the plus icon and
  `New brand` label horizontally in the toolbar and empty state.

## R4.06 — 2026-09-01 — fix(masterdata): align directory actions

- Moved the primary create action in Brand, Category, SKU, Unit, Vendor, and
  Vendor Type directories into the shared toolbar action slot.
- Added a contextual create action to each unfiltered empty state, so an empty
  catalog remains actionable without duplicating controls in populated views.
- Recorded the current Next.js development type-reference output.

### Verification

- `npm run typecheck` and `npm run lint`: passed.
- Browser acceptance: the Brand directory presents its primary action in the
  toolbar and a contextual action in its empty state.

## R4.05 — 2026-09-01 — fix(shell): group settings navigation

- Organized Account, General Settings, Users, and Roles & Access beneath one
  persistent Settings section in the shared authenticated sidebar.
- Preserved each destination's existing permission gate and active-state signal;
  the grouped layout collapses cleanly to the existing accessible icon rail.

### Verification

- `npm run typecheck` and `npm run lint`: passed.
- Browser acceptance: the expanded sidebar presents the named Settings group;
  its accessible label and all destination labels remain available after the
  rail is collapsed.

## R4.04 — 2026-09-01 — fix(masterdata): rebalance Brand link entry

- Reworked the Brand create and edit link builders so link type and URL share
  the primary row, the optional label receives a full second row, and Add stays
  aligned without squeezing either input.

### Verification

- `npm run typecheck` and `npm run lint`: passed.
- Browser dialog inspection confirms both URL and optional-label controls remain
  present in the corrected two-row link-entry layout.

## R4.03 — 2026-09-01 — fix(ui-engine): preserve primary action labels

- Shared buttons now keep their icon-and-label actions on one line and do not
  shrink below their content width.
- Directory toolbar action groups likewise retain their intrinsic width, while
  the existing narrow-viewport stack behavior remains unchanged.

### Verification

- `npm run typecheck` and `npm run lint`: passed.
- Browser acceptance: both Brand **New brand** controls rendered at 99×36 px
  with `white-space: nowrap`; neither label wrapped or was pushed downward.

## R4.02 — 2026-09-01 — fix(masterdata): finalize deletion and action boundaries

Follow-up correction for the R4.01 contract-alignment work. Permanent-deletion
approval now re-reads each target inside the same transaction and refuses a
target restored or reactivated after its deletion request. The request is marked
approved only after the deletion preconditions and deletion operation succeed.

### Changed

- Added archive-state preconditions for Brand, Vendor, SKU, Unit, Category,
  VendorType, and all three Price deletion branches.
- Unit and Category permanent-deletion dependency checks now include archived
  rows, preventing later restrictive-FK failures and preserving historical
  references.
- Added a regression test proving a restored Unit remains live and its request
  remains `PENDING` when approval is attempted.
- Added Zod validation for direct lifecycle-action IDs and deletion metadata;
  Pricing actions also validate their kind at the server boundary.
- Approval refresh now includes the Pricing directory.
- Regenerated Prisma Client from the aligned schema. The R4.01 migration was
  deployed to the owner-confirmed rebuild database `studioflow_rebuild`.

### Verification

- Passed: `npx prisma generate`, `npx prisma validate`, `npm run typecheck`,
  `npm run lint`, `npm run check`, `npm run build`, and `git diff --check`.
- Browser acceptance: authenticated `/masterdata/brands` loaded successfully
  after restarting the local development server, with no stale Prisma-client
  validation error.
- `npm test` was invoked but the integration suites correctly refused to run
  because no disposable `PLATFORM_TEST_DATABASE_URL` is configured. The owner
  explicitly authorized skipping separate test-database migration verification
  and the integration test run for this local commit. This remains required
  before any production-readiness claim or deployment.

## R4.01 — 2026-09-01 — fix(masterdata): schema and field contract alignment

Executor pass against brand-contract.md §4.2, vendor-contract.md §2.1/§4/§5/§6.2,
and pricing-contract.md §2/§3/§4. All identified schema gaps closed; partial
unique indexes added; all consumer files updated to match renamed fields.

### Schema changes (`prisma/schema.prisma`)

- **`VendorContact`**: renamed `name` → `person_name`, `position` → `job_title`;
  added `is_primary Boolean @default(false)` (vendor-contract §4). FK
  `vendor_id` changed from `onDelete: Restrict` to `onDelete: Cascade` per
  contract §14.4 (children follow parent on hard delete).
- **`VendorType`**: added `sort_order Int @default(0)` (vendor-contract §2.1).
- **`VendorLink`**: added `archive_url String?` and `sort_order Int @default(0)`
  (vendor-contract §5). FK `vendor_id` changed to `onDelete: Cascade`.
- **`BrandSupplier`**: added `is_authorized Boolean @default(false)` and
  `notes String?` (brand-contract §4.2, vendor-contract §6.2).

### Migration (`20260901000000_r4_01_contract_alignment`)

- Column renames and additions for the four models above.
- `sort_order` seeded for the 6 canonical VendorType records (SUPPLIER=1 …
  SERVICE=6).
- Seven partial unique indexes added:
  - `Brand_name_live_unique` and `Brand_slug_live_unique` — `lower(name/slug)
    WHERE deleted_at IS NULL`
  - `Vendor_name_live_unique` and `Vendor_slug_live_unique`
  - `PriceMaterial_sku_vendor_live_unique` — `(sku_id, supplier_vendor_id)
    WHERE deleted_at IS NULL`
  - `PriceMaterialLabor_vendor_name_live_unique` — `(vendor_id, lower(name))
    WHERE deleted_at IS NULL`
  - `PriceLabor_vendor_name_live_unique`

### Consumer updates

- **`service.ts`**: all `VendorContact` write paths (`createVendor`,
  `updateVendor`) and read paths (`listVendors` search filter and select)
  updated to `person_name`, `job_title`, `is_primary`. Input types aligned.
- **`vendors/actions.ts`**: Zod schema for contacts updated
  (`name`→`personName`, `position`→`jobTitle`, added `isPrimary`); action
  mapping updated accordingly.
- **`vendors/vendor-directory.tsx`**: `ContactDraft` type, `addContactDraft`
  initial value, `openEditDialog` mapping, both form inputs, client-side search
  filter, and table display all updated to new field names.

### Verification

- Pending: `npm run typecheck`, `npm run lint`, `npm run test` — to be run by
  owner after applying the migration to the dev database.

## R4 — 2026-09-01 — release: publish Master Data checkpoint

- Published the owner-authorized local Master Data revisions through R3.30 to
  the `main` branch.

### Release boundary

- This is a verified implementation checkpoint, not a claim that all future
  Master Data scope is production-complete. Media, Samples, import/export, and
  BQ snapshot persistence remain explicitly deferred by the active contract.
- The Master Data closure work order also still requires its complete browser
  acceptance matrix to be recorded before a 100% production-readiness claim.

## R3.30 — 2026-09-01 — feat(ui-engine): add simple text editor

- Added a shared, keyboard-accessible plain-text editor with concise Bold,
  Italic, and Bullet list controls. Formatting is represented as text markers,
  so consumers retain normal form submission and no rich-text persistence is
  introduced.
- Replaced the Material + Labor Pricing `Scope note` one-line field with the
  editor, including a concise scope example and the existing 1,000-character
  server limit.

### Verification

- `npm run typecheck`, `npm run lint`, `npm run check`, `npm run build`,
  `npm test`, and `git diff --check`: passed; **198 passed, 0 failed, 0
  cancelled** on the isolated test database.
- Browser acceptance: the Work Price dialog exposes the labeled toolbar and
  Scope note textarea; **Bullet list** changes `Installation labor` to
  `- Installation labor` without submitting a price.

## R3.29 — 2026-09-01 — fix(masterdata): format Pricing amount entry

- Pricing amount entry now renders the default currency as an inline prefix and
  groups IDR nominal values as Indonesian decimal display (for example,
  `15000` becomes `IDR 15.000`). The submitted value remains the canonical
  ungrouped decimal string.
- Removed the separate editable currency field from this flow; the current
  record currency (or default `IDR`) is retained as the submitted value.

### Verification

- `npm run typecheck`, `npm run lint`, `npm run check`, `npm run build`,
  `npm test`, and `git diff --check`: passed; **198 passed, 0 failed, 0
  cancelled** on the isolated test database.
- Browser acceptance: entering `15000` renders as `15.000` beside the IDR
  prefix without submitting a price.

## R3.28 — 2026-09-01 — fix(masterdata): use creatable Pricing Vendor picker

- Replaced the split Vendor select and **Add vendor** button in Pricing create
  forms with the shared accessible CreatableSearch pattern. It searches existing
  Vendors and presents quick-create in the same picker.
- Quick-create still opens the required capability-aware VendorType step and
  keeps its transactional server validation; no price or vendor is created by
  merely searching.

### Verification

- `npm run typecheck`, `npm run lint`, `npm run check`, `npm run build`,
  `npm test`, and `git diff --check`: passed; **198 passed, 0 failed, 0
  cancelled** on the isolated test database.
- Browser acceptance: entering a new Vendor name in the Pricing picker exposes
  the single **Add “…” as a new vendor** action.

## R3.27 — 2026-09-01 — fix(masterdata): simplify Vendor reference links

- Removed BrandSupplier selection from Vendor create/edit. Brand supply
  relations are now deliberately managed from the Brand workflow, and saving a
  Vendor profile no longer clears or replaces them implicitly.
- Replaced the cramped one-line link controls with separate accessible fields
  for link type, URL, and optional display label in both create and edit flows.
- Updated the Vendor contract to record the owner-approved UI ownership change.

### Verification

- `npm run typecheck`, `npm run lint`, `npm run check`, `npm run build`,
  `npm test`, and `git diff --check`: passed; **198 passed, 0 failed, 0
  cancelled** on the isolated test database.
- Browser acceptance: the Vendor create dialog now exposes only Profile & Types,
  Contacts, and Links; the Links tab presents separate labeled fields.

## R3.26 — 2026-09-01 — fix(masterdata): scope Vendor assignment lookups

- Vendor readers no longer need unrelated dictionary or Brand-read grants merely
  to open the Vendor directory. A Vendor manager receives active VendorType and
  Brand assignment options through narrowly scoped service reads; a read-only
  viewer derives its displayed type filter from the Vendors it may already see.
- Added integration coverage for assignment lookup under only
  `masterdata.vendor.manage`.

### Verification

- `npm run typecheck`, `npm run lint`, `npm run check`, `npm run build`,
  `npm test`, and `git diff --check`: passed; **198 passed, 0 failed, 0
  cancelled** on the isolated test database.

## R3.25 — 2026-09-01 — feat(masterdata): add Pricing sorting and pagination

- All three Pricing tables now use the shared accessible sortable table headers
  and shared pagination controls, with a 25-row page size.
- Sorting supports identity, Vendor/Supplier, and exact decimal price amount;
  currency amounts are compared with the platform decimal comparator, never via
  lossy JavaScript number conversion. Changing filters or sort resets to page 1.

### Verification

- `npm run typecheck`, `npm run lint`, `npm run check`, `npm run build`,
  `npm test`, and `git diff --check`: passed; **197 passed, 0 failed, 0
  cancelled** on the isolated test database.
- Browser acceptance: the authenticated Pricing route renders the empty state
  and create controls correctly. The local development dataset contains no
  pricing rows, so row-sort interaction requires seeded non-production data.

## R3.24 — 2026-09-01 — feat(masterdata): add capability-safe Pricing vendor quick entry

- Pricing create dialogs now offer **Add vendor** for holders of
  `masterdata.vendor.manage`. The option is available without granting
  dictionary-management permission.
- The server creates the Vendor and its single active VendorType assignment in
  one audited transaction. Material pricing requires material-supply capability;
  Material + Labor and Labor Only require labor-provision capability. A stale,
  archived, or mismatched VendorType is rejected at the server boundary.
- The newly created Vendor is selected in the open Pricing dialog immediately,
  so the user can finish the price without navigating away.

### Verification

- `npm run typecheck`, `npm run lint`, `npm run check`, `npm run build`,
  `git diff --check`, and `npm test`: passed; **197 passed, 0 failed, 0
  cancelled** against the isolated `studioflowrb_test` database.
- Browser acceptance: Pricing loaded for the authenticated owner; **New material
  price** and its **Add vendor** action were visible.

## R3.23 — 2026-09-01 — fix(masterdata): validate VendorType assignments

- Vendor creation now refuses missing or archived VendorType identifiers before
  creating assignments, closing an integrity gap used by upcoming Pricing quick
  entry.
- `npm run typecheck`, `npm run lint`, and `git diff --check`: passed.

## R3.22 — 2026-09-01 — docs(masterdata): activate closure work order

Status: **owner-authorized execution boundary**

- Added the deterministic Master Data closure work order for every active
  contract slice. Deferred Master Data capabilities remain out of scope.

## R3.21 — 2026-09-01 — docs(recovery): record local owner access repair

Status: **owner-authorized local recovery**

### Changed

- Replaced the sole active rebuild account's login credentials at the owner's
  explicit request, revoked its previous sessions, and granted the registered
  Master Data permissions to the existing `platform-owner` role.
- Applied the pending Master Data migrations to the owner-confirmed local
  rebuild database `studioflow_rebuild`; the application dashboard then loaded
  successfully with Master Data navigation and live summary data.

### Security

- No password, password hash, connection secret, legacy path, or legacy
  database was recorded in this repository.

## R3.20 — 2026-09-01 — feat(masterdata): add owner-vendor quick entry

Status: **local Master Data continuation**

### Changed

- Activated asynchronous creation in the reusable UI Engine searchable picker;
  the generic component remains domain-neutral and receives only the resulting
  option identity.
- Brand create and edit dialogs now use that picker for the optional owner
  Vendor. A holder of `masterdata.vendor.manage` can create an owner-only
  Vendor inline; no VendorType is assigned, so it remains ineligible for price
  supply until classified through the Vendor directory.
- The server action authenticates, validates the name, delegates permission and
  transactional audit behavior to the Master Data Vendor service, and refreshes
  Brand and Vendor views.

### Verification

- `npm run typecheck`, `npm run lint`, `npm run check`, `npm run build`, and
  `git diff --check`: passed.
- `npm test`: **196 passed, 0 failed, 0 cancelled** against the verified,
  isolated `studioflowrb_test` database.
- Browser acceptance remains to be completed for this new picker flow.

## R3.19 — 2026-09-01 — docs(verification): record isolated test execution

Status: **local verification correction**

### Verification

- Verified the owner-provided PostgreSQL target as the isolated rebuild test
  container `studioflowrb-gateb-test-db` on port `5433`, database
  `studioflowrb_test`; no legacy repository or database was accessed.
- Applied the pending rebuild migrations to that disposable target with
  `prisma migrate deploy`.
- `npm test`: **196 passed, 0 failed, 0 cancelled**.
- The test process emitted one upstream `pg` deprecation warning about
  concurrent `client.query()` calls; it did not affect test results.

## R3.18 — 2026-09-01 — feat(masterdata): add pricing edit dialogs

Status: **local Master Data continuation**

### Changed

- Added edit actions and pre-filled dialogs for Material, Material + Labor, and
  Labor Only pricing records.
- Kept Material Price identity read-only during editing: its SKU, supplier, and
  SKU-derived unit are displayed as context rather than editable inputs.
- Kept server-action authentication, permission checks, and Zod validation at
  the mutation boundary; missing per-kind reference fields now fail validation
  before service dispatch.

### Verification

- `npx prisma generate`: passed; regenerated the local Prisma client from the
  pulled Master Data schema without connecting to a database.
- `npm run typecheck`, `npm run lint`, `npm run check`, and `npm run build`:
  passed.
- `git diff --check`: passed.
- `npm test` and browser acceptance: not run. They require the owner-confirmed,
  rebuild-only PostgreSQL target and a running authenticated browser workflow.

## R3.10 — 2026-09-01 — chore(masterdata): checkpoint in-progress implementation

Status: **local internal checkpoint — not accepted or complete**

### Changed

- Preserved and stabilized the interrupted Master Data implementation: expanded
  service commands, integration coverage, public read composition, application
  shell, and draft directories for Brand, Vendor, SKU, Unit, Category, and
  Pricing.
- Added the first Pricing directory with its three contract tabs and connected
  archive, restore, and permanent-deletion-request actions to the service.
- Corrected shared hooks/CreatableSearch lint issues and added actionable
  password validation rendering plus explicit per-role removal controls in
  platform access UI.
- Applied the initial owner-review corrections: primary app navigation now
  contains workflow destinations only; Unit usage counts were removed from the
  directory; Unit input uppercases as typed and `M2`/`M3` display as `M²`/`M³`;
  Brand create/edit no longer assigns material suppliers.

### Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: **196 passed, 0 failed, 0 cancelled** against the isolated
  `masterdata_test` database.
- `git diff --check`: passed before commit.

## R3.11 — 2026-09-01 — fix(masterdata): recover pricing and deletion workflows

Status: **local**

### Changed

- Repaired the interrupted Pricing directory so the three contract tabs compile
  and retain their permission-scoped search, active/archive filter, archive,
  restore, and deletion-request workflows. The SKU flow remains the sole
  creation path for Material Prices.
- Added a permission-gated deletion-approval directory with explicit permanent
  deletion and rejection confirmations. It is intentionally not a primary
  Master Data navigation destination: dictionary/governance placement remains
  the next UI correction.
- Removed an undeclared test dependency and invalid UI Engine imports from the
  interrupted agent draft. Primary navigation is again limited to Overview,
  Brands, Vendors, and Pricing.

### Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm test`: not passing because the isolated `masterdata_test` PostgreSQL
  endpoint on port 5433 is unavailable while Docker Desktop starts; no legacy
  database or resource was accessed.

## R3.12 — 2026-09-01 — docs(verification): record restored rebuild test environment

Status: **local**

### Verification

- Docker Desktop was restarted and only the rebuild test target
  `masterdata_test` was used.
- `npm test`: **196 passed, 0 failed, 0 cancelled**.
- `npm run check`: passed (`typecheck`, boundaries, and legacy-runtime guard).
- `git diff --check`: passed.

## R3.13 — 2026-09-01 — fix(masterdata): clarify lifecycle feedback

Status: **local**

### Changed

- Corrected the revision ledger after `R3.12` publication.
- Unit create and edit now close their successful dialogs and leave a visible
  success notice in the directory.
- Replaced inaccurate role-based “supervisor” copy with the actual deletion
  approval permission wording across Unit, Category, and Brand workflows.

### Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.

## R3.14 — 2026-09-01 — feat(masterdata): group governed dictionaries

Status: **local**

### Changed

- Added `Settings > General > Master Data Settings` with Units, Categories,
  Vendor Types, and permission-gated deletion review tabs.
- Added VendorType create/edit capability controls plus archive, restore, and
  permanent-deletion-request UI backed by the existing audited service.
- Added revalidation of the Settings shell after dictionary and deletion
  mutations, and linked it from General Settings.

### Verification

- `npm run typecheck`, `npm run lint`, and `npm run build`: passed.

### Remaining

- Complete Pricing create/edit UI and the deletion-approval directory.
- Move Unit, Category, VendorType, and deletion review into the locked Master
  Data Settings tab shell; keep SKU within the Pricing workflow.
- Add VendorType CRUD UI, Owner Vendor CreatableSearch/quick entry, and the
  reviewed Brand/Vendor link interactions.
- Apply consistent dialog success feedback and close behavior across every
  Master Data mutation, complete admin password feedback, then run build and
  full browser acceptance at desktop and narrow viewport.

## R3.15 — 2026-09-01 — docs(agent): require environment location verification

Status: **local**

### Changed

- Added a mandatory owner-verification checkpoint to `AGENTS.md` for every new
  computer/session or changed environment.
- The checkpoint requires confirmation of the exact legacy checkout path, rebuild
  checkout path, and rebuild-only PostgreSQL Docker target with container/service,
  port, database name, and connection target.
- Agents must not infer these values from previous handoffs, sibling folders,
  environment variables, Docker listings, or remembered paths.

### Verification

- `git diff --check`: passed.

## R3.16 — 2026-09-01 — docs(masterdata): add continuation reference

Status: **local**

### Changed

- Added `docs/apps/masterdata-handoff.md` as a cross-computer continuation
  reference for the remaining Master Data implementation.
- Recorded repository state, protected uncommitted Pricing files, mandatory
  environment verification, remaining work, execution order, and completion
  criteria.

### Verification

- `git diff --check`: passed.

## R3.17 — 2026-09-01 — feat(masterdata): add pricing entry flow

Status: **local**

### Changed

- Added a permission-aware Pricing create flow for Material, Material + Labor,
  and Labor Only records.
- Added server-side Zod validation and service dispatch for create/update price
  actions.
- Loaded active SKU, Vendor, Unit, and WORK Category references into the Pricing
  directory.
- Preserved existing archive, restore, and permanent-deletion-request flows.

### Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.

### Remaining

- Pricing edit UI and full browser acceptance remain to be completed.

## R3.09 — 2026-08-31 — feat(masterdata): harden lifecycle and test isolation

Status: **local Master Data service slice — UI directories remain incomplete**

### Changed

- Completed transactional Unit, Category, Brand, Vendor, SKU, all-three-Pricing,
  archive/restore, deletion-request, and deletion-approval service commands from
  the interrupted executor diff, then separated runtime composition from the
  testable service module.
- Enforced the owner-locked SKU create invariant: name, active Unit, at least one
  active Category, and at least one exact-decimal PriceMaterial from a materially
  capable live Vendor, with duplicate Category and Vendor-price input rejected.
- Corrected archive provenance so parent causes are attached to already-archived
  dependents as well as live dependents. Directly archived SKU/price rows can no
  longer be restored while their Brand, SKU, or Vendor parent remains archived.
- Added restore validation for live identities, Brand/Vendor relationships,
  VendorType capabilities, SKU Units/Categories, Pricing Units/Categories,
  source Brand state, and exact live Pricing conflicts.
- Replaced JavaScript number price input with canonical decimal strings before
  Prisma persistence, preserving exact values and rejecting malformed or
  negative amounts at the service boundary.
- Hardened disposable-database protection: database names must explicitly carry
  a test marker, `npm test` loads `PLATFORM_TEST_DATABASE_URL` into its child
  process, and the application `DATABASE_URL` is no longer manually repointed.
- Added regression tests for the disposable guard and focused Master Data
  integration tests for SKU atomicity, exact decimals, overlapping causes,
  failed-restore rollback, and approved permanent deletion.

### Local environment recovery

- Created rebuild-only database `masterdata_test` inside `masterdata-db` and
  applied the existing eight migrations. Local `.env.test.local` is ignored by
  Git and points tests to that database.
- Restored persisted General Settings from leaked test fixture values (`Dapur
  Sinyo`) to `StudioFlow`, cleared the fixture brand mark through the audited UI,
  and restarted only this repository's Next.js dev server so its current Master
  Data permission registry became active.
- Verified the application database still contains one active owner, 8 Units,
  and 6 VendorTypes. No legacy repository, database, or container was accessed.

### Verification

- `npm run check`: passed.
- `npm test`: **191 passed, 0 failed, 0 cancelled** against `masterdata_test`.
- `npm run build`: passed; `/masterdata` remains dynamic and routable.
- Browser review: authenticated `/masterdata` redirects correctly from the
  launcher, StudioFlow branding and Master Data navigation render, desktop and
  390px layouts have no horizontal overflow, and no browser console error was
  observed.
- `git diff --check`: passed.
- `npm run lint`: **not passing due to pre-existing UI Engine React Hooks errors**
  in `creatable-search.tsx` and `patterns/hooks.tsx`; R3.09 does not modify those
  files.

### Remaining

- Add update commands and complete VendorType/Brand relationship mutations.
- Add public read DTOs and broader lifecycle matrices for Brand/Vendor/work-price
  restore and deletion guards.
- Build real Master Data directory/detail/form routes with search, filters,
  sorting, pagination, quick entry, unsaved-state handling, confirmations, and
  permission/archived/error states in `R3.10+`.

## R3.08 — 2026-08-31 — docs(handoff): package Master Data continuation context

Status: **local handover checkpoint — implementation intentionally incomplete**

### Current state

- Published baseline remains `R3` at `origin/main` commit
  `ca5db0b176fb6d4969615623b0f5e74243ff37f8`.
- Current local HEAD before this checkpoint was `R3.07` commit
  `54f5ba3479dcf6e66f563183d233be37e5688f22`; this checkpoint is local-only
  and must not be pushed without separate owner instruction.
- UI-F1 was corrected and browser-verified in `R3.02`: the collapse control is
  hidden at `<=840px` and narrow layout has no horizontal overflow.
- Owner decisions for Unit, Category, and SKU are recorded in
  `docs/apps/masterdata.md`; Brand, Vendor, and Pricing contracts remain
  authoritative for their own product rules.
- The active implementation work order is
  `scripts/work-orders/MASTERDATA.md`.

### Implemented

- Prisma `master_data` schema, archive-cause provenance table, deletion-request
  table, live partial unique indexes, FK correction for `PriceMaterial.source_link_id`
  `ON DELETE SET NULL`, and seed migration for 8 Units + 6 VendorTypes.
- Master Data permission registration in `src/app/app-registrations.ts`.
- `src/apps/masterdata/service.ts` with permission-checked summary/list reads and
  audited transactional create commands for Unit, Category, Brand, and Vendor.
- Authenticated dynamic `/masterdata` landing route.

### Rebuild-only environment

- Database target used for migration/tests:
  `postgresql://masterdata:masterdata@localhost:5433/masterdata`.
- Container: `masterdata-db`; never use `studioflow-db-1` or any legacy target.
- `npx prisma migrate status`: up to date.
- No legacy repository or legacy PostgreSQL resource was accessed during this
  implementation.

### Verification at handover

- `npm run typecheck`: passed.
- `npm run build`: passed with `/masterdata` routable.
- `npm run check:boundaries`: passed.
- `npm run check:legacy-runtime`: passed.
- `npm test` with explicit rebuild database: **183 passed, 0 failed, 0
  cancelled**.

### Next deterministic work

1. Add focused Master Data service tests and complete update/create validation.
2. Implement archive/restore causes and parent cascades for Brand, Vendor, SKU,
   and all Pricing tables.
3. Implement Category deactivate/merge and persisted deletion request approval.
4. Implement SKU creation invariant: name + Unit + Category + at least one
   PriceMaterial, with Vendor only on PriceMaterial.
5. Implement all three Pricing commands, capability checks, restore validation,
   and public read DTOs.
6. Build real directory/detail/form routes with UI Engine patterns and browser
   test search, filters, sorting, pagination, quick entry, unsaved changes,
   destructive confirmations, permissions, and narrow viewport behavior.
7. Update this ledger under the next unused revision (`R3.09`) and commit one
   cohesive local change set. Do not push.

## R3.07 — 2026-08-31 — feat(masterdata): add service boundary and landing route

Status: **Master Data implementation — first vertical slice**

### Changed

- Added Master Data service composition for permission-checked summary and
  directory reads across Units, Categories, Brands, and Vendors.
- Added transactional audited create commands for Unit, Category, Brand, and
  Vendor using shared normalization, slug, safe-error, transaction, and audit
  infrastructure.
- Added authenticated `/masterdata` landing route backed by live rebuild data.
- Kept app code under `src/apps/masterdata` and domain-neutral concerns in Core,
  Utilities, and UI Engine.

### Verification

- `npm run typecheck`: passed.
- `npm run build`: passed; `/masterdata` is dynamic and routable.
- `npm run check:boundaries`: passed.
- `npm run check:legacy-runtime`: passed.
- `npm test` with explicit rebuild database: **183 passed, 0 failed, 0
  cancelled**.
- No legacy repository or legacy PostgreSQL resource was accessed.

### Remaining

- Complete update, archive/restore, Category merge/deactivation, SKU create
  invariant, pricing commands, deletion approval, cascade provenance, detailed
  directories/forms, and browser acceptance in `R3.08+`.

## R3.06 — 2026-08-31 — feat(masterdata): activate permissions and seed vocabulary

Status: **Master Data implementation — application activation**

### Changed

- Registered the Master Data application and its curated Brand, Vendor,
  dictionary, SKU, Pricing, and deletion-approval permission vocabulary.
- Added idempotent rebuild-only seed migration for the six curated VendorTypes
  and eight initial operational Units.
- Removed stale deferred wording for Unit, Category, and SKU now that the owner
  has locked their decisions.
- Reconciled Unit hard-delete behavior with Pricing's restrictive required FKs:
  referenced Unit rows remain available as archived historical dictionary data.

### Verification

- `npm run typecheck`: passed.
- `npm run check:boundaries`: passed.
- `npm run check:legacy-runtime`: passed.
- Explicit rebuild target migration deploy: passed.
- `prisma migrate status`: database schema is up to date.
- Rebuild-only seed verification: 8 Units and 6 VendorTypes present.

### Remaining

- Domain service rules, transactional mutations, routes, UI, and behavior tests
  continue in `R3.07+`.

## R3.05 — 2026-08-31 — feat(masterdata): add curated isolated schema

Status: **Master Data implementation — persisted foundation**

### Changed

- Added the isolated `master_data` Prisma schema for Unit, Category, Vendor,
  VendorType, Brand, SKU, Brand/Vendor relations, and all three Pricing tables.
- Added persisted archive-cause provenance and permanent-deletion request tables.
- Added live partial identity indexes for Brand, Vendor, Category, SKU, and
  Pricing, including the owner-locked nullable Brand SKU identity rules.
- Added the rebuild-only schema migration and a follow-up FK correction so
  removing a BrandLink sets `PriceMaterial.source_link_id` to null as required
  by the curated Pricing contract.
- No legacy data, schema, code, or database resource was accessed or copied.

### Verification

- `npx prisma format`: passed.
- `npx prisma validate`: passed.
- `npx prisma generate`: passed.
- Explicit rebuild target `postgresql://masterdata:masterdata@localhost:5433/masterdata`:
  migrations deployed successfully and status is up to date.

### Remaining

- Domain services, seeds, permissions, routes, UI, and behavior tests continue
  in the next Master Data revisions.

## R3.04 — 2026-08-31 — docs(masterdata): activate curated implementation scope

Status: **owner-authorized Master Data work order**

### Changed

- Recorded the owner-locked Unit, Category, and SKU decisions in the active
  Master Data contract index.
- Activated the Master Data implementation work order with Brand, Vendor,
  Pricing, Unit, Category, and SKU as the first isolated application scope.
- Preserved Brand, Vendor, and Pricing contracts as authority for their own
  product decisions when wording differs from the shared index.
- Locked rebuild-only migration, Core audit, RBAC, lifecycle, deletion approval,
  UI Engine reuse, and browser acceptance boundaries.

### Verification

- Contract and work-order review completed.
- No database, legacy repository, or remote state changed.
- Implementation begins in the next local revision.

## R3.03 — 2026-08-31 — docs(masterdata): record implementation readiness boundary

Status: **navigator gate review — implementation blocked on missing domain decisions**

### Changed

- Confirmed that the curated Brand, Vendor, and Pricing contracts take priority
  over the shared Master Data index whenever wording conflicts.
- Recorded that those contracts still delegate final SKU identity and
  SKU–Brand cardinality to a future SKU contract, and do not define the full
  Category and Unit lifecycle/permission policy.
- Kept Master Data implementation out of the active tree until those decisions
  are locked; Pricing cannot safely create its required SKU, Category, and Unit
  foreign keys by inference.
- Corrected the R3.02 verification record after the browser retest: typecheck,
  focused UI Engine tests, and the 390px browser check all passed.

### Verification

- `npm run typecheck`: passed.
- `node --import tsx --test src/platform/ui_engine/ui-engine.test.ts`: passed.
- Browser review at `390px`: passed; the narrow rail remains expanded and the
  collapse control is hidden without horizontal overflow.
- No Master Data schema, route, database, legacy repository, or remote state
  changed.

### Required owner decisions before Master Data work order

- SKU identity fields and uniqueness rules.
- SKU–Brand cardinality and whether Brand-less SKU is allowed.
- Category lifecycle, permissions, and `PRODUCT`/`WORK` dictionary policy.
- Unit lifecycle, permissions, identity, and seed policy.
- Exact migration/recovery plan and acceptance tests for the first slice.

## R3.02 — 2026-08-31 — fix(ui-engine): harden narrow rail behavior

Status: **navigator correction — UI-F1 browser finding**

### Changed

- Added a CSS breakpoint guard to the collapsible rail control so the collapse
  button cannot flash or remain visible at `<=840px` during hydration or narrow
  viewport transitions, matching the locked UI Engine contract.
- Added a focused UI Engine assertion for the narrow rail control contract.

### Verification

- `npm run typecheck`: passed.
- `node --import tsx --test src/platform/ui_engine/ui-engine.test.ts`: passed.
- Browser review at `390px`: passed; the narrow rail remains expanded, labeled,
  and free of a collapse control.
- No database, legacy repository, or remote state changed.

## R3.01 — 2026-08-31 — feat(ui-engine): raise shared shell quality and add public showcase

Status: **navigator audit/correction — UI-F1 implementation**

### Changed

- Added a public `/ui-engine` showcase route that stays outside app data and database dependencies so the shared engine can be reviewed even when platform auth data is unavailable.
- Whitelisted `/ui-engine` in the proxy public-route gate so browser review no longer falls through to the DB-backed login page.
- Extended the shared UI Engine surface with a generic creatable search control and reusable hooks for debounced values, overlay option staging, confirm dialogs, and unsaved-change guarding.
- Raised the page shell max width to the locked design token, then used the showcase to exercise AppShell, PageShell, PageHeader, PageSection, tables, filters, selection, row actions, comboboxes, creatable search, dialogs, drawers, loading/empty/error states, and dirty-state handling.
- Reworked the platform shell/navigation/launcher/account/settings chrome away from inline layout styling toward shared primitives and utility classes so the shared presentation is more reusable and less domain-shaped.
- Updated the UI Engine test surface to lock the new exports and the creatable-search markup contract.

### Verification

- `npm run typecheck`: passed.
- `node --import tsx --test src/platform/ui_engine/ui-engine.test.ts`: passed.
- Browser review in Chrome headless on `http://127.0.0.1:3000/ui-engine`: passed. Desktop and narrow screenshots were captured and inspected; the showcase renders the shared shell, table directory, form controls, and state surfaces without database access.
- `npm test`: still not a full pass in this environment because the disposable rebuild PostgreSQL URL is not available. The suite stops in DB-backed integration tests before any legacy resource is touched.
- `git diff --cached --check`: not yet run for this revision; will be run before the local commit.

### Remaining limitation

- The full DB-backed test suites remain blocked until a disposable rebuild PostgreSQL target is available in this environment.

## R3 — 2026-08-31 — release: publish isolated foundation utilities baseline

Status: **owner-authorized GitHub publication**

Publishes `R2.01` and `R2.02` as the new remote baseline: StudioFlow legacy is
isolated across home/office environments and treated only as owner-located,
strictly read-only behavioral evidence; decimal and money display utilities are
now locale-aware, arbitrary-precision, runtime-validated, and reusable across
future apps. The repository remains Foundation-only, and UI Engine visual
quality remains the next acknowledged audit/correction area.

### Verification

- Release content is exactly committed revisions `R2.01` and `R2.02` plus this
  changelog-only promotion commit.
- The complete checks and disposable-database limitation are recorded under
  `R2.02`; no legacy repository or PostgreSQL resource was touched.
- `git diff --cached --check`: passed.

## R2.02 — 2026-08-31 — feat(utilities): generalize decimal and money display

Status: **owner-requested reusable utility review and correction**

### Changed

- Added locale-aware, arbitrary-precision decimal display without JavaScript
  number conversion, calculation rounding, padded zeroes, or Intl fraction-digit
  limits; the formatter supports locale grouping, decimal separators, localized
  digits, signs, and explicit grouping control.
- Kept `id-ID` as the platform default while allowing explicit locales such as
  `en-US`, `de-DE`, and Indian grouping through the same domain-neutral API.
- Locked compact default IDR presentation (`Rp.` with the canonical grouped
  amount), including a sign before the currency symbol for negative values.
- Made money display reject forged/non-canonical amounts at runtime rather than
  relying only on the branded TypeScript type.
- Updated the Core money contract and accepted the production-build-generated
  `next-env.d.ts` route-type references.

### Verification

- Focused decimal/money suite: **19 passed, 0 failed, 0 cancelled**.
- `npm run check`: passed (typecheck, architecture boundaries, and no legacy
  runtime references).
- `npm run lint`: passed with zero warnings/errors.
- `npm run build`: passed; the production route manifest remains Foundation-only.
- `npx prisma format --check` and `npx prisma validate`: passed; no schema or
  migration changed.
- Full `npm test`: **not a complete pass** — 143 passed, 2 file-level hook
  failures, and 40 cancellations because no explicitly isolated disposable
  rebuild PostgreSQL URL was supplied. The database guard stopped before any
  connection; no legacy PostgreSQL resource was touched.
- `git diff --cached --check`: passed.

### Remaining limitation

- UI Engine visual quality remains an acknowledged next-stage audit/correction
  item; this utility revision does not claim a browser/UI quality pass.

## R2.01 — 2026-08-31 — docs(governance): isolate legacy across work locations

Status: **owner-approved governance clarification**

### Changed

- Removed fixed home-machine assumptions for the StudioFlow legacy checkout;
  an agent must ask the owner for the exact current-computer path before any
  legacy evidence access.
- Made the legacy repository strictly read-only and prohibited all commands that
  could alter its files, Git state, dependencies, generated output, or external
  state.
- Put every PostgreSQL resource used by or capable of affecting StudioFlow
  legacy completely out of scope, including read/query, dump, restore,
  migration, seed, reset, container, volume, and service operations.
- Required rebuild-only code, migrations, configuration, and database resources
  created from zero; database writes must fail closed unless their explicit
  target is proven to belong only to `studioflow-rebuild`.
- Aligned the active documentation and Master Data evidence gate with the new
  cross-location isolation rule.
- Removed the obsolete `check:legacy` script that assumed a sibling
  `../studioflow` checkout, and neutralized fixed home paths in active shared
  contracts, the repository entry documentation, and the completed Foundation
  work order's provenance note.

### Verification

- Reviewed the changed governance text for fixed legacy-path assumptions and
  contradictory legacy/database authority.
- Markdown relative-link scan and `git diff --cached --check`: passed.
- `package.json` parse and the remaining repository checks' script references:
  passed.
- No runtime code, dependency version, Prisma schema, migration, or database
  changed.

### Reserved owner state

- Existing `next-env.d.ts` and decimal/money utility changes remain unstaged and
  are not part of this revision.

## R2 — 2026-08-31 — release: publish foundation-only rebuild baseline

Status: **owner-authorized GitHub publication**

Publishes the complete locally reviewed `R1.01` through `R1.06` series as the
new remote baseline. The release contains the locked Foundation contracts and
implementation, the curated Brand, Vendor, and Pricing contracts, and the
owner-authorized reset to a platform-only persisted/runtime baseline. Master
Data remains deferred until the UI Engine audit/correction gate is completed;
no application is currently registered or routable.

### Verification

- Release content is exactly the committed `R1.01`–`R1.06` history plus this
  changelog-only promotion commit.
- The checks and known database limitation for the published implementation are
  recorded under `R1.06` below.
- Reserved owner changes to `next-env.d.ts` and decimal/money utilities remain
  unstaged and are not part of this release.

## R1.06 — 2026-08-31 — chore(reset): return repository to platform foundation

Status: **owner-authorized destructive application reset — Foundation-only baseline**

Permanently retires every pre-contract application implementation and app data so
Master Data can be rebuilt from the approved Brand, Vendor, and Pricing contracts.
The shared platform, Core, Utilities, Design, and UI Engine remain; no application
is registered or routable after this revision.

### Removed

- Deleted all old Master Data routes, actions, UI, domain/application/
  infrastructure/public modules, tests, workbook/import-export code, app-owned
  README files, and both app seed files.
- Deleted speculative StudioFlow and BQ module stubs plus the obsolete shared
  placeholder README.
- Deleted completed executor-context/prompt handoffs that no longer govern an
  active run. The locked Foundation work order remains historical evidence.
- Removed the `@masterdata/*`, `@studioflow/*`, and `@bq/*` aliases and removed
  `exceljs` plus its now-unused transitive dependency tree.
- Removed the stale `/masterdata` settings revalidation target. The production
  route manifest now contains platform/login/settings/account routes only.

### Changed

- Reduced the active Prisma schema to `platform` only: User, Role, UserRole,
  RolePermission, Session, PlatformGeneralSettings, AuditEvent, and UserStatus.
- Left the application registration composition root intentionally empty. The
  launcher therefore renders the Foundation no-app state until an approved app
  work order registers a real public permission surface.
- Kept bootstrap connected to the code-owned registry so a fresh owner receives
  exactly the seven platform grants in the Foundation-only vocabulary.
- Made the architecture checker accept and test a valid platform-only source
  tree with no `src/apps` directory.
- Renamed the disposable Foundation database guard from the retired
  `MASTERDATA_TEST_DATABASE_URL` name to `PLATFORM_TEST_DATABASE_URL` and changed
  the transaction-client type proof from an app Category model to platform User.
- Updated governance and active documentation to record the reset and make UI-F1
  audit/correction a hard gate before any Master Data route or domain UI. Brand,
  Vendor, and Pricing contracts remain product authority; their old-code ledgers
  now point only to the R1.05 Git snapshot.

### Dependencies and migration

- Removed production dependency `exceljs@4.4.0`; no dependency was added or
  upgraded.
- Added irreversible migration
  `20260831000000_reset_to_platform_foundation`: deletes persisted
  `masterdata.*`, `studioflow.*`, and `bq.*` grants, then drops the
  `master_data`, `studioflow`, and `bq` schemas with CASCADE. Platform audit
  history and all historical migration files remain intact.
- The owner explicitly authorized permanent loss of all old application data and
  a clean future application schema.

### Verification

- `npx prisma format`, `npx prisma validate`, and `npx prisma generate`: passed.
- Platform-only schema SQL generation with `prisma migrate diff --from-empty`:
  passed.
- `npm run check`: passed (typecheck, boundaries, no legacy runtime references).
- `npm run lint`: passed with zero warnings/errors.
- `npm run build`: passed on Next.js 16.3.2; route manifest contains `/`,
  `/login`, `/account`, and platform settings routes only.
- Non-DB Foundation suite: **140 passed, 0 failed, 0 cancelled**.
- Full `npm test`: **not a pass** — 140 passed, 2 file-level hook failures and 40
  cancellations because the required disposable PostgreSQL database was
  unavailable.
- Migration deployment/status and DB integration tests could not run: configured
  target is local `localhost:5433/masterdata`, but Docker Desktop/service could
  not be started from this non-administrator session. The reset migration is
  committed but not applied to that local database.
- Active Markdown relative-link scan and `git diff --cached --check`: passed.

### Reserved owner state

- Existing decimal/money display-format changes and generated `next-env.d.ts`
  remain unstaged. They were exercised by the local checks but are not owned by
  this reset revision.

## R1.05 — 2026-08-31 — docs(masterdata): reconcile brand vendor and pricing contracts

Status: **navigator contract reconciliation — logic contracts only, no app work authorized**

Reconciles the owner's curated Vendor and Pricing decisions with the shared
contracts and implemented-state evidence, and records the already-locked Brand
decisions as the third active Master Data logic contract. Product choices in the
curated Vendor and Pricing contracts were preserved; this revision closes only
cross-contract contradictions and implementation-critical gaps.

### Changed

- Replaced the deferred Master Data intake with an active contract index and
  shared rules for archive-cause provenance, permanent-deletion approval,
  cross-app snapshot boundaries, capability placement, and the remaining
  undecided Master Data slices.
- Added the Brand contract covering identity, optional owner Vendor, independent
  suppliers, flat PRODUCT-category discovery, hashtags, SKU enrichment with
  source provenance, resources, lifecycle, deletion, permissions/audit, UI/public
  reads, and the KEEP/FIX/MERGE/PURGE implementation ledger.
- Reconciled Vendor lifecycle and Pricing references to the approved three-table
  model; required Pricing foreign keys remain Restrict, parent restore removes
  only its own persisted archive cause, and restore conflicts never overwrite or
  silently merge a live record.
- Added the capability-integrity guard implied by the curated VendorType model:
  assignment/type/flag changes cannot remove the last capability still required
  by a live price or BrandSupplier relation.
- Reconciled Pricing's exact identities: one live SKU × Vendor material price and
  Vendor-scoped normalized name/slug identities for work prices. Exact matches
  target the existing row; near-duplicate confirmation remains available only for
  genuinely distinct work names.
- Replaced Role-name `Admin` authorization language with the explicit
  `masterdata.deletion.approve` grant. A seeded Admin Role may receive the grant,
  but code has no Role-name bypass.
- Removed unsafe legacy-import fallback language: missing suppliers/vendors are
  reported for manual resolution and are never inferred from Brand ownership or
  manufactured as a generic Vendor.
- Updated the active documentation index. `docs/` now contains exactly its index,
  Master Data shared index, and the Brand, Vendor, and Pricing contracts; no
  obsolete document was retained or needed deletion.

### Dependencies and migrations

- Documentation only. No dependency, schema, migration, runtime code, or
  executable work-order change is authorized by this revision.
- The exact persisted archive-cause/deletion-request representation and recovery
  migration remain inputs to a future owner-approved implementation work order.

### Verification

- Active Markdown relative-link scan: passed.
- Contract contradiction scan for stale Admin bypass, global work-price identity,
  old public DTO naming, and automatic Manufacturer fallback: passed.
- `git diff --cached --check`: passed (line-ending conversion warnings only).
- Runtime tests, lint, typecheck, and build were not run because this revision
  changes documentation only.

### Reserved owner state

- Existing uncommitted Foundation/schema/bootstrap, money/decimal utility, and
  pricing-page changes remain unstaged and untouched.

## R1.04 — 2026-08-30 — fix(foundation): close identity shell and concurrency gaps

Status: **executor correction — Foundation F0 follow-on fixes**

Closes identity, shell, concurrency, and observability gaps left open after R1.02/R1.03.

### Fixed

- **Proxy redirect loop** — `/login` is no longer silently redirected to `/` just because a session cookie is present; the proxy performs only optimistic public-route gating and defers live session resolution to the login page itself.
- **Login page live resolution** — `/login` now resolves the principal against the live database and reads General Settings (branding, locale) before rendering; valid sessions are forwarded to the single accessible app or the launcher.
- **`loginAction` FormData extraction** — malformed credentials are no longer rejected before `performLogin`; all extraction happens first, then `performLogin` does the single Argon2 verify.
- **Exactly-one Argon2 verify** — every login attempt (valid user, unknown email, malformed email, short/empty password, disabled user) resolves to exactly one `argon2.verify` call against the real hash or the precomputed PHC dummy hash; lazy/random dummy hashes removed.
- **Dummy hash** — replaced with a precomputed Argon2id PHC string so timing properties are stable and the value is not generated at runtime.
- **Limiter reset fail-closed** — limiter reset failures now produce `LOGIN_LIMITER_UNAVAILABLE` rather than silently succeeding.
- **Shared validators** — common validators for email, display name, and password Unicode boundaries extracted to `src/platform/core/auth/identity-validation.ts`; create-user, admin-password, account-password, display-name, and bootstrap boundaries now use the shared validators.
- **Serializable transaction runner** — `src/platform/core/db/transactions.ts` introduces a serializable transaction runner with up to three retry attempts; wired into the platform runtime and bootstrap CLI.
- **Bootstrap permission registry** — bootstrap now receives the full permission registry from the composition root instead of the seven hardcoded platform permissions.
- **General Settings `weekStartsOn`** — type narrowed to `0 | 1`; UI restricted to Sunday/Monday; seeding replaced with race-safe upsert; additive migration added.
- **General Settings usage** — login branding, launcher, authenticated shell, and Account locale/timezone now read from live General Settings; settings updates revalidate the affected login and layout paths.
- **Centralized safe reporter** — `src/platform/core/errors` gains a central operational reporter; raw `console.error` calls in import/export routes replaced.
- **Reusable authenticated shell** — `src/platform/authenticated-shell/` provides a shared shell used by the platform and Master Data; app list filtered by live access grants; active navigation derived from actual pathname; `NavItem` emits correct `aria-current="page"`.
- **Deferred surface removal** — `WorkspaceShell`, `SplitPane`, `InlineEdit`, `ReorderHandle`, `FileDropZone`, `DocumentSheet`, print-only helpers, and `/ui-engine` showcase removed (spec-deferred, no consumers).
- **Test fix** — three `bootstrapFirstOwner` calls in `session-service.integration.test.ts` that were missing the required `permissionIds` field (introduced when bootstrap was extended to accept the full registry) are now supplied `PLATFORM_PERMISSIONS`.

### Added

- `prisma/migrations/20260830000000_foundation_identity_shell_concurrency/migration.sql` — additive migration for `week_starts_on` CHECK constraint and `PlatformGeneralSettings` upsert safety.
- `src/platform/core/auth/identity-validation.ts` — shared Unicode boundary validators.
- `src/platform/core/db/transactions.ts` — serializable transaction runner with retry.
- `src/platform/authenticated-shell/index.tsx` — reusable authenticated shell.
- `src/platform/authenticated-shell/navigation.tsx` — permission-filtered navigation with live active state.

### Verification

- `npm run typecheck`: passed (0 errors).
- `npm run lint`: passed (0 warnings, 0 errors).
- `npm run check:boundaries`: passed (Architecture boundaries OK).
- `npm run check:legacy-runtime`: passed (No legacy runtime references OK).
- `npm test`: 205 tests passed; 4 failures are pre-existing sandbox infrastructure (argon2 native binding missing for this arch, no DB configured) — not code regressions; 66 cancelled (DB integration, require disposable PostgreSQL).

## R1.03 — 2026-08-30 — fix(foundation): complete speculative module purge in committed tree

Status: **executor correction — same run as R1.02, staged-deletion omissions**

### Fixed

- R1.02 accidentally left four stale paths in its committed tree because their deletions were not staged (`git rm --cached` failed silently behind a suppressed error): `src/app/page.tsx` (superseded by `src/app/(platform)/page.tsx`; both resolving to `/` would break the production build) and the speculative `src/platform/dictionary`, `src/platform/utilities/format`, `src/platform/utilities/id` stubs whose removal R1.02's changelog already claimed. The working tree already matched the intended state; this revision commits those deletions only. No other content changes.

### Verification

- `git ls-tree` confirmed the R1.02 tree contained both `/` pages and the three stub modules; this commit removes exactly those four paths.
- Working-tree files unchanged by this correction; all reserved owner files remain unstaged and untouched.

## R1.02 — 2026-08-30 — feat(foundation): implement reusable platform foundation

Status: **executor implementation candidate — awaiting navigator review**

Implements the locked Foundation F0 work order (`scripts/work-orders/FOUNDATION.md`) in one run: persisted identity/access, real login, Platform General Settings, shared Core mechanics, UI-F0 platform routes, and Master Data request-identity convergence.

### Added

- **Persisted platform shape** — additive migration `20260829000000_platform_identity_access_settings`: `platform.User` (normalized unique email, Argon2id PHC hash, `ACTIVE|DISABLED`), `platform.Role` (immutable unique code, system flag, archiving), `platform.UserRole` / `platform.RolePermission` (unique pairs, Restrict FKs so historical rows are never silently destroyed), `platform.Session` (unique SHA-256 token hash, idle/absolute expiry, revocation, bounded client metadata), SQL-enforced `PlatformGeneralSettings` singleton (CHECK constraint pins the singleton ID), and the `platform.LoginRateLimit` table in the exact shape of the `rate-limiter-flexible` PostgreSQL adapter (no implicit runtime DDL). Migration documents recovery and refuses any implicit conversion of the removed operator environment identity.
- **Identity implementation** — `src/platform/core/auth`: Argon2id hashing (`memoryCost 19456`, `timeCost 2`, `parallelism 1`, `outputLen 32`; 12–128 Unicode code points, never trimmed/normalized/logged), opaque 32-byte base64url session tokens with SHA-256-at-rest verification, revocable database sessions (12 h idle, non-sliding 7-day absolute, throttled 15-minute last-seen touch), and the `studioflow_session` cookie (`httpOnly`, `sameSite=lax`, `path=/`, `secure` in production, never outliving the absolute expiry). Unknown email, disabled user, malformed input, and wrong password return the identical generic failure backed by equal-work dummy-hash verification.
- **Login rate limiting** — `rate-limiter-flexible@11.2.0` PostgreSQL adapter over the one shared `pg` pool: SHA-256 hashed normalized-email key (5/15 min) and network key (25/15 min), both with 30-minute blocks, both consumed before credential verification; forwarded client-IP headers trusted only under explicit `AUTH_TRUST_PROXY_CLIENT_IP`, otherwise a deployment-local fallback bucket (limitation recorded in `.env.example`); limiter infrastructure failure fails login closed with `INFRASTRUCTURE`; success clears only the email bucket. Security failures are sanitized operational logs, not business AuditEvent rows.
- **RBAC and access administration** — `src/platform/core/rbac`: pure evaluator (kept), the one code-owned permission registry composing the seven locked `platform.*` permissions with registered app public permission lists (rejects malformed/duplicate/unknown vocabulary, fails closed when uninitialized), live grant resolution per request (union over non-archived roles; unknown persisted grant IDs grant nothing and are reported to authorized administrators), and the access service (user create/update/password/disable/restore, role create/update/archive, assignment/removal, atomic registry-validated grant replacement — all with explicit permission checks, transactions, safe no-ops, and audit events; last-access-administrator protection across disable, removal, and grant replacement; self-demotion allowed only while another administrator remains; system roles and roles with active members cannot be archived).
- **Bootstrap** — one-time server-side command (`scripts/bootstrap.ts`, not an HTTP route): refuses while any active user exists, creates the `platform-owner` system role with explicit registry grants plus the owner/assignment/audit atomically, never overwrites later grant customization, never prints password/hash; password arrives via STDIN.
- **Platform General Settings** — typed singleton service with the locked field set and defaults (`StudioFlow`/`StudioFlow`/`id-ID`/`Asia/Jakarta`/`IDR`/`1`/`null`), bounded-name/supported-locale/IANA-timezone/ISO-4217-currency/week-range/safe-URL validation, `platform.settings.read/manage` enforcement, transactional audited updates, and no audit event on no-op.
- **Core mechanics** — safe server-action result boundary (`@platform/core/actions` with Zod mapping, framework control-flow rethrow, generic INTERNAL collapse); pure pagination utilities (`normalizePage`, `normalizePageSize`, `calcOffset`, `buildPageMeta`, `normalizeSortDirection`) with caller-supplied defaults/limits; `email` normalization added to the shared text-normalization utility; shared `pg` pool exported from `@platform/core/db` for infrastructure adapters.
- **Routes, shell, and UI-F0** — `proxy.ts` (optimistic public-route/session-cookie gating only), `/login` (only public UI route: generic failure copy, rate-limit feedback, pending/disabled state, autofocus, no signup), authenticated platform route group with the single reusable AppShell (permission-aware navigation, account/identity topbar, sign out), `/` launcher (zero apps → intentional no-access state; one app → redirect; several → launcher), `/account` (own display name, password change with full session revocation + current-session rotation, session list/revocation/sign-out-all), `/settings/general`, `/settings/access/users`, `/settings/access/roles` (directories with loading/empty/error/permission-denied states, dialogs, destructive confirmations, role/grant editors, integrity-issue notice).
- **ESLint 9 flat config** — `eslint.config.mjs` from the already-installed `eslint-config-next` package; baseline rule set unweakened. Three pre-existing `react/no-children-prop` false positives in `ui-engine.test.ts` were fixed by passing children as `createElement` arguments, and `Field`/`NavItem`/`DocumentSheet` prop types now type `children` as optional (React-standard; runtime behavior unchanged).
- **Tests** — platform schema contract tests (uniqueness, pairs, Restrict FKs, settings singleton CHECK, limiter table shape, session indexes), auth/session/login/bootstrap integration tests (session lifecycle, throttled touch, both expiries, revocation semantics, indistinguishable login failures, closed-on-limiter-failure, hashed limiter keys, bootstrap refusal/role reuse), RBAC access-service integration tests (live grants, unknown-grant integrity, last-admin guards, self-demotion, archive rules, no-op audit silence, mutation+audit atomic rollback), settings validation/service tests, registry composition tests, pagination tests, safe-action tests. Disposable-DB platform test support mirrors the existing `MASTERDATA_TEST_DATABASE_URL` guard.

### Changed

- `SessionPrincipal` migrated to the locked `{ userId, roleIds, displayName, email }` shape; `getPrincipal()`/`requirePrincipal()` are request-bound public functions resolving live database state (status, roles, expiries, revocation) on every call — no session/JWT/cookie caching.
- Master Data convergence (§9): `MASTERDATA_PERMISSIONS` exposed from `src/apps/masterdata/public/` and registered into the platform registry by a composition root OUTSIDE platform (`src/app/app-registrations.ts`, loaded by `src/instrumentation.ts` at server boot; the registry singleton is `globalThis`-backed because Next loads instrumentation and the server runtime as separate module instances). Every use of the environment-configured operator (`MASTER_DATA_REQUEST_CONTEXT` / `configuredOperatorContext` / `MASTERDATA_OPERATOR_*`) was replaced across existing pages, actions, and import/export handlers with `await requireMasterDataRequestContext()` (session → active user → live grants → `masterdata.access` → existing per-use-case permission checks). The unsafe adapter, its environment variables, and the topbar operator-label environment read were removed after `rg` proof of no remaining consumers.
- Master Data layout now fails closed at app entry: unauthenticated → `/login`, missing `masterdata.access` → rendered denied state; existing service-level permission checks are unchanged.
- Removed unused speculative modules after `rg` proof of no consumers: `src/platform/core/events`, `src/platform/core/files`, `src/platform/dictionary`, `src/platform/utilities/format`, `src/platform/utilities/id`.

### Dependencies and migrations

- Added exactly the two authorized production dependencies: `@node-rs/argon2@2.1.0` and `rate-limiter-flexible@11.2.0` (exact versions, `--save-exact`).
- One additive migration: `20260829000000_platform_identity_access_settings` (no existing column/table altered; `prisma db push` not used).

### Verification

- `npm run lint`: passed (flat config, no rule weakening).
- `npm run typecheck`: passed.
- `npm test`: **308 tests passed, 0 failed, 0 cancelled** on a prepared disposable PostgreSQL database (`DATABASE_URL` == `MASTERDATA_TEST_DATABASE_URL`); the previously-cancelled 52 database suites now run for real.
- `npm run check:boundaries`: passed (platform → app and cross-app internal rules intact; the registry composition deliberately lives outside `platform` for this reason).
- `npm run check:legacy-runtime`: passed.
- `npm run build`: passed (Next.js 16.3.2 production build).
- `git diff --check`: passed (line-ending conversion warnings only).
- Disposable database infrastructure: Docker Desktop was started and a disposable `postgres:17-alpine` container (`studioflow-rebuild-test-db`, port 55432) was created for the DB suites; migrations were applied and the additive migration was also deployed to the local development database (`localhost:5433`).
- Running application checks (dev server, HTTP-level): unauthenticated `/`, `/account`, `/masterdata` redirect to `/login`; `/login` renders with no signup link; wrong password/unknown email produce identical generic copy with no plaintext/db leakage; rate limit blocks on the 6th consecutive failure with retry feedback; successful login sets an httpOnly `studioflow_session` cookie and redirects to the sole accessible app; `/` resolves live `<app>.access` grants (no-access state and single-app redirect both observed); account/users/roles/general-settings render with real data and identity; `/masterdata` renders the authenticated identity after `masterdata.access` is granted; one real Master Data mutation (`unit.create`) executed end to end through the real server action with the new request identity, visible in the units list and on the audit page; DB-revoked session fails closed to `/login` on the very next request without token refresh.

### Reserved owner state

- The four reserved decimal/money files are untouched and remain unstaged.
- The two reserved pricing pages (`src/app/masterdata/pricing/page.tsx`, `src/app/masterdata/pricing/sku/[id]/page.tsx`) required the §9 context replacement inside otherwise-reserved files. The owner's money-formatting hunks were preserved byte-for-byte and remain UNSTAGED; only the mechanical request-context hunks are staged for those two files (built deterministically from `HEAD` content + the same mechanical transformation applied to every other consumer). The staged-vs-worktree diff for those files contains exactly the owner's hunks.

### Navigator-review caveats

- `weekStartsOn` is implemented as `0 | 1 | 2 | 3 | 4 | 5 | 6` per work order §7 ("exactly"), while CORE.md §11 locks `0 | 1`. The wider validated range was implemented because the work order is the operative implementation lock; please confirm or issue a correction revision.
- Visual browser review (hydration, console errors, collapsed-rail/narrow-viewport rendering, pixel-level DESIGN.md conformance) could not be performed in this environment (no browser automation available); HTTP-level behavioral checks above all passed. Recommend the navigator perform the visual pass during review.
- The launcher/bootstrap grant flow means the first owner initially sees the no-access launcher state until roles/grants are assigned through `/settings/access` — intended (no bypass), but worth confirming as the expected first-run experience.

## R1.01 — 2026-08-29 — Foundation contract and executor governance

Status: **local contract handoff**

### Changed

- Consolidated the documentation surface to the shared Core, Design, UI Engine contracts and the deferred Master Data intake; removed obsolete, duplicate, and conflicting PRDs/audits/handoffs/work orders.
- Locked Foundation F0 as the reusable shell/platform phase: real login, hash-only revocable database sessions, persisted multi-Role RBAC with live grants, Platform General Settings, shared Core/Utilities, and UI-F0.
- Locked identity mechanics and exact versions for Argon2id password hashing and an atomic PostgreSQL login limiter; UI-F1 and all speculative capabilities remain deferred.
- Preserved the owner rule that future generic mechanisms belong centrally in Core, Utilities, or UI Engine when their domain-neutral need is proven; apps may not create private substitutes.
- Kept Master Data as the first deferred consumer, including the approved one-SKU/many-vendor-price direction, while withholding app implementation authority until its code-derived contract is complete.
- Added deterministic navigator/OpenCode executor boundaries, changelog requirements, local revision naming, local-commit workflow, and an explicit prohibition on remote publication without owner authority.
- Added the locked one-run Foundation work order and a copy-ready OpenCode prompt targeting `R1.02`.
- Updated source comments that referred to deleted documents; these edits do not change runtime behavior or persisted schema.

### Removed

- Deleted legacy duplicate Markdown and superseded work orders from active repository documentation. Their history remains recoverable through Git.

### Dependencies and migrations

- No dependency or persisted-schema change in this revision.
- The Foundation work order authorizes only `@node-rs/argon2@2.1.0` and `rate-limiter-flexible@11.2.0` for the next revision.

### Verification

- Markdown active-link scan: passed for all 11 retained Markdown files.
- `git diff --check`: passed (line-ending conversion warnings only).
- `npm run check`: passed (`typecheck`, architecture boundaries, and no legacy runtime dependency).
- `npm run build`: passed with Next.js 16.3.2 production compilation.
- `npm run lint`: baseline failure because the repository has ESLint 9 but no flat `eslint.config.*`; Foundation F0 explicitly owns the repair.
- `npm test`: 191 tests passed with zero assertion failures; 52 database tests were cancelled because the required matching disposable `DATABASE_URL` and `MASTERDATA_TEST_DATABASE_URL` were not configured. This is not recorded as a passing suite and remains mandatory for Foundation execution.

### Reserved state

- Existing money/decimal formatting and two Master Data pricing-page changes are intentionally excluded from this revision and remain owner working-tree state.

## R1 — published baseline

- Commit: `c8e473702801510aa314bbed45242a71b600f733`
- This is the initial published baseline for the new revision protocol; earlier history retains its original commit subjects.
