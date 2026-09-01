# Changelog

This file is the authoritative revision ledger. Revision/commit rules are in `AGENTS.md`.

## Revision state

- Published baseline: **R4** (commit `8116d5a`, 2026-09-01)
- Current revision: **R4.19**
- Next local revision: **R4.20**
- Remote publication: **authorized by the owner on 2026-08-31**

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
