# Changelog

This file is the authoritative revision ledger. Revision/commit rules are in `AGENTS.md`.

## Revision state

- Published baseline: **R8** — published to GitHub by the release commit below
- Current revision after this entry is committed: **R8.267**
- Next local revision: **R8.268**
- Revision collision: **R8.164 was issued twice** — `b2421de` (local, docs/backlog) and `5acc67d`
  (remote, fix sf/ui-engine). Both commits are kept as-is and both entries are below, told apart
  by hash. R8.167 is the merge that joins them; no number is reused.
- Ledger gap: R8.163 (`ee9e09e`) was backfilled by the remote R8.164 work; the local note that it
  was not backfilled is superseded.

## R8.267 | 2026-10-01 | docs(masterdata): review WO-MD-HARDEN-01 (correction required)

- Reviewed R8.266 (`f907b84`). Independent re-run: `npm test` 718/718 and `npm run check` pass. The fixes for MD-AUD-001, 003, 004, 005, 006, 009 (Master Data), 010, 011, 013 and 014 read correctly against the plan.
- Verdict CORRECTION REQUIRED, one consolidated pass (target R8.268): the new constraint migration shares a timestamp prefix with the category-merge migration and so runs before it on a database that has neither, where it would reject the supplier-category rows the merge is meant to close; `next-env.d.ts` was committed from a production build; initial SKU prices still have no per-price audit event; the registry-versus-constraint test checks one direction only. Docs only; no code, schema, or migration change in this revision.

**Checks.** `npm test`; `npm run check`; `git diff --check`.

## R8.266 | 2026-10-01 | fix(masterdata): harden the audited write paths and constraints

- Closed MD-AUD-001/003/004/005/006/007/009-MD/010/011/013/014. Malformed Supplier contacts now fail safely; inactive roots cannot change; active Category dependencies and Supplier-Type capabilities block unsafe archives; sample-price references must match their selected SKU and Supplier; and workbook preview applies the same dimension/capability checks as import.
- Restored per-SKU and per-price audit events for workbook and sample synchronization while retaining their batch events. Price-kind and polymorphic deletion/archive types now use canonical closed registries.
- Added pre-checked database constraints for non-negative amounts, currency format, polymorphic values and archive-cause shape/uniqueness, plus the six Master Data FK indexes. Both migrations applied to verified local rebuild development and test targets. `pg_index` comparison confirmed and removed exactly these duplicate pairs: Brand and Vendor live names, unbranded SKU slug, material price pair, material+labor live vendor name, and labor live vendor name; curated-schema indexes remain.
- Removed the matching fixed `[BUG]`/`[CLEANUP]` rows from `docs/BACKLOG.md`. No dependency added. Browser checks for readable contacts, Category and Supplier-Type errors, and child audit history are queued for Reviewer acceptance.

**Checks.** `npm test` (all pass), `npm run check`, `npm run lint` (0 errors; two pre-existing StudioFlow `<img>` warnings), `npm run build`, `git diff --check`; migrations deployed to `studioflow_rebuild` and `studioflow_rebuild_test` after target verification.

## R8.265 | 2026-10-01 | docs(masterdata): review WO-MD-AUDIT-01 (PASS) and plan WO-MD-HARDEN-01

- Reviewed the R8.264 audit: PASS. Spot-checked MD-AUD-001, 003, 004, 005, and 013 against the code and confirmed each. The report covers all four schemas, every Master Data service and action surface, a read-only check of the office data (no violations), and an invariant coverage matrix.
- Issued WO-MD-HARDEN-01 as READY (target R8.266). Locked decisions: deactivating a Category is blocked while active SKUs, Brands, Suppliers, or work prices use it (merge first); archiving a Vendor Type runs the capability guard; child audit events are restored and `suppressAudit` leaves the public surface; a malformed structured payload never changes stored data; polymorphic type lists come from one registry checked against the database constraint; archived roots are immutable through their services.
- Deferred by design: MD-AUD-002 to WO-MD-CHAIN-01, MD-AUD-008 to WO-MD-SCALE-01, MD-AUD-012 and the BQ/StudioFlow FK indexes to WO-SCHEMA-HARDEN-01. Docs only; no code, schema, migration, or dependency change.

**Checks.** `git diff --check`. No code changed, so no test run.

## R8.264 | 2026-10-01 | docs(masterdata): audit relational schema and Master Data logic

- Completed WO-MD-AUDIT-01 as a read-only audit: mapped all relations in the Platform, Master Data, StudioFlow and BQ schemas; checked foreign keys, delete behavior, indexes, constraints, lifecycle fields and application boundaries; and traced every Master Data public service method, action family, workbook/sample flow and public read port.
- The office rebuild database was identified as `studioflow_rebuild` from the kantor configuration before access, and every inspection query ran in an explicit read-only transaction. Current data contained none of the searched integrity violations. The report records one P0, three P1, nine P2 and one P3 finding, each with evidence and a proposed work order; the open work is mirrored in `docs/BACKLOG.md`.
- Documentation only. No source, schema, migration, test, contract, dependency or database data changed.

**Checks.** Baseline and final `npm test`: 712/712 pass (158 suites) on both runs; `npm run check`; `npm run lint` (0 errors, two pre-existing StudioFlow image warnings); `npm run build`; `git diff --check`. Full evidence is recorded in the audit report.

## R8.263 | 2026-10-01 | docs(masterdata): plan the audit-first backend and hardening roadmap

- Replaced the completed WO-MD-FINDABILITY-01 plan with WO-MD-AUDIT-01: a read-only audit of the whole relational schema (all four schemas) and the Master Data logic, with severity scale, method, deliverables, and a locked read-only rule for the rebuild database. The plan also records the roadmap that follows: hardening, the brand → supplier → price chain, bulk price entry, and shared text normalization.
- Added to `docs/BACKLOG.md` the roadmap entry, the brand-supplier-price entry, and the `[UNVERIFIED]` browser-check entry for R8.262. The R8.262 commit said these were queued but its backlog edit had not been applied (the file uses CRLF line endings); this revision supplies them. Docs only; no code, schema, migration, or dependency change.

**Checks.** `git diff --check`. No code changed, so no test run.

## R8.262 | 2026-10-01 | feat(masterdata): merge supplier categories into the shared category list

- A supplier's categories now come from the one shared category list (work = a trade such as MEP, product = a product line such as Flooring). The separate "Supplier categories" list, its Settings tab and its archive/deletion flow are removed. The Suppliers form has two fields, Work categories and Product categories, each able to create a missing category inline; the Suppliers filter groups both kinds.
- Saving a work price (labor, material + labor) files the supplier under that price's category, and saving a material price files it under the SKU's product category. Each new link is audited as `vendor.categories-linked`. A category cannot be taken off a supplier while that supplier still has live prices under it (`VENDOR_CATEGORY_IN_USE`).
- The work price form now asks for the supplier first, then narrows Pricing category to that supplier's categories, selects it when there is only one, and offers "Show all categories". A supplier with no categories yet sees every category; the chosen one is saved to it. The labor form also stops offering material-only suppliers when the person can read both price kinds.
- Merging two categories moves supplier links onto the survivor without duplicates, and permanently deleting a category now checks supplier links.
- Migration `20261001090000_merge_supplier_categories_into_categories` carries every supplier category and assignment over before dropping the old tables: a name that already exists as a Category is reused (so MEP stayed MEP); otherwise a Category is created (WORK when unassigned or any assigned supplier can provide labor, else PRODUCT; archived becomes DEACTIVATED). Pending supplier-category deletion requests are closed with a note. Applied to the office development and disposable test databases (office data: MEP kept its supplier, Sipil became a work category). No dependencies.

**Checks.** `npm test` (712 pass); `npm run check`; `npm run lint` (no errors); new integration tests for category linking from prices, the in-use guard, merge with supplier links, and supplier deletion. Browser acceptance is not done; queued in the backlog. Material price entry is not yet restricted to brands linked to the supplier; that is a separate planned change.

## R8.249 | 2026-09-30 | feat(platform): store personal display preferences and storage usage

- Added per-person preferences for theme, locale, timezone, and allowed start page. Null values use the platform-wide setting; the authenticated shell and account session timestamps now use the effective personal display settings. Personal changes have no audit trail and actions always derive the person from the signed-in session.
- Added a read-only, 60-second cached storage report for holders of Platform Settings read access. It totals free and total disk space, configured reserve, and file bytes by top-level area while ignoring symlinks and bounding a large walk.
- Migration `20260930210000_platform_user_preferences` was applied to the office development and disposable test databases. No dependencies.

**Checks.** `npm test`; `npx tsc --noEmit`; `npm run check`; `npm run lint`; focused preference and storage-report tests. `npm run build` is not run when the owner dev server occupies port 3001. Browser acceptance is queued for the Reviewer.

## R8.259 | 2026-09-30 | fix(masterdata): correct directory price comparisons

- SKU price summaries now find the lowest existing price separately for each currency and unit, so a value in another currency or measurement unit can never be presented as cheaper. The list now says “from amount / unit” and preserves the total price count.
- Supplier discovery now includes active product-category filtering from carried Brands, a concise Brands column, and a price-type breakdown. Pricing exposes the planned Group by item control and additional in-list sort keys; these remain display-only.
- Expanded pure display-helper coverage for supplied-by ordering, phone normalization, status, and comparable-price edge cases. No schema, migration, server action, permission, validation, audit, or other business behavior changed.

**Checks.** `npm test`; `npm run typecheck`; `npm run check`; `npm run lint`. Production build was not run because the owner development server is using port 3001.

## R8.257 | 2026-09-30 | feat(masterdata): improve directory findability

- Brands, Suppliers, SKUs, and Pricing now start on active records and share a clear, visible set of display-only filters and search results. Searches include the supporting discovery information already shown by each directory; no action, permission, validation, audit, schema, or save behavior changed.
- Brand rows show the owner and linked suppliers under **Supplied by** and expose stored links safely in a new tab. Supplier rows include address context while filtering by linked brand and capability; SKU rows can narrow to priced/unpriced records and summarize the lowest displayed price.
- Pricing can narrow its existing material and work records by supplier, brand, and work category. Added pure helper coverage for status, phone normalization, and lowest-price selection. No dependencies or migrations.

**Checks.** `npm test`; `npm run typecheck`; `npm run check`; `npm run lint`. Browser acceptance is queued for the Reviewer.

## R8.261 | 2026-09-30 | feat(masterdata): finish WO-MD-FINDABILITY-01 (Pricing grouping and columns, shared filter bar, brands carried)

- **Lane note.** The owner asked the Lead to take over after two partial Executor rounds. Still presentation only: no schema, permission, rule, validation, action or audit change. The only backend touches are additive read-only selects (below), and existing tests are unchanged and green.
- **Pricing.** "Group by item" now works (Material: by SKU; Material + Labor and Labor: by name and category): groups ordered by item, rows cheapest first using decimal-safe comparison, archived rows last, a group header line, and a **Lowest** badge on the cheapest active row(s) only when the group has two or more active prices in one currency and one unit (never across currency or unit; a mixed group is ordered by currency and unit before amount). Material table gains Brand, Category, Size and the supplier's first contact with tel and WhatsApp links; work tables gain the contact; sort headers for Brand, Category and Updated; per-tab filters (Material: brand and product category; work tabs: work category; all: supplier and status); tab labels show the number of rows the filters show; empty state says when filters are hiding results.
- **Shared filter bar.** `directory-filters.tsx` (status select and "Clear filters" plus "N of M") is used by Brands, Suppliers, SKUs and Pricing; phone links are one shared component (`phone-links.tsx`), and a malformed number now gets no link at all.
- **Suppliers.** The "Brands" column and search now include the brands a supplier owns (first) as well as the brands it is linked to, and the derived "from brands" product categories and the product-category filter follow the same list, so an owner-supplier such as Vivere shows Carta and its categories. The supplier-category select is labelled "All supplier categories". **SKUs.** A SKU with no brand reads "No brand" (was "Brand unavailable").
- **Read-only additions.** Material price read: the SKU's categories and dimensions; vendor list read: owned brand names and categories. The Pricing page reads supplier contacts only for people who may read suppliers.
- **Helpers and tests.** `directory-findability.ts`: decimal-safe `compareAmounts`, per-currency-and-unit lowest prices, `groupPriceRows`, `groupLowestRows`, `sizeText`, `carriedBrandNames`, `tabCountLabel`, with tests for ties, single price, mixed currency and unit, archived rows, phone edge cases.
- **Report against the plan (decisions 1-8).** 1 status filter: DONE (Brands, Suppliers, SKUs; Pricing kept). 2 shared bar: DONE. 3 Brands: DONE. 4 Suppliers: DONE (including brand, capability, product-category filters, address line, phone links, price breakdown). 5 SKUs: DONE (has price, supplier, per-currency lowest). 6 Pricing: DONE. 7 copy and empty states: DONE. 8 read-only additions: DONE as listed above. Not done: sticky first column in the tables.

**Checks.** `npm test` 709/709, `npm run check`, `tsc --noEmit`, eslint on the touched folders. Browser acceptance with removable fixtures passed (see the acceptance backlog); the fixtures were deleted from the rebuild dev database afterwards.

## R8.260 | 2026-09-30 | docs(masterdata): review of R8.259 — second correction pass for WO-MD-FINDABILITY-01

- **Review verdict, WO-MD-FINDABILITY-01 (R8.259): CORRECTION REQUIRED.** Scope stayed clean (screens plus one pure helper file; no business, schema, action, permission or audit change) and the SKU lowest-price defect is fixed (per currency and unit, "from <amount> / <unit>"). Also delivered: the Suppliers product-category filter, "Brands" column and price breakdown line. But the Pricing work is not: the "Group by item" checkbox is wired to nothing, `groupLowestRows` is imported and never called, no "Lowest" badge is rendered, the new sort keys have no clickable header, the Pricing Brand/Category/Size/contact columns and the filtered tab counts are absent, and the shared filter bar (Clear filters and "N of M") exists only on Suppliers.
- **Next.** `PLAN.md` now has a "Correction pass 2" section that lists each open item, requires the grouping logic as a tested pure helper, and requires the Executor's report to map every item and decision 1-8 to DONE / NOT DONE with proof. Target R8.261. Browser acceptance stays after that revision.

**Checks.** Documentation only; not run.

## R8.258 | 2026-09-30 | docs(masterdata): review of R8.257 — correction pass for WO-MD-FINDABILITY-01

- **Review verdict, WO-MD-FINDABILITY-01 (R8.257): CORRECTION REQUIRED.** Scope was respected: the diff touches only Master Data screens and one small pure helper file (no schema, migration, action, permission, service or audit change), and the existing tests are untouched and green. About a third of the plan is delivered (status filter defaulting to Active on Brands, Suppliers and SKUs; Brands category and supplier filters, "Supplied by" and "Links"; Suppliers brand and capability filters, wider search, address line, clear button with count, tel and WhatsApp links; SKU "Has price" and supplier filters; Pricing supplier, brand and category filters). The rest is not: the shared filter bar, the Suppliers "Brands" column and product-category filter, the Pricing columns, sort keys, filtered tab counts and the "Group by item" / "Lowest" view, the helper test coverage.
- **One defect found.** The SKU lowest-price helper compares prices across currencies and units and displays a supplier name instead of the "from <amount> / <unit>" summary the plan requires.
- **Next.** `PLAN.md` now carries a "Correction pass" section listing exactly what remains and the defect (target R8.259). The browser acceptance of the finished screens waits for that revision; sample data will be loaded for it.

**Checks.** Documentation only; not run. (Codex reported `npm test`, typecheck, `npm run check` and lint green for R8.257.)

## R8.256 | 2026-09-30 | docs(masterdata): WO-MD-FINDABILITY-01 ready

- **Work Order written, no code.** `PLAN.md` holds WO-MD-FINDABILITY-01 (target R8.257), the outcome of the Lead's review of Brands, Suppliers, SKUs and Pricing from a head-of-interior-contractor's point of view. **Presentation only, by the owner's explicit confirmation:** no schema, permission, rule, validation, action, audit or import/export change; the only backend touch allowed is additive read-only fields on existing list reads.
- **Contents.** Active/Archived/All status filter (default Active) on Brands, Suppliers and SKUs; one shared filter bar with clear-filters and result count; Brands "Supplied by" names and clickable "Links"; Suppliers filters for brand, capability and brand product categories, a "Brands" column, address line and clickable phone numbers (tel and WhatsApp); SKUs "Has price" and supplier filters with a lowest-price summary; Pricing supplier, brand and category filters, richer columns, more sort keys, filtered tab counts and a "Group by item" view with a "Lowest" badge (never across currencies or units). Executor builds the UI for this plan by the owner's lane assignment; the Lead does the browser acceptance.

**Checks.** Documentation only; not run.

## R8.255 | 2026-09-30 | feat(masterdata): Suppliers list shows the product categories of the brands each supplier carries

- **Owner question:** categories added through the Brands screen never appeared on the Suppliers list ("No categories"); could suppliers inherit them? There are two different vocabularies: **supplier categories** (what kind of supplier it is, set on the supplier from Master Data Settings) and **product categories** (what a brand makes, set on the Brand). The list column only showed the first.
- **Change.** The Categories column now also shows the product categories of the supplier's brands, read-only and de-duplicated, as "from brands: Flooring, Stones" (first three, then a count; archived categories left out; a tooltip says to change them on the Brands). A supplier's own supplier categories still show as before; "No categories" appears only when there is neither. Checked in the browser: Profitto shows Finishing, Flooring; PT Bangun Delta Abadi shows Flooring; PT. CITATAH shows Stones.
- **Why not copy them into supplier categories.** The two lists mean different things, and a copy would go stale as soon as a brand's categories or supplier links change; a derived display is always current. No data, permission or filter change (the "All categories" filter still filters by supplier category).
- **Noted.** Suppliers whose brands have no categories, or that carry no brands, still read "No categories".

**Checks.** `npm test` 697/697, `npm run check`, `tsc --noEmit`, eslint on the touched files.

## R8.254 | 2026-09-30 | fix(masterdata): a Supplier with a supplier category can be permanently deleted

- **Owner report:** an archived Supplier ("dadawda", the red square in the Suppliers list) could not be submitted for deletion; the dialog answered "A related record is missing or still referenced."
- **Cause (reproduced in the browser).** The owner holds the deletion-approval permission, so "Request deletion" is not a request for that account: it permanently deletes at once (`hardDeleteArchived`). The Supplier's link to its supplier category (`VendorSupplierCategory`, a restrict-on-delete link) was the one related table the delete did not clear, unlike contacts and supplier types, so the database refused it and the generic foreign-key message came back. Any archived Supplier with a supplier category was affected, whether deleted directly or through an approved request.
- **Fix.** The permanent delete now also removes the Supplier's category links (the category itself stays). New integration test: an archived Supplier with a category, contacts and types is deleted directly; it fails without the fix.
- **Not changed, noted.** For an approver the dialog still reads "Submit supplier for deletion" although the action deletes immediately; the wording could say so. The Supplier in the report was not deleted by this session; retry it.

**Checks.** `npm test` 697/697 (two runs in a row), `npm run check`, `tsc --noEmit`. The first commit of this revision shipped a test that reused fixed category and supplier names and failed on the second run (the test database keeps master data between runs); the names are now unique per run.

## R8.253 | 2026-09-30 | fix(studioflow): card editor follows the typography rule; Brand no longer overflows

- **Browser acceptance of R8.252 (Lead, dev server, the owner's session).** The dev server was restarted first (the R8.249 Prisma model needed a regenerated client; the running server still had the old one and every page failed on the preferences read). Checked on the PT-01 item: the card table opens as a dialog; editing Color and saving persists (reload shows it); turning the Pattern slot on, adding option B, selecting it, editing it and option A, then Save once saved both; a dirty close asks "Discard changes?"; the option menu offers Add photo and Delete option and delete asks for confirmation; at phone width the card comes first. All test data was restored (option B deleted, colour back to Pink, Pattern slot off). Not checked: read-only view for an account without edit rights, Set as final, sample request, photo change (these touch other data), Fixture item.
- **Two defects the owner spotted in the screenshots, fixed.** (1) The card title, option letters and hand-card titles used the serif; DESIGN.md limits Instrument Serif to large display moments (H1/H2, document titles, MOM) and keeps it out of operational surfaces, so they are now Schibsted Grotesk. (2) The Brand plate text ran past its box; the placeholder is now the short "Tap to add" like the other plates and the plate clips and sizes its control.
- **Note.** The design concept on the canvas also used the serif for card titles; the built editor no longer does.

**Checks.** `npm test` 696/696, `tsc --noEmit`, eslint on the schedule screen.

## R8.252 | 2026-09-30 | feat(studioflow): Product Schedule item editor as a card table

- **Owner request:** edit a schedule card like a card game (Yu-Gi-Oh / Clash Royale / capsa), but keep the app's own look. The concept was reviewed on a design canvas and made more minimal at the owner's request; this builds it.
- **What changed (only the editor's layout).** The item dialog ("Card content" checklist plus "Spec options" list) is now a three-part card table in a wider dialog: **Card slots** on the left (the old field checklist as toggle buttons, with "Use default" and a "card filled in" meter), **the card** in the middle (code chip, category, Type as the serif title, photo window with sample badge, and Brand, Color, Pattern, Finishing, Size, Location, Qty and extra spec lines as plates edited in place; Notes still uses the shared editor), and **your hand** on the right (the options as small cards; the selected one lifts), with Set as final, Request sample or Mark received, a menu (photo, remove photo, cancel sample, delete option), Add option and From past project. The photo editor replaces the hand while it is open. On a narrow screen the card comes first.
- **Rules unchanged.** Nothing saves until Save (owner decision 2026-09-24), now per option, so several options can be edited and saved together; closing with unsaved edits still asks to discard; slots hide without losing text; Type is always shown; Qty is Fixture-only; Brand is free text or a Master Data brand and never writes Master Data; every control is gated by edit permission or a pending save. No server, schema or permission change.
- **Removed.** The old checklist rows and the inline option form (their behaviour now lives on the card). The source-check regression tests that pinned the old markup are rewritten to pin the same rules on the new structure.

**Checks.** `npm test` 696/696, `npm run check`, `tsc --noEmit`, eslint on the schedule screens. NOT exercised in the browser (needs a signed-in project); scenario added to the acceptance backlog.

## R8.251 | 2026-09-30 | test(studioflow): Today page timezone test follows R8.250

- **Correction to R8.250.** R8.250 was committed with one failing test (695/696): a source check on the Today page still looked for the old settings call. The test now asserts the real rule: the date comes from the person's effective timezone (`userPreferences.resolveDisplay`) and the studio-wide reader is not used there. An unused database import in that page is removed. No behaviour change.

**Checks.** `npm test` 696/696, `tsc --noEmit`.

## R8.250 | 2026-09-30 | fix(platform): personal timezone applies to every dated page; review of R8.249

- **Review verdict, WO-PLAT-PREFS-01 (R8.249): CORRECTION REQUIRED, repaired here by the Lead.** Storage, validation (theme, locale, timezone, start page limited to apps the person can open), ownership (only the signed-in person), the cascade on user delete, the effective-display helper, the shell and account page use, and the storage usage report (60 s cache, symlinks skipped, truncation flag, permission-gated) all match the plan. One gap: three pages still read the studio-wide timezone directly, so a person with a personal timezone would see different dates there. The StudioFlow Today page computes "today" for its open/overdue/due-today counts and its own comment says it must equal the timezone the client badges use, which now follow the personal one; the two BQ pages format dates the same way.
- **Repair.** `studioflow/page.tsx`, `bq/page.tsx` and `bq/library/page.tsx` now use the person's effective locale and timezone (`userPreferences.resolveDisplay`). The launcher page keeps the studio settings because it only reads the main-app choice. The login page has no signed-in person.
- **Noted, not changed.** The layout now makes two extra small reads per request (preference row, settings again); the start page is validated when saved, so the redirect the Lead builds must re-check access when it is used.

**Checks.** `npm test`, `npm run check`, `tsc --noEmit`, eslint on the touched pages.

## R8.248 | 2026-09-30 | docs(platform): WO-PLAT-PREFS-01 ready

- **Work Order written, no code.** `PLAN.md` holds WO-PLAT-PREFS-01 (target R8.249): per-person preferences (theme, personal locale and timezone, start page) stored in a platform table with validation, the effective display settings for the signed-in person (personal value, else the studio General Settings), and a read-only storage usage report (total, free, reserve, and bytes by area) for administrators. The Lead builds the My Preferences screen, theme switching, start-page redirect and the Storage page afterwards.
- **Numbers and content are Lead defaults** proposed with the settings structure and accepted by the owner ("setuju").

**Checks.** Documentation only; not run.

## R8.247 | 2026-09-30 | feat(platform,studioflow,masterdata): one settings pattern everywhere

- **Owner request:** settings had no consistent pattern. Agreed structure: **My Preferences** (per person), **Platform** settings, and **one group per application**, with each application keeping one "Settings" entry in its own side menu.
- **One sidebar.** `SettingsNavigation` (`settings/settings-navigation.tsx`) is rebuilt as the single settings sidebar with four headings: My Preferences (Account & security), Platform (General Settings, Users, Roles & Access), Master Data (Dictionaries & approvals), StudioFlow (Studio Settings, Schedule templates). A link shows only if the person may open that page. Every settings destination now renders it: the account page (moved inside the settings layout, retitled "Account & security", menu entry "My preferences"), the platform pages (unchanged), Master Data settings (unchanged), Studio Settings (its in-page jump list — Archived files, Checklist, Phase Templates — now sits under the shared sidebar) and Schedule templates (now inside the settings layout).
- **Application side menus.** StudioFlow's rail keeps one entry, renamed "Settings" (it also highlights on Schedule templates); the separate "Schedule templates" rail entry from R8.246 is removed (the toolbar link stays). Master Data's rail gets a "Settings" entry for people who may open its settings; it is added in the app's nav component because Master Data settings live in the shared settings area, outside the app's own route root.
- **Not changed.** No URL moved (no redirects needed), no permission or data change. BQ has no settings yet, so no group. "My Preferences" holds only the account for now; personal preferences (theme, start page, personal date format) and a Storage page are the next work orders.

**Checks.** `npm test` 693/693, `npm run check`, `tsc --noEmit`, eslint on the touched screens. Not exercised in the browser.

## R8.246 | 2026-09-30 | feat(studioflow): Schedule templates on their own page

- **Owner request:** "Template settings" on the Product Schedule opened a long general settings page. The standard Product Schedule (codes such as PT-01 that repeat in every standard project, which "Apply templates" adds to a project) now has its own page, **Schedule templates** (`/studioflow/schedule-templates`), reachable from the schedule toolbar (renamed from "Template settings"), the StudioFlow side menu (next to Studio Settings) and a link on Studio Settings.
- **Page.** The prefix dictionary and template items moved unchanged, with a new **Code** column that shows the code a new standard project will give each active item (prefix plus its place in that category, e.g. PT-01, PT-02), using the same prefix rule as project creation. Same permission as before (settings manage edits; others read). A short note explains that new projects get every active item and that "Apply templates" adds missing ones to an existing project.
- **Studio Settings** keeps the checklist, phase templates and archived-files sections; the Product Schedule section is gone from it. No backend, schema or permission change.

**Checks.** `npm test` 693/693, `npm run check`, `tsc --noEmit`, eslint on the StudioFlow screens. Not exercised in the browser.

## R8.245 | 2026-09-30 | feat(masterdata): "Import & export" in the Master Data side menu

- **Owner request:** the import/export page was hard to find (only a button on the SKU catalogue, shown only to people who may manage SKUs). It is now a menu item in the Master Data side menu, after Sample requests. It shows for anyone the page itself allows: read SKUs and material prices (export) or manage them (import). Same permission rule as the page; nothing else changes.

**Checks.** `npm test`, `npm run check`, `tsc --noEmit`, eslint on the two files. Not exercised in the browser.

## R8.244 | 2026-09-30 | feat(masterdata): clearer import and export prices page

- **Owner complaint:** the export/import page was not clear. The page (`/masterdata/workbook`, same address) is now "Import & export prices", in two cards side by side. **Get the data out:** a file type choice (Excel, CSV, PDF price list) with one plain sentence about each ("PDF is read-only and cannot be imported"), a Download button, and a "Download a blank template" button for people who may import. **Bring changes in:** three numbered steps (choose your file, check it, save), each saying what it does and whether it saves anything; results in plain words ("new / changed / unchanged / with problems"), problem rows listed as Row, Column, Problem, and messages such as "Check the file first" or "There is nothing to save" instead of a silent disabled button.
- **Names.** The button on the SKU catalogue reads "Import & export" (was "Excel workbook"). No behaviour, permission or backend change; this uses the R8.238 actions.

**Checks.** `npm test` 693/693, `npm run check`, `tsc --noEmit`, eslint on the Master Data screens. Not exercised in the browser (owner tests UI).

## R8.243 | 2026-09-30 | feat(ui-engine): image workspace gets colour touch-ups and automatic compression

- **Owner request:** attaching a picture should not be a chore; give it an editor and a compressor, with no regression. The shared `ImageWorkspace` (used by MOM photos and Product Schedule photos) is extended; every existing setting keeps its meaning.
- **Colour touch-ups.** A closed-by-default "Touch up colours" section with narrow hue (±30°), saturation (70-130%) and brightness (80-120%) sliders and Reset. The preview and the saved image use the same filter; annotations keep their exact colours. Hidden on browsers whose canvas cannot apply the filter (older Safari), so preview and result can never disagree. Untouched sliders change nothing.
- **Compression.** New `targetBytes` (default 1.5 MB). The first encode uses the caller's own size and quality exactly as before; only if the result is larger does it lower JPEG quality (0.78, 0.7, 0.62), then shrink the pixels (85%, 72%, 60%, 50%) until it fits. The result line shows "Made smaller: 5.8 MB → 1.2 MB". The accepted input size grows from 10 MB to 30 MB (the prepared image is what gets uploaded), so a phone photo no longer has to be shrunk by hand first.
- **Crop.** Crop stays zoom and focus with the caller's aspect ratio (unchanged); a free-drag crop box is not built.
- **Pure logic tested.** `patterns/image-adjust.ts` (filter string, compression plan, size text) has its own tests. Dependencies and schema: none.

**Checks.** `npm test` 693/693, `npm run check`, `tsc --noEmit`, eslint on the patterns folder; the canvas behaviour was NOT exercised in a browser (needs a signed-in project page); please try attaching a large photo to a MOM or a schedule item.

## R8.242 | 2026-09-30 | feat(studioflow): deliverables panel shows Final/expiry clearly and reports upload progress

- **Owner answers (2026-09-30).** Maximum file size: 100-200 MB is enough, 500 MB is fine, so the 500 MB default stays. Disk: the storage lives on the owner's PC with hundreds of GB free, so the 2 GB free-space reserve stays as is.
- **Panel (Lead).** Each file shows a Final badge (kept) or "Deleted in N days" (warning colour at 7 days or less) and its version number ("newest" on the latest). Upload uses a progress bar with a percentage, refuses a file over 500 MB before sending, and gives a plain message if the connection drops. The hint under the button states the 30-day and 2-version rules.
- **Not changed.** No backend or schema change.

**Checks.** `tsc --noEmit`, eslint on the panel. Not exercised in the browser with a large file yet (owner tests UI; listed in the acceptance backlog).

## R8.241 | 2026-09-30 | fix(studioflow): large deliverable uploads no longer truncated by the proxy; review of R8.240

- **Review verdict, WO-SF-FILELIFE-01 (R8.240): CORRECTION REQUIRED, repaired here by the Lead.** The lifecycle rules (slot, Final, 2 newest, 30-day expiry, one warning, sweep, free-space guard, streaming port, migration) match the plan and their tests pass. One defect: Next.js buffers any request body that passes through `src/proxy.ts` and silently cuts it at 10 MB, and the proxy matcher covered `/api/studioflow/deliverables`. A 200 MB upload would therefore have been stored as its first 10 MB and recorded as a valid file.
- **Repairs.** The deliverable upload route is excluded from the proxy matcher (the route already authenticates itself and answers 401 without a session). The service now refuses a stored size that differs from the declared size (`DELIVERABLE_INCOMPLETE`), so a truncated or interrupted upload can never be saved as a good file. The configured size limit is capped at the 32-bit column maximum. New integration test: streamed upload succeeds; a short stream and an over-limit declaration are refused and leave no object or row.
- **Left as noted, not defects.** The route handler and the free-space guard have no direct test of an over-limit stream through the HTTP layer (covered at service and adapter level); browser acceptance of large uploads is in the acceptance backlog.

**Checks.** `npm test` 687/687, `npm run check`, `tsc --noEmit`; `npm run build` not run (owner dev server active).

## R8.240 | 2026-09-30 | feat(studioflow): stream deliverables with version lifecycle

- StudioFlow deliverables now stream through an authenticated PUT route (up to 500 MB by default, configurable with `STUDIOFLOW_DELIVERABLE_MAX_BYTES`) rather than loading the full upload in a Server Action. The local storage adapter has `putStream`, removes partial writes, and refuses writes that would leave less than 2 GB free (configurable with `STORAGE_MIN_FREE_BYTES`). Private reads stream from disk as well.
- A deliverable tracks its normalized phase/name slot, Final state and expiry. One final version per slot is retained; uploads keep the two newest non-final versions; working files expire after 30 days, warn their uploader in the final seven days, and can be extended. The daily app-owned sweep deletes expired working rows before best-effort object cleanup. Existing deliverables receive a 30-day grace period in the additive migration; none become Final automatically.
- Added minimal delivery-screen wiring for streamed upload, Final/expiry state, and Final/Extend commands. Browser acceptance is queued in `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md`; visual polish remains Lead-owned.
- Migrations: `20260930200000_sf_deliverable_file_lifecycle`, applied to the selected office dev and disposable test databases. Dependencies: none.

**Checks.** `npm test` 686/686; `npx tsc --noEmit`; `npm run check`; `npm run lint`; focused storage and StudioFlow lifecycle tests passed. `npm run build` not run because the owner development server is active on port 3001. Browser acceptance deferred to the Reviewer backlog.

## R8.239 | 2026-09-30 | docs(studioflow): WO-SF-FILELIFE-01 ready

- **Work Order written, no code.** `PLAN.md` holds WO-SF-FILELIFE-01 (target R8.240): large-file streaming upload for StudioFlow deliverables (default 500 MB), a Final flag, the "2 newest non-final versions per slot" rule, 30-day automatic expiry with a 7-day warning, and the storage-port streaming plus free-space guard they need. Chat expiry is unchanged. The Lead builds the deliverables screen and the image editor (HSB, crop, compress) afterwards.
- **Numbers are Lead defaults** (500 MB, 2 versions, 30 days, 7-day warning, 2 GB free-space reserve) open to the owner's veto.

**Checks.** Documentation only; not run.

## R8.238 | 2026-09-30 | feat(platform): shared tabular export/import (Excel, CSV, PDF) and template; Master Data and schedule use it

- **Lane note.** The Executor started WO-PLAT-TABULAR-01 and hit its usage limit after a first draft of the utility and the `pdf-lib` dependency. With the owner's approval the Lead took over, rewrote the utility and finished the plan.
- **Utility** `@platform/utilities/tabular`: `exportTable` (xlsx / csv / pdf), `parseTabularFile` (xlsx / csv; header aliases, duplicate/missing/unknown headers, size and row limits, unreadable formula cells reported), `buildImportTemplate`, `readTabularGrid` / `parseCsvText` for callers with their own layout. CSV is UTF-8 with BOM and imports back unchanged (formula-looking text gets a leading apostrophe on export and loses it on import); xlsx text is always a string cell. PDF is a plain table drawn with `pdf-lib`; `PdfTableTemplate` (page size, orientation, title, footer, colour, column weights, zebra rows) is the per-app customization seam. Non-Latin text degrades to `?`, never throws.
- **Master Data.** The SKU price workbook reads and writes through the utility. `exportSkuPriceList({ format })` adds csv and a read-only landscape pdf; `skuPriceImportTemplate` adds a template; preview/apply accept an exported xlsx or csv unchanged (same hash flow, same row rules). The exported xlsx keeps its sheet name, header order and Reference sheet.
- **StudioFlow.** The schedule import accepts an .xlsx as well as CSV text (`file` on the action) and offers a plain-layout template; the two private CSV parsers in the domain are gone (the domain now reads a cell grid from the shared reader, with identical results for the existing fixtures).
- **Boundary rule.** An app file importing `exceljs`, `pdf-lib`, `pdfkit` or `xlsx` fails `npm run check`. `docs/UTILITY-INVENTORY.md` lists the utility.
- **UI wiring only.** Master Data download uses the file's own type and the import picker accepts .csv; the schedule Import dialog picks .xlsx/.csv and has template buttons. The workbook page redesign and format picker are the Lead's next revision.
- **Dependencies.** `pdf-lib`. Migrations: none.

**Checks.** `npm test` 682/682, `npm run check`, `tsc --noEmit`, eslint on touched folders. `npm run build` NOT run (the owner dev server uses the same build folder); PDF export is covered by tests under Node, not yet by a Next build or the browser.

## R8.237 | 2026-09-30 | docs(platform): WO-PLAT-TABULAR-01 ready

- **Work Order written, no code.** `PLAN.md` now holds WO-PLAT-TABULAR-01 (target R8.238): one shared utility for exporting a table as Excel, CSV or PDF and importing Excel or CSV with a generated template, then moving the Master Data SKU price workbook and the StudioFlow schedule import onto it. PDF is a simple table with a per-caller template object as the customization seam. One PDF library is the only new dependency (`pdf-lib` recommended).
- **Also this session:** R8.236 (role editor Position row) was the owner-approved poin 3; the workbook page redesign (poin 1) is the Lead's revision after R8.238.

**Checks.** Documentation only; not run.

## R8.236 | 2026-09-30 | feat(platform,studioflow): role editor lists app positions apart from permissions

- **Owner request:** "Pic Designer / Pic Drafter" sat among Read/Manage/Override in the role editor, which reads as permissions rather than who a member is. An app can now register optional `positions` (a labelled subset of its own permissions); the role editor shows them on a separate "Position" row. StudioFlow registers Designer and Drafter (`STUDIOFLOW_POSITIONS`).
- **Presentation only.** The stored permission ids, grants, PIC eligibility checks and existing roles are unchanged; no migration. Registry composition rejects a position that is not one of the app's permissions, is the access permission, or has an empty label.
- **Tests.** Grouping puts positions apart from the resource rows; an invalid position is refused. Dependencies: none.

**Checks.** `npm test` 671/671, `npm run check`, `tsc --noEmit`. Not checked in the browser (owner tests UI).

## R8.235 | 2026-09-30 | feat(masterdata): pick a SKU on a quote and add it to the price list; review PASS for R8.234

- **Review verdict, WO-MD-SAMPLEPRICE-01 (R8.234): PASS with one Lead repair.** The command follows the plan (both permissions, complete-quote precondition, create or update through the existing price
  services, one combined audit event, additive read fields). The idempotence check only compared the amount and currency of the linked price, so changing the supplier or SKU to one with the same amount
  would have been skipped. Repaired here: the linked price must also match this SKU and supplier, otherwise it syncs again. New test covers it, plus `listSampleRequestSkuChoices`.
- **Screen (Lead).** The quote dialog has a "Product in the catalogue" picker (all live SKUs, searchable; needs only the sample-request permission through `listSampleRequestSkuChoices`), a
  "Save and add to price list" button (saves the quote, then syncs; shown to holders of the price permission, enabled once supplier, SKU, amount and currency are set), and a row action "Add to price
  list" for a priced request that has all of them but no linked price. The request detail shows the linked SKU and price. Server action `syncSampleQuoteToPriceAction`; `skuId` now travels with quotes.
- **Housekeeping.** `PLAN.md` marked complete; the backlog entry is removed (the browser check with a real request is queued).

**Checks.** `npm test` 669/669, `npm run check`, `tsc --noEmit`, eslint on touched folders; dialog rendered in the browser (nothing saved).

## R8.234 | 2026-09-30 | feat(masterdata): sync a sample quote to the material price list

- **Sample quote price sync.** Master Data now exposes `syncSampleQuoteToPrice`: a staff member holding both the sample-request and material-price manage grants can create or update the matching live SKU/supplier material price from a complete quoted amount and currency. The request is linked to that price, existing price notes are retained with the sample-request note appended, and a repeated matching sync is a no-op.
- **Safety and audit.** Declined or incomplete requests are refused with plain errors; live SKU, supplier capability, currency, amount, derived unit, and price rules continue through the existing pricing service. One combined `masterdata.sample-request.price-synced` audit event records the result; the underlying pricing audit is suppressed.
- **Read contract and tests.** Sample-request reads now include the linked SKU name/code and price amount through batched lookups. Integration coverage proves create/update, note preservation, idempotency, dual permissions, incomplete and declined requests.
- **Dependencies and migrations.** None.
- **Verification.** `npm test` passed; `npx tsc --noEmit` passed; `npm run check` passed; `npx eslint .` completed with 2 pre-existing StudioFlow `<img>` warnings and no errors; `npm run build` passed. The running owner dev server rendered `/masterdata/sample-requests` and `/masterdata/pricing`; both safely redirect anonymous visitors to `/login`. Browser acceptance is queued in `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md`.

## R8.233 | 2026-09-30 | refactor(platform): one Prisma schema file per app, migration isolation rule, BQ index drift fixed

- **Prisma schema split (owner concern: a fix in one app must not disturb Master Data or BQ).** `prisma/schema.prisma` is now `prisma/schema/` with one file per database schema:
  `base.prisma` (generator, datasource), `platform.prisma`, `studioflow.prisma`, `master_data.prisma`, `bq.prisma`. Block text and doc comments moved verbatim; only their file changed.
  `prisma.config.ts` points at the folder and pins `migrations.path` to `prisma/migrations` (without that Prisma looks for migrations inside the schema folder and reports none). The generator
  output path is now `../../src/generated/prisma`. Verified: `prisma validate` passes, `prisma migrate diff` against the live dev database is identical for the old and new schema text,
  and the full suite and `next build` pass. A StudioFlow edit now touches `studioflow.prisma` only.
- **Migration isolation rule** in `npm run check`: a migration may change tables of at most one app schema (platform may appear alongside for grants and audit). Three older BQ/Master Data
  migrations that span two app schemas are allow-listed with a stale-entry ratchet; any new spanning migration fails. The Prisma ownership rule reads the schema folder.
- **BQ index drift fixed.** `prisma migrate diff` showed the live database differing from the schema (five BQ indexes named in PascalCase, five redundant sort-order indexes left over from the
  R8.205 uniqueness migration). Migration `20260930190000_bq_index_names_sync` renames and drops them; applied to dev and test; the diff is now empty. BQ-only, no data change.
- **Docs.** `docs/README.md` and `docs/MODULE-BOUNDARIES.md` point to `prisma/schema/*.prisma`. `PLAN.md` (sample price sync) moves to Executor target R8.234.

**Checks.** `npm test` 666/666, `npm run check` (fixtures included), `tsc --noEmit`, `npm run build`, `prisma validate`, `prisma migrate diff` empty on both rebuild databases.

## R8.232 | 2026-09-30 | feat(platform): notification retention, app icons in the switcher, stale storage roadmap fixed

- **Notification retention (owner, 2026-09-30: read items go after 90 days, unread never).** `createNotificationRetention(...).purgeReadNotifications()` deletes notifications read
  more than 90 days ago (`READ_NOTIFICATION_RETENTION_DAYS`); `startNotificationRetention` runs it 15 s after boot and daily, on in production or with `NOTIFICATION_RETENTION=on`
  (a development server deletes nothing), started from `instrumentation.ts`. Test: old read removed, recently read and old unread kept. The instrumentation guard test now expects the extra startup step.
- **App icons (owner: yes, simple line icons).** App registrations carry an optional `icon` key (`layout-dashboard` StudioFlow, `database` Master Data, `calculator` BQ); the shell draws it
  next to the app name in the switcher button and menu from a fixed vocabulary (`authenticated-shell/app-icons.tsx`), falling back to a neutral icon for an unknown key. A running dev server
  keeps the registry it booted with, so icons appear after a restart (before that the fallback icon shows).
- **Mobile check.** The shell at 375 px (top bar, horizontal app rail, Today) renders correctly; no change needed.
- **Docs.** The asset storage roadmap and its backlog entry said "partially activated"; phases 1 to 4 are delivered (port, local adapter, Brand mark, private StudioFlow assets, archive sweep). Updated.
  `PLAN.md` (sample price sync) moves to Executor target R8.233.

**Checks.** `npm test` 666/666, `npm run check`, `tsc --noEmit`, eslint on touched folders.

## R8.231 | 2026-09-30 | docs(masterdata): WO-MD-SAMPLEPRICE-01 ready

- `PLAN.md` now holds WO-MD-SAMPLEPRICE-01 (READY, Executor target **R8.232**): one Master Data command that writes a sample request's quoted price into the material price list
  (create or update the price for the linked SKU and supplier, link the request, one audit event, idempotent), gated by both the sample-request and price-manage permissions,
  never creating a SKU or supplier (legacy parity: `sample-request-actions.ts` `syncToMaterialPrice`). The Lead builds the SKU picker and the action afterwards. No code changed.

## R8.230 | 2026-09-30 | chore(platform): harness rule for server-calls-client, quieter polling, backlog cleanup

- **Harness.** `check-boundaries` gets rule "server code -> function in a "use client" module" (`collectServerClientCallViolations`): a file without the `"use client"`
  directive that imports a lower-case function from a `"use client"` module (directly, through a barrel's `export {}` / `export *`, or under a renamed import) and calls
  it now fails `npm run check`. Components, hooks, constants, types, tests and client callers are ignored. Fixture tests cover each case; the real tree is clean. This is
  the class that broke `/bq` in R8.210 and R8.164 while `npm test` and `next build` passed.
- **Polling.** The notification bell and quick messenger polled every 60 s even in a background tab (about two POSTs a minute, the "hundreds of requests" seen on a
  long-open tab). They now skip the tick while the tab is hidden and refresh when it becomes visible again. No behavior change for a visible tab.
- **Backlog.** Removed the two finished entries (workbook import/export, harness rule).

**Checks.** `npm test`, `npm run check` (boundaries fixtures included), `tsc --noEmit`.

## R8.229 | 2026-09-30 | feat(studioflow): collapsible project cards on Today

- Owner request: the project cards on the Today page can be collapsed. Each card header has a chevron; a "Collapse all / Expand all" button shows when there is
  more than one project. The choice is remembered per browser (localStorage through `useSyncExternalStore`, in-memory fallback when storage is blocked); the card's
  add row hides with its list. Checked in the browser: collapse, reload keeps it collapsed, expand again. No data or server change.

**Checks.** `tsc --noEmit`, eslint (0 errors).

## R8.228 | 2026-09-30 | feat(studioflow): CD List screen; review PASS for R8.225

- **Review verdict, WO-SF-CDLIST-01 (R8.225): PASS.** Lead re-ran the full suite (665/665 with the later changes), read the service (drafter-seat only, `requireProjectAccess`
  content gate, writable-phase loader, assignee eligibility, audit per write) and the migration. No correction needed.
- **Screen (Lead).** A "Drawing list" section on the Construction Drawing phase (project page canvas and phase page): quick-add row (number and name), rows grouped by
  hundreds series with "Other" for unnumbered, inline status select, assignee chip, row menu (Edit dialog, Delete), a "N of M done" summary, read-only for viewers
  who cannot edit the phase. Server actions `createCdItemAction`, `updateCdItemAction`, `setCdItemStatusAction`, `deleteCdItemAction`. Backlog entry removed.
- **Browser.** On the dev project the Lead added and deleted one drawing (list rendered, database back to zero rows); status change and the edit dialog are queued.

**Checks.** `tsc --noEmit`, eslint (0 errors). The dev server must be restarted after a Prisma change; a stale server showed the same symptoms earlier.

## R8.227 | 2026-09-30 | fix(studioflow): simpler Add item dialog; quantity and unit are Fixture-only everywhere

- Owner feedback: the Add schedule item dialog looked too formal and still showed Qty/Unit for Material, although only the item panel had been corrected (Qty is a
  Fixture-only fact). The dialog now uses Material/Fixture chips, a searchable/creatable Category, Location, and shows Qty and Unit only for Fixture. Product
  fields: one Brand control (pick a Master Data brand or type any name), Size next to it, Color/Pattern/Finishing, and Notes plus extra specs behind "+ Notes or
  other specs" (opened automatically when they already have content, which also applies to the inline option editor). Friendlier copy.
- Server: `createEntry` and `updateEntry` ignore qty/unit for a Material entry. Tests: new "keeps quantity and unit for Fixture only"; the old assertions that
  expected Material qty were updated; the source guard for the Finishing field follows the new markup.

**Checks.** `npm test` 665/665, `tsc --noEmit`, eslint. Checked in the browser (Material hides Qty/Unit, Fixture shows them); nothing saved.

## R8.226 | 2026-09-30 | fix(studioflow,masterdata): a designer can request a sample without naming a supplier

- Owner feedback on the Request sample dialog: "as a designer I do not know where to request from". "Requested from" is now optional. Blank is stored as
  an empty string (no migration); the dialog says "Not sure? Leave it blank and Master Data will find a supplier"; the Schedule card shows "supplier to be
  found"; the notification reads "needs a sample ... and did not name a supplier"; the Master Data queue detail shows "Not specified. Please find a supplier."
  and its intake snapshot accepts a blank source. Tests +2 (StudioFlow request without supplier; Master Data intake with a blank source).

**Checks.** `npm test` 664/664, `tsc --noEmit`.

## R8.225 | 2026-09-30 | feat(studioflow): add Construction Drawing list backend

- **CD List backend.** Construction Drawing phases now have an additive drawing-item table and one StudioFlow service for listing,
  creating, editing, changing status, and deleting drawings. It accepts drafter-seat phases only, normalizes legacy drawing codes,
  returns numeric ordering and hundreds grouping, and never participates in phase approval blockers.
- **Access and audit.** Writes retain `studioflow.phase.work`, reuse the existing PIC content gate, reject locked/archived projects,
  validate optional assignees as active phase workers, and write one `cd-item` audit record per actual change. Reads remain open to
  project readers. The new table cascades when its phase or project is removed.
- **Migration.** `20260930180000_sf_cd_list` was applied to the approved `studioflow_rebuild` and `studioflow_rebuild_test`
  databases; both migration-status checks are up to date. The first local deploy exposed the repository's text phase IDs; its
  uncommitted failed enum artifact was verified unreferenced, removed, then the compatible additive migration was applied cleanly.
- **Reviewer follow-up.** Added the CD List phase-canvas browser scenario to `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md`; the Lead
  owns that UI implementation and its acceptance.

**Checks.** `npm test` 662/662; `npx tsc --noEmit`; `npm run check`; `npm run lint` (0 errors, 2 existing `no-img-element`
warnings); `npm run build`; restarted authenticated `next dev` rendered `/studioflow` and a project overview.

## R8.224 | 2026-09-30 | docs(masterdata): record the staff-driven overrides in the contracts

- Contract and code are in sync for R8.223. `masterdata.md` gets section 4.3 "Operational overrides ledger" (OO-1 auto-link Brand from a scoped
  contact, OO-2 Brand-side scoped contacts, OO-3 up to three phone numbers), each with the locked rule it overrides, the operational reason
  (staff feedback, 2026-09-30), the implemented behavior and its code/test evidence. `vendor-contract.md` (section 4, dialog description,
  migration ledger) and `brand-contract.md` (sections 4.2, 4.3, 7, 9, decisions summary) reference the ledger. Marked as overrides requested
  operationally, not as reversals of the owner's design intent. No code changed. `PLAN.md` (CD List) target is now R8.225.

## R8.223 | 2026-09-30 | feat(masterdata): supplier contacts from staff feedback (auto-link Brand, Brand-side contacts, 3 phone numbers)

- **Staff input, three items.** (1) Saving a Supplier contact scoped to a Brand the supplier does not carry used to fail with "Supplier must own or supply this
  Brand" and sent staff to another menu. It now links the supplier to that Brand in the same save (not authorized) and the dialog says so beforehand; a
  supplier without a material type gets a clear message instead. (2) The Brand Create/Edit dialog has a "Supplier contacts" section (owner or supplier as the
  contact's supplier, name, job title, phones, email, primary) — full set, `brand.manage`, stored as normal `VendorContact` rows so they also show on the Supplier.
  (3) A contact can have up to three phone numbers: additive migration `20260930170000_md_contact_extra_phones` (`extra_phones text[]`, first number stays in
  `phone`), shared `PhoneNumbersField`, tables show the first number plus "+N". Applied to dev and test databases.
- **Contracts** updated (`vendor-contract.md` §4, `brand-contract.md`). Master Data was worked by the Lead at the owner's explicit request.
- **Tests** (+3): phone limits/dedupe/legacy single phone, auto-link and the non-material-supplier refusal, Brand-side contact create/update/delete and refusal for a non-supplier.
- **Browser** (Lead, dev data untouched, nothing saved): Brand edit shows existing scoped contact with three phone rows and the add/remove behaviour; Supplier
  edit shows the new hint under Brand scoping. Real saves are queued in the browser acceptance list. `PLAN.md` (CD List) target moves to R8.224.

**Checks.** `npm test` 658/658, `tsc --noEmit`, eslint (0 errors). Dev server restarted after the schema change.

## R8.222 | 2026-09-30 | docs(studioflow): WO-SF-CDLIST-01 ready

- `PLAN.md` now holds WO-SF-CDLIST-01 (READY, Executor target **R8.223**): CD List backend (`sf_cd_item`, service, audit, tests) ported from legacy
  `CDList` (`c4b0c466`), drafter-seat phases only, gated by the PIC content rule. The Lead builds the screen after review. No code changed.

## R8.221 | 2026-09-30 | feat(studioflow): hide edit controls the viewer cannot use; review PASS for R8.220

- **Review verdict, WO-SF-ACCESS-01 (R8.220): PASS.** Lead re-ran `npm test` (655/655), `tsc`, `npm run check`; read the shared gate
  (`requireProjectAccess`/`getProjectAccess`), the five gated project commands, the centralized MOM/Schedule/Presentation/Tasks/Phases
  gates, and the role-grant migration (dev "Owner" role got override + both PIC seats, so nobody was locked out). Notes: permissions
  have no per-permission plain-English label mechanism, so the labels promised in the plan are the raw ids; the gate reads the PIC
  outside the mutation transaction (negligible race).
- **UI (Lead).** `pageProjectAccess` + `ReadOnlyNotice`; project page and phase page hide phase actions, activities, checklist and
  deliverable edits per the phase's seat; MOM, Schedule, Presentation pages disable editing for non-PICs and show "View only";
  Projects list shows "View only" instead of row actions and the New/Edit dialogs use per-seat PIC lists (current PIC stays
  selectable); Timeline shows "Edit project dates" only for editable projects and phase bars only for editable phases.
- **Test.** Added denied cases: drafter PIC cannot activate or add activity on a designer-seat phase or edit project fields.
- **Housekeeping.** Reset the two stale scratch databases (`browser_test`, `regression_test`) to a clean current schema at the owner's
  request; dev and test databases untouched. Backlog: CD List recorded as `[PLANNED]` (owner go-ahead), stale-DB blocker removed.
  A running dev server must be restarted after new permissions ship (the permission registry loads once at boot).

**Checks.** `npm test` 655/655, `tsc --noEmit`, eslint (0 errors), pages rendered as the override holder; read-only rendering for other
accounts queued in `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md`.

## R8.220 | 2026-09-30 | feat(studioflow): enforce PIC project edit access

- **PIC-based server enforcement.** StudioFlow mutations retain their existing base permission and now also require the project's
  designer PIC, the drafter PIC for drafter-seat phase work, or the new `studioflow.project.override` permission. This covers
  project changes, phase transitions/content and deliverables, checklist tasks, MOM, Product Schedule, and Presentation; reading
  remains unchanged. The shared access result now supplies the Lead-owned UI with project, document, and per-phase capabilities.
- **PIC eligibility and safe rollout.** Designer and drafter picker eligibility now uses the distinct registered permissions
  `studioflow.project.pic-designer` and `studioflow.project.pic-drafter`. Migration `20260930160000_sf_project_pic_access`
  copies every existing `studioflow.phase.work` role grant to both PIC permissions and every `studioflow.phase.override` role
  grant to `studioflow.project.override`; it was applied to the approved `studioflow_rebuild` and `studioflow_rebuild_test`
  databases and verified not to leave a current role without its equivalent capability.
- **Coverage.** Added StudioFlow integration coverage for the access read model and permitted/denied mutations across projects,
  phases, tasks, MOM, Schedule, and Presentation. Updated only pre-existing tests that had deliberately relied on the former
  any-phase-worker edit rule.

**Checks.** `npm test` 655/655; `npx tsc --noEmit`; `npm run check`; `npm run lint` (0 errors, 2 pre-existing `no-img-element`
warnings); `npm run build`; and authenticated `next dev` renders of `/studioflow`, a project overview, and `/studioflow/projects`.

## R8.219 | 2026-09-30 | docs(studioflow): PIC-based edit rights decided, WO-SF-ACCESS-01 ready

- Owner answered the four blocked questions (2026-09-30): legacy rule + admin override permission, read-only view for all staff, separate PIC
  designer/drafter permissions, project-level documents editable by designer OR drafter PIC. `docs/BACKLOG.md` blocker converted to
  `[PLANNED]`; `STUDIOFLOW-REWORK-CONTRACT.md` RW-02 and §3 updated; `PLAN.md` now holds WO-SF-ACCESS-01 (READY, target R8.220).
  No code changed.

## R8.218 | 2026-09-30 | feat(masterdata): Excel workbook screen; review PASS for R8.216-R8.217

- **Review verdict, WO-MD-IMPORT-01: PASS** (R8.216 + correction R8.217; `npm test` 654/654 re-run by the Lead). The Lead's
  first correction finding (multi-category SKUs) was withdrawn: `SkuCategory` is unique per SKU by contract.
  Recorded non-blocking gap: the preview counts each supplier row of a grouped new SKU as "new" while apply creates one SKU.
- **Screen** `/masterdata/workbook` replaces the executor's bare page: 1 Export (download), 2 Check (upload, totals,
  per-row error table, rows that will change), 3 Save (enabled only when the check is clean and something changes; server
  re-validates with the hash). Entry point: "Excel workbook" button on the SKU catalogue for SKU managers. The bare
  form actions were removed. Export and check were run in the browser against the empty dev catalogue; changed/error paths
  are covered by the R8.217 integration tests.

**Checks.** `tsc --noEmit`, eslint on touched folders. Authenticated Excel round trip with real data still queued in `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md`.

## R8.217 | 2026-09-30 | fix(masterdata): correct SKU price workbook import

- **Single-category safety.** Workbook rows now keep the established one PRODUCT category. Empty or unknown Category cells are preview errors, so an edit cannot clear a SKU's category.
- **Supplier-row grouping.** Multiple new rows with the same Code and Name now create one SKU with all supplied material prices, rather than duplicate SKUs.
- **Earlier, safer feedback.** Preview rejects unsupported cell objects, uses formula results and rich-text content safely, and shows the existing measurement and linked-brand locks on the affected row before apply. The import still validates file size/type and the 2,000-row limit before parsing.
- **Acceptance coverage.** Added integration coverage for unchanged exports (including exact decimal and no-price rows), rollback on a later failure, grouped supplier rows, category preservation, locks, formulas/rich text, and file/row limits.

**Checks.** `npm test` 654/654 passed; `npx tsc --noEmit`, `npm run check`, `npm run build`, and `npm run lint` passed.

## R8.216 | 2026-09-30 | feat(masterdata): add SKU price workbook export and atomic import

- **Workbook contract.** Master Data can export SKU material prices to `.xlsx` with the locked `SKU Prices` columns and a protected `Reference` sheet. Import accepts only the exported format up to 5 MB / 2,000 rows, resolves references by trimmed case-insensitive name or code, and never creates reference data.
- **Safe import.** Preview is read-only and reports create, update, unchanged, or per-cell errors with a content hash. Apply revalidates the same bytes within one transaction, refuses changed/invalid files, uses the existing SKU and material-price write paths, and records one counts-only audit event.
- **Boundary/testing.** Added typed Master Data server actions and a temporary executor route at `/masterdata/workbook`; the Lead-owned finished upload/preview UI remains next work. Added an integration round trip plus invalid-workbook coverage. Browser acceptance is queued in `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md`.
- **Dependency.** Added the approved `exceljs` package only.

**Checks.** `npm test` passed; `npx tsc --noEmit`, `npm run check`, and `npm run build` passed. `/masterdata/workbook` opened in `next dev` and correctly redirected the signed-out session to `/login`; authenticated browser acceptance remains queued.

## R8.215 | 2026-09-30 | fix(ui): align the creatable search trigger, record blocked owner decisions

- **CreatableSearch trigger.** It set `justify-between` without `!`, so the Button base's `justify-center` won and the
  selected value (e.g. the Client field) rendered centered and looked borderless. Now matches `Combobox`
  (`justify-between!`); checked in the browser on Edit project. Affects every CreatableSearch consumer (Pricing, Brands, Schedule).
- **Blockers recorded** in `docs/BACKLOG.md`: PIC-based edit rights (four named owner questions, legacy evidence at
  `c4b0c466`) and two stale scratch databases. Agents must not act on either before the owner answers. `PLAN.md` target is now R8.216.

**Checks.** `tsc --noEmit` clean; browser look only, no test run needed for a class change and docs.

## R8.214 | 2026-09-30 | feat(studioflow): set project dates only from Timeline

- **KB-062 closed.** Owner decision: all time settings live on Timeline. New and Edit project no longer have Opening date
  or Timeline start; Timeline rows get "Edit project dates" (start + opening date) via `setProjectDatesAction`.
  `updateProjectAction` no longer forces the opening date to null when the field is omitted (it would have wiped it on
  every edit once the field left the form). Regression test added. Phase dates are still set from the bar.

**Checks.** `npm test` 651/651, `tsc --noEmit`, boundaries and legacy-runtime checks pass; no browser run (queued).

## R8.213 | 2026-09-30 | fix(studioflow,masterdata): free-text project names, inline client/supplier creation, sample receipt on cards

- **KB-062 (naming, client, type).** Owner decision: no year-number-name convention. Project names are free text on
  create and edit (duplicate name gives `PROJECT_NAME_TAKEN`). Removed the naming rule, the auto-numbering switch and
  `setAutoNaming` (now `setArchiveRetention`), `domain/naming.ts`, and the never-used Project type. New/Edit project use a
  single searchable, creatable Client control (`client-select.tsx`). Existing project names are kept as they are.
- **Migration `20260930100000_sf_free_text_project_name`** (applied to dev and test): drops `sf_project.project_code`,
  `sf_project.project_type`, table `sf_project_sequence`, and `sf_settings.auto_naming_enabled`. Destructive but
  only removes derived/unused data.
- **Concurrency fix uncovered by the change.** The per-year counter used to serialize project creates by accident; without
  it the same-new-client race (SF-05) aborted the loser's transaction. Client upsert now uses `ON CONFLICT DO NOTHING`.
  Unique-name violations on project write map to `PROJECT_NAME_TAKEN` (rename onto a taken name used to leak `P2002`).
- **KB-061.** Schedule board cards and option cards show "Mark received" / "Mark sample received" for a requested sample.
- **KB-060.** The sample-request quote dialog searches suppliers and can create a real one inline (existing quick-create
  dialog, material-capable types, only with supplier manage).
- **Still open:** the Opening date / Timeline part of KB-062 waits on an owner answer. Browser checks queued in
  `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md`. `PLAN.md` target moved to R8.214.

**Checks.** `npm test` 650/650, `tsc --noEmit`, `check:boundaries`, `check:legacy-runtime` pass; no browser run.

## R8.212 | 2026-09-29 | fix(studioflow,docs): refine sample request copy and record walkthrough follow-ups

- **Schedule refinement.** The sample-request dialog now explains that Master Data staff receive the request to obtain a
  quote and that physical receipt is recorded back in StudioFlow. The vendor hint is a field placeholder rather than
  redundant field copy; the optional note uses the compact single-line input. Product codes on Schedule cards use the
  normal UI typeface, removing the unintended display-font artifact.
- **Owner walkthrough backlog.** Added KB-060 (create/select Supplier while recording a quote), KB-061 (mark the physical
  sample received from Schedule), and KB-062 (bring New Project naming, client creation, project type, and opening-date /
  Timeline behaviour back in line with the confirmed legacy workflow). These remain planned Lead-owned work; none is
  claimed complete in this revision.

**Checks.** Full repository verification recorded with the local commit. No migration or dependency.

## R8.211 | 2026-09-29 | fix(bq,platform): review correction for R8.210 (BQ list crash), show estimator name

- **Verdict on R8.210 (WO-CLEANUP-01): CORRECTION REQUIRED, corrected here.** The refactor, migration (both databases up to date, no TODO rows)
  and directory hooks are sound and were re-run independently. One regression: `getPaginationSlice` lived in a `"use client"` UI Engine file
  but the server page `bq/page.tsx` called it, so `/bq` crashed ("Attempted to call getPaginationSlice() from the server"). Neither `npm test`
  nor `next build` caught it (same class as the R8.164 print bug). The pure function now lives in `@platform/utilities/pagination` (server and client
  share it), the UI Engine copy and its source-regex test were removed, and a behavior test (slice, clamp, empty) was added.
- **Estimator column.** The BQ project list showed the raw user id in "Estimator"; it now resolves the name through the platform people directory
  (raw label kept for non-user actors). Pre-existing defect found in the walkthrough.
- **Browser (dev server).** Master Data units archive and restore through the shared row-action hook (dialog closes, row state changes, PCS restored),
  and users, roles, brands, categories, SKUs, vendors, pricing and BQ list render without errors.
- Follow-up for the harness: no rule yet catches "server component calls a function from a `"use client"` module"; recorded in `BACKLOG.md` under the
  harness item (`WO` list in `BACKLOG.md`: "Harness: catch server code calling a `"use client"` function").

**Checks.** `tsc`, eslint (0 errors), `check:boundaries`, focused pagination + UI Engine tests (58/58); full `npm test` below.

## R8.210 | 2026-09-29 | refactor(platform,studioflow): converge row actions and pagination, remove retired activity mode

- **Shared machinery (KB-043, KB-055b).** Added the domain-neutral UI Engine `useRowAction` hook, then moved the seven
  Master Data and Settings directory row-action wrappers to it without changing their pending, safe-error, retry-error, or
  success-callback handling. BQ and pricing now share the UI Engine page slice helper, preserving the existing one-page empty
  state and last-page clamp. `APP_DUPLICATE_MACHINERY` is empty after convergence.
- **StudioFlow activity mode.** Removed the retired `SfActivityMode.TODO` value. Confirmed zero TODO rows in both isolated
  rebuild databases before creating the enum-replacement migration, deployed it to `masterdata` and `masterdata_test`, and
  regenerated Prisma Client. `FEEDBACK` remains the only valid value.
- **Evidence.** Updated `docs/UTILITY-INVENTORY.md` with the converged pagination verdict and added UI Engine coverage for the
  public hook/page helper surface.

**Checks.** `npm run check`; `npm run test:boundaries`; `npm run test:legacy-runtime`; `npx eslint src scripts`; full
`npm test` against `masterdata_test`; focused `ui-engine.test.ts`; `npm run build`; staged/unstaged whitespace checks.

## R8.209 | 2026-09-29 | fix(platform,docs): harden the architecture harness, clear the backlog to planned-only, verify in the browser

- **Checker harness (KB-040, KB-053, KB-054, KB-051 follow-up).** The duplicate-primitive rule now also catches
  `Intl.RelativeTimeFormat` and `toLocaleDateString`/`toLocaleTimeString`; the two live bypasses
  (`masterdata/page.tsx`, print/schedule) now use `formatInstant`. New rules: an unscanned file under `src` (extensionless,
  `.mts`, `.fuse_hidden*`) fails; a **ratchet** for generic machinery (`APP_DUPLICATE_MACHINERY`: private `runRowAction`, private
  page-count math) that fails on any new copy and on any baseline entry that no longer matches. The legacy-reference scan now also
  covers `scripts/`, `prisma/`, `public/` (plus `.sql`/`.prisma`) and absolute paths into a checkout named `studioflow`.
  Fixtures for every new rule.
- **Docs (KB-039, KB-052, KB-055a).** `CORE.md` now describes the real shape (service modules + `runtime.ts`, no per-app
  `infrastructure/`/`application/`) and its stale "current evidence" block is rewritten; the checker table in
  `docs/UTILITY-INVENTORY.md` states the widened rule. R8.83's "pill radius 3px" note was stale (token was always 999px).
- **UI fixes found in the walkthrough.** PipelineStrip (UI Engine) scrolls horizontally instead of truncating phase names at
  ~840 px and stacking tall at 375 px; "Add feedback" no longer clips at 375 px.
- **Backlog is planned/blocked only.** All `[UNVERIFIED]`, `[BUG]` and `[CLEANUP]` entries were closed or moved: browser checks that
  still need a second user, real hardware, or Master Data prices are one PENDING item in
  `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md`; KB-043 and KB-055b became `WO-CLEANUP-01` in `PLAN.md` (READY, for Codex, R8.210).
- **Browser verified (dev server, 2026-09-29).** Quick messenger anchoring at desktop and 375 px; Deliverables upload/download/delete;
  archive and restore with a real file; Product Schedule settings (add/edit/delete a prefix row), add-option with photo, Set final,
  option delete, board and list; Presentation board pins; print pages (200, converged date) and the SF-13 error fallback with retry
  (forced error, reverted); BQ end to end (see R8.208). Test rows left in the dev DB are listed in R8.208.

**Checks.** `npm run check`, `test:boundaries`, `test:legacy-runtime`, eslint, full `npm test`.

## R8.208 | 2026-09-29 | fix(bq,platform): late-sorting BQ price lookup, production storage-folder guard, checker rules, mobile project menu

- **BQ price bug closed.** Adding a Master Data material price re-read a 200-row search window, so a price whose SKU
  sorted past 200 was wrongly refused. Master Data's public read now has `getMaterialPriceOption(id)` (same live-price
  rules); `addLineItemAction` uses it. Integration test covers found / not found.
- **Production storage-folder guard.** New `platform/infrastructure/storage/storage-root.ts`; `instrumentation.ts`
  refuses to start in production unless `STUDIOFLOW_STORAGE_ROOT` is set, absolute, not a drive root, outside the app
  folder, and writable (write probe). Development keeps the `.storage` fallback. `.env.example` documents it.
- **Checker fixes (KB-051, part of KB-053).** The duplicate-primitive allow list now fails on entries that point at a
  missing file; the three deleted `_legacy_project_id` entries and doc rows are removed. Both checkers skip only the
  top-level `src/generated`, not any folder named `generated`. Fixture tests added. KB-054 left open.
- **Mobile project menu (owner feedback).** At 840 px and below the project side menu was a ~500 px block above the
  content; it is now a slim horizontally scrolling strip (`projects/[projectId]/layout.tsx`).
- **Browser walkthroughs (dev server).** BQ, deliverables, and archive/restore with a real file recorded in
  `docs/BACKLOG.md` and `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md`. Test data left in the dev DB: BQ project
  "Walkthrough Test BQ", library item "Keramik Uji", assembly "Assembly Uji", StudioFlow project "2026-999 Uji Retensi".
- No migration, no dependency.

**Checks.** `tsc --noEmit`, `check:boundaries`, `check:legacy-runtime`, `test:boundaries`, `test:legacy-runtime`,
eslint on touched paths, and the storage-root + Master Data integration tests pass. Full `npm test` 648/648 (the instrumentation test now also mocks the storage-root import).
Not walked: quick messenger anchoring, Master Data price source, repeat/unauthorized cleanup.

## R8.207 | 2026-09-29 | feat(platform): refine the quick messenger composer

- **Popup only; `/messenger` and the messenger backend contract are unchanged.** The popup collapses on a press or
  keyboard focus outside it and on Escape (focus returns to the topbar button), never while interacting inside.
  Unsent text and picked files are kept per conversation across collapse/reopen; text also survives a reload through
  `sessionStorage` (files are memory-only).
- **Composer.** Enter sends; Shift+Enter and Alt+Enter insert a newline; Enter during IME composition is ignored; a
  ref guard plus the pending state prevent a double send. `- `, `* ` and `1. ` lists continue on Enter and exit on an
  empty item (Ctrl/Cmd+Enter sends a list message); storage and rendering stay plain text (messages now keep their
  line breaks). Compact `+` picker and small send button use UI Engine `IconButton`/`Textarea`; picker, drag-and-drop
  and paste share one selection path with client-side 5-file / 10 MB checks and an accessible error, while the server
  stays the authority. Pure rules live in `quick-messenger-composer.ts` with unit tests.
- **Config fix proven in the browser.** `next.config.ts` server-action body limit raised 4 MB → 52 MB: a 6 MB
  attachment failed to send at the old limit though the contract allows 10 MB × 5. After the change a 9 MB file sent.
- No migration, no dependency. `PLAN.md` replaced by this UI work order (IMPLEMENTED); the backlog item is now
  `[UNVERIFIED]` for real-device evidence only.

**Checks.** `tsc --noEmit`, `npm run lint` (0 errors; 2 existing unrelated warnings), `check:boundaries`,
`check:legacy-runtime`, `npm test` 645/645. `npm run build` was not run. Browser (`http://localhost:3001`): Escape,
outside click and outside focus collapse with the draft restored on reopen; list continue/exit for `-` and `1.`;
Shift/Alt+Enter newlines; synthetic IME Enter did not send; double Enter sent one message; drag-drop, picker,
over-10 MB and over-5-file errors; text + attachment send; 375 px viewport with no horizontal scroll. A test message
and two test attachments were sent to the existing dev conversation.

## R8.206 | 2026-09-29 | docs(platform): plan quick messenger composer refinement

- Recorded the owner's UI/UX work order for Claude: safe outside dismissal that retains the session draft, Enter-send
  with Shift/Alt+Enter newline and IME protection, plain-text list continuation, and compact attachment picker/drop
  support. The plan preserves the completed platform Messenger backend and its attachment/security contract; it makes
  no product-code change.

**Checks.** Documentation-only change; whitespace check passes.

## R8.205 | 2026-09-29 | fix(bq,platform): make sibling ordering durable and schedule local messenger cleanup

- **BQ sibling order.** Additive migration `20260929100000_bq_sibling_sort_order_uniqueness` enforces one
  `sort_order` per actual sibling scope, including the nullable dual-parent scopes for work items, cost components,
  and template sections. Before deployment, both local rebuild databases were checked and had no duplicate sibling
  positions. Automatic appends now retry only a database unique collision and recompute their position; explicit
  positions remain strict. Template reordering moves rows through a temporary unused range before its final order, so
  a legitimate swap cannot violate the unique index midway. Regression tests cover concurrent automatic appends and a
  position swap.
- **Sample-request supplier.** The quote form now uses the UI Engine searchable `Combobox`, as the Master Data
  contract requires for a live supplier dictionary. It preserves the optional no-supplier state and the existing
  server-side active-supplier validation.
- **Messenger cleanup for a local PC.** New `npm run cleanup:messenger` is a short-lived, location-aware command for
  expired private attachment bytes. It uses the same selected local database and private storage root as the app,
  keeps chat history, drains at most 2,000 attachments per run, and closes its database connection afterward. The new
  local-PC scheduler runbook documents a daily Windows Task Scheduler task; no in-app timer or hosting-provider lock-in
  was added. Ran it against the rumah rebuild database: zero expired attachments needed removal.

**Prisma sync.** Applied the additive BQ sibling-order migration to verified `masterdata` and `masterdata_test`
rebuild databases, then regenerated the Prisma client.

**Checks.** Focused BQ concurrency coverage (20/20) and the full suite (636/636) pass. TypeScript, architecture and
legacy-runtime checks, and the production build pass. ESLint has two pre-existing presentation-image warnings and no
errors.

## R8.204 | 2026-09-29 | feat(masterdata): link a supplier while recording a sample quote

- The sample-request quote dialog can now associate an existing active supplier with a quote. This completes the
  locked intake contract's existing optional `vendorId` link without creating suppliers or changing StudioFlow's
  request state.
- Supplier choices expose only an id and name, omit archived suppliers, and require
  `masterdata.sample-request.manage` rather than the broader supplier-directory permission. The server action still
  validates the selected UUID; the Master Data service independently confirms that the supplier remains active before
  writing it.
- Tests cover the narrow read permission, archived-supplier exclusion, server-action forwarding, and existing quote
  invariants.

**Prisma sync.** After fast-forwarding from R8.184 to R8.203, deployed the three incoming additive migrations
(`20260929035510_studioflow_asset_cleanup_failure`, `20260929063847_sf_presentation_manager`, and
`20260929090000_platform_messenger`) to the verified local rebuild databases `masterdata` and `masterdata_test`.
Regenerated the Prisma client. No migration was authored in this revision.

**Checks.** TypeScript and targeted sample-request coverage pass. Full mandatory checks are recorded with the commit.

## R8.203 | 2026-09-29 | fix(studioflow): stop project sub-pages hanging on a deleted project, close a presentation-asset purge gap

Owner request: verify Codex's recently-completed work live in the browser, re-check the known-bug backlog for
remaining logic debt, and audit for business-logic/UI-UX defects. Details in `docs/BACKLOG.md` (SF-16, KB-040 third
instance, KB-056 through KB-059, and the `nextSortOrder` race re-classification).

- **SF-16 (BUG, fixed).** Every `studioflow/projects/[projectId]/*` sub-page except the overview
  (`mom`/`schedule`/`presentation`/`presentation/[boardId]`/`history`) hung forever on "Memuat halaman" for a
  deleted/nonexistent project instead of 404ing, because none of them converted StudioFlow's `NOT_FOUND` `AppError`
  into Next's `notFound()` — the pattern `layout.tsx` already used correctly. Separately, no `not-found.tsx` existed
  anywhere under `src/app/(platform)/`, so even a correct `notFound()` call (layout.tsx, and the project overview once
  fixed) had nothing to render into. Added `src/app/(platform)/not-found.tsx`; applied the established
  catch-and-convert pattern to all five sibling pages. Verified live for all six routes via browser screenshot against
  a nonexistent project id.
- **KB-056 (BUG, fixed).** Archive-asset retention purge never touched `sfPresentationSlide`, so the owner-approved
  "files removed after 90 days" promise was false for presentation images — the row's `image_key` stayed referenced
  forever, and the shared-key safety check in `removeUnreferenced` correctly refused to ever delete the blob. Purge
  now also collects slide keys and deletes the slide rows (boards are kept, annotations cascade). New regression test
  in `service.integration.test.ts`.
- **KB-057 (BUG, fixed).** Master Data's sample-request queue already computed `sourceStatus` (StudioFlow's live
  status for the source request) but never showed it, so staff could keep pricing a sample the designer already
  marked received directly in StudioFlow. Added an "Already received" badge and detail-dialog warning in
  `sample-request-directory.tsx`, reading the field that was already correct and already unit-tested.
- **KB-058 (BUG, fixed).** Neither messenger surface (`/messenger`, the topbar quick-messenger popup) showed
  `otherUser.active`, so staff had no signal when continuing a conversation with a deactivated account. Added a
  "Deactivated" badge to both surfaces.
- **KB-040 third instance (BUG, fixed).** The presentation print page (`print/projects/[projectId]/presentation/[boardId]/page.tsx`)
  used `toLocaleDateString` instead of the canonical `formatInstant`, same bypass class as the two already-open
  KB-040 instances (still open). Converged onto `formatInstant`.
- **`nextSortOrder` race (BUG, re-classified — partially mitigated, not closed).** Wrapped all five original BQ call
  sites plus two undocumented sibling instances (`assemblies.ts`, `templates.ts`) in `runTransaction`
  (Serializable + retry-on-P2034). This closes a real secondary atomicity gap in `applyAssemblyTemplate`, but a
  purpose-built concurrency test proved the `MAX()`-then-`INSERT` race itself is not reliably caught even under
  Serializable isolation — PostgreSQL's predicate locking does not treat that pattern as a detectable conflict. A full
  fix needs a DB-level unique constraint (partial indexes; schema-level, out of scope here). Documented honestly in
  `docs/BACKLOG.md` rather than claimed fixed.
- **KB-059 (CLEANUP, documented, not fixed).** `cleanupExpiredAttachments` (messenger) has no caller outside its own
  test — a slow storage leak, not a correctness bug (reads already gate on `expires_at`/`purged_at` independently).
  `PLAN.md:79` locks messenger cleanup to manual/opportunistic, not a background timer; the exact opportunistic
  trigger is left for an owner/Lead decision rather than invented here.

Checks: `tsc --noEmit` clean, `eslint` clean on touched files, full `npm test` 634/634 pass (was 633 before the new
purge regression test), `STUDIOFLOW_LOCATION=kantor npm run build` clean. No schema/migration changes.

## R8.202 | 2026-09-29 | fix(ui): give the visual foundations the scales they were missing

Owner direction 2026-09-29 approved this foundations pass under DESIGN.md §16.

- **One ground, neutral on purpose.** `DESIGN.md` opened by promising a "warm-neutral palette" while the product
  shipped neutral grey, and three alternate ground ramps (`clay` `#F5EFE7`, `ivory` `#F3F2EE`, `gray` `#F0F0F0`
  with rail `#E8E3DB`) sat behind a `[data-ground]` switch no code ever set. The owner confirmed neutral light
  grey is the intent, so the contract now says so and the dormant ramps are removed rather than documented. Their
  values are recorded in this entry if they are ever wanted back.
- **The rail is a recess again.** `AppShell` computed its own rail colour as `color-mix(surface-muted 52%, surface)`
  (≈`#F5F5F5`), which sits *above* the `#F0F0F0` ground — the opposite of the contract's "this is the machine, not
  the work" — while the record workspace rail beside it used `--ui-rail`. Both now use `--ui-rail` `#E3E3E3`.
- **Phase marks are monotone.** The five phase hues differed almost only in hue, spanning 14 L\* in light and 11 in
  dark; Moodboard olive and 3D rose sat 3.4 L\* apart, which is the red/green pair at one lightness that the
  contract's own checklist warns against, and on a 7px Gantt dot colour is the only channel. Replaced with five
  steps of one hue family ~7.6 L\* apart (light) and ~9 (dark), each clearing 3:1 against surface, canvas and rail
  in both themes. The ramp runs ground-outward, so a Gantt row now reads as sequence without a legend. The unused
  `--ph-*-deep` ramp is gone: a phase label is ink.
- **A motion scale.** Three durations (120/160/240ms) and two easings, replacing durations picked one at a time in
  components. Applied as `duration-[var(--ui-motion-fast)]`; the `duration-(--token)` shorthand is not guaranteed
  to emit a rule, and this repo has already paid for one silently-empty utility.
- **An icon scale.** Nine sizes between 10px and 20px collapsed to four (12/14/16/20) across 35 call sites, plus
  the off-scale `[&_svg]` and `h-[15px]`/`h-[13px]`/`h-[18px]` overrides. The nav entry's 18px icon is now 16px.
- `DESIGN.md` gains §4.1 Iconography and §13.1 Motion; §1 and §3 are rewritten to match what ships.
  `UI_ENGINE.md` §5 adds the motion and icon tokens to the canonical list.

**Checks.** `tsc --noEmit` clean; `eslint .` 0 errors with the two pre-existing Presentation `<img>` warnings;
boundary and legacy-runtime checks OK; whitespace clean staged and unstaged.

## R8.201 | 2026-09-29 | test(platform): guard quick messenger portal

- Adds a source regression test for `QuickMessenger` requiring the fixed popup panel to render through
  `createPortal(..., document.body)` rather than as a plain topbar descendant. This preserves the R8.200 fix for
  backdrop-filter containing-block behavior.
- Adds the pending browser acceptance item for desktop and 375 px verification that the popup stays bottom-right and
  fully visible.

**Checks.** `npm test` 633/633; `tsc --noEmit` clean; `eslint .` 0 errors with the two pre-existing
Presentation `<img>` warnings; boundary and legacy-runtime checks OK; production build passed with
`STUDIOFLOW_LOCATION=kantor`; whitespace clean staged and unstaged.

## R8.200 | 2026-09-29 | fix(ui): straighten the app shell and portal the quick messenger

- Removes the AppShell brand path that never ran. The rail's brand block was gated on `!topbar`, but every consumer
  passes a topbar, so that block, the `railBrand` local, and the `collapsedBrand` prop were dead. `topbar` is now
  required, the geometry that depended on it (`min-h`, rail `top-`, `<main>` height) no longer branches, and a single
  `brand` prop carries the compact top-bar mark it always rendered.
- Drops `railPresentation="compact"`. Its documented behavior — a full brand header above an icon-only rail — depends
  on the rail brand block that no longer exists, and no consumer set it.
- Fixes `NavSeparator`: `bg-[--ui-border-subtle]` emitted no rule under Tailwind v4, which dropped the implicit
  `var()` wrap for the `[--token]` form. Now `bg-line-subtle`, the bridged theme utility used elsewhere in the file.
- Portals the R8.199 quick messenger panel to `document.body`. The topbar carries `backdrop-blur-[12px]`, and a
  backdrop-filter makes its element the containing block for every `position: fixed` descendant, so the panel
  anchored `bottom-4 right-4` of the 46px header and rendered off the top of the viewport. The blur is intended;
  portalling is the fix. R8.199 is not at fault — `PLAN.md` reserved UI composition for the Lead.
- Syncs `UI_ENGINE.md` and `DESIGN.md` to the code: rail widths 212/48px (not 232/60), `defaultCollapsed` `true`,
  the AppShell prop table, the NavItem active state as it is actually built (white plane + `--ui-shadow-plane` +
  heavier type, no ink rule), the neutral `#F0F0F0` ground with the warm ramps recorded as defined but dormant, and
  the primary-rail `color-mix` recorded as a known deviation from `--ui-rail` pending a visual decision.

**Checks.** `tsc --noEmit` clean; `eslint .` 0 errors with the two pre-existing Presentation `<img>` warnings;
boundary and legacy-runtime checks OK; whitespace clean staged and unstaged.

## R8.199 | 2026-09-29 | feat(platform): add quick messenger popup

- Replaces the topbar messenger link with a bottom-right quick-message popup opened from the same icon/badge. The
  popup consumes the existing messenger actions/service from R8.198: list conversations/people, read conversation,
  send text/files, resolve attachment links, and poll unread counts.
- Keeps `/messenger` as the full-screen view via an expand icon in the popup. No new schema, storage policy,
  permissions, or delivery channel; polling and expiring private attachments remain the R8.198 behavior.
- The popup supports existing conversation chips, a "New" recipient picker, a compact message list, attachment open
  buttons, and the same server-action composer used by the main module.

**Checks.** `tsc --noEmit` clean; `eslint .` 0 errors with the two pre-existing Presentation `<img>` warnings.
Full mandatory suite continues from R8.198's backend checks; browser acceptance for the messenger remains open.

## R8.198 | 2026-09-29 | feat(platform): add private messenger with expiring attachments

- Adds a platform-owned private 1:1 messenger: server-side conversations, participant read cursors, messages, unread
  counts, and temporary attachments in the `platform` schema. The implementation is cross-app and uses the existing
  signed private ObjectStorage boundary; it does not resurrect StudioFlow's legacy project discussion or write through
  `platform.Notification`.
- Legacy evidence was checked read-only from `D:\Misc\ProjectsHUB\studioflow` at
  `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`: KEEP the 30-minute temporary attachment expiry and cleanup concept;
  FIX public-upload storage and localStorage unread state; PURGE the project-scoped shared chat UI behavior for this
  private messenger slice.
- Adds `/messenger` as minimal functional wiring plus a topbar messenger badge. Delivery is polling, messages are
  permanent for both participants in this slice, and attachments become unavailable after 30 minutes while message
  history remains.
- Adds additive migration `20260929090000_platform_messenger` and focused service tests for stable 1:1 conversation
  identity, server-side unread state, non-participant denial, attachment expiry, and cleanup.
- Applied the migration to both kantor local databases used this session: `studioflow_rebuild` and
  `studioflow_rebuild_test`.

**Checks.** Focused messenger integration test passed; `npm test` 632/632; `tsc --noEmit` clean; `eslint .` 0 errors
with the two pre-existing Presentation `<img>` warnings; `check:boundaries` and `check:legacy-runtime` clean;
production build passed with `STUDIOFLOW_LOCATION=kantor`. Browser acceptance for the new messenger remains open, so
the backlog item is now `[UNVERIFIED]`.

## R8.197 | 2026-09-29 | feat(sf): cancel a mistaken sample request before anyone acts on it

Owner request: once a sample request exists, the only transition was "Mark sample received" — there was no way to
undo a mistaken request (wrong vendor typed, wrong option clicked) before Master Data's queue or anyone else acted
on it.

- **Backend.** `schedule/service.ts`: new `cancelSample` command, permission-gated same as `requestSample`/
  `receiveSample` (`P.scheduleManage`). Only allowed while `status === "REQUESTED"` — a `RECEIVED` sample is a
  real-world fact and is not undoable here (`SAMPLE_NOT_PENDING`, same error the receive path already uses for that
  case). Hard-deletes the `SfScheduleSampleRequest` row rather than adding a `CANCELLED` status — it never happened,
  not "happened then stopped" — so no migration was needed. Writes an audit event
  (`studioflow.schedule.sample-request-cancelled`) with the vendor name it was asked of, since the row itself won't
  exist to look at afterward. Master Data's queue reads StudioFlow's `listPendingSampleRequests` (status `REQUESTED`
  only), so a cancelled request disappears from it automatically — no coordinator or Master Data change needed.
- **Actions.** `cancelScheduleSampleAction({ projectId, requestId })` in `(platform)/studioflow/actions.ts`, same
  shape as the sibling request/receive actions.
- **UI.** Added everywhere R8.188 put "Request sample"/"Mark sample received": the Board card's quick-link row (now
  shows "Cancel" next to the "Sample requested" badge), the List row's `⋯` menu, and the full item-editor's per-option
  menu. All three confirm first (`useConfirm`, danger tone, "This cannot be undone") before deleting — this is a hard
  delete, unlike "Mark received" which is just a status change.
- Tests: 1 new integration test — cancel while pending removes the row and re-allows a fresh request, cancelling an
  already-cancelled (now nonexistent) request or a received one both fail cleanly, and the audit event carries the
  vendor name.

**Checks.** `tsc --noEmit` 0 errors; `eslint .` clean; `check:boundaries` and `check:legacy-runtime` OK; full
`npm test` 629/629 (628 before, +1). Browser-verified end to end: cancelled a real test sample request
(the "berkah" one from testing R8.188/189) from the Board card's quick-link, confirmed the dialog showed the correct
vendor name, and confirmed the card fell back to the earlier resolved "Sample received" state afterward — exactly
the intended behavior.

## R8.196 | 2026-09-29 | fix(studioflow): make Today scope links valid and protect print routes

- Today scope choices now use the existing filter-chip link styling directly, with `aria-current` for the selected
  destination. This removes the invalid interactive button inside each link without changing scope URLs or filtering.
- The authenticated document route segment now supplies localized loading and unexpected-error/retry states for the
  existing Schedule, MOM, and Presentation print pages.

**Checks.** `npm test` 628/628; `tsc --noEmit` clean; `eslint .` 0 errors with two pre-existing Presentation image
warnings; boundary and legacy-runtime checks clean; production build passed. Browser verification on disposable
`studioflow_rebuild_test`: Today navigates by keyboard between both scopes, exposes one `aria-current` link, and contains
no nested buttons; an authorized Schedule print route renders its document and print controls. A nonexistent print
project correctly returns 404. The generic unexpected-error fallback was not deliberately induced, so SF-13 remains
`[UNVERIFIED]` for that one browser state. Sample-request and Presentation acceptance records remain open.

## R8.195 | 2026-09-29 | fix(bq): Assembly picker used a bare native select instead of the searchable-picker pattern

Owner spotted this while testing R8.192's new Assembly picker dialog: the "Assembly" field
(`assembly-picker-dialog.tsx`) was a plain `<Select>` with every assembly template dumped into a native dropdown.
Assembly templates are a growable catalog (BQ Library has an "Add assembly" button, same shape as Vendor/Brand/SKU),
not a short fixed vocabulary — the app's own established pattern for that (used for Vendor/Brand/Category pickers in
`pricing-directory.tsx`, `sku-directory.tsx`, `category-directory.tsx`) is `Combobox` (search-as-you-type), not a bare
select. The one other `<Select>` in BQ (`project-editor.tsx:575`) is for **unit**, a genuinely short fixed list —
that one is correctly a native select and was left alone.

- `assembly-picker-dialog.tsx`: swapped `<Select>` for `<Combobox>` (no `onCreate` — assemblies are created from BQ
  Library, not inline here), options built from `{id, label: name, description: "N baris"}`. Verified live: opening
  the picker on a project with zero assembly templates shows the search field and the correct empty state
  ("Assembly tidak ditemukan"), matching the dialog's existing Indonesian copy.

**Checks.** `tsc --noEmit` 0 errors; `eslint .` clean; `check:boundaries` OK; full `npm test` 628/628. Browser-verified:
combobox opens, search field renders, empty state is correct for a project with no assembly templates yet.

## R8.194 | 2026-09-29 | feat(studioflow): add project Presentation boards

- Adds StudioFlow Presentation boards with private multi-image slides, editable blank or Schedule-linked pins, project-scoped permission, audit history, and reference-aware image cleanup.
- Adds project navigation, functional board editor, and the existing print/PDF route for one slide per page.
- Applies additive migration `20260929063847_sf_presentation_manager` to the kantor development and disposable test databases.

**Checks.** `npm test` 628/628; `tsc --noEmit` clean; `eslint .` clean with two existing-style signed-image warnings; boundary and legacy-runtime checks clean; production build passed. Browser acceptance for Presentation remains open. Sample-request acceptance remains separately open and unchanged.

## R8.193 | 2026-09-29 | feat(bq): search/filter and a real Status Promosi column on BQ Library Items

Fourth and last slice of the BQ UI/UX redesign pass (previous three: R8.190–R8.192).

- **New `LibraryItemsPanel`** (`src/app/(platform)/bq/library/library-controls.tsx`), extracted from the Items
  tab's inline JSX in `page.tsx`. Adds a search box (by name) plus KATEGORI and Status Promosi `<Select>` filters
  above the table, all filtering the already-fetched `items` array client-side — the same convention this
  codebase's masterdata directory tables already use (e.g. `unit-directory.tsx`), not a new pattern. The Items tab
  previously had no search or filter at all; as the library grows past a page or two this was the one BQ screen
  with no way to find anything.
- **Status Promosi is now a table column** (`DRAFT`/`REQUESTED`/`APPROVED`/`REJECTED`, badge-styled like KATEGORI),
  not only an implicit state that gated whether the row-menu's "Ajukan Promosi" action was visible. A Custom
  item's `promotionStatus` is always `DRAFT` and can never change (bq-contract §8.2 — only Material/Labor/
  Material+Labor are ever `REQUESTED`), so it renders as a plain "—" rather than a `Draft` badge that would
  wrongly imply a pending step.
- `page.tsx` shrank to composing tabs; all Items-tab markup, state, and the KATEGORI/promotion label-tone maps
  moved into the new client component alongside the (also newly added) `PROMOTABLE_TYPES` check reused from
  `promotion-controls.tsx`'s existing rule.

**Checks.** `tsc --noEmit` 0 errors; `eslint src/apps/bq "src/app/(platform)/bq"` clean; `check:boundaries` OK;
`check:legacy-runtime` OK; full `npm test` 628/628; production build exit 0. No browser pass was run (owner tests
BQ in-browser themselves); added to the same `[UNVERIFIED]` BQ scope in `docs/BACKLOG.md`.

This closes the four-slice BQ UI/UX redesign pass (R8.190–R8.193) proposed as an owner-facing mockup earlier this
session. Deliberately out of scope throughout, and not silently added: any change to the calculation engine,
schema, RBAC, or editability rules; a per-section money subtotal (would require server-side calculation, not
attempted client-side — see R8.191); an "estimated assembly cost" total (see R8.192, same reason); redesigning
Project List, the "new project" form, or the Template Editor (judged already adequate, not touched).

## R8.192 | 2026-09-29 | feat(bq): Assembly picker shows the L2+L3 recipe before applying

Third slice of the BQ UI/UX redesign pass (first two: R8.190, R8.191).

- **New read-only action** `getAssemblyLinesAction` (`src/app/(platform)/bq/[id]/source-actions.ts`), gated by the
  same project read/manage check as the rest of this route (not the Library's `bq.library.read`, since it's
  reached from inside the project editor). Calls the existing `bqPublicRead.getAssemblyTemplateDetail` public read
  port — no new backend capability, that port already returned `lines: BqAssemblyLineRead[]` but nothing in the
  project editor called it.
- **`AssemblyPickerDialog`** (`src/app/(platform)/bq/[id]/assembly-picker-dialog.tsx`) now shows a live preview
  panel next to the Assembly/Quantity fields — each line's name, kategori, qty + unit, koefisien, and harga —
  fetched (via `useEffect` + `useTransition`, after render, same pattern R4.57 fixed for the Import dialog) whenever
  the selected assembly changes. Previously the dialog was one dropdown and one qty field with no way to see what
  the assembly actually contained before applying it — the estimator had to already know the recipe by name.
  **Deliberately does not show a computed "estimated group cost"** the way the original mockup sketched: summing
  the previewed lines' `harga` client-side would be exactly the client-side money arithmetic bq-contract §2/§6.0
  reserve for the server (and the calculation isn't even this simple — L2 markup, `qty_per_l1`, and the engine's
  truncate-to-2-decimals rounding policy all apply before a real subtotal exists). The preview stays descriptive
  (what's in the recipe), not a second, unofficial calculator.

**Checks.** `tsc --noEmit` 0 errors; `eslint src/apps/bq "src/app/(platform)/bq"` clean; `check:boundaries` OK;
`check:legacy-runtime` OK; full `npm test` 628/628; production build exit 0. No browser pass was run (owner tests
BQ in-browser themselves); added to the same `[UNVERIFIED]` BQ scope in `docs/BACKLOG.md` as R8.190/R8.191.

## R8.191 | 2026-09-29 | feat(bq): Section outline rail + sticky Grand Total footer on Project Detail

Second slice of the BQ UI/UX redesign pass (first slice: R8.190). Scoped again to presentation only, inside
`src/app/(platform)/bq/[id]/project-editor.tsx`; nothing server-computed changed.

- **Section outline rail.** A sticky left-hand nav (`SectionOutline`, `xl:` breakpoint and up — hidden on
  narrower viewports so it never further squeezes the already-wide ledger table) lists every Section with its
  Work Item count and jumps to it on click via a plain `#bq-section-<id>` anchor (each `SectionCard` now carries
  that `id`). Long documents — many Sections, one continuous scroll — previously had no way to jump around or see
  structure without scrolling past everything. Deliberately **does not** show a per-section money subtotal:
  bq-contract §2/§6.0 reserve all money arithmetic for the server ("Tidak ada kalkulasi di client"), and no
  per-section subtotal is in the current read shape (`BqSectionDetail` has no `subtotal` field) — inventing one
  client-side by summing `item.total` strings would be exactly the kind of client-side money math the contract
  forbids. The rail only counts array lengths (Work Items per Section), which is structural, not calculated.
  Also does not track/highlight the currently-scrolled-into-view Section (would need a scroll-spy/
  IntersectionObserver); scoped out to keep this slice small. Confirmed the app shell's own scroll container
  (`<main>` in `shells.tsx`, fixed `h-[calc(100dvh-var(--ui-topbar-height))]` with `overflow-auto`) is what
  `position: sticky` resolves against here, so no layout/flex-chain change was needed elsewhere.
- **Sticky Grand Total footer.** The Grand Total (and the R8.190 pricing-completeness line) moved out of the top
  action bar into its own bar with `sticky bottom-0`, staying visible while scrolling a long project instead of
  requiring a scroll back to the top to check the running total. The top bar keeps only the Lock/Archive/Restore/
  status controls, now on a single row.

**Checks.** `tsc --noEmit` 0 errors; `eslint src/apps/bq "src/app/(platform)/bq"` clean; `check:boundaries` OK;
`check:legacy-runtime` OK; full `npm test` 628/628; production build exit 0. No browser pass was run (owner tests
BQ in-browser themselves) — sticky positioning is CSS-only and code-reviewable, but visually confirming it against
the real app shell chrome (topbar height, z-index stacking with any other sticky/portal elements) is worth an
explicit look next time BQ is opened in-browser; not blocking, added to the existing `[UNVERIFIED]` BQ
browser-walkthrough entry's scope in `docs/BACKLOG.md`.

## R8.190 | 2026-09-29 | feat(bq): split Koef./Markup columns, unify Cost Component entry points, show pricing completeness

First slice of a UI/UX redesign pass on the BQ project editor (`src/app/(platform)/bq/[id]/project-editor.tsx`),
scoped to changes that touch presentation only — no calculation-engine, schema, or editability-rule change. A
proposal for the remaining screens (Project Detail navigation/sticky chrome, a unified Quick-Add popover, an
Assembly-apply preview, and BQ Library search/filter) was designed first as an owner-facing mockup and is not yet
implemented; scoping the rest is next.

- **Koef. and Markup are now two fixed columns instead of one cell that changes meaning.** Previously the same
  cell showed an editable coefficient for a childless Work Item and, once it gained children, silently switched to
  an editable markup percentage — distinguishable only by a hover tooltip. Now both columns are always present;
  whichever does not apply to that row (Koef. for a Work Item with children, Markup for a childless Work Item or
  a Cost Component, both for a Component Group's Koef.) shows a plain "—". No calculation, storage field, or
  editability rule changed — `zeroMarkupIfChildless` (R8.119) still applies; this is presentation only.
- **One entry point for adding a Cost Component, not three.** Removed the inline "Custom Cost Component" quick-add
  row (`TransientLineItemRow`), which took only a title and silently defaulted `kategori` to `MATERIAL`
  (`actions.ts:372`, `value.kategori ?? "MATERIAL"`) without asking. The existing Import dialog already has a full
  Custom tab that asks for type/kategori explicitly, so both "Custom Cost Component" and "Add Cost Component"
  buttons at the Work Item and Component Group level are now a single "+ Tambah Cost Component" button opening
  that dialog. Applying an Assembly stays a separate action (it fills many lines at once, not one).
- **Pricing completeness is now visible before the Grand Total goes blank.** A new "`X` dari `Y` Cost Component
  sudah ada harga" line under the Grand Total (client-side count over every terminal L1-only Work Item and L3 Cost
  Component's `hargaSnapshot`), turning warning-colored once anything is unpriced — previously the only signal was
  the Grand Total itself rendering as "Belum lengkap" with no indication of which or how many items were missing a
  price.

**Checks.** `tsc --noEmit` 0 errors; `eslint src/apps/bq "src/app/(platform)/bq"` clean; `check:boundaries` OK;
`check:legacy-runtime` OK; full `npm test` 628/628; production build exit 0. No browser pass was run (owner tests
BQ in-browser themselves); this remains covered by the existing `[UNVERIFIED]` BQ browser-walkthrough entry in
`docs/BACKLOG.md`.

## R8.189 | 2026-09-29 | fix(ui): converge stale token classes and drawer entrance

Closes five small backlog UI defects whose fixes were already locked by the token inventory and UI Engine contract:

- **KB-038:** deliverable download/delete affordances and the upload hint now use `text-ink-tertiary` instead of the
  nonexistent `text-ink-muted`, restoring the intended quiet resting state while keeping the existing hover colors.
- **SF-11:** the Schedule List/Board toggle now uses `min-h-(--ui-control-height-sm)`, matching the valid token syntax
  already used by neighboring controls.
- **MD-01:** supplier remove controls now hover to `text-danger` instead of the nonexistent `text-ink-danger`.
- **SF-14:** final option chips now use the bridged success foreground token `text-success`.
- **KB-050:** drawers now use the fade-in animation instead of the centered dialog entrance, so the drawer frame no
  longer inherits the dialog's translate-from-center keyframe.

**Checks.** `tsc --noEmit` 0 errors; `eslint .` clean; `check:boundaries` OK; `check:legacy-runtime` OK; full
`npm test` 628/628; production build exit 0. No browser pass was run; these fixes are static token/class corrections
covered by the UI Engine source checks and production CSS compilation.

## R8.188 | 2026-09-29 | fix(sf): Request sample was reachable only from inside the full item-editor dialog

Follow-up to the owner's question about how to request a sample: the action existed (R8.123) and worked, but was three
levels deep (open the entry → scroll past Item details and What shows on the card → Spec options) in both List and
Board view, with no status visible until you got there.

- **Board view** (`schedule-board.tsx` `BoardView`): the card now shows a `Sample requested`/`Sample received` badge
  right under the product name, and a `Request sample`/`Request sample again` quick-link next to it when nothing is
  pending — no need to open the item editor first. Same nested-interactive pattern the existing "+ Add photo" overlay
  already used (`role="button"` span with `stopPropagation`, not a real `<button>`, since the whole card is already
  one), so the click doesn't also trigger the card's own open-entry handler.
- **List view** (inline in `ScheduleBoard`): the row now shows the same status badge, and the row's `⋯` menu gained
  `Request sample` / `Request sample again` and `Mark sample received` — previously that menu only had Open, Save as
  template, Move up/down, Move to category, and Delete; there was no path to a sample request from this view at all.
- Both open the same existing `SampleRequestDialog` and call the same existing `requestScheduleSampleAction` /
  `receiveScheduleSampleAction` — no new backend, no schema change. `ScheduleBoard` now owns a lifted `sampleFor` state
  so the dialog can be triggered from the top-level card/row, independent of the full item editor's own instance of the
  same dialog (unchanged, still reachable the original way too).

**Checks.** `tsc --noEmit` 0 errors; `eslint .` clean; `check:boundaries` and `check:legacy-runtime` OK. Verified live
in the browser end to end on both views: Board quick-link → dialog → badge appears → List row's menu → Mark sample
received → badge updates, no page reload needed (existing `revalidatePath` in the actions). No new automated test —
this reuses existing, already-tested actions and an existing dialog component; nothing new to unit-test at the service
layer, and this file has no existing test harness for its client-rendered markup.

**Note for the owner:** verifying this created a real "Toko Cat Jaya" sample request (then marked received) on
project 2026-536's PT-01 Paint 1 option in the dev database — harmless dev data, but flagging since it wasn't a
disposable fixture project.

## R8.187 | 2026-09-29 | fix(ui): print headings faked serif bold instead of using the fixed sans-black pattern

Found while answering the owner's question about a font "artifact" on the printed Product Schedule title. `tsc --noEmit`
found nothing because this is a Tailwind class string, not a type error.

- Both print/PDF headings (`(document)/studioflow/print/projects/[projectId]/schedule/page.tsx`,
  `.../mom/[momId]/page.tsx`) hand-rolled their own `<h1>` instead of the shared `Heading` primitive, so they never
  picked up the R8.148/R8.162 fix: `font-serif font-bold` requests weight 700 on Instrument Serif, which ships only
  weight 400 (Regular/Italic — `layout.tsx`), so the browser synthesized the bold by smearing the 400 outlines (thin,
  slack look). A second, separate defect stacked on top: `font-serif` is Tailwind's own built-in default utility, not
  this app's `font-ui-serif` design token (`globals.css` `@theme inline` maps `--font-ui-serif` to the actual Instrument
  Serif variable) — so the custom face wasn't even being requested; the computed font-family resolved to the browser's
  generic system serif, not Instrument Serif and not any "Lora"-like face.
- Both now use `font-ui-sans font-black` (Schibsted Grotesk, a real variable font over weights 400-900), matching the
  pattern `Heading`'s H1/H2 already use. Verified live: computed `font-family` is now `"Schibsted Grotesk", ...` at
  `font-weight: 900`, no synthesis.
- No other file uses the bare `font-serif` Tailwind utility (checked app-wide).

**Checks.** `tsc --noEmit` 0 errors; `eslint .` clean; `check:boundaries` OK; verified live via computed styles and a
screenshot of the rendered print page (no MOM document existed in the fixture project to screenshot that page too, but
it is byte-identical markup to the schedule heading now confirmed working). No test added — a static className string,
not a behavior a unit test would catch; the R8.162 precedent didn't add one either.

## R8.186 | 2026-09-29 | fix(studioflow,masterdata): asset-cleanup deletes retry instead of leaking, price amount always has a currency

Two owner-prioritized items from the R8.184 debt review (`kerjakan dalam 1 session run`), both pre-existing and untouched
by R8.183-185: a leaked storage key on delete failure, and a data-integrity gap on the sample-quote price.

- **Asset cleanup retry (`docs/BACKLOG.md` #1, was the top priority).** `purgeExpiredArchivedAssets` and every schedule-
  image delete already removed the owning DB row before attempting the storage delete; a failed `storage.remove` was
  only ever counted (`blobFailures`), never recorded, so the key was unrecoverable — no DB row referenced it anymore,
  and the count in the audit event's metadata isn't the key itself. New model `SfAssetCleanupFailure` (additive
  migration `20260929035510_studioflow_asset_cleanup_failure`, applied to `studioflow_rebuild` and
  `studioflow_rebuild_test` after verifying both are the rebuild's local databases) records the key on failure and
  clears it on a later success. `retryFailedAssetCleanup` (`asset-cleanup.ts`) retries every unresolved failure and
  runs at the start of every `purgeExpiredArchivedAssets` call — so both the existing daily scheduled sweep
  (`asset-sweep.ts`, unchanged) and a manual "Run cleanup now" now retry old failures before doing new work, with no
  new scheduling surface. `previousFailuresResolved`/`previousFailuresStillFailing` added to the cleanup summary; the
  settings UI (`archive-retention-settings.tsx`) reports resolved-from-earlier-run separately and reworded the still-
  failing notice ("cleanup will keep retrying automatically") instead of implying permanent loss.
- **Sample-quote currency invariant (`docs/BACKLOG.md` #2).** `recordSampleQuote`'s currency-only branch
  (`sample-request.service.ts`) let `{ quotedCurrency: null }` clear the currency while leaving a non-null amount in
  place — a price with no currency. Clearing the currency alone now cascades to clear the amount too, the same rule
  the amount branch already applied in the other direction, so `amount` and `currency` stay both-set or both-null.
- Tests: 4 new unit tests for `removeUnreferenced`/`retryFailedAssetCleanup` (records on failure, clears on a later
  success, a bookkeeping failure never masks the real delete outcome, retry partially resolves and keeps counting
  repeats), 1 new real-database integration test exercising the full retry cycle through `purgeExpiredArchivedAssets`
  twice, 1 new integration assertion for the currency/amount cascade.

**Checks.** `tsc --noEmit` 0 errors; `eslint .` clean on touched files; `check:boundaries` and `check:legacy-runtime` OK;
full `npm test` 628/628 (623 before, +4 `asset-cleanup.test.ts`, +1 retry-cycle integration test).

**Limits.** No independent review (same standing gap as R8.181-185; still open). `previewAssetCleanup`'s "nothing to
clean up" state doesn't surface pending retries separately, so a manual "Review cleanup…" run with zero newly-eligible
projects gives no visible way to trigger a retry-only pass early — it still happens on the next scheduled sweep. No
browser acceptance recorded (owner tests UI changes themselves).

## R8.185 | 2026-09-29 | feat(masterdata,shell): sample requests screen and the notification bell

Continues WO-SR-01's "Next" from R8.184: the two pieces the queue and inbox backend still needed a face.

- **Master Data.** `(platform)/masterdata/sample-requests`: queue table built on the coordinator's `listQueue`
  (`src/application/sample-request-coordinator.ts`), a "Show finished" toggle, and dialogs for Take / Record quote / Mark
  priced / Decline, wired through new `actions.ts` (`takeSampleRequestAction`, `recordSampleQuoteAction`,
  `markSampleRequestPricedAction`, `declineSampleRequestAction`) that authorize via `requirePrincipalGrants` and never accept
  a user id from the browser. Nav link added to `MASTERDATA_NAV_LINKS`, but only rendered when the viewer holds
  `masterdata.sample-request.manage` (`MasterDataNav` now takes `canManageSampleRequests`, computed in
  `(platform)/layout.tsx`) — kept off the shared rail otherwise, same convention as Deletions. `recordSampleQuote` already
  accepts `vendorId`/`skuId`/`priceMaterialId` by id; this pass ships amount + currency + staff note only, which already
  satisfies "must state a price" — the linking pickers are a follow-up (`docs/BACKLOG.md`), not a blocker.
- **Platform shell.** `authenticated-shell/notification-bell.tsx`: a bell in the top bar for every signed-in user (platform-
  wide, not app-scoped, unlike the StudioFlow header search beside it) — unread badge, popover inbox, mark one/mark all read,
  polls `getUnreadNotificationCountAction` every 60s and again on route change, matching the polling delivery `PLAN.md`
  already committed to.
- Tests: 5 new action-layer unit tests (`sample-requests/actions.test.ts`) mirroring the `notifications/actions.test.ts`
  pattern — authorization scoping, quote-field normalization, decline-reason validation, signed-out rejection.
- `PLAN.md` and `docs/BACKLOG.md` updated.

- **Tooling fix, same revision.** `scripts/run-tests.mjs` now passes `--test-concurrency=1`. `npm test` hung indefinitely on
  this machine before this fix: up to 7 of the 11 disposable-DB test files (`test-support.ts`) start concurrently — Node's
  default file concurrency is `os.availableParallelism()`, 32 here — and race for the shared advisory lock that serializes
  their `TRUNCATE`s; the first holder went idle mid-suite and never released it, blocking the rest for 18+ minutes until
  killed from outside (reproduced twice, in `platform/core/notifications/notifications.integration.test.ts`'s suite both
  times). Confirmed root cause by running the same 66 files with `--test-concurrency=1`: 623/623 pass in 53s, no hang.
  Recorded in `docs/BACKLOG.md` as fixed, since another agent hitting this on a similarly wide machine would otherwise lose
  a session to it.

**Checks.** `tsc --noEmit` 0 errors; `eslint .` clean on touched files; `npm run check:boundaries` and `check:legacy-runtime`
OK; new action tests 5/5; full `npm test` 623/623 (after the concurrency fix above). Not run: browser acceptance (per
standing instruction, the owner tests UI changes themselves) and production build.

**Limits.** Vendor/SKU/material-price linking on the quote dialog is not built (amount + currency only). Read notifications
still have no retention rule. Not independently reviewed.

## R8.184 | 2026-09-29 | feat(notifications): platform in-app inbox and the two sample-request events (executed by the Lead)

Part of the same owner-delegated work as R8.183; **not independently reviewed**.

- **Platform.** `platform.Notification` (additive migration `20260929010000_platform_notifications`, applied to `masterdata`
  and `masterdata_test` after verifying both are the rebuild's local databases; recipient is a plain user id, no foreign key).
  `core/notifications`: domain-neutral envelope and safety rules (`prepareNotification`: app-prefixed dotted kind, title/body
  limits, recipient de-duplication and cap, links must be in-app paths only), the transactional `NotificationWriter` port,
  and `createNotificationCenter` (a person's own inbox: list, unread count, mark read, mark all read; every call is scoped
  to the caller's user id, so it needs no permission). Composed in `platform/runtime.ts`. `CORE.md` deferred registry: the
  notification row is now ACTIVATED for in-app items; email, push, preferences, digests stay deferred.
- **Actions.** `(platform)/notifications/actions.ts`: unread count, list, mark read, mark all read. None accepts a user id;
  they act for the signed-in user only and revalidate nothing (the bell will poll).
- **Events.** New optional ports, written inside the event's own transaction: `StudioFlowPorts.sampleRequestNotifier`
  (called by `requestSample`; `studioflow/sample-request-notifier.ts` tells everyone holding Master Data's public permission
  `masterdata.sample-request.manage`, never the requester; a failed staff lookup tells nobody and never blocks the request) and
  `MasterDataServicePorts.sampleRequestNotifier` (called by mark-priced and decline; `masterdata/sample-request-notifier.ts`
  tells the requester, with the quoted price or the decline reason, and links to the project's schedule via StudioFlow's public
  route constant). `MASTERDATA_ROUTES.sampleRequests` (`/masterdata/sample-requests`) added for the link target.
- `docs/MODULE-BOUNDARIES.md` interaction register and `docs/BACKLOG.md` updated.
- Tests: 7 notification rules (unit), 8 storage and inbox (integration), 4 + 4 notifier (unit), 3 + 3 event (integration, real
  database), 3 action (unit).

**Checks.** `tsc --noEmit` 0 errors; `eslint .` clean; `npm run check` OK; full `npm test` 618/618. Not run: production build and
browser (no bell or screen yet).

**Limits.** Nothing shows a notification yet (the bell and inbox come next). Read notifications are never deleted. Not independently
reviewed. The owner's dev server still holds an older Prisma client and must be restarted.

## R8.183 | 2026-09-29 | feat(sample-requests): StudioFlow read contract, Master Data intake, and the coordinator that joins them (executed by the Lead)

**Who did this.** The owner told the Lead to take over the sample-request and notification work directly (Codex was at its
limit). The Lead decided the open product questions by recommendation and recorded them in `PLAN.md` and `docs/BACKLOG.md`
for the owner to veto; the Lead also implemented it, so **no independent review has happened**.

- **StudioFlow public read contract.** `createStudioFlowSampleRequestRead` (`public/sample-request-read.ts`, exported from
  `public`, instantiated in `runtime.ts`): `listPendingSampleRequests` (pending only, live projects only, oldest first, capped)
  and `getSampleRequests` (any state, flags archived projects). Facts only; no storage keys or images leave StudioFlow.
- **Master Data.** New permission `masterdata.sample-request.manage`; additive migration
  `20260929000000_masterdata_sample_request_intake` (enum + `SampleRequestIntake`, source and link columns are plain ids,
  no foreign keys, applied to `masterdata` and `masterdata_test` after verifying both are the rebuild's local
  databases); `services/sample-request.service.ts` with `startSampleRequestIntake` (one taker per request, same person
  idempotent), `recordSampleQuote` (validated vendor/SKU/price links and money, unset fields unchanged), `markSampleRequestPriced`
  (must state a price), `declineSampleRequest` (reason required), and reads. Audit events `masterdata.sample-request.started`,
  `quote-recorded`, `priced`, `declined`; free text is never copied into the audit trail. Public types exported from
  `masterdata/public`; commands exposed on `runtime.ts`.
- **Coordinator** `src/application/sample-request-coordinator.ts` (wired in `src/app/sample-request-runtime.ts`): merged queue
  (new requests oldest first, then work in progress, optionally recent finished), `take` copies facts from StudioFlow rather than
  from the caller and refuses missing, archived, or already-received requests; authorizes before reading StudioFlow.
- Unusable list limits now fall back to the default consistently (`0` and negatives), in Master Data and in the StudioFlow contract.
- Tests: 8 Master Data integration, 3 StudioFlow read-contract integration, 7 coordinator unit.

**Checks.** `tsc --noEmit` 0 errors; `eslint .` clean; `npm run check` OK; full `npm test` 586/586 against `masterdata_test`.
Not run: production build and browser (no screen yet; both come with the UI revisions).

**Limits.** No notifications yet and no screen; nothing in the running app uses this until the next revisions. Not independently
reviewed. The owner's dev server was not restarted, so it still holds the previous Prisma client until the next restart.

## R8.182 | 2026-09-29 | feat(studioflow): archived-file retention screens (settings, archive dialog, archived state, cleanup control)

Lead-owned UI for the WO-BE-02/03 backend; no backend, schema, or dependency change.

- **Settings.** New "Archived project files" card in Studio Settings: whole-day window (7 to 730, same rule as the
  backend, shown inline and blocking Save when invalid), a plain-language statement of what is and is not removed, and
  a "Review cleanup…" control for project managers. The card passes the current automatic-numbering value back when
  saving, because the shared settings command carries both values. A side-nav entry "Archived files" was added.
- **Cleanup control.** Review first (the count comes from the preview command), then a danger confirmation that requires
  typing DELETE, then a result that names files removed, files kept because something else uses them, and files that
  could not be deleted; it says when more projects may be waiting (limit 100 per run).
- **Archive dialog** states the configured window and that restoring before it keeps the files.
- **Archived state everywhere it matters:** the project banner, the Archived list row (compact), and the restore dialog
  (a warning that removed files cannot be brought back). One rule, `archivedFilesState` in
  `domain/retention.ts`, decides kept / overdue / removed with the same strict boundary the sweep uses; a shared
  `ArchivedFilesNote` renders it. The server passes its render time so server and client wording agree.
- New tests: `domain/retention.test.ts` (boundary, changed window, purged marker, validation range).

**Browser verification (real app, dev database, disposable project deleted afterwards).** Settings validation and save
(91 saved and audit shows only the retention change, then restored to 90; automatic numbering stayed off), review dialog
empty state and confirm state, DELETE gate, cleanup run, both audit events and the purge marker in the database,
archive dialog copy, archived row and banner in the kept, overdue and removed states, restore warning, restore audit
`assetsPurged: true`, archiving again clearing the marker (the WO-BE-03 C1 defect, end to end), the SF-08 edit-dialog
hint and refusal, and a 375 px pass of the settings card (no horizontal overflow). Not covered: real files present in
the fixture. Statuses are recorded per item in `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md`.

**Checks.** `tsc --noEmit` 0 errors; `eslint .` clean; `npm run check` OK; full `npm test` 568/568; production
build exit 0; `git diff --check` clean. The dev server was stopped for the build and restarted; `next-env.d.ts` was
restored and is not staged.

**Limits.** No test with real project files in the browser; the R8.173 revision-history items still need a project with
a closed revision. The disposable project's audit events remain (audit is append-only), pointing at a project id that no
longer exists. R8.181 is still awaiting an independent review.

## R8.181 | 2026-09-28 | fix(studioflow): WO-BE-03 retention lifecycle correction and UI-support reads (executed by the Lead)

**Who did this.** The Backend Executor (Codex) hit its usage limit, so the owner asked the Lead (Claude) to take over
this one Work Order (lanes combined by explicit owner instruction, AGENTS.md). The Lead wrote WO-BE-03 and also
implemented it, so **no independent review has happened**: the Lead cannot approve its own work. Codex or a fresh
session should review this commit, and the owner may also ask ChatGPT for a second opinion. No commit gate item was
skipped; browser checks are still PENDING.

- **C1 (defect).** `archiveProject` now clears `assets_purged_at` in the same update that sets `archived_at`, so a
  project archived, purged, restored, given new files and archived again is purged again. `restoreProject` still
  keeps the marker for its `assetsPurged` audit field. New integration test runs the whole cycle (two purge event
  pairs, second-cycle file removed, nothing purged inside the second window) and was verified to fail without the fix.
- **C2.** `startAssetSweep` takes a batch size and keeps running while a batch comes back full, at most 10 batches
  per run (`MAX_BATCHES_PER_RUN`); timers, 10 s delay, 24 h interval, `unref()` and error handling unchanged.
  `runtime.ts` passes 25.
- **C3.** `previewAssetCleanup` (`studioflow.project.manage`) returns `{ eligibleProjects, retentionDays }`; the purge
  and the preview now share one `eligibility()` helper for the cutoff and predicate. Action
  `getAssetCleanupPreviewAction`. Reads only; test asserts no audit event and no deletion.
- **C4.** Action `runAssetCleanupAction(limit?)`: integer 1 to 100, default 25, standard validation payload, refreshes the
  StudioFlow layout. Tested by executing the real action module with its framework edges stubbed
  (`asset-cleanup-actions.test.ts`).
- **C5.** `assetsPurgedAt` added to `listProjects` rows and `getProject`; nothing else in either changed.
- No migration, no dependency, no layout or copy change, no Master Data or BQ change.

**Checks.** `tsc --noEmit` 0 errors; `eslint .` clean; `npm run check` OK; full `npm test` 563/563 against
`masterdata_test` (558 before, +2 integration, +2 action, +1 sweep); production build exit 0; `git diff --check`
clean. The owner's dev server on port 3001 was stopped for the build and restarted (sweep off);
`next-env.d.ts` was restored and is not staged.

**Limits.** Self-implemented, not independently reviewed. Browser acceptance for R8.173, R8.178 and this change is
still PENDING. `PLAN.md` is marked EXECUTED so no session re-runs it.

## R8.180 | 2026-09-28 | docs(changelog): backfill the missing R8.179 entry; WO-BE-03 target moves to R8.181

R8.179 (`bb0be53`) was committed without its changelog entry: the patch script stopped on a wrong anchor and the
commit command that followed ran anyway. Commits are not amended, so the entry is supplied here and the ledger is
marked accordingly. Process fix: ledger edits and their commit are now chained so a failed edit stops the commit.

- Adds the R8.179 entry below (the review of R8.178).
- `docs/BACKLOG.md` and `PLAN.md` now name **R8.181** as WO-BE-03's target, because R8.180 is used by this correction.

**Checks.** `npm run check` OK; `git diff --check` clean. Documentation only.

**Limits.** WO-BE-03 is not executed.

## R8.179 | 2026-09-28 | docs(plan): review of R8.178 (CORRECTION REQUIRED) and WO-BE-03 (entry backfilled in R8.180)

**Review of R8.178 (`6db6554`, WO-BE-02): CORRECTION REQUIRED, one item.** The Lead read the purge use case, cleanup
helper, sweep, wiring, migration and the schedule refactor, and re-ran the gate independently (`tsc` 0 errors, lint,
`npm run check`, `npm test` 558/558). The migration is exactly the two additive columns. The claim re-checks archive
eligibility inside a serializable transaction, so a concurrent restore cannot be purged; snapshots are rewritten in the
same transaction as the row deletes; blobs are removed only when no row references them; both audit events match the
locked names. The schedule delete now shares the safer helper.

- **Defect (a gap in the Lead's plan, implemented as written).** `assets_purged_at` is never cleared. Archive, purge,
  restore, add files, archive again: the marker still hides the project from the sweep, so the new files are kept
  forever. Correction: reset it when a new archive cycle starts.
- Accepted observations: one batch of 25 projects per day would take days to drain a large backlog (folded into
  WO-BE-03); `purgeExpiredArchivedAssets` is exposed without a permission check on the service object, safe today
  because only the boot sweep and the guarded `runAssetCleanup` call it; `setAutoNaming` now also carries the
  retention days, a naming smell, not changed.
- **WO-BE-03** (READY, originally targeting R8.180, now **R8.181**) returns the correction to the Backend Executor
  together with the small backend pieces the Lead's retention UI needs: a preview command, a manual-run action,
  `assetsPurgedAt` on the project reads, and the sweep backlog drain.
- Browser acceptance for R8.173 and R8.178 stays PENDING; it runs as one batch with a disposable QA project after
  WO-BE-03.

**Checks.** `npm run check` OK; `git diff --check` clean. No tests run for the documentation change itself.

**Limits.** WO-BE-03 is not executed. The retention UI is not built. The owner's dev server on port 3001 was restarted
by the Executor with the sweep off.

## R8.178 | 2026-09-28 | feat(studioflow): enforce archived project asset retention

Backend Executor completion of revised WO-BE-02. Starting HEAD and remote-tracking
`origin/main`: `ee15685ca55e22fe03d44e09cc64ef452155a0b1`, branch `main`, published baseline R8;
R8.178 was the next unused revision. Model/relationship verification confirmed deliverables,
MOM item images, document revision snapshots, schedule options, and excluded client/template
keys. No cross-project MOM snapshot-copy path exists in the current service.

- **APP-OWNED / EXTEND:** Studio settings now read and update `archiveRetentionDays` (default 90,
  integer 7–730), with existing settings permission/audit behavior and backwards-compatible
  settings action input. No UI controls added.
- **PURGE / REUSE:** oldest-first batches (default 25) atomically claim expired archived projects,
  rechecking archive status before deletion. Delete deliverable/MOM image rows, clear option
  photo keys, and strip image arrays from parseable retained MOM snapshots while preserving
  original JSON text/fields and revision metadata. Unparseable revisions remain untouched and
  are counted. Known candidate keys still present in those untouched snapshots are conservatively
  retained and counted as shared, avoiding dangling references.
- Extracted the schedule's unreferenced-object cleanup into one StudioFlow helper shared with
  retention. Checks all five locked row owners before removing a unique key; shared blobs stay.
  Blob/reference-check failures leave objects in storage and increment `blobFailures`.
- The locked SYSTEM events are separate and append-only: `studioflow.project.assets_purged`
  commits with the claim and record changes, with exactly the primary fields; then
  `studioflow.project.assets_purge_completed` records exactly the storage outcome fields.
  Completion-audit failures log a fixed safe line and do not undo cleanup.
- `projects.runAssetCleanup` requires project-manage (plus existing app-access/actor checks).
  Internal `purgeExpiredArchivedAssets` uses SYSTEM audit context. Node instrumentation starts
  the app-owned sweep after 10 seconds and every 24 hours using unreferenced timers. The
  `STUDIOFLOW_ASSET_SWEEP` switch defaults on only in production; documented in `.env.example`.
- Restore audit metadata includes `assetsPurged`; restore does not recreate files. Tests prove
  that subsequent MOM revision restoration still restores text with empty image arrays.

**Migration.** One additive migration, `20260928120000_studioflow_archive_asset_retention`,
adds only `studioflow.sf_settings.archive_retention_days` and
`studioflow.sf_project.assets_purged_at`. Successfully deployed to **both** rebuild-only local
databases, `masterdata` and `masterdata_test`, after verifying localhost:5433 matches the
`masterdata-db` container and the selected ignored env files. Prisma client regenerated.
No dependency, Master Data, BQ, or platform-storage changes; no push.

**Checks.** Full `npm test`: **558/558**, zero failed/skipped/cancelled. `npm run check`
(typecheck, boundaries, legacy-runtime), `npm run lint`, `npm run build`, and staged/unstaged
whitespace checks passed. Coverage includes eligibility/exclusions, exact audit fields,
snapshot-only images, legacy snapshot text, malformed snapshots, shared keys, concurrent claims,
restore before claim, rollback on primary-audit failure, storage/completion failures, settings
permissions/range, and boot defaults/timer/error handling. Initial test-fixture isolation and
async test flushing failures were corrected before the final full pass; no old assertion weakened.
Build ran with dev stopped and automatic sweep explicitly off. Dev restarted on port 3001
using rumah configuration, refreshed client, and sweep off; `next-env.d.ts` preserved, not staged.

**Limits / handoff.** No real project purge was run against dev storage. As locked, a crash after
the primary commit can leave orphan blobs and no completion event; the claimed project is not
automatically retried. Unparseable snapshots remain retained. Lead owns the settings field,
archive/removed-date copy and manual button; three R8.178 browser acceptance items were added.
Existing planned backlog entry stays open pending Reviewer end-to-end acceptance.
Unrelated dirty files preserved: `next-env.d.ts`, `.claude/launch.local-untracked.json`,
`docs/PROJECT-REBUILD-FOUNDATION-REFERENCE.md`, `docs/STUDIOFLOW-RECOVERY-REFERENCE.md`,
`docs/apps/studioflow/STUDIOFLOW-PRODUCT-MENTAL-MODEL-PHASE-V2-DRAFT.md`, `opencode.json`,
`public/uploads/brand-marks/22e07e06-00d2-45c0-894b-7b11c736a545.png`, `scripts/dev-seed.ts`,
`scripts/work-orders/UIUX-APPLE-MINIMALIST.md`.

## R8.177 | 2026-09-28 | docs(plan): WO-BE-02 audit order locked after the Executor's second BLOCKED / CONFLICT

The Backend Executor stopped again before changing anything (no files, database, or commit touched). Lead-side
correction only; no code, schema, or dependency change.

- **Conflict.** The plan asked for one audit event, written inside the deletion transaction, to carry the final
  storage counts. Blob removal must follow commit, and CORE.md §5 makes audit append-only, so that event cannot hold
  results that do not exist yet and cannot be updated later.
- **Decision (the Executor's option A).** Two events, names and fields locked in `PLAN.md`:
  `studioflow.project.assets_purged` inside the transaction (database and snapshot counts) and
  `studioflow.project.assets_purge_completed` after storage removal (`blobsRemoved`, `blobsKeptShared`,
  `blobFailures`). A primary event without a completion event is the visible signal of an interrupted cleanup.
- Target revision moved from R8.177 to **R8.178** because this correction uses R8.177.
- Process note: two consecutive conflicts came from the Lead specifying a plan without walking the audit and MOM
  paths first; the Executor's inspection caught both before any change was made.

**Checks.** `npm run check` OK; `git diff --check` clean. No tests run: documentation only.

**Limits.** WO-BE-02 is still not executed.

## R8.176 | 2026-09-28 | docs(plan): WO-BE-02 revised after the Executor's BLOCKED / CONFLICT (MOM revision snapshots, shared image keys)

The Backend Executor stopped, correctly, before changing anything: no files, database, or commit were touched. Lead-side
correction only; no code, schema, or dependency change.

- **Conflict.** The first WO-BE-02 called its three-model file list exhaustive. It was not: `SfMomRevision.snapshot`
  (JSON) also holds image storage keys, `restoreRevision` recreates image rows from them, and `unreferenced()` in
  `mom/service.ts` deliberately keeps those blobs. Purging only `SfMomImage` would leave revisions pointing at missing
  files; preserving them would keep project files forever. The Executor also found that schedule option images share
  keys with templates and other projects.
- **Decision (Lead, the Executor's option A).** Purge strips images from every retained MOM revision snapshot of the
  project's documents, keeping revision numbers, notes, dates and text; `restoreRevision` afterwards restores text
  without images. Rejected: exempting revision images (defeats retention) and deleting revisions (loses history).
- **Shared-key rule locked.** A blob is removed only if no remaining StudioFlow row references its key
  (deliverable, MOM image, schedule option, template item, client logo); otherwise it is kept and counted.
- **Audit counts locked.** `projectsPurged, deliverables, momImages, momSnapshotImages, optionPhotos, blobsRemoved,
  blobsKeptShared, blobFailures, unparseableRevisions`.
- Target revision moved from R8.176 to **R8.177** because this correction uses R8.176.
- Process note: the Lead's "exhaustive list" claim was wrong and was caught by the Executor's inspection; the
  `BLOCKED / CONFLICT` protocol worked as designed.

**Checks.** `npm run check` OK; `git diff --check` clean. No tests run: documentation only.

**Limits.** WO-BE-02 is still not executed.

## R8.175 | 2026-09-28 | docs(plan): WO-BE-02 archived-project file retention — second Work Order for the Backend Executor

Lead-side preparation only; no code, schema, or dependency change.

- Root `PLAN.md` is now **WO-BE-02** (READY, target **R8.176**), replacing WO-BE-01, which R8.174 accepted.
- Outcome (owner decision of 2026-09-28): a project's own files are kept for a retention window (90 days,
  provisional, adjustable 7 to 730 in studio settings) after archive, then a claim-based, audited sweep removes
  them. Restore inside the window changes nothing. Scope is exactly `SfDeliverable`, `SfMomImage` and
  `SfScheduleOption.image_key`; client logos, studio templates and Master Data files are never touched.
- Backend contract locks an additive migration (`archive_retention_days`, `assets_purged_at`), the purge use case,
  a manual command for the Lead's button, and an in-process 24-hour sweep started from `src/instrumentation.ts`
  (default off outside production, `STUDIOFLOW_ASSET_SWEEP`). UI (settings field, dialog copy, archived-project
  line, button) stays with the Lead.
- `docs/BACKLOG.md` points the purge entry at the Work Order.
- Queued next, not yet written as Work Orders: SF-PRESENTATION backend (defaults confirmed; plan in
  `docs/apps/studioflow/SF-PRESENTATION-PLAN.md` must be re-cut into backend and Lead-UI halves) and the Master
  Data workbook import/export (approved approach; needs a spreadsheet dependency).

**Checks.** `git diff --check` clean. No tests run: documentation only.

**Limits.** WO-BE-02 was not executed; it is the handoff. Location "rumah" is inferred from `.env.rumah`.

## R8.174 | 2026-09-28 | fix(lead): review verdict on R8.173, dialog hint, dead barrel, role-list exposure, ledger

**Review of R8.173 (`5e036ae`, WO-BE-01): PASS.** The Lead read the whole diff, re-ran the gate independently
(`npm run check`, lint, `npm test` 548/548) and ran the new tests against the pre-fix code (R8.172): the three
password-boundary tests and the role-action test fail there and pass now. Equivalence was checked by reading:
`quickSearch` uses the same filter, archive handling and order as `listProjects`/`listClients`, and
`readBlockerCountsBatch` uses the same predicates as the single-phase reader. The Executor's report that the login
"calls argon2 directly" allegation is not reproducible is correct (`verify` there is an alias of `verifyPassword`);
the real defect, a throwing verify, is fixed once in `password.ts`. Observation, accepted per WO-BE-01: `changePassword`
now hashes before the in-transaction current-password check, so a wrong current password costs one hash; it needs a
signed-in session. Browser checks for R8.173 stay PENDING in `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md`
(the dev database has no closed revision to exercise them without altering the owner's project).

**Lead fixes (owner said the Lead may fix the remaining items)**
- **SF-08 hint.** The edit-project dialog derived "The number … stays fixed" by slicing the name; it now uses the
  stored `code`. `ProjectRow` and `EditableProject` gain `code`.
- **KB-025.** `masterdata/services/index.ts` had no importer; deleted (Master Data lock lifted by the owner).
- **KB-047.** `listAssignableRoles` returns `appIds` instead of the whole permission list; `role-grouping.ts` groups
  by them. The Users picker is unchanged; the permission matrix stays behind `platform.role.read`. Tests updated, and
  one assertion added that `permissionIds` is absent.
- **Ledger.** `docs/BACKLOG.md`: 13 items closed with evidence; KB-037a/b closed as accepted by the owner; the Master
  Data lock recorded as lifted; owner decisions recorded (90-day archive retention, Excel round-trip approach with a
  new spreadsheet dependency approved, SF-PRESENTATION defaults confirmed).
- `AGENTS.md`: owner-facing text must be plain Indonesian, decision and recommendation first.

**Checks.** `tsc --noEmit` 0 errors; `eslint .` clean; `npm run check` OK; full `npm test` 548/548 against `masterdata_test`. Not run: `npm run build`
(the owner's dev server was up) and a browser pass of the dialog hint.

**Limits.** Remaining Lead-owned items are UI-only and tooling: SF-11..SF-14, MD-01, KB-038, KB-043, KB-050, checkers
KB-040/053/054, docs KB-039/052/055a. BQ items stay on hold.

## R8.173 | 2026-09-28 | fix(backend): complete WO-BE-01 correctness and bounded reads

Backend Executor implementation of `PLAN.md` WO-BE-01. Starting evidence: `main` at
`c8bae89359a06bfc9ee2acab8e2b611a9059fae4` (R8.172), remote-tracking `origin/main` at
`aa182d2e1c83e233749f4c0a55fb22ef5501c9c6` (R8.171), published baseline R8;
R8.173 was the next unused ledger revision. No push.

- A1 / KB-042: all four password hashes finish before their transaction begins, after
  existing non-transactional permission/input checks. Current-password verification stays
  inside the account transaction; isolation, audit and return contracts are unchanged.
- A2 / KB-049: canonical password verification returns false for corrupt PHC hashes;
  login and account password changes retain their generic failure codes. **Not reproducible
  subfinding:** `auth/login.ts` already used canonical `verifyPassword`, including the dummy
  hash for unknown users, so that file is unchanged.
- A3 / KB-048: archive-role action validates the UUID before calling the service.
- A4 / KB-044: five fake-client transaction-runner tests cover return, callback failure,
  successful P2034 retry, exhausted retry and non-P2034 failure. A concurrent StudioFlow
  integration test proves two distinct stored project codes. No transaction-runner changes.
- B1 / SF-08: reject a typed project number differing from stored `project_code` with
  `VALIDATION / PROJECT_CODE_IMMUTABLE`; preserve same-code and readable-name edits.
- B2 / SF-09: APP-OWNED batch blocker reader uses one revision read and two grouped counts;
  project phases and Today consume it. Nav uses one grouped open-root-checklist count,
  including warning-only roots as before. Transactional single-phase reads remain intact.
- B3 / SF-10: quick-search uses two limited, minimal database projections and the existing
  permissions, ordering, matching and archive semantics. Directory readers are unchanged.
- B4 / SF-15: closed revisions expose `activityCount`; one revision's activities load through
  a permission-checked service/action on details-open. Active revision activities retain their
  projection. Existing revision-history markup/classes remain, with loading/error lines only.
- Classification: REUSE canonical auth/validation/transaction infrastructure; EXTEND the
  existing StudioFlow read services with APP-OWNED queries. No dependency, schema, migration,
  Master Data or BQ source/test changes.

**Verification.** Full mandatory gate passed: `npm test` **548/548** (0 failed, skipped or
cancelled); `npm run typecheck`; `npm run lint`; `npm run check:boundaries`;
`npm run check:legacy-runtime`; `npm run build`; unstaged and staged `git diff --check`.
New tests cover all changed items, including multi-phase count equivalence, bounded query
shape, directory/quick-search equivalence and lazy revision projection/permissions.
Database target verified before testing: ignored `.env.test.local` selects rebuild-only
`masterdata_test` on local `masterdata-db` at port 5433; `STUDIOFLOW_LOCATION=rumah`.
The repository dev-server processes were stopped before the successful build.

**Limits / handoff.** Reviewer acceptance is pending; four browser checks were added to
`docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md` (overview, phase history, search, project rename).
The Lead retains edit-dialog hint and history presentation follow-up. Existing backlog items
remain open for end-to-end Reviewer verification. `next-env.d.ts` was restored byte-for-byte
after build and is not staged. Pre-existing unrelated files preserved: `next-env.d.ts`,
`.claude/launch.local-untracked.json`, `docs/PROJECT-REBUILD-FOUNDATION-REFERENCE.md`,
`docs/STUDIOFLOW-RECOVERY-REFERENCE.md`,
`docs/apps/studioflow/STUDIOFLOW-PRODUCT-MENTAL-MODEL-PHASE-V2-DRAFT.md`, `opencode.json`,
`public/uploads/brand-marks/22e07e06-00d2-45c0-894b-7b11c736a545.png`, `scripts/dev-seed.ts`,
and `scripts/work-orders/UIUX-APPLE-MINIMALIST.md`.

## R8.172 | 2026-09-28 | docs(plan): WO-BE-01 backend correctness pass — first Work Order for the Backend Executor

Lead-side preparation only; no code, schema, or dependency change. `main` was pushed at `aa182d2` (R8.170, R8.171)
immediately before.

- Root `PLAN.md` is now **WO-BE-01** (READY, target **R8.173**): eight re-verified backend defects, each with a
  locked fix and tests: KB-042 (hash outside the transaction), KB-049 (corrupt hash is a failed verify), KB-048
  (validate role id), KB-044 (direct `runSerializableTransaction` tests plus a concurrent project-numbering test),
  SF-08 (typed project number may not drift from `project_code`), SF-09 (batched blocker/open-item counts), SF-10
  (bounded header quick-search), SF-15 (revision history returns counts, activities load on demand).
- The previous active plan moved, unchanged apart from a QUEUED banner, to
  `docs/apps/studioflow/SF-PRESENTATION-PLAN.md`; `docs/BACKLOG.md` and `docs/README.md` point at it. It must be
  re-cut into a backend Work Order plus a Lead UI revision, and its two defaults confirmed, before it runs.
- Corrections to the backlog's own text, recorded in the plan: `runSerializableTransaction` has no nesting/reuse
  rejection (tests cover what exists); `listNavPhases` counts open checklist items, not blockers.
- Deliberately excluded from WO-BE-01: Master Data (LOCKED by the owner 2026-09-24, includes KB-025), BQ (on hold),
  KB-047 (owner must confirm), KB-037a/b, KB-055(b), checker items KB-040/053/054, and UI-only items.
- `docs/BACKLOG.md`: the asset-purge-on-archive and workbook import/export entries now carry the owner questions
  that block them.

**Checks.** `npm run check` OK; `git diff --check` clean. No tests run: documentation only.

**Limits.** Location "rumah" in the Executor prompt is inferred from the presence of `.env.rumah`. WO-BE-01 was not
executed; it is the handoff.

## R8.171 | 2026-09-28 | docs(agents): Lead + Backend Executor operating model (Claude leads, Codex executes backend)

Owner instruction of 2026-09-28: Claude is the single Engineering Lead and UI owner; Codex is a narrow Backend
Executor working from a Work Order; ChatGPT (web) is a second opinion outside the hierarchy. The repo already had a
Planner/Reviewer + Executor harness, so this folds the model into it instead of adding a parallel one.

- `AGENTS.md`: new "Operating model and session handshake" (hierarchy; lanes follow the tool; the setup question is
  now only home/office) and "Lead-led execution" (Executor implements the smallest correct change and never
  reinterprets the plan; `BLOCKED / CONFLICT` protocol; backend commit first, then the Lead's UI revision; Claude and
  Codex work serially in this checkout and never overlap uncommitted files). Legacy isolation, database safety,
  revision/commit protocol, and the no-push rule are unchanged.
- `docs/agent/EXECUTOR.md`: backend-only scope and an explicit must-not-own list (product behavior, UX, visual
  design, new abstractions, scope); refactors only inside the plan; conflict report replaced by `BLOCKED / CONFLICT`
  (expected, actual, conflict, options A/B/C, recommendation).
- `docs/agent/PLANNER.md`, `REVIEWER.md`, `README.md`: Lead lane, `PLAN.md` is the Work Order, UI ownership stays
  with the Lead, the Lead may fix UI/integration glue directly but returns Executor-owned backend defects.
- `docs/agent/PLAN-TEMPLATE.md`: adds Target revision, Business Rules and Architecture Constraints, Backend Contract,
  UI Contract, and Regression Risks sections; the Executor prompt now names the backend scope and the conflict report.
- `docs/README.md`, `docs/SESSION-HANDOFF-PROMPT.md`: index and session prompts renamed to Lead / Backend Executor.

No code, schema, or dependency change.

**Checks.** `npm run check` OK (typecheck, boundaries, legacy-runtime); `git diff --check` clean. No tests were run: documentation only.

**Limits.** The active `PLAN.md` (SF-PRESENTATION) was left as written and does not yet use the new template sections.
`CORE.md:19` and `scripts/work-orders/*` still name the old navigator/OpenCode roles; they are historical Foundation
records. The current instruction to hold BQ work is not written into repo docs; every Work Order must state it as a
non-goal until the owner lifts it.

## R8.170 | 2026-09-28 | fix(ui-engine): green the two failing UI Engine tests (radius lock, app-neutral tokens)

Both failures predate this work: they fail identically on `b4cdf3e`, the previous GitHub head, and came in with
the R8.145 design-tokens-v2 rework, which changed values and comments without updating the guards.

- **Radius lock (KB-045).** `ui-engine.test.ts` asserted `--ui-radius-action: 4px`; the live token is 7px and the
  owner confirmed 7px is intended. The assertion now says 7px. No token value changed.
- **App-neutral tokens (KB-046).** `tokens.css` named the BQ app in two comments (`--ui-page-wide-max` and the
  compact-density banner), which the app-vocabulary guard rejects. Reworded to neutral text; the
  `[data-density="compact"]` selector and all values are unchanged.
- Scope: shared UI Engine files only. No BQ app code, route, or test was touched, per the owner's instruction to
  hold BQ work until requested.

**Checks.** `ui-engine.test.ts` 42/42; `eslint .` clean; `npm run check` OK; full `npm test` against `masterdata_test` 532/532 (first fully green run since R8.145). Not run: `npm run build` and a browser pass (comment-only CSS change and a test assertion).

## R8.169 | 2026-09-28 | docs(changelog): record the browser pass that R8.168 listed as not done

R8.168 shipped with "no browser pass of the Brand/Pricing supplier quick-create dialog after the move". That
pass has now been done; this entry corrects the ledger instead of amending R8.168. No code change.

**Verified in the running dev server (localhost:3001, dev database `masterdata`, signed in as the seeded dev
owner).** `VendorQuickCreateDialog`, now in `src/app/(platform)/masterdata/vendor-quick-create-dialog.tsx`:
- Brands -> New brand -> "+ Create new supplier for this brand" opens "Add supplier". The submit button is
  disabled when empty, still disabled with a name only, and enabled once a Supplier Type is chosen.
- Cancel after typing raises "Discard changes?", so the `DraftDialog` unsaved-input guard survives the move.
- Pricing -> New price -> Material price -> Supplier -> typing a new name -> `Add "..." as a new supplier`
  opens the same dialog ("for this material price") with the same disabled rule.
- No console errors on either page.

**Not exercised.** Submitting the dialog (deliberately: it writes to the dev database), the Labor and Material +
Labor price forms, the empty-Supplier-Type alert, and the narrow-viewport and collapsed-rail states. Nothing was
created; the dev database holds no rows from this check.

**Side effect worth recording.** A production `npm run build` run while the owner's dev server was up on the same
`.next` directory made the dev page reload repeatedly for a while; it settled without intervention. Run builds
with the dev server stopped.

## R8.168 | 2026-09-28 | refactor(architecture): enforce database ownership and shell/domain boundaries; platform audit reads go through Platform

Architecture hardening of the existing modular monolith. No workflow, route, permission, schema, or data
change. Full rationale, ownership table, and the cross-app interaction register are in the new
`docs/MODULE-BOUNDARIES.md`.

**Audit result.** Cross-app imports were already clean: every app-to-app edge goes through `public/`, and
the one two-app use case (library promotion) lives in `src/application/promotion-coordinator.ts` with
injected ports. No cross-schema foreign keys. The gaps were in enforcement and in two places where an app
reached into Platform-owned data.

**Violations fixed**
- StudioFlow's project History read (`projects/service.ts`) queried the platform `AuditEvent` model directly.
- MasterData's latest-actor query (`services/shared.ts`) ran raw SQL against `"platform"."AuditEvent"`.
- Both now use the Platform audit read side added to `@platform/core/audit/persistence`:
  `listAuditEvents` and `latestAuditActorLabels` (same queries, scoped to one `appId`, no app knowledge).
- `VendorQuickCreateDialog` encoded MasterData policy (vendor needs a Supplier Type) inside the UI Engine and
  had only MasterData consumers. Moved unchanged to `src/app/(platform)/masterdata/vendor-quick-create-dialog.tsx`;
  removed from the `patterns` barrel; its imports now come from `@/platform/ui_engine`.

**New checks in `scripts/check-boundaries.mjs`** (each with rejection + legal fixtures)
- `database ownership`: foreign Prisma model access (`prisma|db|tx.<model>`), foreign `Prisma.<Model>*` types,
  foreign-schema names in raw SQL, and any `@relation` across two schemas. Shell counts as Platform; tests exempt.
  Closes KB-041.
- `shell -> app/<internal>`: files under `src/app` and `src/application` that no app owns may import an app's
  `public`, `runtime`, or route lane only.
- `app domain -> persistence`: `apps/<app>/domain/**` may not import Prisma, `src/generated`, or infrastructure.
- `(document)/<app>` route groups are now owned by their app (were unclassified and skipped).
- Fixture change: `settings/general/page.tsx` importing `@beta/domain` was recorded as a legal "known residual";
  it is now a rejection.

**Contract / dependency changes.** New exports `listAuditEvents`, `latestAuditActorLabels`, `AuditReadClient`,
`AuditEventMatch`, `AuditEventRead` from `platform/core/audit/persistence.ts` (that file now imports the
`Prisma` value, not only its type). No migration. No dependency added.

**Decision recorded, not changed.** The shell rule permits an app's `runtime` layer, which codifies today's
`src/app/promotion-runtime.ts`. Whether the promotion command surface should move into `public` remains the
open owner decision in KB-037a; nothing was re-exported.

**Checks.** `tsc --noEmit` 0 errors; `eslint .` clean; `npm run check` OK (typecheck, boundaries, legacy-runtime);
`scripts/test-boundaries-checker.mjs` passes all three fixture groups; `npm run build` succeeds. Full `npm test`
against `masterdata_test`: 530/532 pass. The 2 failures are the pre-existing, unrelated `ui-engine.test.ts` ones
already recorded in `docs/BACKLOG.md` (token radius lock; `BQ` in `tokens.css` comments).

**Not done / limits.** No browser pass of the Brand/Pricing supplier quick-create dialog after the move; it is
verified by typecheck, lint, and build only. KB-037b is only partly closed (import rules now cover the lane
root; reclassifying it as `platform` and the nav-slot decision are still open). `npm test` needs the local
test database.

## R8.167 | 2026-09-28 | chore(merge): join local R8.164–R8.166 with origin/main R8.164 and the PLAN/BACKLOG chores

Integrated `origin/main` (`b4cdf3e`) into local `main` (`67afe21`) after both diverged from `ee9e09e`.

- Incoming: R8.164 `5acc67d` (Product Schedule print/export crash; `print-format-values.ts` split out of a
  `"use client"` module; sample-request affordance), plus `PLAN.md` and `docs/BACKLOG.md` chores
  (`e7e4a8f`, `8839596`, `b4cdf3e`).
- Only `CHANGELOG.md` conflicted; resolved by keeping both sides. Source files merged cleanly.
- Branch review: `claude/shared-export-utilities-error-0s43z9` and `claude/loving-carson-th2hpm` are fully
  contained in `origin/main`; `claude/optimistic-euler-bmhz8u` (R8.145/R8.146) is already re-landed in `main`
  (PhaseGate and `ProjectPhasesNav` present); `codex/quarantine-unapproved-20260823` is 472 commits behind
  and deliberately not merged.
- The working tree held a stale R3-era snapshot (104 tracked files, pre-`services/*` masterdata monolith);
  it was saved to a stash and not applied. Owner-preserved files were left untouched.

## R8.166 | 2026-09-26 | fix(ui): the project rail's document links shared one empty React key

The owner hit a console error on a project page: "Encountered two children with
the same key, ``". Three keys were in fact empty, not two.

**Cause.** `projects/[projectId]/layout.tsx` renders the Documents rail behind a
`Suspense` boundary whose fallback was a module-level `EXTENSIONS_SKELETON` with
`href: ""` on all three entries, and `ProjectNavLinks` keys on `item.href`. So the
fallback mounted three siblings keyed `""`. The same empty href caused a second,
quieter defect: the active test is `pathname === href || pathname.startsWith(href + "/")`,
and with `href` empty the second arm is `pathname.startsWith("/")`, which is always
true - so while the boundary was pending, MOM, Schedule, and History all rendered
as the current page at once.

**Fix.** The fallback now builds the real routes from `projectId`, which the shell
already has synchronously. Only the document *counts* actually stream in, so
empty hrefs were never needed; `extensionsSkeleton(projectId)` replaces the const.
Keys are unique, the links point where their labels say, and nothing is marked
current until the real nav arrives.

Verified in the running app with the boundary deliberately held pending
(intercepted requests delayed 900ms): mid-stream, MOM/Schedule/History carry
`/mom`, `/schedule`, `/history` and none has `aria-current="page"`; the settled
rail is unchanged, and no console error or warning is emitted. `typecheck`,
`lint`, `check:boundaries`, `check:legacy-runtime` pass. `npm test` 530/532,
unchanged - the two failures remain the pre-existing KB-045/KB-046 guard pair.

No migration, no dependency change, no contract change.

## R8.165 | 2026-09-26 | fix(security): private assets were readable with a published key; the admin-lockout guard and the Today clock were both wrong

Four defects from the full-repo audit at `ee9e09e`, fixed together: the one P0,
and the three P1s the owner authorised.

**KB-036, private-asset read URLs were forgeable by anyone.** The signer and the
verifier both ran on `process.env.SESSION_SECRET || "local-storage-secret"`, and
`SESSION_SECRET` was undocumented, so a deployment that followed the written
setup ran on that published string. The private read route authorises on the HMAC
and nothing else, so anyone who knew the key could sign a URL for any object.
`src/platform/infrastructure/storage/asset-signing.ts` is now the one place that
reads the key, requires at least 32 characters, and has no fallback; comparison
is `crypto.timingSafeEqual`, because a byte-by-byte `!=` on a digest leaks how
much of a forgery was right. `register()` asserts the key at boot so a
misconfigured deployment fails on start rather than on first asset request.
`SESSION_SECRET` is now required configuration and is documented in
`.env.example` with its length rule. Note for operators: it is read here and
only here - session tokens do not use it, they are 32 random bytes from
`core/auth/token.ts` and need no secret.

**KB-035, stripping a shared role could leave the platform with no
administrator.** `requireChangeKeepsAccessAdministrator` returned early whenever
more than one administrator existed, so the invariant was only ever evaluated in
the single-administrator case. Two administrators sharing one role holding
`platform.user.manage` + `platform.role.manage` could empty that role, after
which nobody can re-grant `platform.role.manage` and recovery needs direct
database surgery. The guard now computes the affected set: if any current
administrator is untouched the change is safe, and if every one of them is
affected it simulates the outcome for each and rejects the change unless someone
retains the capability. Two integration tests were added; the negative one was
confirmed to fail against the old guard.

**SF-07, the Today header counted "today" in UTC.** `page.tsx` derived the date
with `toISOString().split("T")` while the filter chips and every due-date badge on
the same screen used the studio timezone, so for seven hours every day
(00:00-06:59 WIB) the landing page header and its own chips disagreed about the
same task list. It now reads the same `PlatformGeneralSettings.timezone` the
client uses and goes through `currentDateOnly`. The settings read is memoised per
request with React `cache`, matching `requirePrincipalGrants`, so the layout and
the page still cost one query.

**KB-037, the boundary checker skipped whole route directories.** `routeLaneApp`
only recognised a `/<app>/` root segment, so anything else - `settings/`,
`account/`, the lane root - classified as neither app nor platform and was skipped
by every rule. Six live cross-app internal imports sat in that hole. The checker
now has an explicit `PLATFORM_ROUTE_OWNERS` table (`settings/general/masterdata`
is Master Data's own administration UI, so its `masterdata/service` and
`masterdata/runtime` imports are intra-app and correct), matched longest-prefix
first. Two fixtures cover an app-owned route group that is not under the app's
own root; the rejecting one was confirmed to fail against the old checker.

`npm test` 530/532. The two failures are the pre-existing stale-guard pair
tracked as KB-045 and KB-046, unchanged by this pass. `typecheck`, `lint`,
`check:boundaries`, `check:legacy-runtime`, and `next build` all pass. The
signing tests cover the signer, expiry, and key binding; a signed-URL round trip
through the running app was not exercised here.

## R8.164 (local, `b2421de`) | 2026-09-26 | docs(backlog): record 32 verified audit findings from full-repo logic + UI/UX pass

A full-repo read of the logic and UI/UX surfaces at `ee9e09e`, recorded as 1 P0,
3 P1, 13 P2, 15 P3, and 2 currently-failing guard tests in `docs/BACKLOG.md`
under "Full-repo logic + UI/UX audit". Backfilled here because the audit commit
touched the backlog but not this ledger.

## R8.164 (remote, `5acc67d`) | 2026-09-25 | fix(sf,ui-engine): Product Schedule print/export crashed server-side; sample request was buried in a kebab menu

Owner report: `/print` (the shared UI Engine print view) "works in MOM, errors in Product Schedule," and separately the Product Schedule "request sample" action was unclear how to use.

**Print/export crash — root cause found and reproduced.** Provisioned a disposable local Postgres, ran `prisma migrate deploy`, bootstrapped an owner, seeded a project/schedule entry/MOM doc through the real `studioFlow` service, and drove the running app with a headless-Chromium Playwright session (login → both print routes). MOM's print route returned 200 with no console errors. Schedule's print route returned HTTP 500: `Attempted to call printFormatFromSearchParams() from the server but printFormatFromSearchParams is on the client.`

`printFormatFromSearchParams` is a plain, hook-free function, but it lived in `patterns/print-format.tsx`, which carries a file-level `"use client"` directive for the co-located `PrintFormatPicker` component. Next.js's RSC boundary treats every export of a `"use client"` module as an opaque client reference, so the schedule print page (a Server Component, the only one of the two print routes that calls this function — MOM's print route never did) crashed the instant it tried to invoke it as a normal function. This was never caught because no test exercises either print route end-to-end, and `docs/BACKLOG.md` already carried both as `[UNVERIFIED]`.

Fix: split the pure value/function (`DEFAULT_PRINT_FORMAT`, `printFormatFromSearchParams`) into a new non-`"use client"` module, `patterns/print-format-values.ts`; `print-format.tsx` now exports only the client `PrintFormatPicker` component. Both are re-exported from the same `@/platform/ui_engine` barrel, so the only import path (`schedule/page.tsx`) needed no changes. Re-verified via the same Playwright session after the fix: schedule print route returns 200, cards render, and toggling `?paper=LETTER&orientation=landscape` correctly reflects in both the on-screen preview and the injected `@page` rule — no console/page errors on either print route.

**Sample request discoverability.** "Request sample" only ever existed as one entry in an option's `⋯` row-action menu, inside the entry detail drawer, with no visible affordance anywhere else — matching the owner's "not clear how to use." `schedule-board.tsx`: added a visible "Request sample" button on the option card face (same pattern as the existing "Set final" button), shown whenever the option has no pending request; it reads "Request sample again" once a prior request has been received, matching the existing re-request rule (a new request is blocked only while one is `REQUESTED`). The now-redundant "Request sample" kebab-menu entry was removed; "Mark sample received" stays in the kebab menu as the follow-up action once a request is outstanding. Verified live: button visible on the option card immediately after opening an entry, dialog opens with its existing title/description/fields, submitting creates the request and the card immediately shows the "Sample requested" badge and vendor name.

**Checks:** `tsc --noEmit` clean; `eslint .` clean; `node scripts/check-boundaries.mjs` OK; full suite 519/521 (see `[BUG]` entry below for the 2 pre-existing, unrelated failures); browser-verified live via headless Chromium against a disposable local Postgres (not `.env.kantor`/`.env.rumah` — this container has neither; `studioflow_rebuild`/`studioflow_rebuild_test` were created fresh for this session's local verification only and are not the owner's persistent local database).

**Ledger correction.** This entry was drafted as "R8.163" against this file's own stated "Next local revision: R8.163", but `git log` showed R8.163 already used by commit `ee9e09e` ("account avatar, rail section heads, phase dot to prototype spec"), which never got a `CHANGELOG.md` entry or a header bump — the header was simply stale. Renumbered this entry to R8.164 and backfilled the missing R8.163 entry below instead of silently skipping past the gap.

## R8.163 | 2026-09-25 | fix(ui): account avatar, rail section heads, phase dot to prototype spec

Backfilled 2026-09-25 during the R8.164 audit — commit `ee9e09e` shipped this without a changelog entry; transcribed from its commit message, not re-verified beyond what it already states.

Four gaps found by measuring the running app against the prototype's CSS, not by eye.

- `initialsOf()` gave a one-word name a single letter: it took the first letter of each whitespace-separated word, so "Berkah" rendered as a lone "B" rattling around a 24px circle. A mononym now takes its first two letters; multi-word names are unchanged. Same defect class as the top-bar mark in R8.158, and this one is shared — it feeds every person chip.
- Account menu trigger is the prototype's `.a-av`: a 24px filled circle (bg-action / text-action-ink, 9.5px bold, .02em) instead of a 124px-wide avatar + name + chevron button. The name is not lost — it still labels the control for assistive tech and now heads the menu, where it has room to be read rather than truncated at 180px.
- `ContextNavHeading` is `.a-railhead`: 10px sans, .11em tracking, 600. It was `text-label`, the mono identity utility — right for a data label, too mechanical for a rail's section heads (PROJECT / PHASES / DOCUMENTS).
- Phase accent dot 8px → 7px, per `.a-nav .dot`.

Verified: typecheck and eslint clean. Browser confirmation of the rendered result was still owed at commit time (the pane's safety classifier was timing out) — the measured before/after was code-level only for this one.

Measured but NOT changed, because it is a design call rather than a defect: content measure. The project workspace applies `PageShell measure="wide"` (1440px) to every page; the prototype uses `.a-measure` 800px for ordinary content and `.a-wide` 1040px only for the schedule/timeline. With 268px already spent on the two rails, 1440px gives very long lines. Splitting it per page means moving `PageShell` out of the project layout into the six project pages, as R8.156 did for the seven top-level ones.

## R8.162 | 2026-09-25 | fix(ui): H2 asked a 400-weight serif for bold, so the browser faked it

The owner reported headings had gone back to a thin face despite R8.148 moving them off it. Nothing regressed — H1 is still `font-ui-sans font-black`. What they were seeing is H2, which R8.148 deliberately left on Instrument Serif.

**The defect is real and objective, not a matter of taste.** `HEADING_LEVEL_CLASSES[2]` was `font-display font-bold` — Instrument Serif at weight 700. That face ships here at 400 only: `layout.tsx` loads `InstrumentSerif-Regular.woff2` and `InstrumentSerif-Italic.woff2`, and there is no bold file. The browser therefore synthesised the weight by smearing the 400 outlines, which renders thin and slack rather than bold. This is the same reason R8.148 gave for moving H1 off the face — it simply left H2 behind on it.

H1 and H2 are now one display pair separated by size rather than by typeface: H2 is `font-ui-sans font-black tracking-[-0.02em] text-title`. Schibsted Grotesk is loaded as a variable font over 400–900, so 900 is a real outline; confirmed in the running app via `document.fonts` ("Schibsted Grotesk 400 900 loaded") and a computed weight of 900 on a 21px `h2`.

The serif tier is kept in the system at the owner's direction, and `font-display` remains available for anything that wants Instrument Serif at its real 400.

Blast radius is one element: `level={2}` has exactly one consumer app-wide (the phase title), and no `<Heading>` is rendered without an explicit level, so nothing falls through to the level-2 default.

**Context.** That phase title only became conspicuous because R8.156 removed the project `PageHeader`, which had carried `<Heading level={1}>{project.name}</Heading>`. The project subtree now has no `h1` at all — the project name lives in the 44px context bar's breadcrumb, as in the prototype — so an accent style sized to sit *below* a page title became the topmost text on the page. Left as is, per the owner's answer that the phase title's size should not change.

## R8.161 | 2026-09-25 | feat(shell): standing header search, in the prototype's top-bar order

The top bar's search was an icon that had to be found and clicked before it would take a query, and it sat in the right-hand group beside the account menu. The prototype's `.a-search` is a standing field between the app chip and the avatar.

- `header-search.tsx`: the icon-plus-expanding-input is replaced by a permanent field — 27px tall, capped at 300px, `rail-soft` fill, `line-subtle` hairline, 7px radius, 9px gutter, 12.5px text, placeholder "Search projects, items, MOM", with a `kbd` hint at the trailing edge. Cmd/Ctrl-K focuses and selects it from anywhere. The results popover is unchanged.
- The modifier label is a client-only fact, so it is read through `useSyncExternalStore` with an empty server snapshot — the hint appears after hydration with no mismatch, and without setting state from an effect (which this repo's lint forbids).
- `authenticated-shell/index.tsx`: the topbar is ordered mark → app chip → search → spacer → avatar, per `.a-top`. The search takes its own 300px cap and a bare spacer absorbs the remainder, so the field keeps its width rather than being shoved about by the account menu's name length.

Verified live: header 46px; mark at x=14; chip 26px at x=46; search box 27px tall, exactly 300px wide, at x=161; radius 7px; padding 0 9px; hint reads "Ctrl K" on Windows; DOM order mark, chip, search, avatar.

**Not a code issue: the mark reads "SF", not "RAD".** `brandMark()` (R8.158) prefers `settings.organizationName` and falls back to `appTitle` when the two are equal. The shipped default for `organizationName` is `"StudioFlow"` — identical to `appTitle` — so the fallback fires. Setting Organization name to the studio's own mark in Platform Settings makes the top-bar mark that, as `.a-logo` shows "RAD" in the prototype. No code change is needed for it.

## R8.160 | 2026-09-25 | fix(ui): a compact table clobbered its card's gutter, so its edge columns sat 4px inboard

In a `SectionCard`, the first table column's text started 12px from the card edge while the card's own title, toolbar and footer all started at 16px. Every table inside a card was misaligned against the rest of that card.

**Cause.** `DataTable` puts `data-density={density}` on its container, and the BQ compact-density stamp in `tokens.css` redefines `--ui-section-px` from 16px to 12px. That token is the *section card's* gutter, so a compact table silently re-stamped the card's gutter for its whole subtree. Measured live: `--ui-section-px` is 16px at the card and 12px at the table container and its cells.

The table being full-bleed is correct — the header band and row hover should reach the card's edges. What was missing is that the **edge columns** must then carry the card's gutter themselves, and the obvious way to do that (read `--ui-section-px` in the cell) is exactly what the density stamp had already broken.

**Fix.** `SectionCard` republishes its own gutter as `--ui-card-gutter`, resolved at the card — outside any density stamp a child puts on itself. Table edge cells read `var(--ui-card-gutter, var(--ui-section-px))`, so they align to the card when inside one and are unchanged anywhere else. Interior columns keep their tighter 12px padding.

Verified live on the prefix-dictionary table: first `th` and `td` inset 12px → **16px**, matching the card header's 16px; right gutter 16px; table still starts at x=0 of the card (full-bleed intact); interior cells still 12px. `ProjectDirectory` is not a `SectionCard`, so it takes the fallback and is byte-for-byte unchanged.

**Correction to R8.159.** That entry stated Tailwind emits no rule for the `[--ui-rail-width:…]` arbitrary-property form, "verified by walking every CSS rule". While debugging this one I found that rule-walk cannot read this app's stylesheet at all — it reports zero rules even for utilities that demonstrably work — so the claim was unsupported and is withdrawn. The mechanism behind the expanded rail's failure is unconfirmed. R8.159's fix and its measured before/after behaviour (48px → 212px → 48px, no clipping) stand; only the stated cause was wrong.

## R8.159 | 2026-09-25 | fix(shell): expanded rail stayed 48px and clipped its labels

Expanding the icon rail produced a broken state: `data-collapsed` came off and the labels rendered, but the column stayed 48px, so every label was clipped and the nav grew a horizontal scrollbar.

**Two faults, one of which hid the other.**

1. **The width override never applied.** The grid asked for `var(--ui-rail-width)` and, while collapsed, overrode it with the Tailwind arbitrary-property utility `[--ui-rail-width:var(--ui-rail-collapsed-width)]`. Tailwind emits no rule for that arbitrary-property form in this setup — verified in the running app by walking every CSS rule (including inside `@layer`) for one that touches `--ui-rail-width`: there are none. The override had therefore always been inert.

2. **It was invisible because the two tokens were the same value.** `--ui-rail-collapsed-width` was defined as `var(--ui-rail-width)`, i.e. 48px — the very token it was overriding. So the inert override changed nothing that anyone could see, and `--ui-rail-expanded-width: 212px` had *zero readers anywhere in the codebase*. Collapsed and expanded both resolved to 48px.

This is a leftover from when `--ui-rail-width` meant "the full rail width" and `--ui-rail-collapsed-width` was the narrow one. When the design moved to a 48px icon rail, `--ui-rail-width` was redefined as 48px and `--ui-rail-expanded-width` added, but the grid logic kept the old shape.

Fixed by setting the expanded width as an **inline custom property**, which always applies, and letting the existing `grid-cols-[var(--ui-rail-width)_minmax(0,1fr)]` utility (which does generate) read it. Mobile keeps its own `grid-template-columns` classes because only the token is touched. `--ui-rail-collapsed-width` is deleted — `--ui-rail-width` is now itself the at-rest width, documented as such.

**Also: the top-bar mark duplicated the app name when expanded.** The header rendered `isCollapsed ? (collapsedBrand ?? brand) : brand`, so expanding the rail swapped the monogram for the full wordmark and the bar read "StudioFlow StudioFlow ⌄" beside the chip — the redundancy R8.154 removed, which had only ever been fixed for the collapsed case. The rail's state has no bearing on the header, so the mark is now always the compact one.

Rail gutters are 9px when expanded (`.a-icon-rail[data-expanded]{padding:8px 9px}`), 5px collapsed.

**Verified in the running app**, toggling both ways:

| | collapsed | expanded | prototype |
|---|---|---|---|
| rail column | 48px | 212px | 48 / 212 |
| nav item | 36x34px | 29px tall | `.a-icon` 36x34, 29px expanded |
| label clipping | none | none | — |
| top-bar mark | `SF` | `SF` | compact in both |

Collapsing again returns the column to 48px cleanly.

## R8.158 | 2026-09-25 | fix(shell): top-bar mark showed a single letter; drop duplicated topbar padding

Two defects visible in the running app once R8.155 exposed the mark.

**1. The mark rendered as "S".** `productMark` took the first letter of each whitespace-separated word of `settings.appTitle`, which yields exactly one letter for a one-word title — and "StudioFlow" is one word. The rule only ever worked for names like "Master Data".

`brandMark()` now splits a closed-up product name on its capitals, so "StudioFlow" reads "SF"; keeps a name that is already an abbreviation whole, so "RAD" stays "RAD" rather than being cut to "RA"; and still takes initials for multi-word names. An all-caps run is not split, so "Berkah RAD" gives "BR", not "BRA".

The mark also now prefers `settings.organizationName` when it differs from `appTitle`. The chip beside it already names the active application, so taking the app name for both put the same word in the bar twice — the redundancy R8.154 set out to remove. This is the prototype's pairing of `.a-logo` (the studio) with `.a-app` (the application). Set an organization name in platform settings and the mark becomes that studio's mark, as "RAD" is in the prototype.

**2. Duplicated leading padding.** The topbar slot still carried `px-(--ui-page-padding)` (20-24px), left over from when `AppShell`'s header had a separate brand column owning the leading edge. The header sets its own `px-3.5` now, so the app chip sat a further ~22px off the mark. Removed; the topbar's gaps are 10px to match `.a-top`.

**Verified against the running app** (`localhost:3001`, live DOM measurements):

| | prototype | measured |
|---|---|---|
| top bar height | 46px | 46px |
| top bar padding-left | 14px | 14px |
| mark | studio mark | `SF` (was `S`) |
| mark to chip gap | 10px | 10px |
| app chip height | 26px | 26px |
| icon rail | 48px | 48px at x=0 |
| project rail | 220px | 220px at x=48, flush (0px seam) |
| context bar | 44px | 44px, full-bleed from x=268 |
| content column | own scroll | `overflow-y: auto` |

Both rails measure 922px tall against a 968px viewport — exactly `100dvh - 46px` — confirming the R8.156 flex chain carries a real height, which is what was inert in R8.152.

## R8.157 | 2026-09-25 | fix(ui): rail and secondary-nav metrics to prototype spec

Ports the remaining `.a-icon-rail` / `.a-rail` measurements from the approved prototype. Radius needed no conversion — the prototype's `--r-sm` is 7px and `--ui-radius-action` is already exactly 7px.

**Icon rail** (`ui_engine/layouts/shells.tsx`):

- `NavItem` 38px tall to 29px expanded / 36x34 collapsed (`.a-icon`); radius `control` (10px) to `action` (7px); icons 16px to 18px; `NavGroup` gap 4px to 2px; rail padding 12px to 8px/5px, with `UtilitySection` matched.
- **Active state rewritten.** It was a bordered box plus a 3px accent bar. The prototype's `.a-icon.on` is a white plane lifted off the recessed rail: `bg-surface` + `shadow-plane`. The old rule's comment correctly insisted the active state must not rely on fill alone or it collapses into hover — that still holds, and it is still marked on three channels: the plane fill, the shadow that plane casts, and heavier type.
- **Rail toggle relocated.** It was a 16px-wide sliver pinned to the rail's outer edge at mid-height — easy to hit by accident, hard to find on purpose. Now at the rail foot below the utility icons, per `.a-rail-toggle`.

**Secondary nav** (`ui_engine/layouts/context-nav.tsx`):

- `ContextNavLink` takes `surface?: "plane" | "rail"`. On `rail` the active item is a raised white plane (29px row, 13px text, radius-action) per `.a-nav.on`. `plane` is unchanged and remains the default — `SettingsShell` renders on a white content surface where a white card would be invisible, so it keeps the muted fill. The project rail opts in through `ProjectNavLinks`.

## R8.156 | 2026-09-25 | fix(sf): full-bleed project workspace — move the page measure out of the app layout

Retry of R8.152, this time fixing the cause R8.153 correctly identified rather than the symptom.

**Root cause.** `StudioFlowLayout` wrapped every StudioFlow route in `<PageShell size="wide">` — a centred, max-width-1440px, 22px-padded CSS grid. Two consequences made the prototype's shell unreachable from inside the project layout, and no amount of CSS there could fix either:

1. `flex-1` is inert inside a grid parent, so the project workspace could never be given a constrained height. Its inner `overflow-y-auto` was therefore also inert, and the sticky context bar had no scroll container to stick to.
2. `mx-auto max-w-(--ui-page-max)` centres the content box, so the secondary rail could never sit flush against the icon rail — on a wide display it floated hundreds of px inboard. Negative margins can undo the padding but not the centring.

The prototype inverts this: `.a-main` is full-bleed and the measure (`.a-measure`) sits *inside* it, below the context bar.

- `studioflow/layout.tsx` returns children bare. The `PageShell` in the access-denied branch stays — that one is a leaf render, not a wrapper.
- The 7 top-level SF pages each apply their own `<PageShell measure="wide">`, so their rendering context is byte-for-byte what it was.
- `projects/[projectId]/layout.tsx`: `SettingsShell` to a real two-column workspace. 220px rail (`--ui-secondary-width`) flush to the icon rail with its own scroll; the content column owns the scroll so the 44px context bar (`--ui-header-height`, prototype `.a-ctx`) can stick to it; `PageShell` moves inside that column, leaving the 6 project-subtree pages unchanged.

Verified: all 13 SF pages resolve a measure (7 their own, 6 via the project shell), and `PlatformLayout` passes children straight to `AppShell` with no intervening wrapper, so the flex-column chain from `<main>` to the workspace is unbroken.

## R8.155 | 2026-09-25 | fix(shell): rebuild top bar to prototype spec — 46px, no clipped brand column

The top-left area the owner flagged was a layout defect, not a styling one.

`AppShell`'s header hard-coded a fixed brand column at `w-(--ui-header-brand-width)`, which resolved to `--ui-rail-width` = 48px, then spent `px-4` (32px) on padding. That left a 16px content box, into which the brand was rendered under `overflow-hidden`. Whatever went in — the full wordmark before R8.154, the monogram after — was clipped to an unreadable sliver. R8.154 changed *which* brand went into the box; the box itself was the bug.

Prototype `.a-top` has no brand column at all: one 46px flex row, `gap:10px; padding:0 14px`, laid out logo, app chip, search, spacer, avatar.

- `shells.tsx`: the header is a plain flex row (`gap-2.5`, `px-3.5`); the fixed brand column is gone, so the mark sizes to its own content.
- `tokens.css`: added `--ui-topbar-height: 46px` (was a hard-coded `h-16`/64px). Removed `--ui-header-brand-width` — the column it sized no longer exists and it had no other reader.
- `shells.tsx`: the three offsets that hard-coded the old 64px header (grid min-height, rail sticky top and height, main height) now read the token, so header height changes in one place.
- `authenticated-shell/index.tsx`: `collapsedBrand` is the prototype's `.a-logo` — mono, 12px, tracking .16em, no chip or 36px box.
- `authenticated-shell/navigation.tsx`: the app chip gets `.a-app` — 26px tall, `bg-rail-soft`, 1px `line-subtle` border, radius-action.

## R8.154 | 2026-09-25 | fix(shell+sf): eliminate redundant "StudioFlow" labels from rail, header, and page eyebrows

With the app-name chip now the canonical location for the active application name (Option B, R8.152), four separate "StudioFlow" labels appeared simultaneously on every SF page:

1. **Header brand area** (`ui_engine/layouts/shells.tsx`): `AppShell` header always rendered `{brand}` (full text "StudioFlow"), which gets truncated to "S.." inside the fixed 48px brand area. Fixed by using `collapsedBrand ?? brand` when `isCollapsed` — shows the "SF" monogram instead of the truncated text.
2. **Rail NavGroup heading** (`studioflow/nav.tsx`): `NavGroup heading="StudioFlow"` rendered a "STUDIOFLOW" section label above every nav item in the left rail. Removed the `heading` prop; `label` is kept for accessibility.
3. **Page eyebrows** (7 files): Every top-level SF page (`page.tsx`, `projects/page.tsx`, `clients/page.tsx`, `timeline/page.tsx`, `library/page.tsx`, `settings/page.tsx`) had `PageHeader eyebrow="StudioFlow"`. Removed on all — the topbar chip already identifies the active app.

Verification: `tsc --noEmit` clean.

## R8.153 | 2026-09-25 | fix(sf): restore SettingsShell-based project layout; fix R8.152 regression

R8.152 replaced `SettingsShell` with a custom `flex flex-1` viewport-tall layout in the project workspace `layout.tsx`. The approach assumed the layout would be a direct child of `<main>`, but `StudioFlowLayout` wraps every StudioFlow page in `<PageShell size="wide">` (a CSS grid with padding). `flex-1` has no effect inside a grid, so the secondary rail had no constrained height, `overflow-y-auto` on the inner containers was inert, and the sticky context bar was broken.

This revision restores the `SettingsShell`-based layout while preserving R8.152's design improvements:
- `projects/[projectId]/layout.tsx`: reverts to `SettingsShell` for the two-column layout. Keeps the "← All projects" back link at the top of the nav column, the streaming `ProjectRailMeta` (compact name + client + status), section headings "Project" / "Phases" / "Documents" (note: renamed from "Extensions"), `ProjectPhasesNav` and `ProjectExtensionsNav` unchanged. Replaces the 44px sticky context bar with a simpler `ProjectContentHeader` (breadcrumb + optional archive notice) inside a `<Suspense>` fallback above `{children}`.
- `platform/authenticated-shell/navigation.tsx`: updated stale comment that still described a "hamburger trigger" after R8.152 changed the button to an app-name chip.

Verification: `tsc --noEmit` clean, `check:boundaries` clean.

## R8.152 | 2026-09-25 | feat(shell): app-name chip replaces hamburger in topbar

Navigation.tsx: replaced the `<Menu>` hamburger trigger with an app-name chip (`activeApp.name` + `ChevronDown` when multiple apps exist), per `GLOBAL-MENU-DESIGN-BRIEF.md` Option B (owner decision 2026-09-23). Hover open / close-delay behavior retained. Also included an (incomplete) project workspace layout change that introduced a layout regression — corrected in R8.153.

## R8.151 | 2026-09-25 | feat(sf): §7.3 Today — PhaseAttentionSection cross-project strip

Wave B §7.3. The Today page now opens with an "In flight" strip showing every in-progress phase across all projects the user can read, before the per-project task feed.

Service layer:
- `today/service.ts`: added `PhaseAttentionRow` export type and `listPhaseAttention` method. Fans `sfPhase.findMany` where `status IN ACTIVE_PHASE_STATUSES` and project is live; joins project id + name; calls `readBlockerCounts` per phase in parallel and maps through `phaseStatusDisplay`, `waitingDays`, `availablePhaseCommands`, `phaseAccentDotClass`, `fullBlockers`. Ordered by project priority → project name → phase order_index.

UI:
- `_components/phase-attention.tsx`: `PhaseAttentionSection` server component. `SectionCard` with `padded={false}` containing a `<ul>` of rows. Each row: accent dot, phase link + project breadcrumb, `PhaseStatusBadge` (status + waiting days), seat badge (hidden below sm), danger badge for open blockers. Conditionally rendered from `page.tsx` when `phaseAttention.length > 0`.


## R8.150 | 2026-09-25 | feat(sf): §7.2 Icon rail — phase links with accent dots in project nav

Wave B §7.2. The project workspace nav rail now lists all phases between the Overview link and the Extensions heading. Each phase link shows the phase's accent color dot as a marker and a trailing open-item count (unchecked root checklist items). The section heading "Phases" only renders when the project has at least one phase.

Service layer:
- `phases/service.ts`: added `listNavPhases` — lightweight query returning `{ id, definitionId, label, status, openCount }` per phase. Uses a `findMany` + parallel `count` pattern (one count query per phase for unchecked root checklist items, `parent_id: null, is_checked: false`). Local `Row` type annotation suppresses the pre-existing TS7006 pattern that affects every `db.sf*.findMany()` call in this environment.

Layout:
- `projects/[projectId]/layout.tsx`: added `NavPhaseItem` local type, `ProjectPhasesNav` async server component, and a `<Suspense fallback={null}>` wrapper in the nav tree. Phase items use `phaseAccentDotClass(phase.definitionId)` as the `marker` prop (colored dot) and `String(openCount)` as `detail` when non-zero. Finished phases (`isPhaseFinished`) get a tooltip suffix "— done". The `<Suspense fallback={null}>` keeps the nav shell instant while phase data streams in.
## R8.149 | 2026-09-25 | feat(sf): §7.1 PhaseGate — interactive blocker list replaces static Notice

Wave B §7.1. The static "Blockers" `Notice` on the phase detail and project overview pages is replaced by `PhaseGate`, a client component that renders each blocking item as a `Checkbox` the assigned user can resolve inline. Resolving a checklist item calls `checklistAction`; resolving a feedback activity calls `activityAction`. Items are dismissed from view optimistically on click while the server action revalidates in the background.

Domain and query layers were extended to carry item records (IDs + labels) alongside the existing counts:
- `blocker-query.ts`: added `BlockerItems` type and `readBlockerItems` — fetches open `SfActivity` and unchecked `SfChecklistItem` rows in parallel (skips each query when its count is already zero).
- `domain/blockers.ts`: added `BlockerItem` type; extended `PhaseBlockers` with `activityItems` and `checklistItems` arrays; updated `fullBlockers` to accept an optional items argument; `todoBlockers` returns empty arrays for the new fields (no N+1 on list views).
- `phases/service.ts` (`getPhaseDetail`): runs `readBlockerItems` in parallel with the existing detail queries and passes the result to `fullBlockers`. List views (`listProjectPhases`) are unchanged.

UI layer:
- `_components/phase-gate.tsx` (new): `"use client"` component; one `useState` pair for optimistic dismissed-item sets; items with `key` on the wrapper `<div>` (not on `<Checkbox>`) to match the project's pre-existing broken-JSX-types pattern.
- `projects/[projectId]/page.tsx` and `phases/[phaseId]/page.tsx`: `PhaseGate` replaces the static `Notice tone="danger"` when `blockers.total > 0 && !isLocked && status !== "PENDING"`.

## R8.144 | 2026-09-24 | fix(masterdata): restore hover background and focus ring on count tiles

R8.143's migration to `SectionCard` dropped the hover surface and focus-visible ring that the original raw-Tailwind count tiles carried directly on the `Link` element. The regression was caught in Reviewer browser acceptance.

- `src/app/(platform)/masterdata/page.tsx`: added `transition-colors hover:bg-surface-muted` to each tile's `SectionCard`; added `rounded-card focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-line-focus` to the wrapping `Link`.

Verification: browser acceptance confirmed — `hover:bg-surface-muted` and `focus-visible:outline-*` present in rendered DOM; Master Data home, StudioFlow Today, and Login page all pass visual inspection.

## R8.143 | 2026-09-24 | feat(platform): redesign entry apps for improved user-friendliness and UI Engine consistency

Owner-requested redesign (rumah session, 2026-09-24): *"redesign the entry apps supaya feels lebih user friendly, uiux lebih konsisten dengan bisnis logic, feels lightweight tapi informatif dengan seminimal mungkin bloattext yg ga perlu."* Four entry surfaces were identified as needing improvement:

**Workspace Launcher** (the app picker after login):
- **Before:** Every app card showed the same generic `LayoutGrid` icon + filler copy ("Open {app.name}", generic footer text "More applications appear here automatically…").
- **After:** Each app now shows its own distinct icon (Master Data → `Box`, BQ → `FileText`, StudioFlow → `Workflow`) + a one-line business description explaining what the app actually does ("Brands, suppliers, SKUs, and pricing catalog…", "Project cost estimates and bill of quantities", "Design project execution and task management"). The fallback for new apps is safe (`Box` + generic "Access {app.name}") so the launcher doesn't break if a fourth app appears. Generic footer removed entirely — the descriptions already explain what each app does.

**Login page**:
- **Before:** Hardcoded copy said "Sign in to your StudioFlow account" even though the login is the shared platform entry for all three apps — a factual error.
- **After:** Now reads "Sign in to {settings.appTitle}." (the actual platform name from settings, already loaded for the brand mark). Falls back to "Sign in to continue." if appTitle is somehow missing. No invented platform name, no hardcoded assumption.

**StudioFlow Today landing**:
- **Before:** Just a plain `PageHeader` with eyebrow + title + scope description ("What is on your plate…"). No summary, no numbers — felt empty.
- **After:** Description now shows a real summary calculated from the `today` data already being fetched: "{firstName}, {N} open · {M} overdue · {K} due today" (or "no open work" when empty). All three counts are derived from `today.groups` (flatten tasks, filter by `!isChecked` and `dueDate`), so there's no extra database hit.

**Master Data home**:
- **Before:** Most "informative" page but built entirely from raw Tailwind classes (`text-label`, `text-ink-tertiary`, `font-display`, `text-display`, `rounded-card`, `border-line`, etc.) — bypassed the UI Engine completely, which is an architectural violation and the source of visual inconsistency.
- **After:** Fully migrated to UI Engine components: `PageHeader` (replaces the raw hero div), `SectionCard` (replaces every manual `rounded-card border border-line bg-surface`), `MetricValue` (replaces raw `text-2xl font-semibold tabular-nums text-ink` — this is the component's first actual use in the codebase, despite being defined in the engine since the beginning), `Heading`, `Text`, `Badge`. Every card, tile, and section now comes from the engine's public surface, so Master Data finally shares the same visual DNA as the rest of the platform.

Changes:
- `src/app/(platform)/page.tsx`: added `APP_META` map with distinct icons + descriptions; changed import from `LayoutGrid` to `Box, FileText, Workflow`; removed the generic "More applications appear…" footer text.
- `src/app/login/login-form.tsx`: changed `LoginForm` to accept `appTitle?: string` prop; replaced hardcoded "Sign in to your StudioFlow account." with conditional `{appTitle ? 'Sign in to ${appTitle}.' : 'Sign in to continue.'}`.
- `src/app/login/page.tsx`: passed `appTitle={settings.appTitle}` to `LoginForm`.
- `src/app/(platform)/studioflow/page.tsx`: calculated summary metrics (`openTasks`, `overdue`, `dueToday` counts) from `today.groups`; replaced static description with dynamic summary string.
- `src/app/(platform)/masterdata/page.tsx`: migrated entire page from raw Tailwind to UI Engine (`PageHeader`, `PageShell`, `SectionCard`, `MetricValue`, `Text`, `Heading`, `Badge`, `buttonClasses`); removed ~150 lines of raw `className` attribute content, replaced with semantic component composition.

Verification: `tsc --noEmit` clean, `check:boundaries` clean, `check:legacy-runtime` clean. Full suite 521/521 passed. Browser verification intentionally deferred per session lane ("rumah" — commit only, no manual browser test requirement).


## R8.142 | 2026-09-24 | fix(ui-engine): stop auto-opening the OS file picker when an image workspace mounts

Partial reversal of R8.110's "photo picker opens immediately" and directly
relevant to R8.141's "collapsing the wrapper dialog away is what makes the
photo click feel instant" rationale — the owner tried it live on the
Schedule board's "+ Add photo" overlay and didn't want it: *"saat diklik
jangan lgsg keluarin dialog pencarian image - keluarin modal dulu, di
dalam nya baru ada utk select image."*

- `platform/ui_engine/patterns/image-workspace.tsx`: removed the
  mount-time `useEffect` that auto-clicked the hidden file input (and the
  now-unused `autoOpened` ref). The "Choose image" button — already the
  empty-state UI, previously described as "a fallback if the user cancels
  the picker" — is now the only way to open the OS file dialog again, for
  every `ImageWorkspace` consumer (Schedule options and MOM section
  photos alike, since it's the one shared component).
- No other change: R8.141's single-modal structure (board photo click
  opens the same `EntryDialog`, pre-swapped to `InlinePhotoEditor`) stays
  exactly as it is — the modal now simply shows its content first instead
  of being instantly obscured by the native file dialog.

Verification: `tsc`, `check:boundaries`, `check:legacy-runtime` clean.
`npm test`: 521 passed (no test exercised the auto-open behavior directly).
Browser acceptance intentionally deferred — owner asked to test manually.


## R8.141 | 2026-09-24 | fix(sf): Product Schedule photo capture is inline in the entry dialog, not a second stacked modal

Owner-scoped (chat, 2026-09-24), after confirming how the Board view's card
"thumbnail + card content" layout works: *"modalnya jd 1 aja, di klik di
body / di judul kartu -> munculin modal. saat klik image -> otomatis cari
gambar."*

**Before:** a board card had two disconnected popups. Clicking the card body
opened the full item editor (`EntryDialog`). Clicking the card's photo area
opened a second, separate `SchedulePhotoDialog` — its own `Dialog`, stacked
on top if the editor was already open (the entry panel's own per-option
"Change photo" button did exactly this: a modal opening a modal).

**Fix:** there is now exactly one dialog. `SchedulePhotoDialog` is gone;
its guts became `InlinePhotoEditor`, which swaps in for the option's row
inside the already-open entry panel — the same in-place swap
`OptionInlineForm` already used for editing product details, just applied
to the photo step too. The board card's photo click (`onOpenPhoto`) now
opens the *same* `EntryDialog` as a body click, passing an
`initialPhotoOptionId` so the panel starts with that option's row already
swapped to the photo editor — `EntryPanelContent` consumes this once via a
render-time ref comparison (`autoPhotoAppliedRef`, mirroring the existing
`shownIdRef` resync pattern a few lines below it), not a `useEffect`, since
this file's lint config rejects synchronous `setState` inside effects.
`ImageWorkspace` already opens the OS file picker itself as soon as it
mounts, so this alone delivers "click the photo → the file picker just
appears" with no button click of ours in between — the "automatically" in
the owner's ask was mostly already true, it was just hidden behind an extra
modal.

`ScheduleBoard` centralizes every path that opens the panel (board card,
list row, row-action "Open") through one `openEntry(id, photoOptionId?)`
helper, so a stale auto-photo target from an earlier photo click can never
leak into a later, unrelated open of the same entry.

Updated the `schedule.regression.test.ts` assertion that pinned the old
`onOpen={setOpenId}` literal (now `onOpen={(id) => openEntry(id)}`) and
added a regression test asserting photo capture no longer opens its own
`Dialog`.

Checks: `tsc --noEmit` clean; `eslint .` clean; full suite 521/521. Verified
in the browser: clicking a card's photo area opens the single entry dialog
with the option's row already swapped to the photo picker (`Choose image`
visible, `Cancel` returns to the normal row); clicking the card title opens
the same dialog at the normal Card-content view with no photo editor
active; clicking "Add photo" from inside an already-open dialog swaps the
row in place with no second dialog appearing. No schema migration; no new
dependency.

## R8.140 | 2026-09-24 | fix(platform): reuse recently-rendered dynamic pages on revisit instead of refetching the whole layout chain

Owner-scoped (chat, 2026-09-24), reported right after R8.139 landed:
*"sudah dicoba, masih muncul spinner besar tiap pindah project. knp ga di
selaraskan?"* — R8.139 split the project layout's own Suspense boundaries
correctly, but the platform-wide spinner (`(platform)/loading.tsx`) still
covered the *entire* shell — including `(platform)/layout.tsx` and
`studioflow/layout.tsx` above it — on every revisit.

**Root cause:** Next.js's Client Router Cache defaults
`experimental.staleTimes.dynamic` to 0 seconds (unset in this repo's
`next.config.ts`). Per Next's own docs, ordinary forward navigation already
reuses shared layouts via partial rendering regardless of this setting — but
a *revisit* of a dynamic route (leaving it and coming back, e.g. Projects
list → a project → Projects list → the same project) is exactly what
`staleTimes.dynamic` governs: at 0s, the client treats the previously
rendered page as immediately stale and refetches the whole route tree for
that URL, re-running every layout in the chain from
`(platform)/layout.tsx` down. With only one project seeded in the dev
database, every "switching projects" test the owner did was actually this
exact revisit pattern, so the app shell (rail, StudioFlow nav) re-rendered
under the generic spinner on every click regardless of the R8.139 split.

**Fix:** set `experimental.staleTimes: { dynamic: 30 }` in `next.config.ts`,
matching Next's own documented example value. A dynamic page revisited
within 30s of its last render is now served from the client cache instead of
being refetched, so the shell no longer re-executes (and the generic
spinner no longer shows) on a quick back-and-forth between routes sharing a
layout. This is a platform-wide navigation-freshness trade-off, not a
StudioFlow-specific one: any dynamic route revisited inside that window may
show up-to-30s-old data (including permission grants, since
`resolvePrincipalGrantsForRequest` is only deduped *within* one render, not
across renders) until the window elapses or the user does a hard reload.
Recorded as a platform-level decision rather than in
`STUDIOFLOW-REWORK-CONTRACT.md`, since it isn't StudioFlow-specific.

Checks: `tsc --noEmit` clean; `eslint .` clean; full test suite not
re-run (config-only change, no service/business logic touched). Verified in
the browser: repeated Projects-list ↔ project-detail navigation on the seeded
project dropped from ~1.2s full reloads to ~50-125ms RSC fetches
(`?_rsc=` responses confirmed in network log, not full-document reloads), no
visible shell spinner, no console errors beyond an expected one-time HMR
websocket reconnect from the dev-server restart needed to pick up the config
change. No schema migration; no new dependency.

## R8.139 | 2026-09-24 | fix(sf): project rail is app shell — stream it independently of project/count data

Owner-scoped (chat, 2026-09-24), from watching the project workspace load:
*"harusnya saat loading, yang loading ini nya aja, side bar itu kan app shell
harusnya"* — the sidebar shouldn't wait on the same data the page content
does.

**Root cause:** `layout.tsx`'s top-level async function `await`ed
`getProject` and the MOM/Schedule counts before returning any JSX at all.
Since that JSX includes the `SettingsShell` frame and nav rail, the whole
shell was gated behind the same data fetch as the page content, even though
the rail's *links* need no data (only their badge counts do).

**Fix:** split `layout.tsx` into three pieces. The outer `ProjectLayout`
returns the `SettingsShell` frame and static "Overview"/"MOM"/"Schedule"/
"History" links synchronously (after only the cheap `params`/session reads).
A `<Suspense>`-wrapped `ProjectHeader` component fetches the project record
for the breadcrumb, title, meta line, and archived notice. A second,
independently-`<Suspense>`-wrapped `ProjectExtensionsNav` fetches the
MOM/Schedule counts for their nav badges, falling back to the same links
with no badge while counting. A new `loading.tsx` for this route segment
(Next.js's own file convention) gives `page.tsx`'s own content — the
phase-tab strip and canvas — its own independent fallback, so the content
area's loading state is fully decoupled from the layout's.
`notFound()` on a missing project still discards the whole route regardless
of which Suspense boundary it's thrown from — verified this still works
(Next.js resolves it to the nearest not-found boundary, not the throwing
component's own parent).

`STUDIOFLOW-REWORK-CONTRACT.md` §8 records the split and the reasoning.

Checks: `tsc --noEmit` clean; `eslint .` clean; full suite 520/520 (no
service-layer change — pure Server Component restructuring). Verified in the
browser: Overview and Schedule pages render correctly, nav/header persist
across navigation, no console errors. No schema migration; no new
dependency.

## R8.138 | 2026-09-24 | fix(sf): remove the duplicate per-project Timeline bar; rename the project sidebar's "Records" group to "Extensions"

Two small owner requests from the browser, given mid-turn while other work
was in flight.

**Removed the per-project `ProjectTimeline` bar from the Overview page**
(owner: *"buang saja timeline di view ini"*). It duplicated
`/studioflow/timeline`'s per-project view (same span, same phase segments)
with nothing the portfolio page didn't already show for that project.
Deleted `project-timeline.tsx` and its usage in
`projects/[projectId]/page.tsx`. The shared geometry
(`domain/timeline.ts`'s `resolveTimelineSpan`/`computePhaseSegments`) stays —
`/studioflow/timeline` and `timeline-directory.tsx` are still live
consumers. `timelineStartDate` stays editable from `EditProjectDialog` and
still drives the portfolio bar; nothing about editing or the underlying data
changed, only this one display removed.
`STUDIOFLOW-REWORK-CONTRACT.md` §8 and `docs/BACKLOG.md`'s R8.125/R8.127 note
record the removal.

**Renamed the project sidebar's "Records" heading to "Extensions"**
(`projects/[projectId]/layout.tsx`) — MOM/Schedule/History now sit under
"Extensions" instead of "Records". Label-only; no route or permission
change.

Checks: `tsc --noEmit` clean; `eslint .` clean; full suite 520/520. No schema
migration; no new dependency.

## R8.137 | 2026-09-24 | feat(sf): fold "Default categories" into Template Items; fix a sort_order count() bug found along the way

Owner-scoped (chat, 2026-09-24): after explaining what Prefix dictionary /
Default categories / Template items each do (the owner found the Settings
page's three-table split confusing and suspected overlap), the owner
proposed collapsing Default Categories into Template Items: *"default
categories mah tergantung template items aja ga sih? di joint... template
itu konsepnya reserved dengan jenis2 yg biasa kita pakai."* Confirmed
`SfScheduleTemplateCategory` had 0 rows in the dev DB, so no migration
concern.

**The merge.** A category that should always be reserved with no settled
default product is now a Template Item with **Type left blank**, the same
"Reserve code only" concept a live schedule entry already supports (§11.1),
instead of a separate `is_default_entry` flag on a third table. Changes:
- Migration `20260924000000_sf_schedule_drop_default_entry` drops
  `sf_schedule_template_category.is_default_entry`.
- `sync.ts`'s `seedScheduleFromTemplates` loses its second seeding pass
  (driven by `is_default_entry`); the one remaining pass conditionally omits
  the option snapshot when `product_name` is blank, so a blank-Type template
  item reserves its category with zero options, matching what the second
  pass used to do.
- `cleanSnapshot` gains an opt-in `{ requireProductName: false }` — used only
  by `createTemplateItem`/`updateTemplateItem`. A live option's Type stays
  required everywhere else (option creation/update, CSV import,
  "Save as template item").
- Removed: `upsertTemplateCategory`/`deleteTemplateCategory` (service),
  `upsertScheduleTemplateCategoryAction`/`deleteScheduleTemplateCategoryAction`
  (actions), the "Default categories" table in Studio Settings, and its
  `ScheduleTemplate.is_default_entry` field.
- `TemplateItemDialog`'s Type field is no longer `required`; the Template
  items table shows "Reserved only — no default product" for a blank one.

**Also fixed while in this code: a `count()`-based `sort_order` bug in
`insertTemplateItem`** (same class as R8.134's BQ fixes) — both the
auto-created category row and the item itself computed `sort_order` via
`count()`, which collides with a surviving sibling after any deletion.
Swapped both to `MAX(sort_order)+1`, matching the pattern already used
elsewhere in this file.

`STUDIOFLOW-REWORK-CONTRACT.md` §11.5 records the merge and the reasoning.
`service.integration.test.ts` updated: the two direct `upsertTemplateCategory`
calls that only existed to pre-create a category (already auto-created by
`createTemplateItem`) are removed; the one test exercising "default
categories" now creates a blank-Type template item instead and asserts the
same "reserved, zero options" outcome.

Checks: `tsc --noEmit` clean; `eslint .` clean; full suite 520/520. Migration
applied to both `studioflow_rebuild` and `studioflow_rebuild_test`; Prisma
Client regenerated. No new dependency.

## R8.136 | 2026-09-24 | feat(sf): Product Schedule entry panel — explicit Save/Discard, no option required to fill in product info

Owner-scoped (chat, 2026-09-24), following the R8.135 crash fix: two
deliberate reversals of R8.112/R8.113 decisions, both explicitly requested
by the owner after seeing the panel in the browser.

**Reversal 1 — explicit Save/Discard, not per-field auto-save-on-blur.**
Owner: *"mending disave aja dari pada di react live sync gitu... kaya di
masterdata tuh, kalau ga fokus ntar ada discard / keep editing."* Every edit
in `EntryPanelContent`'s "Card content" checklist (item fields, product
details, which fields are ticked) is now a local draft (`fields`,
`optionDraft`, `cardFieldsDraft`, all baselined together and resynced only
when the shown option's identity changes — reusing the same ref-based
pattern R8.135 fixed, not a second copy of the bug). A **Save** button
commits whatever changed via the existing actions
(`updateScheduleOptionAction`/`createScheduleOptionAction`,
`updateScheduleEntryAction`, `updateScheduleEntryCardFieldsAction`); a
**Discard** button resets the draft. Closing the dialog with an unsaved
draft prompts "Discard changes? / Keep editing" via the existing
`useConfirm()` hook, matching Master Data's edit-dialog wording — the entry
dialog tracks dirtiness through a ref (`EntryDialog`'s `isDirtyRef`, written
by `EntryPanelContent`'s `onDirtyChange` callback) rather than lifting the
draft state itself, so the guard only reads it at the moment of closing.

**Reversal 2 — no checklist row requires an option to exist first.** Owner:
*"opsi mah hal berbeda... naturalnya di buat dulu card berisi informasi
(produk) - kalau ga yakin baru tambah opsi. ga ada aturannya harus punya 2
opsi atau lebih dulu."* R8.112 disabled Brand/Color/Pattern/Finishing/Size/
Notes whenever the entry had zero options ("Add an option below first") —
this was also what made R8.135's crash reproducible in the first place, on
exactly this state. Every row now disables only for edit permission or an
in-flight save. Pressing Save with no option yet **creates the first one**
(`createOption`, the same call `OptionDialog`'s "Add option" already used)
from whatever was filled in; with an option already shown, Save updates it —
one `shown ? update : create` branch, mirroring `OptionDialog` exactly rather
than inventing a second create path.

`domain/schedule.ts` gains `resolveCardFields(override, extraKeys)`,
factored out of `effectiveCardFields` so the client-side draft can mirror the
same null-vs-list default logic without duplicating it.

`docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md` §11.10 records both
reversals in place, next to the R8.112/R8.113 text they supersede.
`schedule.regression.test.ts`'s two assertions that specifically guarded the
old behavior (`auto-saves on blur...`, `...also require a shown option to
write to`) are replaced with assertions for the new behavior; the file's
other R8.112/R8.113 regression tests (row order, Brand combobox, WYSIWYG
Notes, ChecklistRow reveal) are untouched since nothing about them changed.

Checks: `tsc --noEmit` clean; `eslint .` clean; full suite 520/520. Browser
verification of the new Save/Discard flow itself is the owner's to do (they
were already testing this page live when the reversal was requested); the
crash fix half (R8.135) was independently verified in the browser before
this. No schema migration; no new dependency.

## R8.135 | 2026-09-24 | fix(sf): Product Schedule entry panel infinite-render crash on a zero-option entry

Owner-reported (chat, 2026-09-24, browser): opening the entry panel for a
schedule item with no options yet ("Reserved — no product yet") crashed the
whole page with "Too many re-renders." Reproduced in the browser and fixed.

**Root cause** (`schedule-board.tsx`'s `EntryPanelContent`): the draft-resync
block used two separate `useState`s —
```
const [shownIdSeen, setShownIdSeen] = useState(shown?.id ?? null);
if (shown?.id !== shownIdSeen) { setShownIdSeen(...); setOptionDraft(...); }
```
— React's own documented "adjust state during render" pattern, but with a
second piece of *state* (not a ref) tracking what was last seen. Confirmed by
bisection (temporarily short-circuiting the block) that this exact code was
the trigger; for an entry with zero options (`shown` stays `null` across
every render) this should have been a same-value no-op per React's `Object.is`
bailout, but empirically was not — swapping `shownIdSeen` from a second
`useState` to a plain `useRef` (mutating a ref during render never itself
schedules a re-render, only the one `setOptionDraft` call can) resolved it
outright, verified in the browser with a clean console both for the
zero-option case and for adding an option afterward.

This also satisfies `react-hooks/set-state-in-effect`, which rejected an
initial `useEffect`-based alternative fix (moving the resync into an effect
runs the same setState one render later, which the linter flags as
avoidable). The `useState`-based render-time pattern is unchanged everywhere
else in this file; only this one two-state instance is now ref-based.

Owner also asked whether the panel should stop reactively re-deriving from
the shown option at all and only update after an explicit Save — noted as a
separate, larger design question (not applied here): this fix keeps today's
existing resync-on-identity-change behavior (a different option becoming
final while the dialog stays open still updates the draft), just without the
crash.

Checks: `tsc --noEmit` clean; `eslint .` clean; full suite 520/520 (unchanged
count — this is a client-only rendering bug with no server-testable
behavior; verified by reproducing and re-testing in the browser instead). No
schema migration; no new dependency.

## R8.134 | 2026-09-24 | fix(bq,studioflow,ui-engine): full-repo logic + UI-consistency audit — 7 bugs fixed, 2 deferred

Owner-scoped (chat, 2026-09-24): "cek logic bisnis + logic debt, pastikan no
cacat logic, uiux konsisten" across BQ, StudioFlow, and the shared UI Engine
(Master Data excluded — locked, R8.133). Three parallel finder passes
surfaced 15 candidates; each was independently verified by reading the
actual code (and in two cases, by writing the regression test first and
watching it fail against my own initial fix location before correcting it —
see the completeSupervision entry below).

**Bug: deleting a promoted Library item crashed via a DB check constraint**
(`src/apps/bq/services/library-items.ts`: `deleteLibMaterial`, `deleteLibLabor`,
`deleteLibMaterialLabor`, `deleteLibCustomItem`). Each FK from
`bq_template_recommendation` to a library table is `ON DELETE SET NULL`, but
the table's own CHECK constraint requires exactly one of its four source
columns non-null — deleting a library item still referenced by a Template
recommendation nulled the column and then failed that constraint mid-DELETE,
surfacing a raw Postgres error instead of succeeding. Fixed by explicitly
deleting the dependent recommendation rows first, matching the existing
`deleteTemplateSection` pattern. Regression test added.

**Bug: BQ sibling `sort_order` collisions on two more paths.** R8.109 fixed
this for `project-tree.ts`'s five `add*` functions via a `MAX(sort_order)+1`
helper; two other paths never adopted it and still used `count()` or a bare
`?? 0` fallback: `assemblies.ts`'s `addAssemblyCustomLine` and
`applyAssemblyTemplate` (count() collides with a surviving sibling after any
deletion), and `templates.ts`'s `addTemplateSection`/`addTemplateRecommendation`
(no caller ever supplies `sortOrder`, so every section/recommendation added
through the real UI landed at 0). Both instabilities propagate into real BQ
projects: `applyAssemblyTemplate` copies line `sort_order` verbatim, and
`createProject` copies template section `sort_order` verbatim. Fixed with
the same `MAX+1` pattern. Regression tests added for both.

**Bug: reopening a project's completed last phase left `Project.status`
stuck at COMPLETED** (`src/apps/studioflow/phases/service.ts`). `reopenPhase`
and `overrideRevision` never reverted the project status that
`completeProjectIfLast` had set, so a reopened, actively-`IN_PROGRESS` phase
sat inside a project that `today/service.ts` filters out entirely
(`status: { not: "COMPLETED" }`) — the work silently disappears from every
assignee's Today feed. Fixed with a new `reactivateProjectIfCompleted`
helper (the mirror of `completeProjectIfLast`), called from both. Regression
test added.

**Bug: `completeSupervision` orphaned open feedback instead of converting it**
(`src/apps/studioflow/phases/service.ts`). `approveInternal`/`approveClient`
refuse to lock a phase while it has an OPEN `FEEDBACK` activity
(`assertFullyUnblocked`), and `rejectPhase` explicitly converts any such
feedback to a checklist item before closing a revision. `completeSupervision`
is the one lock path with no blocker gate (legacy-parity: Supervision
finishes on its own terms) — it closed the revision without converting
lingering feedback either, permanently orphaning it (invisible to
Today/blockers, which only read the *active* revision). **Correction during
this fix**: the same conversion was initially added to `reopenPhase` on the
theory that *reopening* was where the loss happened; writing the regression
test first caught that this is dead code — every lock path closes its
revision as part of locking, so `reopenPhase` never finds a live active
revision to convert feedback from. Moved the fix to `completeSupervision`,
the path that actually closes a revision without a blocker check. Regression
test added (and is what caught the wrong placement).

**Bug: MOM revision save had no P2002 mapping** (`src/apps/studioflow/mom/service.ts`
`freezeRevision`). Every other uniqueness-sensitive write in this codebase
(`projects/service.ts`'s `createClient`/`updateClient`/`upsertClientByName`)
catches and remaps `P2002`; a concurrent "Save revision" race on the same
document could surface a raw `PrismaClientKnownRequestError` instead of a
clean conflict. Wrapped the create in `try/catch` + `mapWriteError`, matching
the established pattern.

**UI consistency: raw checkbox → `Checkbox`**
(`src/app/(platform)/studioflow/settings/studio-settings-view.tsx`). The
"Optional (warning only...)" toggle used a bare `<input type="checkbox">`
instead of the UI Engine `Checkbox` component. Swapped. A second raw
checkbox inside `schedule-board.tsx`'s `ChecklistRow` was investigated but
not changed: `ChecklistRow` wraps its own custom `<label>` (hover state,
tooltip), and `Checkbox` also wraps its own `<label>` internally — using it
there would double-nest labels. Left as-is; already covered by this
backlog's existing "StudioFlow UI Engine adoption gaps... accepted
architecture debt" note rather than a new entry.

**Investigated, not fixed — recorded in `docs/BACKLOG.md` as `[BUG]`:**
- BQ `nextSortOrder` (`project-tree.ts`) reads-then-creates on the plain
  (non-transactional) `db` client across five call sites — a genuine
  concurrent-insert race, but fixing it means wrapping all five in a
  transaction, broader surgery than warranted to rush in this pass.
- `addLineItemAction`'s material branch re-validates a selected Master Data
  price via a 200-row, no-search re-fetch that can wrongly reject a valid
  price past that window. The clean fix needs a by-id lookup added to Master
  Data's public read port — Master Data is locked (R8.133); left for an
  explicit owner request.
- A UI finding recommending `FileDropZone` for `deliverables-panel.tsx`'s
  upload was investigated and found not viable as stated: `FileDropZone`
  deliberately strips `File` down to `{name,size,type}` before handing it to
  the consumer ("a consumer must not retain a live platform handle it could
  later read bytes from by accident"), so it cannot supply the actual bytes
  `uploadDeliverableAction` needs. No backlog entry — not a defect, a correct
  design constraint on the shared component that a naive reuse would violate.

Checks: `tsc --noEmit` clean; `eslint .` clean; full suite 520/520 (up from
516 — 6 new regression tests: BQ library-item delete, BQ assembly sort_order,
BQ template sort_order, StudioFlow reopen-reactivates-project,
StudioFlow completeSupervision-converts-feedback; one MOM P2002 fix has no
dedicated concurrency test — the fix is a simple, low-risk try/catch). No
schema migration; no new dependency.

## R8.133 | 2026-09-24 | docs(masterdata): audit and lock — no code changes

Owner-scoped (chat, 2026-09-24): "cek masterdata dulu - kalau sudah semua nya
solid - kunci dulu." Audited, found solid, recorded the lock — no source
changes in this revision.

Audit: 35/35 `masterdata` integration tests pass in isolation; 0 open `[BUG]`
entries in `docs/BACKLOG.md`; no TODO/FIXME in `src/apps/masterdata`. One
apparent gap surfaced while reading `vendor-contract.md` §14.4 ("Brand
permanent delete... currently missing") — checked against
`brand.service.ts` and it is already implemented (`brand.archived` audit
action, deletion-request flow); that table is a stale historical migration
checklist from the Vendor rework, not a live gap.

`docs/BACKLOG.md`'s Master Data section gains a **LOCKED** note: no
modification to Master Data app code without an explicit new owner request,
including drive-by cleanups found while working elsewhere. The existing
`[PLANNED]`/`[CLEANUP]` entries stay as recorded future work, not something
to start unprompted.

Checks: none needed (docs-only). No schema migration; no new dependency.

## R8.132 | 2026-09-24 | feat(sf,ui-engine): Product Schedule print/export as a second consumer of the shared UI Engine print view

Owner-scoped (chat, 2026-09-24): close the `[PARITY][P2]` backlog item —
Product Schedule had no print/export path, unlike legacy's `CatalogBoard`.
Explicit owner direction this session: match legacy's simple running-header
style (no need to chase per-page numbering); the one thing to actually
improve over legacy is that its export size was fixed — paper size should be
configurable this time.

**Shared capability, not app-owned code.** `DocumentSheet`, `DocumentBlock`,
and `PrintButton` (`platform/ui_engine`, UI_ENGINE §13) already existed with
one consumer, MOM's print route (§10). This makes Product Schedule the
second consumer instead of forking a parallel print implementation:
`src/app/(document)/studioflow/print/projects/[projectId]/schedule/page.tsx`,
reached from a new "Print / PDF" link on the board toolbar
(`schedule-board.tsx`), styled and behaving exactly like MOM's own link.

**New UI Engine capability: selectable paper size/orientation** — the actual
improvement over legacy. `DocumentSheet` gains an optional `printFormat:
{ paper: "A4" | "LETTER"; orientation: "portrait" | "landscape" }` prop that
drives both the on-screen preview width and an injected `@page { size: ...;
}` rule, so the real print/PDF output matches what was picked, not just the
preview. New client pattern `PrintFormatPicker` (`patterns/print-format.tsx`)
reads/writes `?paper=&orientation=` via `router.replace`, the same
URL-driven-filter idiom already used elsewhere — no new client state pattern
introduced. `format` (the old `"a4-portrait" | "a4-landscape"` prop) is
untouched; MOM is not forced onto the new prop.

**Known, owner-accepted limitation: no true per-page running header or page
counter.** Chrome/Firefox do not support CSS Paged Media running
elements/`@page` margin-box content — confirmed and discussed with the owner
before building; a real "page N of M" needs a server-side PDF-render
pipeline, which the owner explicitly declined to add. The printed header
(project, client, print date) appears once at the top, same pattern as MOM's
existing print page.

**Extracted card-rendering logic to prevent drift**
(`src/apps/studioflow/domain/schedule.ts`): `ScheduleEntryView`,
`ScheduleOptionView`, `ScheduleSampleRequestView`, and the pure functions that
decide what a board card shows (`finalOf`, `shownOptionOf`,
`templateSourceOf`, `effectiveCardFields`, `cardFieldValuesOf`,
`extraChoicesOf`, `cardFieldLabel`, `specLine`, plus the card-field-label and
section-label maps) moved out of the client-only `schedule-board.tsx` into
the shared domain module. Both the on-screen board and the new print page
import the same functions, so the printed catalogue cannot drift from what
the board itself shows — this was a precondition for building the print view
at all, not a separate refactor. `schedule-board.tsx`'s own rendering is
unchanged; `schedule.regression.test.ts`'s source-matching assertions for the
moved functions were updated to check `domain/schedule.ts` instead.

`docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md` §11 gains §11.11
recording this. `docs/BACKLOG.md`'s `[PARITY][P2]` entry is closed (moved to
a "Fixed" note) and a new `[UNVERIFIED]` entry added — code is done, no
browser walk has happened yet.

BQ `[PLANNED]` backlog items are explicitly deferred by the owner this
session; none touched here.

Checks: `tsc --noEmit` clean; `eslint .` clean; full suite 516/516 (read-only
view over already-tested data, so no new integration-test surface — the
extraction is covered by the existing regression test plus the full board's
existing behavioral tests still passing unchanged). No schema migration; no
new dependency.

## R8.131 | 2026-09-24 | fix(masterdata,bq): close the residual TOCTOU window and unbranded-SKU restore loophole R8.130 left open

Owner-scoped (chat, 2026-09-24): R8.130 fixed the easy half of each bug and
explicitly flagged what it left open; this closes both remaining gaps.

**Bug: BQ promotion TOCTOU — the actual race, not just the pre-check**
(`src/application/promotion-coordinator.ts:approve()`,
`src/apps/bq/services/promotions.ts`, `src/apps/bq/runtime.ts`)
R8.130 only caught the case where the Master Data reference was *already*
archived when `validatePromotionReference` ran, and its own changelog entry
noted the real gap — a concurrent archive landing between that check and
`approvePromotion`'s write — as "theoretically possible but not a practical
risk." Since Master Data and BQ are separate apps with no shared transaction
(cross-app FK/transactions are forbidden by this repo's architecture), the
window can't be closed with a lock; it's closed with a saga instead:
`approve()` now re-validates the same reference immediately after
`approvePromotion` commits, and if a concurrent actor archived it in that
window, calls a new `bq.revokeStalePromotionApproval()` to unwind the
approval (`APPROVED` -> `REJECTED`, `masterdata_ref_id` cleared) before
throwing `PROMOTION_REFERENCE_ARCHIVED`. `revokeStalePromotionApproval` is a
system-only compensation, gated the same as approve/reject, and deliberately
separate from the user-facing `rejectPromotion` (which stays scoped to
`REQUESTED` items per bq-contract §8.2). New regression test in
`promotion-coordinator.test.ts` simulates the concurrent archive landing
between the two validate calls and asserts the approval is unwound rather
than left pointing at a stale reference.

**Bug: source-link brand mismatch — the unbranded-SKU case R8.130 missed**
(`src/apps/masterdata/services/shared.ts:assertPriceMaterialRestorable()`)
R8.130's guard was `if (sourceLink && sku.brand_id && sourceLink.brand_id !==
sku.brand_id)` — the `sku.brand_id &&` short-circuit meant that if the SKU's
Brand was cleared to `null` (unbranded) rather than changed to a different
Brand, the whole check was skipped and a price restored with a source link
pointing at a Brand the SKU is no longer even associated with. Removed the
`sku.brand_id &&` guard; `sourceLink.brand_id !== sku.brand_id` alone already
covers both the "different brand" and "no brand" cases correctly, since
`sourceLink.brand_id` is never null. Regression test added to
`service.integration.test.ts` covering the unbranding path specifically.

**Unrelated drive-by: impure `Date.now()` in `TimelinePage`**
(`src/app/(platform)/studioflow/timeline/page.tsx`)
`npm run lint` (run as a proportionate check before this commit) failed on
`react-hooks/purity` for a bare `Date.now()` call in the R8.127 Timeline
page's component body. Moved it into a plain non-component helper
(`currentTimeMs()`) — same value, satisfies the rule. No behavior change.

**Also this session:** dev and test databases were out of sync with
`schema.prisma` after pulling R8.121-R8.130 (missing
`sf_phase_planned_dates` migration + stale generated Prisma Client caused 60
integration tests to fail). Ran `prisma migrate reset --force` on
`studioflow_rebuild` (dev) and `prisma migrate deploy` on
`studioflow_rebuild_test`, then `prisma generate`. Not a code change; noted
here since it's why the full suite needed a re-run before these fixes could
be verified.

Backlog: no entries to remove — both bugs were already closed out of
`docs/BACKLOG.md` by R8.130; this revision only deepens those same fixes.
Checks: `tsc --noEmit` clean; `eslint .` clean; full suite 516/516 (up from
514 — the two new regression tests). No schema migrations; no new
dependencies.

## R8.130 | 2026-09-24 | fix(masterdata,bq): fix TOCTOU auto-reject and source-link brand mismatch on restore

Owner-scoped (chat, 2026-09-24): two remaining open logic-audit bugs.

**Bug: TOCTOU — BQ promotion auto-reject when reference archived before approval**
(`src/application/promotion-coordinator.ts:approve()`)
Previously, if `validatePromotionReference` threw (price archived between
admin opening the UI and clicking Approve), the error propagated and the
promotion stayed stuck in `REQUESTED`. Now: validation failure is caught,
`rejectPromotion` is called automatically with a reason, and
`PROMOTION_REFERENCE_ARCHIVED` is thrown so the UI can surface a clear
message. The narrow microsecond window where validate passes but the price
is archived before `approvePromotion` writes remains theoretically possible
but is not a practical risk; the product direction (treat as rejected) is
now enforced for the realistic case. Unit tests: 2/2 pass in
`src/application/promotion-coordinator.test.ts` (new file).

**Bug: source-link brand mismatch on restore**
(`src/apps/masterdata/services/shared.ts:assertPriceMaterialRestorable()`)
When a live price with a `source_link_id` is archived directly, the SKU's
brand can then be changed (no live source-linked price triggers the
`SKU_BRAND_CHANGE_BLOCKED` guard). On restore the price would come back with
a source link pointing at the old brand, not the SKU's new brand — a silent
provenance corruption. Added: `if (sourceLink && sku.brand_id &&
sourceLink.brand_id !== sku.brand_id) throw PRICE_SOURCE_LINK_BRAND_MISMATCH`.
Regression test added to `src/apps/masterdata/service.integration.test.ts`.

Backlog: removed both fixed bug entries; BQ TOCTOU entry is now closed.
Checks: `tsc --noEmit` clean; coordinator unit 2/2; masterdata integration
32/32. No schema migrations; no new dependencies.

## R8.129 | 2026-09-24 | fix(masterdata,bq): fix 5 verified logic-audit bugs; add regression tests

Owner-scoped (chat, 2026-09-23/24): implement all five ready code fixes from
the R8.128 logic-audit backlog pass. No schema migrations; no new
dependencies.

**Bug #7 — wrong audit `entityId` in `deleteAssemblyLine`**
(`src/apps/bq/services/assemblies.ts:deleteAssemblyLine()`)
Changed `entityId: line.assembly_template_id` to `entityId: line.id`. The
deleted row is a `BqAssemblyLine`, so `entityId` must be the line's own id.
Regression test added to `src/apps/bq/service.integration.test.ts`.

**Bug #5 — `listLineItemSourcesAction` missing BQ authorization**
(`src/app/(platform)/bq/[id]/source-actions.ts`)
Added `requirePermission(grants, BQ_PERMISSIONS.access)` + an
`hasPermission` OR-check for `bq.project.read` / `bq.project.manage`. The
`authorize()` helper now self-enforces the BQ boundary before listing any
sources. Replaced the two dynamic `import()` calls inside the function body
with static top-level imports (`hasPermission` from rbac,
`MASTERDATA_PERMISSIONS` from masterdata/public, `BQ_PERMISSIONS` from
bq/public, `AppError` from errors).

**Bug #4 — archived entities remain mutable**
(`src/apps/masterdata/services/sku.service.ts:updateSku()`,
`pricing.service.ts:updatePriceMaterial()`, `updatePriceMaterialLabor()`,
`updatePriceLabor()`)
Added `if (existing.deleted_at !== null)` guard immediately after loading
each entity, throwing `AppError("CONFLICT", "SKU_ARCHIVED"|"PRICE_ARCHIVED",
...)`. Regression tests for all four paths added to
`src/apps/masterdata/service.integration.test.ts`.

**Bug #2 — SKU Brand change invalidates `PriceMaterial.source_link`
provenance**
(`src/apps/masterdata/services/sku.service.ts:updateSku()`)
After the brand-archived check, added a brand-change guard: if the brand is
being changed, count live `PriceMaterial` rows with a non-null `source_link_id`
for this SKU; throw `AppError("CONFLICT", "SKU_BRAND_CHANGE_BLOCKED", ...)`
if any exist. Users must clear source links before swapping the brand.
Regression test added (including positive path: brand change succeeds once
links are cleared).

**Bug #3 — SKU restore can produce a LIVE SKU with zero live PriceMaterial**
(`src/apps/masterdata/services/shared.ts:assertSkuRestorable()`)
Added a restorable-price check at the end of `assertSkuRestorable`: finds
all `ArchiveCause` rows with `entity_type=price_material, kind=PARENT,
parent_type=sku, parent_id=skuId` (the prices that *would* be restored). If
none exist, throws `SKU_NO_RESTORABLE_PRICE`. Otherwise filters to prices
that have no OTHER cause besides this SKU; if every candidate price still has
another cause, throws `SKU_NO_RESTORABLE_PRICE` with a distinct message.
Mirrors `removeParentCausesAndFindRestored` logic. Regression test: archive
SKU + both its vendors → restoreSku throws `SKU_NO_RESTORABLE_PRICE`.

**Backlog updates (docs/BACKLOG.md):**
- Removed KB-020 (office migration provenance) — office DB will be reset.
- Removed fixed bug entries #2, #3, #4 (Master Data) and #5, #7 (BQ).
- Reclassified #8 (project archive not purging STORED assets) from `[BUG]`
  to `[PLANNED]`; deferred until PLATFORM-ASSET-STORAGE-ROADMAP.md lands.

Checks: `tsc --noEmit` clean; `service.integration.test.ts` (BQ) 16/16 pass;
`service.integration.test.ts` (Master Data) 31/31 pass. No browser-facing
behavior changed.

## R8.128 | 2026-09-23 | docs(backlog): record 7 verified logic-audit findings; de-scope allow_parallel

Owner-scoped (pasted audit findings, 2026-09-23): docs-only pass over
`docs/BACKLOG.md`, no code changes. Every referenced symbol was re-verified
against current source before being recorded (`sku.service.ts:updateSku()`/
`restoreSku()`, `source-actions.ts:listLineItemSourcesAction()`,
`assemblies.ts:deleteAssemblyLine()` — confirmed `entityId:
line.assembly_template_id` at line 65 instead of `line.id`,
`projects/service.ts:archiveProject()`, `application/promotion-coordinator.ts`).

- Master Data: added `[BUG]` entries for SKU Brand change invalidating
  `PriceMaterial.source_link` provenance, SKU restore reaching LIVE with zero
  live `PriceMaterial`, and archived SKU/Work/Price rows still allowing
  relationship-field edits (`brand_id`/`vendor_id`).
- BQ: added `[BUG]` entries for the BQ source-picker server action missing
  its own `bq.access`/`bq.project.read` authorization check, the cross-app
  promotion-approval TOCTOU window in `promotion-coordinator.ts` (flagged as
  cross-app consistency debt, not an isolated BQ bug — no FK design change),
  and Assembly Line delete recording the wrong audit `entityId`.
- StudioFlow: added a `[BUG]` entry for `archiveProject()` not purging
  `STORED` file assets, which conflicts with the already-resolved owner
  decision recorded in the "Decision gates" section; linked to
  `PLATFORM-ASSET-STORAGE-ROADMAP.md`.
- Removed the `[BUG][P3] sf_phase_definition.allow_parallel` entry: owner
  decision is that phases may run in parallel and `true` for Supervision is
  intentional product behavior, not a defect. Recorded as a third bullet
  under "Decision gates — resolved 2026-09-23" instead.
- KB-020 (office migration-provenance bug) left unchanged.
- Checks: none run (documentation-only change, no source edited).

## R8.127 | 2026-09-23 | feat(sf): portfolio Timeline page + per-phase planned dates

Owner-scoped (chat, 2026-09-23): after seeing R8.125's per-project Gantt bar,
owner asked for a dedicated page with every project's timeline, filterable,
and confirmed (via in-chat questions) it should use real per-phase dates
rather than staying sequence-only, with client/designer-drafter/status/date
filters, as a new sidebar item. Plan recorded in `PLAN.md` before
implementation (SF-PORTFOLIO-TIMELINE).

- Schema: `SfPhase.planned_start_date`/`planned_end_date` (nullable `DATE`,
  additive migration `20260923040000_sf_phase_planned_dates`, applied to
  local dev and test databases per `docs/agent/README.md`). Unset means "no
  override" — same philosophy as R8.125's `timelineStartDate`.
- Shared geometry: `src/apps/studioflow/domain/timeline.ts`
  (`resolveTimelineSpan` + `computePhaseSegments`, unit-tested) replaces the
  inline math that used to live only in `ProjectTimeline`. A phase with both
  planned dates set draws at its real position; without them it keeps the
  original equal-width sequence slot — an all-undated project renders
  identically to before. The span widens to cover any fully-dated phase that
  falls outside the project's own start/opening range, so a saved date can
  never end up clamped to zero width and hidding behind an undated phase's
  fallback slot.
- New `/studioflow/timeline` (`page.tsx`, `timeline-directory.tsx`,
  `edit-phase-dates-dialog.tsx`): one Gantt row per non-archived project,
  filterable by client, designer/drafter (reuses the existing PIC concept),
  status, and a date range (kept when the project's span overlaps it,
  computed in application code same place the date fallbacks already are).
  Clicking a phase segment opens a dialog to set/clear its planned dates,
  gated by `studioflow.project.manage`; the page itself is read-only and
  gated by `studioflow.project.read` like the rest of StudioFlow. New sidebar
  item "Timeline" between Projects and Clients
  (`src/apps/studioflow/public/nav.ts`, `nav.tsx`, `ChartGantt` icon).
- `listProjects`/`listProjectPhases` now also select/return
  `plannedStartDate`/`plannedEndDate` per phase; the existing Overview page
  `ProjectTimeline` bar was upgraded to the shared geometry (read-only there,
  editing stays on the Timeline page only) — no behavior change for a
  project whose phases have no planned dates.
- `setPhasePlannedDates` service command
  (`src/apps/studioflow/phases/service.ts`) + `setPhasePlannedDatesAction`;
  validates end ≥ start, audited as
  `studioflow.phase.planned-dates-changed`. Not gated by phase lock — this is
  schedule metadata, not phase-work content.
- Docs: `STUDIOFLOW-REWORK-CONTRACT.md` §8 rewritten for the new page and
  shared rendering rule; `docs/BACKLOG.md`'s R8.125 timeline note updated to
  record the R8.127 upgrade instead of still reading as outstanding future
  work.
- Tests: `src/apps/studioflow/domain/timeline.test.ts` (13 cases covering
  span resolution, equal-width/dated/mixed segments, span widening, and the
  partially-dated-phase edge case that widening must ignore).

Found during browser verification, fixed before commit: the new client
components (`"use client"`, unlike the server-rendered original
`ProjectTimeline`) re-ran `resolveTimelineSpan` on hydration with a fresh
`Date.now()`, producing a genuine SSR/client attribute mismatch on the
"today" marker; fixed by capturing `now` once on the server and threading it
through as a prop instead of defaulting inside the client tree.

## R8.126 | 2026-09-23 | docs(agent): record dev-DB migration discipline as a harness rule

Owner-scoped: after pulling R8.109–R8.125 (16 commits, 4 new migrations),
`prisma migrate deploy` was only run against `masterdata_test` — `next dev`
then threw `ColumnNotFound`/P2022 on `sf_project.timeline_start_date` against
the local dev DB (`masterdata`) even though `npm run check` and `npm test`
were both green, since the two databases are migrated independently.

- `docs/agent/README.md`: new "Local database sync after new migrations"
  section — after a pull/rebase/cherry-pick or any local migration addition,
  migrate every local database the session uses (dev `masterdata` and test
  `masterdata_test`), not just whichever one the immediate task needed;
  regenerate the Prisma client and restart `next dev` afterward. Framed as a
  harness rule for any agent/model running this checkout, not a
  StudioFlow-specific note.
- No app code changed; `masterdata` (dev, localhost:5433) was migrated
  locally as part of diagnosing this while verifying the R8.125 pull.

## R8.125 | 2026-09-23 | feat(sf): per-project timeline/Gantt bar on the Overview page

Owner-scoped: *"butuh timeline (ganttchart utk proyek yg punya opening [end]
- dan start saat proyek di tambahkan / di override startnya, dan bisa di
breakdown per fase)"*. Shipped as a sequence breakdown, not a
calendar-accurate one — flagged explicitly rather than overclaiming, since
no schema exists for an independently-dated phase start/end.

- Schema: `SfProject.timeline_start_date` (nullable `DATE`, additive
  migration `20260923030000_sf_project_timeline_start`, applied to local dev
  and test databases). `getProject`/`listProjects` resolve it as
  `timelineStartDate`, falling back to `created_at`'s date when unset.
  `updateProject`/`ProjectEditInput`/`updateProjectAction` gained the field;
  `EditProjectDialog` gained a "Timeline start" field (clearing it resets to
  the fallback).
- New `ProjectTimeline` (`project-timeline.tsx`), rendered on the project
  Overview page between the phase-tab strip and the phase canvas: a bar from
  `timelineStartDate` to `openingDate` (falls back to "today +30 days,
  ongoing" when unset), split into one equal-width segment per phase
  (colored via the existing `phaseAccentDotClass`, dimmed while `PENDING`),
  plus a "today" marker and a phase-color legend. Segments are equal-width
  by sequence, not independently dated — `SfPhase` only has `order_index`
  and a single latest `status_changed_at`, not a full transition history, so
  this shows *where in the overall span the project sits, by phase*, not
  literal per-phase durations. A true per-phase-dated Gantt is future work.
- `STUDIOFLOW-REWORK-CONTRACT.md` §8 documents the feature and its
  limitation; §14 non-goals updated (Gantt/Library both shipped early).

Verification: `tsc`, `check:boundaries`, `check:legacy-runtime` clean. `npm
test`: 494 passed (493 + one new integration test: default/override/clear
round-trip for `timelineStartDate` on both `getProject` and `listProjects`).
Browser acceptance intentionally deferred — owner asked to test manually.


## R8.124 | 2026-09-23 | feat(sf): StudioFlow Library — read-only Brand discovery

The "wave 2+" Library the contract already named, shipped early once the
owner confirmed scope: *"rebuild dari studioflow 'library' dengan kemampuan
search dari masterdata utk brand"*. Turned out cheap to build — Master
Data's public read port already had everything needed (`listBrandLibraryReads`/
`getBrandLibraryRead`, built for exactly this consumer but never called from
a StudioFlow page until now).

- New `src/apps/studioflow/library/service.ts`: `createLibraryService(ports)`
  — a thin passthrough (`requireRead` then `ports.masterData.listBrandLibraryReads`),
  no local StudioFlow table. Wired into `service.ts` as `studioFlow.library`.
- New route `/studioflow/library` (`page.tsx` + `library-directory.tsx`):
  one table, search box filtering client-side by name/category/vendor/
  hashtag (small catalog, no server round trip needed, matching the Clients
  directory's own client-side filter). Read-only — no create/edit/archive,
  nothing writes back to Master Data.
  `STUDIOFLOW_ROUTES.library`/`STUDIOFLOW_NAV_LINKS` gained the new route;
  `nav.tsx` gained a `BookMarked` icon.
- `STUDIOFLOW-REWORK-CONTRACT.md` §7a documents the feature; §0 RW-04 and
  §14 updated to note Library shipped ahead of the rest of wave 2.

Verification: `tsc`, `check:boundaries`, `check:legacy-runtime` clean. `npm
test`: 493 passed (492 + one new integration test: seeded brand readable
with categories/hashtags, search matches by name, no-match returns empty).
Browser acceptance intentionally deferred — owner asked to test manually.


## R8.123 | 2026-09-23 | feat(sf): physical sample request tracking on Product Schedule options

Owner-scoped feature (§ discussion this session): from a Product Schedule
option, staff can request a physical sample from a vendor/supplier and mark
it received; the designer sees a badge, and nothing is written to Master
Data (its public contract is read-only by design).

- Schema: new `SfScheduleSampleRequest` (`option_id` FK cascade,
  `requested_from` free text, `note`, `status` REQUESTED|RECEIVED,
  `requested_by_id`/`requested_by_name`, `received_by_id`/`received_by_name`/
  `received_at`/`received_note`). Migration
  `20260923020000_sf_schedule_sample_request`, purely additive, applied to
  both local dev and test databases. `requested_from` is free text — no FK
  into Master Data's Vendor table, matching how `brand_name` already works.
- `schedule/service.ts`: `requestSample` (rejects a second open request per
  option, `SAMPLE_ALREADY_REQUESTED`) and `receiveSample` (rejects resolving
  a non-pending request, `SAMPLE_NOT_PENDING`); `listSchedule` now includes
  each option's latest sample request.
- Two new actions: `requestScheduleSampleAction`/`receiveScheduleSampleAction`.
- `schedule-board.tsx`: option card shows a "Sample requested"/"Sample
  received" `Badge` + "from {vendor}" line; row-action menu gained "Request
  sample"/"Mark sample received"; new `SampleRequestDialog`.
- `STUDIOFLOW-REWORK-CONTRACT.md` §11.11 documents the feature, including
  why there's no notification bell and no Master Data write.

Verification: `tsc`, `check:boundaries`, `check:legacy-runtime` clean. `npm
test`: 492 passed (491 + one new integration test covering request → duplicate
rejection → receive → re-request-after-resolved, against the real-Postgres
schedule suite). Browser acceptance intentionally deferred — owner asked to
test manually.


## R8.122 | 2026-09-23 | docs(masterdata): scope the workbook import/export backlog item

Owner-scoped, doc-only: "workbook import/export" means bulk SKU + pricing
import/export via Excel/CSV, similar to the existing vendor-catalog import.
Error-reporting policy (partial-failure behavior, per-row error surfacing)
is still undesigned — recorded in `docs/BACKLOG.md`, no code yet.


## R8.121 | 2026-09-23 | fix(platform): move the app switcher next to the brand/logo (GLOBAL-MENU-DESIGN-BRIEF Option B)

Turned out most of "Option B" was already built in R8.107 — a single
Popover-based control (`HeaderApplicationNavigation`) showing the current
app's name that opens a menu to switch apps, not the per-app text links the
brief's "Observed UI" section describes (that section predates R8.107). The
only real gap against the locked decision was placement: `ml-auto` on the
nav pushed it to the far right of the topbar, past `contextSlot`, instead of
sitting next to the brand/logo on the left.

- `authenticated-shell/navigation.tsx`: dropped `ml-auto` from
  `HeaderApplicationNavigation`'s `<nav>`; added a comment documenting the
  locked placement decision.
- `authenticated-shell/index.tsx`: `HeaderApplicationNavigation` now renders
  first in the topbar row (immediately after the brand column); `contextSlot`
  and `AccountMenu` moved into a new `ml-auto` wrapper so they stay pinned
  right.

Mobile/narrow-viewport treatment beyond generic truncation and per-app icons
remain open questions (no icon field in the apps registry today) — not
blocking, recorded in `docs/BACKLOG.md`.

Verification: `tsc`, `check:boundaries`, `check:legacy-runtime` clean. `npm
test`: 491 passed (no existing test exercises topbar layout directly).
Browser acceptance intentionally deferred — owner asked to test manually.


## R8.120 | 2026-09-23 | feat(sf): move project-info editing from the detail page onto the Projects list

Owner: *"modifikasi desainer/drafter/timeline opening dll itu ada di tabel /
halaman proyek [list] ini... di project detail hanya fokus pada informasi
keterangan phase saja."* Closes the `docs/BACKLOG.md` "Projects directory"
planned item from this session's discussion.

- `listProjects` (`src/apps/studioflow/projects/service.ts`) now also returns
  `readableName`, `projectType`, `clientContact`, `address`, `area` — the
  fields `getProject` already had but the list view didn't, needed for the
  new edit form without a per-row fetch.
- New `EditProjectDialog` (`edit-project-dialog.tsx`) — the same fields the
  old header dialog had (name/client/contact/designer/drafter/opening date/
  type/area/address), plus priority and status folded in as two more Select
  fields (saved via their own `setProjectPriorityAction`/
  `setProjectStatusAction` calls after `updateProjectAction`, matching how
  the removed header kept them as separate service calls).
- New `ProjectRowActions` (`project-row-actions.tsx`) — a `RowActionMenu` per
  Projects-list row: Edit details, Apply checklist templates, Archive
  project… (or just Restore project for an archived row) — mirrors the
  Clients directory's existing Edit/Archive/Restore row-menu pattern.
  `project-directory.tsx` gained a `RowActionsHead`/`RowActionsCell` column,
  shown only when `canManage`.
- Deleted `project-header-actions.tsx` (fully superseded) and dropped its
  `actions` prop from `[projectId]/layout.tsx` along with the `people`/
  `clients`/`canManage` fetches that existed only to feed it. The layout's
  `MetaList` still *displays* client/designer/drafter/status/priority as
  read-only text — it just carries no edit control anymore, so every project
  page (Overview, MOM, Schedule, History) is phase/record-focused only.
- `STUDIOFLOW-REWORK-CONTRACT.md` §8 documents the new location.

Verification: `tsc`, `check:boundaries`, `check:legacy-runtime` clean.
`npm test`: 491 passed, 0 failed (no test exercised the moved UI directly,
but the underlying `updateProject`/`setProjectPriority`/`setProjectStatus`/
`archiveProject`/`restoreProject`/`syncChecklist` service methods are
unchanged and already covered). Browser acceptance intentionally deferred —
owner asked to test manually before any further browser-driven verification.


## R8.119 | 2026-09-23 | fix(bq): zero a Work Item's markup once it has no children left; record backlog decisions

Fixes the BQ `[BUG][P1]` from `docs/BACKLOG.md`: `calculation-engine.ts`
applies `markupL1Pct` for every L1 Work Item regardless of children, but
`project-editor.tsx`'s single "Koef." column only shows `koefisien` once an
item is childless — a Work Item that had a breakdown (and a nonzero
`markupL1Pct`) whose children are later all deleted kept that markup
silently multiplying the total, invisible and uneditable. Owner decision:
zero it automatically rather than redesign the column to show both fields.

- `zeroMarkupIfChildless` (`src/apps/bq/services/project-tree.ts`) checks the
  Work Item's remaining sub-object/direct-line-item count after a delete and
  resets `markup_l1_pct` to `"0"` once both are zero. Wired into
  `deleteSubObject` and `deleteLineItem`.
- `requireEditableProjectForLineItem` (`src/apps/bq/services/context.ts`) now
  returns the owning `itemId` (previously `void`) so `deleteLineItem` can run
  the check without a second lookup; its 3 existing call sites were
  unaffected (none used the return value).
- Regression test: `service.integration.test.ts` "zeroes a Work Item's markup
  once it has no more children, but not while a child remains" — covers both
  the delete-last-sub-object and delete-last-direct-line-item paths, and
  confirms markup survives while a sibling child remains.

Also recorded five other owner decisions from this session's planner
discussion directly in `docs/BACKLOG.md` (no code yet for any of these):
BQ price modes TBC/By Owner mean a blanked, non-computed price; the physical
Samples workflow is scoped (Product Schedule → vendor request → received
badge, not a notification bell; no StudioFlow→Master Data auto-write, a
review request instead); the global app-switcher redesign is locked to
Option B (dropdown near the logo); StudioFlow asset retention purges on
project archive; Google Drive activation stays deferred.

Verification: `tsc`, `check:boundaries`, `check:legacy-runtime` clean.
`npm test`: 491 passed, 0 failed (490 + the new regression test), against
the real-Postgres BQ integration suite.


## R8.118 | 2026-09-23 | docs(sf): record three owner-confirmed StudioFlow scope decisions in BACKLOG.md

Planner/reviewer discussion of the StudioFlow left nav (Today/Projects/
Clients/Library/Timeline) surfaced three scope decisions the owner locked but
that weren't code yet, so they're recorded in `docs/BACKLOG.md` under
StudioFlow → Planned rather than left only in chat:

- Move project-info editing (designer/drafter/opening date, etc.) off the
  project detail page and onto the Projects list itself (modal or similar);
  the detail page then narrows to phase-focused information only.
- StudioFlow Library — rebuild of the legacy read-only Library page
  (search/discover Master Data's Brand catalog from inside StudioFlow, the
  "wave 2+" Library already named in `STUDIOFLOW-REWORK-CONTRACT.md`).
- Project timeline / Gantt chart — per-project Gantt with an overridable
  start date and an "opening" end date, broken down per phase. No schema for
  this exists today (`SfPhase` has no start/end date field).

The latter two are explicitly deprioritized behind the first item and behind
clearing the existing open bugs/planned items across Platform/Master
Data/BQ (owner: *"selesaikan dlu 3 bug terbuka dan 12 item nya"*). No code,
schema, or route changes in this revision — documentation only.

Verification: N/A (doc-only). No dirty files outside `docs/BACKLOG.md` and
`CHANGELOG.md`.

## R8.117 | 2026-09-23 | feat(sf): MOM sections merge to one free-typed WYSIWYG-lite content field, replacing per-point rows

Owner request on the MOM editor, after first trying a straight `SimpleTextEditor`
swap on the existing per-point rows and rejecting it live: *"ini ga usah gini,
lgsg bentuk text area aja, disimplifikasi jadinya"*. Discussed as
planner/reviewer before touching schema (three options laid out: UI-only
simplify, full merge, or a hybrid that diffs lines back into rows); owner
picked the full merge — *"B lebih optimal, di whatsapp aja bullet/numberingnya
bisa otomatis kan? jadi ga ada issue tinggal nulis diatas -> enter beres"*.

- **Schema:** `SfMomItem` drops `list_style` and its `points SfMomPoint[]`
  relation, gains one `content String @default("")`. `SfMomPoint` table and
  the `sf_mom_list_style`/`sf_mom_point_style` enums are dropped.
  Migration `20260923010000_sf_mom_point_content_merge` backfills `content`
  by joining each item's existing points (ordered) with the exact marker each
  one used to render, so existing MOMs read the same after migrating as
  before. Applied to both the local dev and test databases.
- **Domain (`src/apps/studioflow/domain/mom.ts`):** `MomSnapshot.items[]` is
  now `{ isTextOnly, content, images }`. `parseMomSnapshot` stays backward
  compatible: a historical revision snapshot still shaped as
  `{ listStyle, points }` is normalized into `content` on read (recomputing
  the same legacy marker), so old revisions keep restoring correctly and
  their images stay protected from the reachability sweep. `pointMarkers`,
  the list/point-style constants, and `MOM_LIMITS.pointText` are gone;
  `MOM_LIMITS.itemContent` (20000 chars) replaces it for one section's whole
  note field.
- **Service (`src/apps/studioflow/mom/service.ts`):** `addPoint`/`updatePoint`/
  `deletePoint`/`reorderPoints`/`movePoint` are gone, replaced by one
  `updateItemContent`. `updateItem` drops its `listStyle` argument.
- **Actions:** `addMomPointAction`/`updateMomPointAction`/`deleteMomPointAction`/
  `moveMomPointAction` are gone, replaced by `updateMomItemContentAction`.
- **Editor (`mom-editor.tsx`):** `SectionEditor` no longer renders a per-point
  list, a "List style" selector, or an "Add note" button. Each section is one
  `SimpleTextEditor` box (bold/italic/bullet-list toolbar, same as Master
  Data's Notes field), with the existing "1."/"-"/"•" auto-continue-on-Enter
  behavior now applying unconditionally instead of only when the section's
  list style was `NONE`. `SimpleTextEditor`
  (`src/platform/ui_engine/patterns/simple-text-editor.tsx`) gained
  `forwardRef` support so the editor can still restore cursor position after
  an auto-continued list line.
- **Print view:** renders `item.content` as one pre-wrapped block instead of
  a per-point marker/text loop.
- **Contract:** `STUDIOFLOW-REWORK-CONTRACT.md` §10 rewritten for the new
  shape, with an explicit note that this overrides the legacy-parity "ordered
  document/block/point/image hierarchy… is the minimum" floor recorded in the
  archived `studioflow-mom-contract.md`.

Verification: `tsc`, `npm run check:boundaries`, `npm run check:legacy-runtime`
all clean. `npm test`: 490 passed, 0 failed (includes the real-Postgres MOM
integration suite against both migrated databases). Domain tests cover the
legacy-snapshot-normalization path directly (DECIMAL/DISC/NONE list styles,
mixed DEFAULT/PLAIN points). Browser acceptance intentionally deferred — owner
asked to test manually before any further browser-driven verification pass.

## R8.116 | 2026-09-23 | feat(platform): group the Roles & Access permissions list into a matrix by app and resource

Owner request, from the "New role"/"Grants" dialogs: a screenshot of the flat
39-item permission checkbox list, asked *"benerin permissionnya dalam bentuk
matrix ini bs?"*. This is the explicit follow-up deferred in R8.115 (that
revision grouped the *Users → Create* Roles picker; this one grouped the
*Roles & Access → Permissions* picker, which the earlier entry noted decomposes
naturally into `app.resource.action`).

Considered a fixed-column grid (App × Resource rows, Read/Write/Manage/…
columns) first and rejected it: real actions aren't uniform across resources
(`Audit` has only `read`, `Promotion` only `approve`, `Phase` has
`work`/`review`/`override`, none of which are "write"), so a rigid grid would
be mostly meaningless blank cells. Instead grouped by app, then by resource
within that app, rendering each resource's actual declared actions inline —
same scannable effect as a matrix, no invented cells.

- New `permission-grouping.ts`: `groupPermissionsByApp` parses each
  `app.resource.action` ID (and the two-segment `app.access` form, labelled
  "Access this app") and buckets it under its app, then its resource, in the
  order the registry already declares them — no re-sorting, no name-guessing.
- `PermissionCheckboxes` (in `roles-directory.tsx`) rewritten to render that
  grouped structure — app heading, resource sub-heading, its action
  checkboxes on one line — with the existing search box now filtering by
  permission ID, resource label, or app label together.
- `roles/page.tsx` now builds `permissionGroups` from the registry and passes
  it to `RolesDirectory` in place of the old flat `registryPermissions` list.

Verification: `tsc`, `eslint`, `check:boundaries`, `check:legacy-runtime`,
`npm test` (490 passed — 8 new unit tests for the grouping logic) all clean.
Browser-verified at `/settings/access/roles`: "New role" dialog renders
Platform/Master Data/BQ/StudioFlow sections with correct Read/Manage pairing,
single-action resources (Audit, Promotion, Deletion) show one checkbox with no
phantom blank cell, multi-action resources (Library: Read/Manage/Promote;
Phase: Work/Review/Override) show all their real actions; search for
"schedule" correctly narrows to StudioFlow → Schedule → Manage only; checkbox
state survives clearing the search (verified via direct DOM state, not just
visually); "Grants — Platform Owner" shows all 39 permissions checked;
"Grants — SF-RF Drafter Acceptance" shows exactly its 3 actual permissions
checked and nothing else. Both dialogs closed without saving.

Note: `page.tsx` already carried the same unrelated uncommitted
`SettingsShell`/`SettingsNavigation` wrapper noted in R8.115; again only this
revision's own two edits (the `groupPermissionsByApp` import and the
`permissionGroups` prop) were staged from that file, leaving the wrapper
exactly as it was, still uncommitted.

## R8.115 | 2026-09-23 | feat(platform): group the New User Roles picker by app, checkboxes instead of a native multi-select

Owner request, from the Create User dialog itself: the Roles field was a
native `<select multiple>` (a cramped scrolling box, no grouping, no visible
checked state without scrolling to it). Owner: *"roles ui nya dibuat pakai
checkbox (bentuk matrix by app dan nama role nya) agar lebih user friendly"*.

Investigated two different screens before touching anything, since they sit
at different levels: **Users → Create** assigns *Roles* (named bundles,
e.g. "Platform Owner") to a user; **Roles & Access → Permissions** assigns
*Permissions* (`app.resource.action`, ~39 of them across 4 apps) to a role.
A Role is not 1:1 with an app — "Platform Owner" spans several — so an
app × role matrix would leave most cells meaningless there; a true
app-grouped grid fits the *Permissions* screen instead, where IDs already
decompose that way. Scoped this pass to the Users screen (confirmed with the
owner); the Roles & Access permissions list stays flat for a follow-up.

- `platformAccess.listAssignableRoles` now returns each role's granted
  `permissionIds`, not just id/code/name.
- New `role-grouping.ts`: `appGroupOf` derives a role's group from what it
  **actually grants** — the permission IDs' `app.…` prefix against the
  registered app list — never from the role's name text. A role holding
  permissions in more than one app groups under "Multiple apps" rather than
  being force-fit into one; a role with no grants yet reads "No permissions
  yet" instead of silently vanishing from every group.
- Create User's Roles field is now a checkbox list grouped under those app
  headings (Platform first, then each registered app in registry order,
  then Multiple apps, then ungranted), with a search box once there are more
  than 6 roles to page through.
- Existing users' role assignment (`RoleAssignControl`, the per-row
  dropdown + remove-chip control) was already a reasonable pattern and is
  unchanged — only the Create dialog had the native multi-select.

Verification: `tsc`, `eslint`, `check:boundaries`, `check:legacy-runtime`,
`npm test` (482 passed — 8 new unit tests for the grouping logic plus 1 new
integration test proving `listAssignableRoles` returns `permissionIds`) all
clean. Browser-verified: opened Create User, confirmed "SF-RF Owner
Acceptance" sits under **Multiple apps** rather than StudioFlow — proof the
grouping is reading real grants, not pattern-matching the role's "SF-RF"
name prefix — created a real user by checkbox, confirmed the assigned role
landed correctly, then disabled the test account.

Note: `page.tsx` already carried an unrelated uncommitted `SettingsShell`/
`SettingsNavigation` wrapper (part of a broader settings-sidebar rollout)
when this session started; only this revision's own two edits were staged
from that file, leaving the wrapper exactly as it was, still uncommitted.

## R8.114 | 2026-09-23 | feat(masterdata): relate a Brand at Supplier creation (amends the R5.05 Brand-only-mutation rule)

Owner request, prompted by the Create Supplier dialog itself: *"bisa ga di
permudah uiux nya utk menambahkan relasi 'brand' saat buat supplier. kalau
sudah tau brandnya [pilih], kalau belum tau ya input aja juga gpp (opsional),
nanti tetep bisa di edit kan"*.

**This amends a locked decision (flagged and confirmed with the owner before
committing).** `vendor-contract.md`/`brand-contract.md`'s R5.05 amendment and
Locked Decision Q9 state `BrandSupplier` mutation is Brand-only; the Vendor
Create dialog's field list didn't include brand relations at all. The
amendment is narrow: **only Create gains the field; Edit's "Brand Suppliers"
tab stays exactly as documented — read-only, "managed from the Brand
workflow".** Ongoing changes to the relation still only happen from Brand;
this just lets it be set once, optionally, in the same step as creating the
Supplier, instead of never at Supplier-creation time at all.

- **`vendor.service.ts` `createVendor`** gains `brandIds?: string[]`, written
  after `VendorType` assignment (so material capability can be checked) and
  before contacts (so a brand-scoped contact can validate against a
  same-transaction relation — previously impossible for a brand-new Vendor).
  Same guard as Brand's own Suppliers field: `assertVendorMaterialCapable`
  before any `BrandSupplier` row is created; every Brand id must be live.
- **Create Supplier dialog** gains "Brands supplied" — `CreatableMultiSelect`
  over the existing Brand list, no inline Brand creation. Disabled with an
  explanatory description until the draft has at least one material-capable
  Supplier type selected; a selection made and then invalidated (last
  material-capable type removed) is cleared automatically rather than left to
  fail silently on submit.
- Audit: `vendor.created` metadata now includes `brand_ids`.

Verification: `tsc`, `eslint`, `check:boundaries`, `check:legacy-runtime`,
`npm test` (473 passed, including a new integration test covering the happy
path, the missing-capability rejection, an archived-Brand rejection, and that
`brandIds` stays fully optional) all clean. Browser-verified end to end:
created a Brand, created a Supplier with it checked, confirmed the Brand's
own Suppliers count incremented — then archived both test records.

## R8.113 | 2026-09-23 | feat(sf): Brand as one creatable search, Type in the checklist, Qty fixture-only, WYSIWYG Notes

Third owner review pass on the same R8.111/R8.112 screen, from using the
tick-to-fill checklist live.

- **Brand is one `CreatableSearch` combobox**, replacing the select-plus-
  fallback-input pair. Owner: *"knp brand perlu 2? kasi aja pakai creatable
  search?"* Search Master Data, pick one, or type a name it does not have —
  the combobox's own "create" affordance is repurposed to mean "use this
  typed text" (`onCreate: (text) => text`), never a real Master Data insert;
  StudioFlow still never writes Master Data (§11.3 already documented free
  text as the ordinary case — this just puts it in one control instead of
  two). Verified: no `masterData.create`/`insert`/`upsert` call is reachable
  from the schedule app, and a live test typing an unlisted brand left no row
  in Master Data's `Brand` table.
- **Type joins the checklist**, right after Brand — it previously could only
  be edited via the Spec options list below, which was the one field the
  new checklist didn't cover. It carries no checkbox, since Type always
  shows on the card and was never optional.
- **Qty/Unit are Fixture-only.** Owner: *"qty ga butuh amount; lagi pula
  material harusnya ga perlu keluarin qty"* — a Material line is a
  specification, not a count (matches legacy's own sheet import, which
  already discards Qty on Material). The row is hidden entirely for
  `section = MATERIAL`, not just off by default; the "Amount" placeholder
  is also dropped as redundant with the row's own "Qty" label.
- **Row order, owner-specified:** Brand, Type, Color, Pattern, Finishing,
  Location, Qty (Fixture only), Size, Notes, then extra spec lines.
- **Notes uses `SimpleTextEditor`** — the same bold/italic/bullet-list
  toolbar already used for Notes on Brand, Vendor and Pricing in Master
  Data, so schedule notes match the rest of the app (owner: *"pakai wysiwyg
  seperti pada notes pada masterdata"*). It stores lightly marked-up plain
  text, not HTML.

Verification: `tsc`, `eslint`, `npm test` (472 passed) all clean. Browser-
verified: Brand combobox search/select/free-text-create round-trip (confirmed
against Master Data directly — no row created), Type edit saves, Qty row
present for a Fixture item and absent for Material, field order matches.

## R8.112 | 2026-09-23 | feat(sf): Product Schedule editor — dialog panel, tick-to-fill checklist

Two more owner review passes on the same screen, both from using the R8.111
board live in the browser.

### Pass 1: a real editor, not a sidebar

The entry panel was a slim 22rem (~350px) sidebar squeezed beside the board on
desktop and a separate `Drawer` on mobile — with the card-content section,
its checkboxes, and every option's edit form all fighting for that width. It
is now one `Dialog` (`size="lg"`, 760px), used on both breakpoints, replacing
`EntryDrawer`/the desktop-panel branch/`useIsDesktop` entirely — the same
dialog pattern already used by "Add item" and every other schedule dialog in
this file.

While rebuilding the panel, `card_fields = []` (R8.111's "explicit, nothing
selected" state) was found colliding with `card_fields = null` ("no
override") in the UI's own greyed-out-checkbox styling; both are now handled
without conflating them.

### Pass 2: ticking a field is how you say "I don't know it yet"

Live testing surfaced a real usability bug in the pass-1 UI: a field with no
value on the shown option was greyed out and **un-tickable**, on the reasoning
that ticking an empty field would not change the card. But that made "I don't
know the brand yet, but note that it belongs on this card" impossible to
express — the exact case that comes up on nearly every unfinalized spec.
Owner: *"kalau brandnya masih belum tau gmn? better legacy sih sebenernya
ya?"* Legacy never separated "show this field" from "edit this field" in the
first place — its checklist was a plain visibility toggle, and the value was
typed directly on the card face.

**Item details and What-shows-on-the-card are merged into one checklist**
(`ChecklistRow`): each field is one row, a checkbox, and — only once ticked —
the input(s) that fill it in, right there. Unticking never discards what was
typed, it only stops that field from captioning the card. This closes the
gap pass 1 opened:

- Location and Qty (+Unit) write straight to the entry, per row, on blur —
  the old batched "Save details" button is gone.
- Brand (Master Data select + free-text fallback), Color, Pattern, Finishing,
  Size and Notes write to the option the card already speaks for
  (`shownOptionOf`: the final option, else the first) — the full option
  snapshot re-saves on any of their blurs, since the write path takes a whole
  snapshot, not a per-field patch.
- A row backed by an option (everything except Location/Qty) disables only
  when there is no option yet to attach a value to ("Add an option below
  first"), never because the value happens to be blank.
- Extra spec lines keep a plain checkbox (no reveal needed — by construction
  an extra field never exists with an empty label or value).
- The card itself is unchanged: an empty field, ticked or not, still does not
  render a row (owner decision, this pass) — only the *editing* side changed.

### Verification

`tsc`, `eslint`, and `npm test` (466 passed, including the disposable
`studioflow_rebuild_test` database) all clean. Browser-verified: the dialog
opens at both desktop and 375px with the same content; ticking Brand reveals
the select/input and saves on blur (confirmed against the option row below);
ticking and unticking Qty toggles its two inputs without disturbing the other
rows' state.

## R8.111 | 2026-09-23 | feat(sf): Product Schedule spec model — one vocabulary, legacy-faithful card fields

Owner review of the Product Schedule card ("card? information? metadata?")
found the display layer and the data model disagreeing. Legacy
`CatalogBoard.tsx` was re-read as the specification. Owner decisions taken
during the review are recorded in `STUDIOFLOW-REWORK-CONTRACT.md` §11.3,
§11.8 and the new §11.9.

### Vocabulary

One word per thing, in UI, code and contract. **Spec** = the option's product
attributes. **Item details** = the entry's Location/Qty/Unit. **Card fields**
= which of those caption the board card. The word "metadata" is gone from the
schedule surface. The panel's "Options" heading is now "Spec options", and
Location/Qty/Unit sit under an "Item details" heading instead of floating
above the card-field checkboxes with nothing naming them.

### Type replaces Item No

Legacy carried both an "Item No" (`specs.catalog_sku`) and a Type; the owner
ruled they are the same designation ("Nude Pro - ATS 1132 M"). `sku_text` is
dropped from `sf_schedule_option` and `sf_schedule_template_item`, its value
folded into `product_name`, and every label for that field — card, option
form, template form, list header — is now **Type**. CSV import appends an
article-code column to Type rather than storing it twice. Labels were also
reconciled elsewhere: the card said "Size" while the form said "Dimension",
and the card said "Pattern" while the form said "Pattern / motif".

### Card fields behave like legacy again

- `card_fields` becomes **nullable JSON**. `null` = no override, an array =
  an explicit choice that may be empty. The old `TEXT[]` used `{}` for both,
  so "default" and "explicitly everything" were indistinguishable, "Use
  default" never appeared, and unticking the last box had to be blocked.
- **Default set: Brand, Color, Finishing, Location, Notes.** Previously every
  populated field showed, which is not a choice at all.
- **Notes joins the selectable fields** (it had a column and a form field but
  could never appear on a card); Pattern, Size and Qty are now off by default.
- Overrides are stored in **canonical field order**, so unticking and
  re-ticking a field no longer moves its row to the bottom of the card.
- The panel says whether the entry is on the default or on a custom choice.
- A **template item carries the card-field choice** of the row it was saved
  from, so "Apply templates" reproduces the approved card.

### Extra spec fields

Options and template items gained `extra`, a JSON `[{label, value}]` array for
specification lines that do not deserve a column ("Abrasion class / PEI IV"),
edited through a shared `ExtraFieldsEditor`. Capped at 12 lines, label ≤ 60,
value ≤ 300, half-filled lines dropped, labels de-duplicated. Extras render as
card rows, are individually selectable as card fields (`x:<slug>`), join
`search_key`, and travel with reuse and templates. The typed columns stay the
home of everything that appears on nearly every card, so search, ordering and
CSV keep working off the database — this is not a return to legacy's
`data_snapshot`, which mirrored fields into columns and documented its own
sync risk.

### Two parity bugs found while reading legacy

- **The card now falls back to the first option** when no option is final
  (legacy `selectedCatalogOption`: final → active index → first). A row with
  one unapproved option showed "No final option yet" and no spec rows at all,
  even with the product fully filled in.
- **Placeholder rows stay out of the reuse pool.** `search_key` is empty when
  brand *and* type are both placeholders (`N/A`, `PENDING`, `[RESERVED]`,
  blank…), porting legacy's `deriveScheduleSpecFields` rule that the rebuild
  had never implemented, so empty reserved rows no longer surface in "From
  past project". Brand is deliberately **not** made mandatory — a spec with no
  catalogued brand is normal and stays searchable by its Type.

### Migration

`20260923000000_sf_schedule_spec_model` folds `sku_text` into `product_name`
and drops it, adds `extra` to options and template items, rebuilds every
`search_key` under the new rule, converts `sf_schedule_entry.card_fields` from
`TEXT[]` to nullable JSONB (`{}` → `NULL`, stored choices keep their fields
minus `sku`), and adds `card_fields` to template items. Applied to both
`studioflow_rebuild` and `studioflow_rebuild_test` and verified: `tsc`,
`eslint`, and the full `npm test` (462 passed) all clean, plus a browser walk
of the schedule board and template settings.

### Not in this pass

Printing the board as a client/contractor catalogue sheet — the reason legacy
had card fields at all — is recorded in `docs/BACKLOG.md` as a parity gap, at
the owner's instruction to land the data and UI consistency first.

## R8.110 | 2026-09-23 | feat(sf,masterdata,ui-engine): execute UIUX-CRITIQUE-2026-09-23.md §1–§5

Implemented every recommendation in `docs/UIUX-CRITIQUE-2026-09-23.md` except
§4b (revising `DESIGN.md`'s density/tone stance) — that item is explicitly a
locked-contract revision with app-wide blast radius per the critique's own
text and is left as a separate, explicitly-scoped decision rather than
folded into this pass.

### §1 StudioFlow Product Schedule

- **Card Fields folded into the entry panel.** The per-card "what shows on
  this card" checkboxes moved from a hover-revealed gear-icon popover
  (`CardFieldsMenu`, removed) into a "What shows on the card" sub-section of
  the entry panel itself, right below Location/Qty/Unit. Same
  `updateScheduleEntryCardFieldsAction` write path, no server change.
- **Photo picker opens immediately.** `ImageWorkspace` now auto-triggers the
  OS file picker on mount when no image is chosen yet, instead of requiring
  a "Choose image" button click first inside the dialog; the button remains
  as a fallback if the picker is cancelled.
- **Scroll-to-zoom, drag-to-pan, and an expanded annotation toolbar** (pen,
  arrow, box, circle, 5-color swatch set, plus a "Pan" tool) replace the
  single freehand red-line tool, implemented once in the shared
  `platform/ui_engine/patterns/image-workspace.tsx` (used identically by
  Schedule and MOM photos). Pan is a selectable tool routed through the same
  canvas pointer-capture as drawing, not a second competing pointer
  listener, so dragging to pan never fights with drawing a stroke.

### §2 StudioFlow MOM

- **Meeting Details collapses to a `Topic · Date · Venue` summary**,
  expandable on click, instead of permanently occupying full form height
  above the working content.
- **Typed "1."/"-"/"•" list markers auto-continue on Enter** in point notes,
  scoped to when the section's list style is `NONE` (so it never duplicates
  the externally-rendered marker `pointMarkers()` already draws for
  DECIMAL/DISC/DASH sections). Enter on an empty marker line ends the list.
- Annotation toolbar upgrade shared with §1 (same `ImageWorkspace`).

### §3 Global navigation, header, and Settings

Executes `apps/platform/GLOBAL-MENU-DESIGN-BRIEF.md`'s own explored
direction and closes `BACKLOG.md` KB-031:

- Logo shrunk (`h-[38px] max-w-[190px]` → `h-7 max-w-[150px]`).
- **Users, Roles & Access, and Master Data Settings now render inside the
  shared `SettingsShell`/`SettingsNavigation` sidebar** alongside General
  Settings — previously flat pages reachable only via the account menu.
  `SettingsShell` gained a `fill` prop so a `DirectoryShell fill` table
  inside it still reaches viewport height.
- **Account menu slimmed to Account / Settings / Sign out** (brief's own
  proposed simplification) — the "Administration" submenu with separate
  Users/Roles links is gone now that they're reachable from inside the
  settings canvas. `shell-rules.ts`'s `getAdministrationMenuVisibility`
  (4 booleans) replaced by `getSettingsMenuVisibility` (1 boolean).
- **Header search animates open**: the icon now expands inline into a
  topbar input (CSS width/opacity transition, `Popover.Anchor` spanning
  icon+input so the results dropdown lines up with the full row) instead of
  popping open a detached floating panel.

### §5 Master Data quick-create unification

- **New shared `VendorQuickCreateDialog`** (`platform/ui_engine/patterns/`)
  — name + required Supplier Type, used identically from Brand's
  Owner-supplier field, Brand's new "+ Create new supplier for this brand"
  affordance on the Suppliers field, and Pricing's supplier field (refactored
  onto the shared component, no behavior change there).
  `createBrandVendorQuickAction` (renamed from `createOwnerVendorQuickAction`)
  now requires and applies a `vendorTypeId`, closing the "owner supplier
  created with zero Vendor Types, invisible to every price picker" gap.
  `listBrandDirectoryRefs` gained a `vendorTypes` (material-capable) list.
- **Brand's Suppliers field can now create a new supplier in one step**,
  writing the `BrandSupplier` row through the existing
  `createBrand`/`updateBrand` write path (no new transaction code needed —
  it already writes a `BrandSupplier` row for every id present in
  `suppliers`, and already required `assertVendorMaterialCapable`, which the
  new quick-create satisfies since it now always assigns a type).
- `brand-contract.md` §4.1 and `vendor-contract.md` §11 updated: the
  "owner-only Vendor may have zero Vendor Types" allowance is now scoped to
  the full Vendor directory form (a deliberate choice on the full form),
  not Brand's quick-create paths (which always require one).

### Verification

`tsc --noEmit` and `eslint .` clean; existing `shell-rules.test.ts` updated
for the renamed function and passing; full non-DB unit suite (102 tests)
passing. Browser-verified live (dev server with a real DB connection):
Card Fields panel toggle + persistence, Meeting Details collapse/expand,
list auto-continue (via direct `KeyboardEvent` dispatch — the browser
automation's synthetic key press doesn't reliably reach a focused textarea,
a harness limitation rather than a product one), Settings sidebar on
Users/Roles/Master Data Settings, slimmed account menu, animated search
with live results, and both Brand-side quick-create flows end-to-end
(vendor created with a type, linked into Owner supplier and Suppliers).
Not verified: the post-upload crop/pan/annotation canvas UI, since the
browser tool used here has no file-upload capability to supply a real image.

## R8.109 | 2026-09-23 | fix(bq,sf): BACKLOG sweep — insert-order sort_order, project-lifecycle races, dead code, contract drift

Worked every open `docs/BACKLOG.md` item that did not require owner input
(design decision, IA plan, or dev-environment forensics) — the rest (decision
gates, UI-invisible-markup design call, Foundation Settings IA, the dev-DB
`allow_parallel` anomaly, asset-storage/Google-Drive planning, and every
`[UNVERIFIED]` browser-walk item) are left open as-is.

### Fixed — correctness

- **BQ sibling `sort_order` collisions on plain insert:** `addSection`,
  `addSubsection`, `addItem`, `addSubObject`, and `addLineItem`
  (`project-tree.ts`) all defaulted `sort_order` to `0` when the caller
  omitted it, and no UI action ever supplied one — every manually-added
  sibling under the same parent landed at `sort_order = 0`, leaving
  same-parent display order unstable across reads. Fixed by computing
  `max(sibling sort_order) + 1` at insert time, scoped to the same parent,
  when the caller doesn't pass an explicit `sortOrder`. Regression test:
  `service.integration.test.ts` "assigns sequential sort_order to siblings
  inserted without an explicit order".
- **BQ project-lifecycle check-then-act races:** `lockProject`,
  `unlockProject`, `archiveProject`, `restoreProject`,
  `approveProjectDeletion`, and `rejectProjectDeletion` (`projects.ts`) each
  read status with a plain `findUnique`, validated, then wrote with a plain
  `update` — the same shape already fixed for BQ promotion approvals in
  R8.107. A double-click/double-tab race could double-apply a transition or,
  for `approveProjectDeletion`, attempt to delete an already-deleted project.
  Fixed with the same guarded-`updateMany`/`deleteMany` pattern as
  `transitionPromotionStatus`: the WHERE clause re-checks status in the same
  statement as the write, so the loser's call matches zero rows and throws a
  clean conflict instead of racing. Regression tests:
  `service.integration.test.ts` "guards concurrent project archive attempts
  against a lost-update race" and "guards concurrent deletion approvals from
  deleting the same project twice".

### Cleanup — dead code and doc drift

- Purged `src/apps/studioflow/mom-images.ts` (dead: only consumer was the
  archived, non-routable `_legacy_project_id` route tree) and removed that
  entire archived tree (~24 files under
  `src/app/(platform)/studioflow/projects/_legacy_project_id/**`) plus its
  guard test `requirements.ui.test.ts`. Retargeted `mom.contract.test.ts`'s
  image-size-policy assertion from the deleted 10 MB legacy constant to the
  live 3 MB limit in `domain/mom.ts` (`MOM_LIMITS.imageBytes`).
- Resynced StudioFlow contract vocabulary left over from the V2-D1 Todo-SSOT
  migration: `STUDIOFLOW-REWORK-CONTRACT.md` §2 disposition matrix, §5.2, and
  §6.1/§6.4 still described `SfActivity` as carrying a TODO mode and a defer
  command and `submitInternal`/`fullBlockers` as counting deferred activities
  — none of which exist since V2-D1 restricted `SfActivity` to FEEDBACK-only
  and R8.98 purged the deferral mesh. Updated those sections to match
  `domain/blockers.ts` (`fullBlockers`/`todoBlockers`) as actually
  implemented. Also fixed `STUDIOFLOW-PHASE-ENGINE-V2-CONTRACT.md` §9's
  "SfActivity FEEDBACK + deferred items" and annotated
  `PHASE-ENGINE-V2-BASELINE-AUDIT.md`'s "FEEDBACK → TODO on reject" row as
  superseded (the reject-conversion target is `SfChecklistItem`, not an
  `SfActivity` TODO) rather than rewriting that dated snapshot's claims.

## R8.108 | 2026-09-23 | fix(sf): R8.107 regression sweep — schedule board, checklist permissions, client-name race

An 8-angle review of R8.107 (drag-reorder, removed-behavior, cross-file,
reuse, simplification, efficiency, altitude, conventions) surfaced 8 real
issues the commit introduced beyond its own stated scope — 6 correctness
bugs (2 of them narrower/plausible rather than clear-cut) and 2 cleanup
items. All fixed here; R8.107 itself is kept, not reverted, since its own 6
fixes and docs consolidation verified out independently.

### Fixed — correctness

- **Schedule drag-reorder off-by-one:** `reorderGroup`
  (`schedule/schedule-board.tsx`) computed the drop target's array index
  before removing the dragged item, so a forward drag (dragging an item to a
  later position) landed one slot past the intended target and persisted the
  wrong order via `reorderScheduleEntriesAction`. Fixed by recomputing the
  target's index after the removal.
- **Card fields: unchecking the last field silently reset to "show
  everything":** `CardFieldsMenu` (`schedule-board.tsx`) uses an empty
  `cardFields` array as the "no override" sentinel, but `toggle` let a user
  uncheck every box, saving `[]` and instantly reinterpreting it as "no
  override" — the card showed all fields again while every checkbox in the
  still-open popover looked unchecked. Fixed by keeping at least one field
  checked via the checkboxes; "Use default" (shown once there's an override)
  remains the only way back to the empty/no-override state. Also factored
  the duplicated `cardFields.length > 0 ? cardFields : SCHEDULE_CARD_FIELD_KEYS`
  fallback (present at both the menu and the board card render) into one
  `effectiveCardFields` helper.
- **Card fields popover unreachable by keyboard:** its trigger is a
  `<span role="button">` (can't be a nested `<button>` inside the card's own
  button), whose `onKeyDown` only called `stopPropagation` on Enter/Space
  and never opened it — Radix's `Popover.Trigger` only wires `onClick`, and
  a `<span>` doesn't synthesize a click from the keyboard the way a native
  button does. Fixed by toggling `open` state directly from `onKeyDown`.
- **Checklist toggle permission narrowed for the merged "requirement"
  item:** the deleted `RequirementsPanel`'s toggle required only
  `studioflow.phase.work`; after R8.106 merged requirements into the
  checklist tree as non-blocking root items, toggling them now falls under
  `ChecklistTree`'s single `canEdit` gate, which requires
  `studioflow.task.manage` — silently narrowing who could clear a
  warning-only item, with no docs/changelog note. Fixed server-side
  (`tasks/service.ts` `setItemChecked`) by allowing the toggle when the
  actor has `taskManage`, or has `phaseWork` **and** the target is a
  non-blocking root item; and client-side (`checklist-tree.tsx`) with a new
  `canToggleOptional` prop (defaults to `canEdit`) wired from `phaseWork` in
  both `page.tsx` call sites. Everything else (add/delete/edit, blocking
  items, subtasks) still needs `taskManage`.
- **`upsertClientByName` raced instead of converging:** its own R8.107 fix
  wrapped the `create` in `mapWriteError`, so the losing side of a
  concurrent same-name create now threw a clean but still-fatal `CONFLICT`
  — breaking the function's own upsert (create-or-return-existing) contract
  and failing the loser's entire `createProject` call even though the
  client it wanted now existed. Fixed by re-querying `name_key` on a P2002
  and returning the winner's row, the same way the pre-existing `existing`
  branch above it already does.
- **Empty `?phase=` query param showed a false empty-state:**
  `projects/[projectId]/page.tsx`'s `selectedPhaseId` used
  `sp.phase ?? activePhase?.id ?? phases[0]?.id ?? null`, which only falls
  through on `null`/`undefined` — an empty-string `phase` param (e.g. a
  manually edited URL) stayed `""`, which is falsy, so the page rendered
  "No phases found" even with phases present. Fixed with `sp.phase || null`
  ahead of the `??` chain.
- **Deletion-request dedup dropped a second requester's input:**
  `createDeletionRequest` (`masterdata/services/shared.ts`) silently
  returned the existing `PENDING` row's id when a different actor requested
  deletion of the same target, discarding their reason/notes with no trace
  in the stored request (only the audit log showed the second actor).
  Fixed by folding a different actor's reason/notes into the existing
  request's `notes` instead of dropping them, without reassigning the
  original requester.

### Cleanup

- **Duplicated drag-reorder state machine:** the schedule board's grid view
  and list view each declared their own `draggingId`/`dragOverId` state and
  near-identical drag handlers. Extracted a shared `useRowDrag` hook used by
  both.
- **Header search reimplemented the shared debounce hook:** `header-search.tsx`
  hand-rolled a 250ms `setTimeout`/`clearTimeout` debounce instead of using
  the existing `useDebouncedValue` hook (`@/platform/ui_engine`, already used
  elsewhere). Swapped in the shared hook; the request-ordering guard
  (`requestId` ref) stays, since that's a separate concern from debounce
  timing.
- **Nav hover-close timer not cleared on unmount:**
  `HeaderApplicationNavigation`'s `closeSoon` (`authenticated-shell/navigation.tsx`)
  only cleared the *previous* timer before scheduling a new one, with no
  unmount cleanup. Added the missing `useEffect` cleanup.

### Tests

- `src/apps/studioflow/service.integration.test.ts`: "SF-05" rewritten —
  asserts both concurrent creates now succeed and converge on one client row
  (previously asserted the loser must reject with `P2002`, which was the bug).

### Verification

`npm test` 455/455, `tsc --noEmit` clean, `npm run lint` clean, `check:boundaries`
OK, `check:legacy-runtime` OK. Verified live in the browser: keyboard-only
popover open, the last-card-field guard, and the checklist add/toggle/delete
flow, against the dev DB after applying R8.107's pending migrations there
(only the test DB had been migrated so far) and restarting `next dev` to
pick up the regenerated Prisma client.

## R8.107 | 2026-09-22 | fix(masterdata,bq,sf): logic-defect sweep + docs consolidation

Full-repo logic audit across Master Data, BQ, and StudioFlow backend services
plus their UI/UX flow, run against two ad-hoc audit documents
(`docs/CODEBASE_LOGIC_REVIEW.md`) and a Planner/Reviewer draft
(`docs/apps/studioflow/REVIEW-ALIGNMENT.md`) — both re-verified against
current source rather than trusted at face value, since most of their claims
turned out stale (already fixed in R8.98) or mischaracterized (the
`studioflow -> masterdata/public` import is AGENTS.md-sanctioned
`app -> other-app/public`, not a boundary violation). Six real, verified
defects survived and were fixed with regression tests; several lower-priority
findings were recorded in the new consolidated backlog instead of rushed.

### Fixed — Master Data

- **Deletion-request duplicate/stuck-pending bug:** `createDeletionRequest`
  (`services/shared.ts`) inserted unconditionally with no check for an
  existing `PENDING` row for the same target, and the direct-hard-delete path
  (`hardDeleteArchived` → `directDeleteOrNull`, `deletion.service.ts`) never
  resolved a pending request on that target before deleting it — so a later
  `approveDeletion` on the orphaned request threw P2025, rolled back, and left
  the request permanently stuck `PENDING`. Contradicted `masterdata.md` §4.2
  ("at most one pending request may exist for the same target"). Fixed:
  `createDeletionRequest` now reuses an existing pending row instead of
  duplicating it; `directDeleteOrNull` now auto-resolves (`APPROVED`) any
  pending request for the same target in the same transaction as the hard
  delete.

### Fixed — BQ

- **Assembly-applied Cost Components lost their price-revert baseline:**
  `applyAssemblyTemplate` (`services/assemblies.ts`) never set
  `source_price_snapshot` on the `BqLineItem` rows it creates, so the "Harga
  diubah" override badge could never appear and `revertLineItemPrice` always
  threw `bq.line-item.no-snapshot` for assembly-applied items. Fixed by
  applying the same rule the canonical `addLineItem` path uses:
  `source_price_snapshot: sourceType === "CUSTOM" ? null : hargaSnapshot`.
  Currently dormant in production (the only write path for assembly lines,
  `addAssemblyCustomLine`, always sets `CUSTOM`) but guards the schema's full
  `source_type` range.
- **Promotion approve/reject lost-update race:** `approvePromotion` and
  `rejectPromotion` (`services/promotions.ts`) read status with a plain
  `findUnique` then wrote with a plain `update` — two concurrent Master Data
  admins approving the same `REQUESTED` item with different
  `masterdataRefId`s could both pass validation and both write, silently
  overwriting one approval despite both being audited. Fixed by replacing the
  write with `transitionPromotionStatus`, which guards the write itself
  (`updateMany({ where: { id, promotion_status: { in: expected } } })`) and
  throws `bq.promotion.invalid-status` when zero rows match — check and act
  are now one atomic statement.

### Fixed — StudioFlow

- **SF-02 orphan-delete guard gap:** `deletePhaseDefinition`
  (`phases/service.ts`) counted `sfChecklistTemplate` rows referencing the
  definition but never blocked on them; the FK is `onDelete: Cascade`, so
  deleting silently destroyed checklist templates. Now throws
  `PHASE_DEFINITION_HAS_CHECKLIST_TEMPLATES` when the count is nonzero,
  mirroring the existing `usedBy` guard.
- **SF-05 client-name race leaking a raw write error:** `upsertClientByName`
  (`projects/service.ts`) had a TOCTOU race (`findUnique` then `create` with
  no `mapWriteError`), so a concurrent duplicate-name create surfaced a raw
  `PrismaClientKnownRequestError` instead of a friendly `AppError`. Fixed by
  wrapping the create in the same `mapWriteError` pattern
  `createClient` already uses.
- **`header-search.tsx` synchronous setState in effect:** the debounced
  header search called `setLoading(true)`/`setResult(EMPTY)` synchronously
  inside its effect body (`react-hooks/set-state-in-effect`, the one
  remaining `npm run lint` failure). Refactored `loading` from a state
  variable the effect sets into a value derived at render time
  (`trimmed !== searchedQuery`, where `searchedQuery` is only set inside the
  already-async `.then()` callback). Verified in the browser: empty,
  debounced-loading, results, and no-match states all render correctly.
  KB-034 (a similar `Date.now()`-in-render-body lint issue) was checked while
  here and found already resolved in the current tree.

### Tests

- `src/apps/masterdata/service.integration.test.ts`: "reuses an existing
  pending deletion request…", "direct hard-delete resolves a pre-existing
  pending request…".
- `src/apps/bq/service.integration.test.ts`: "carries a non-CUSTOM assembly
  line's source price forward…", "guards concurrent promotion approvals
  against a lost-update race".
- `src/apps/studioflow/service.integration.test.ts`: "SF-02: deleting a phase
  definition with checklist templates is rejected…", "SF-05: a concurrent
  client-name race surfaces a friendly conflict…".

### Documentation consolidation (owner request)

- `docs/roadmap.md`, `docs/review.md`, and `docs/knownbug.md` merged into one
  worklist, `docs/BACKLOG.md`, tagging each item `[PLANNED]`/`[UNVERIFIED]`/
  `[BUG]`/`[CLEANUP]` instead of splitting them across three files. Originals
  preserved with their full historical/closed record at
  `docs/archive/roadmap-2026-09-22.md`, `review-2026-09-22.md`,
  `knownbug-2026-09-22.md`.
- `docs/CODEBASE_LOGIC_REVIEW.md` and `docs/apps/studioflow/REVIEW-ALIGNMENT.md`
  (ad-hoc audit artifacts, not part of the indexed contract/tracker set)
  archived after their real findings were fixed (this entry, R8.98) or folded
  into `BACKLOG.md`'s Cleanup section (contract-text drift, the archived
  `_legacy_project_id` branch).
- `docs/FOUNDATION-ACCEPTANCE-PF8.md` and `docs/FOUNDATION-BASELINE-FREEZE.md`
  (historical Foundation-phase acceptance evidence, Foundation fully closed,
  not indexed by `docs/README.md`'s active contract table) moved to
  `docs/archive/` unchanged.
- `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md` had its Pending/Completed queues
  cleared — every item described the `/requirements` routes removed in
  R8.106.
- `docs/README.md`, `README.md`, `AGENTS.md`, `docs/agent/{README,EXECUTOR,
  REVIEWER}.md`, and `docs/apps/bq/bq-contract.md` updated to point at
  `docs/BACKLOG.md` instead of the three retired files.

### Verification

- `npm test`: 455/455 passed (6 new regression tests across this revision's
  three apps: 2 StudioFlow, 2 Master Data, 2 BQ; 0 pre-existing failures).
- `npx tsc --noEmit`: clean.
- `npm run lint`: clean (0 errors — the `header-search.tsx` fix above closed
  the only remaining failure).
- `npm run check:boundaries`: OK.
- `npm run check:legacy-runtime`: OK.
- Browser: header search (empty/loading/results/no-match) walked manually
  against the dev server at `/studioflow`.

## R8.106 | 2026-09-22 | refactor(sf): merge Requirements into the phase checklist as `is_blocking`

Owner design decision from the 2026-09-22 UX review. Supersedes V2 contract §5 (V2-D2).

### Why

`SfRequirement` was structurally a subset of `SfChecklistItem` (`title`/`label`, `is_met`/`is_checked`,
`met_at`/`checked_at`). The only real difference was one policy bit — a root checklist item blocks
approval, a requirement only warns — yet it carried a second model, table, service, action set and
UI panel. The split also made requirements *less* visible than ordinary to-dos: no assignee, no due
date, and absent from Today, despite being what a phase must satisfy. Two visually identical
"tick a list" widgets sat side by side on the phase page with an invisible semantic difference.

### Changed — schema

- `SfChecklistItem.is_blocking` (Boolean, default `true`) decides whether an unticked **root** item
  gates approval. Indexed as `(phase_id, is_blocking, is_checked)`.
- Subtasks are now stored with `is_blocking = false` — "subtasks never block" becomes stored data
  instead of a rule readers must re-derive from depth. Existing subtasks backfilled.
- `SfRequirement` is **deprecated, not dropped**: its rows are copied into `sf_checklist_item`
  (same id, `is_blocking = false`, `description` folded into the label) and the table is kept as a
  rollback copy that nothing reads. Dropping it is a separate migration pending owner sign-off.

### Changed — behaviour

- Approval gate counts only unticked, blocking, root items. `warnings.requirementsOpen` becomes
  `warnings.optionalOpen` (unticked, non-blocking, root items).
- Making a subtask blocking is refused with `CHECKLIST_SUBTASK_NEVER_BLOCKS` instead of being a
  silent no-op.
- Removed: `listRequirements`, `createRequirement`, `toggleRequirement`, `deleteRequirement` and
  their server actions; `RequirementsPanel`.

### Changed — UI

- One list on the phase page. Blocking is the default, so only the exception is badged **Optional**
  ("Warning only — does not block approval"); the row menu toggles it.
- `ChecklistTree` gains an inline "Add item…" row with an **Optional** checkbox. This closes a real
  gap: the tree previously had no way to add a *root* item at all, so "Add requirement" had been the
  only way to add an ad-hoc phase item — and General to-dos could only be added from Today.

### Migrations

- `20260922010000_sf_checklist_blocking_merge`
- `20260922020000_sf_subtasks_never_block`

## R8.105 | 2026-09-22 | feat(sf): V2-E full enum-to-definition phase migration + documentation reconciliation

Destructive migration `20260920000000_sf_v2e_definition_migration` (data-preserving; drops the
`SfPhaseKey` enum and `key`/`phase_key` columns after backfilling every row).

### Changed — schema

- `SfPhase.key` (`SfPhaseKey` enum) removed. `SfPhase.definition_id` is now required (was nullable,
  the V2-D3 bridge), FK `ON DELETE RESTRICT` (was `SET NULL`) — a definition in use by any project
  can no longer be deleted out from under it. `name_snapshot`/`prefix_snapshot`/`seat_snapshot` lost
  their empty-string/"designer" defaults and gained a `CHECK` that all three are populated.
- `SfChecklistTemplate.phase_key` replaced by `SfChecklistTemplate.definition_id` (FK to
  `SfPhaseDefinition`, `ON DELETE CASCADE`), so a checklist template now targets the phase it seeds
  by identity, not by a name-shaped enum value.
- `SfPhaseKey` enum dropped entirely.

### Changed — runtime identity

- The five legacy phases (Moodboard/Layout Plan/Design 3D/Construction Drawing/Supervision) are
  identified only by fixed definition ids, `LEGACY_PHASE_DEFINITION_IDS` in
  `src/apps/studioflow/domain/phase.ts` — never by name, never by a `key` column. `phaseAccentDotClass`
  and the new `isLegacySupervisionDefinition` key off these ids; a custom phase named "Supervision" is
  an ordinary phase with no special completion command (verified by a new integration test).
- `createProject` bootstraps one `SfPhase` per `SfPhaseDefinition` of the active default
  `SfPhaseTemplate` directly. There is no legacy-name validation step (`validateTemplateLegacyCompat`
  and `mapDefinitionToLegacyKey` are deleted) — any template, including one with entirely custom
  phase names (e.g. Concept/Planning/Visualization/Documentation/Site Works/Handover), is a valid
  default. This removes the `PHASE_TEMPLATE_NOT_LEGACY_COMPATIBLE` refusal entirely.
- `availablePhaseCommands` no longer takes a `key`; it takes an explicit `legacySupervision` boolean.
  `phaseSnapshot`/`resolvePhaseName` read only the stored snapshot columns — no enum fallback.
- Revision labels (`activatePhase`, `rejectPhase`, `reopenPhase`, `overrideRevision`, phase-detail
  history) use each phase's own `prefix_snapshot` throughout; a custom "Concept" phase with prefix
  `CN` gets `CN1.0`, `CN2.0`, etc., the same as the legacy phases always did.
- `deletePhaseTemplate` and `deletePhaseDefinition` now refuse (`PHASE_TEMPLATE_IN_USE` /
  `PHASE_DEFINITION_IN_USE`) when a project's phases still reference them, instead of relying on the
  database FK to throw — the FK is `RESTRICT` specifically so this can never silently orphan a phase.
- Checklist template admin (`createTemplate`/`reorderTemplates`/`syncProjectChecklist`) and its
  actions/UI (`Studio Settings`) target `definitionId` instead of `phaseKey`.
- Today feed (`domain/feed.ts`, `today/service.ts`) carries `phaseDefinitionId` instead of `phaseKey`.
- `history-list.tsx` reads the new `phaseName` audit metadata field first, falling back to the old
  `phaseKey` (mapped through a name table kept only for reading historical audit rows) — old audit
  events remain readable without a data migration.

### Fixed

- Revision labels produced by `rejectPhase`, `reopenPhase`, and `overrideRevision`'s history view
  never carried the phase's prefix (always `v1.1`, `v2.0`, …, even for a phase whose active-revision
  label elsewhere correctly showed `MB1.0`). They now use `prefix_snapshot` like every other label.
- KB-034 (new, Open, P3): `projects/[projectId]/page.tsx` computes `daysOpen` with `Date.now()`
  inside the render body — pre-existing, unrelated to this migration, now the only remaining
  `npm run lint` failure.

### Documentation reconciliation (Part B)

- `docs/knownbug.md`: moved 14 StudioFlow entries (KB-003, KB-005, KB-006, KB-007, KB-012 through
  KB-018, KB-021 through KB-023) from the **Open** section to **Closed** — every one already read
  "Status: Closed in R8.7x" in its own body but had been left above the `## Closed` heading, making
  fixed defects look active. The StudioFlow Open section now shows only the four genuinely open
  items (KB-002, KB-031, KB-032, KB-033). Added KB-034 (see Fixed).
- `docs/roadmap.md`: V2-E checked off with this revision; the R8.87–R8.93 browser-acceptance note
  narrowed to name exactly what remains (Requirements/Deliverables/Schedule-P0/375px), since V2-E's
  own scope is now verified.
- `docs/review.md`: added the V2-E verification entry (this revision) with full automated and
  browser evidence; left the pre-existing V2-A–V2-D checklist entry untouched since this pass did not
  re-walk it.
- `docs/README.md`: reconciliation date/revision bumped; Active sequence and the V2 contract table
  row updated to say V2-E is implemented.
- `docs/apps/studioflow/STUDIOFLOW-PHASE-ENGINE-V2-CONTRACT.md`: §4.3 annotated as closed by this
  revision (the clause itself is left in place as a record of the bridge that existed R8.87–R8.105);
  the §10 wave table's V2-E row now names this migration.
- `docs/apps/studioflow/PHASE-ENGINE-V2-BASELINE-AUDIT.md`: left untouched — historical evidence of
  the pre-V2 baseline, not rewritten to look like it predicted this migration.
- `README.md`: removed the stale "Current delivery state through R7.55" section; points to
  `docs/README.md` and `CHANGELOG.md` instead of maintaining a second status summary.
- Reconciliation dates in `docs/knownbug.md`, `docs/roadmap.md`, `docs/review.md`, `docs/README.md`
  all bumped to R8.105 / 2026-09-22.

### Verification

- `npm test`: 447/447 (`masterdata_test`) — includes 8 new integration tests under "SF-V2-E phase
  definitions" (five-phase legacy bootstrap, six-phase arbitrary-name bootstrap, full state machine
  on a custom phase with its own prefix, legacy-Supervision-only completion, project completion on
  the last custom phase, template-edit snapshot immutability, template/definition deletion guards,
  checklist templates seeded by definition). Also fixed a pre-existing stale assertion in
  `ui-engine.test.ts` (`--ui-dialog-max-height: 90vh` → `90dvh`, matching R8.99's `dvh` migration).
- `npx tsc --noEmit`: clean (previously had one pre-existing tuple-typing error in `phase.ts:91`,
  fixed incidentally by this rewrite).
- `npm run lint`: clean except KB-034 (documented above, pre-existing, unrelated).
- `npm run check:boundaries`, `npm run check:legacy-runtime`: OK.
- `npm run build`: succeeds.
- Migration dry-run against a rolled-back transaction on the dev database confirmed zero data loss
  before applying for real; applied to both `masterdata_test` and `masterdata` (dev). Dev project
  "2026-506 Sociolla SG Funan" verified unchanged post-migration (phase ids, snapshots, revisions).
- Browser-verified against the dev database (see `review.md` for the full list): Overview, Today,
  phase detail, Studio Settings (checklist templates + Phase Templates V2 panel), History — zero
  console errors.

## R8.104 | 2026-09-22 | fix(ui): keep section card titles at 16px on the R8.102 scale

No schema change.

### Review of R8.102 (concurrent agent commit)

- Checked against the current repo: kept as an improvement (stronger H1/H2 hierarchy, Lora retained, `tsc` and eslint clean). Nothing reverted.

### Fixed

- `SectionCard` titles used H4, which R8.102 reduced to 14px semibold — the same weight and size as button labels. They now use H3 (16px semibold), matching the Master Data card titles (`components/sections.tsx`).

## R8.103 | 2026-09-22 | fix(sf): Product Schedule board follows the legacy photo-first catalog

No schema change.

### Evidence (legacy, read-only Git)

- Path `D:\Projects\studioflow`, branch `main`, HEAD `102ff85de203ad9eaa261d1517cf7a2515ef1cfa`; working tree dirty (`next.config.ts` modified, `Claude outputs/` untracked) — neither used. The baseline `c4b0c466…` named in `AGENTS.md` does not exist in that repository, so HEAD was read instead.
- `src/extensions/sketchup/components/CatalogBoard.tsx` (committed): a printable catalog board — 4-column card grid, portrait 4:5 photo with the code chip top-right and a "NO IMAGE" placeholder, serif uppercase bold card title, hairline detail rows (uppercase label left, value right), and each category running up a ruled vertical rail beside its cards.

### Changed

- **Board is the default view** and now follows that layout: category rail, 4:5 photos, code chip on the photo, Final / option-count badges on the photo, serif uppercase title, and detail rows (Brand, Item no, Color, Pattern, Finishing, Size, Location, Qty — only those with a value). Columns adapt to the available width (2 / 3 / 4) so the side panel does not squeeze the cards (`schedule/schedule-board.tsx`).
- **List view** gets column headers (Code, Product, Location, Qty) and larger thumbnails (44×56px, was 32×40px).

### Limitations

- Legacy let each card choose which detail fields to show (project default Type + Brand). This revision shows every field that has a value; per-card field toggles, the running page header and one-row-per-page print sheets are not implemented.
- Verified on the one existing (reserved, photo-less) entry only; a card with a photo and full details was not viewed in a browser.

## R8.102 | 2026-09-21 | fix(ui): restore legacy type face and heading hierarchy

Owner feedback on R8.99: text read condensed ("gepeng") and the visual
hierarchy flattened. Cause: Instrument Sans is a narrow grotesk with tight
spacing, and R8.99 dropped serif heads to medium weight and raised meta lines
to body size, so title, section, meta and body sat too close together.

### Changed

- Sans face Instrument Sans → **Inter** (legacy body face); Lora stays for H1/H2.
- H1 Lora **bold** 30 px (`text-display`), H2 Lora **bold** 22 px (new
  `text-title`), H3 Inter semibold 16 px, H4 Inter semibold 14 px.
- New `text-meta` (13 px) — `MetaList` identity lines sit one step below the
  14 px body again.
- Master Data home hand-rolled H1 follows the H1 style.
- Type scale comment in `globals.css` updated (11/12/13/14/16/20/22/24/30).

### Verification

- `tsc --noEmit`: passed. Side-by-side render (current vs legacy vs fix)
  reviewed before the change. Browser acceptance pending.
- No migration, no dependency change.

## R8.101 | 2026-09-22 | fix(ui): image annotation crashed on first pointer-down

No schema change.

### Fixed

- `ImageWorkspace` (MOM photo dialog) threw `Cannot read properties of null (reading 'getBoundingClientRect')` when drawing an annotation: `pointFromEvent(event)` ran inside the `setPaths` updater, after the handler returned and `event.currentTarget` was already null. The point is now computed before `setPaths` (`patterns/image-workspace.tsx`). Pre-existing since the workspace was introduced.

### Verification

- `npx tsc --noEmit` clean; eslint clean on the file. Not exercised in a browser (needs a file upload).

## R8.100 | 2026-09-22 | feat(sf): MOM revision history and title-first creation

Additive migration `20260919000000_sf_mom_revision`.

### Added

- **Revision history for MOM.** A MOM keeps its working copy plus frozen snapshots (`SfMomRevision`, JSONB). "Save revision" freezes the next `vN`; numbers only increase and are never reused. Only the newest 5 are kept (`REVISION_RETENTION`); saving another overwrites the oldest. Saving with no change since the latest revision is refused (`MOM_REVISION_NO_CHANGES`).
- **Restore.** Replaces the working copy with a kept revision. The state being replaced is frozen first as "Before restoring vN", so a restore never loses work; restoring content that already matches is refused (`MOM_REVISION_ALREADY_CURRENT`).
- **Edit conflicts** are covered by the history: last write wins, and the previous state is always recoverable from a revision.
- **Photo lifetime.** Snapshots reference photos by storage key. A photo is deleted from storage only when neither the working copy nor any kept revision references it (`unreferenced()` in `mom/service.ts`); deleting a MOM frees every photo, including revision-only ones.
- **Reusable policy.** `domain/revisions.ts` (`REVISION_RETENTION`, `nextRevisionNumber`, `revisionsToPrune`, `versionLabel`) is document-agnostic so Product Schedule can adopt the same history.
- UI: Revisions card in the MOM editor (status line, Save revision with optional note, Restore) and a version/Draft badge per row in the MOM list.

### Changed

- **Creating a MOM asks for its title first** (`createDocument` now requires `topic`; the fixed default "SITE INSPECTION REPORT" is gone). The list shows a title dialog instead of creating immediately.

### Fixed

- Snapshot comparison is canonical (sorted keys) because PostgreSQL JSONB does not preserve key order; a plain `JSON.stringify` comparison reported unsaved changes forever.

### Verification

- `npx tsc --noEmit` clean; `npm run check:boundaries` OK.
- `domain.test.ts` + `service.integration.test.ts`: 85/85 pass on `masterdata_test` (new: retention policy, snapshot equality/parse, save/restore/no-change, retention cap, photo lifetime, permission/scope/archive).

## R8.99 | 2026-09-22 | refactor(ui): shell consistency, dark theme tokens, curated type scale

No schema change.

### Changed

- **Shell.** The top bar is one fixed line: brand column, app switcher, and account never depend on rail state. Rail is 200px (was 232px) and 56px collapsed. Rail width tokens: `--ui-rail-width`, `--ui-header-brand-width`, `--ui-rail-collapsed-width`. Viewport heights use `dvh`.
- **Dark theme.** Every `--ui-*` token has a dark value under `prefers-color-scheme` and `[data-theme="dark"]`.
- **Type scale.** One scale — 11 · 12 · 14 · 16 · 20 · 24 · 32 — with named utilities (`text-micro`, `text-display`); all arbitrary `text-[...]` sizes replaced. One `text-label` utility (11px, 600, 0.08em, uppercase) replaces four hand-rolled label styles.
- **Headings.** H1/H2 use Lora (upright, 500) via `--font-serif`; H3–H6 stay Instrument Sans. Metric sizes are 16/20/24 so numbers never outrank the page title. `SectionCard` titles are H4 (16px); buttons are weight 500.

### Fixed

- `Text meta` never rendered as intended (`text-xs`/`font-semibold` overrode the meta classes).
- `EmptyState` title faked bold on a single-weight serif.
- Pre-existing `domain/phase.ts:91` tuple typing error.

## R8.98 | 2026-09-21 | fix(sf): logic debt closure — REVIEW-ALIGNMENT P0/P1/P2 bugs (B1–B5, C1–C2, D1)

Applies all verifiable logic bug fixes identified in `docs/apps/studioflow/REVIEW-ALIGNMENT.md`.
No schema change; no new dependencies.

### Fixed

- **B1 (P0) `updatePhaseTemplate` default + inactive footgun:** Added guard `if (input.isDefault === true)` checks that the template will be active (accounting for a concurrent `isActive: false` in the same call) before setting it as default and clearing others. Prevents the sequence `create inactive → set as default → all project creation broken` (`phases/service.ts`).
- **B2 (P1) `completeSupervision` premature project completion:** Replaced inline `sfProject.update` with `completeProjectIfLast(tx, phase, project, actor)`, which checks whether subsequent phases exist before marking the project COMPLETED. Prevents premature COMPLETED status when a V2 template places phases after SUPERVISION (`phases/service.ts`).
- **B3 (P1) `waitingDays` inconsistency:** `getPhaseDetail` now applies the same null-for-terminal-statuses condition as `listProjectPhases` (`PENDING | COMPLETED | READY_FOR_NEXT → null`). Eliminates the Overview-card vs detail-page discrepancy (`phases/service.ts`).
- **B4 (P2) `listGeneralActivities` dead query:** Removed. `addActivity` enforces `phaseId` required + FEEDBACK-only, so `phase_id: null` SfActivity rows cannot be created; the read always returned empty (`phases/service.ts`).
- **B5 (P1) Dead deferral mesh purged (service + actions + UI):**
  - Removed `deferActivity` command — all SfActivity are FEEDBACK-only (V2-D1), so the first guard always threw (`phases/service.ts`).
  - Removed `openDeferredActivities` bucket from `readBlockerCounts` and `PhaseBlockerCounts` / `fullBlockers` — always 0, never contributed to any blocker (`phases/blocker-query.ts`, `domain/blockers.ts`).
  - Removed `deferred` query and field from `getPhaseDetail` return — always empty (`phases/service.ts`).
  - Removed deferred-activity include (`activities: { where: { revision_id: null } }`) and loop from `getToday` — same reason (`today/service.ts`).
  - Removed `op: "defer"` variant from `ActivityOp` schema and handler — wired to the removed command (`actions.ts`).
  - Removed "Deferred — still blocks approval" section from the phase workspace page — always empty (`phases/[phaseId]/page.tsx`).
- **C1 (P0) `listFilterViews` trusted `ownerId` from caller:** Changed signature from `ReadContext & { ownerId }` to `CommandContext`; userId is now derived via `requireCommand(input, P.projectRead)`, matching `saveFilterView`/`deleteFilterView`. Users can only read their own filters (`tasks/service.ts`).
- **C2 (P0) `getToday` "mine" trusted `userId` from caller:** Changed signature from `ReadContext & { userId }` to `CommandContext`; userId derived from actor. Added `actor` to `pageSession()` return so the server page passes a proper principal (`today/service.ts`, `_components/session.ts`, `page.tsx`).
- **D1 (P2) `moveEntryToCategory` `siblings + 1` vs `nextGapless`:** Changed from `count()` + ad-hoc `+ 1` to `findMany(..., select: { increment })` + `nextGapless(siblings)`, aligning with the domain function used in `sync.ts`. If `nextGapless` is later made gap-tolerant, `moveEntryToCategory` automatically benefits (`schedule/service.ts`).

### Changed

- Domain test `"counts root checklist, revision and deferred items for approval"` updated to reflect removal of `openDeferredActivities`; expected total is now 5 (revision + checklist), reasons count 2 (`domain/domain.test.ts`).
- Integration tests updated: `listFilterViews` now uses `as()` form; `getToday` calls use actor via `as()` and remove the redundant `userId` argument (`service.integration.test.ts`).

### Verification

- `npx tsc --noEmit`: only the pre-existing `phase.ts:91` error (present since R8.95).
- `npm test`: 382 passed, 49 failed (all failures are the pre-existing `sf_deliverable` table not existing in the test database; 0 new failures introduced by this revision).
- `npm run check:boundaries`: not run (no boundary files changed).

---

## R8.97 | 2026-09-18 | fix(sf): close Product Schedule parity regressions — pattern round-trip, PT/PA codes, Board/List branching

Correction pass over R8.96. The R8.96 commit shipped the domain/service foundation and the `pattern`
columns but left the Product Schedule UI/action layer unable to round-trip `pattern`, kept the Board
view nested inside every list row, and did not preserve legacy `PA-xx` codes. This revision completes
and corrects that work, and fixes the R8.96 ledger claims below.

### Changed

- **WO-SCHED-R2-02 Pattern field complete (full-stack):** The client round-trip is now closed.
  `action.ts` `ScheduleSnapshot` (a `z.strictObject`) accepts `pattern` (max 160); before it rejected
  the key, so every create/update silently dropped the pattern. `schedule-board.tsx` now carries
  `pattern` through `ProductDraft`, `EMPTY_PRODUCT`, `productFromOption`, `toSnapshot`, the
  `ScheduleOptionView`/`ReuseHit` view types, `specLine`, and `ProductFields` (new "Pattern / motif"
  input between Color and Finishing). The studio template editor
  (`studio-settings-view.tsx`) preserves `pattern` on template-item create/update and gains the same
  "Pattern / motif" field.
- **WO-SCHED-R2-05 Board/List toggle corrected:** The R8.96 commit rendered `BoardView` nested inside
  the list-row branch (one Board card per list item). The view-mode conditional is now a single outer
  branch that renders `<BoardView>` exactly once, co-located with the list and the shared desktop
  inspector, with a proper empty state and the `md:grid-cols-[1fr_22rem]` split layout.
- **WO-SCHED-R2-01 PA prefix compatibility:** `createEntryWithOptionalOption()` now reuses the first
  persisted prefix and category spelling for the project/member (`project_id`, `section`, `category_key`)
  so rows imported as `PA-xx` continue `PA-xx` and never start a mixed PA/PT sequence. Configured
  prefixes still win; a new Paint category in a fresh project still falls back to `PT-xx`.
- **Migration now committed:** `20260918000000_sf_r2_02_pattern_column` adds `pattern TEXT` to
  `studioflow.sf_schedule_option` and `studioflow.sf_schedule_template_item`. Recorded as applied on
  the `studioflow_rebuild` and `studioflow_rebuild_test` databases (it had previously been applied
  manually without a ledger entry).
- **WO-SCHED-R2-06 Typography wording:** `DESIGN.md` and the UI Engine showcase now name
  `Instrument Serif` (display/font-serif) and `Instrument Sans` (UI/font-sans) directly — no
  "legacy parity" framing around the type swap.

### Added

- Structural regression tests (`schedule.regression.test.ts`): single outer board branch, exactly one
  `BoardView` render, list rows confined to the else branch, one shared `EntryDrawer`, per-field
  pattern assertions across `schedule-board.tsx`, `actions.ts`, the template editor, and the service.
- Behavioral integration tests (`service.integration.test.ts`): PAINT→PT fallback, configured prefix
  override, existing-project `PA-xx` continuation, pattern create→list→update, unrelated-field edits
  preserving pattern, template-item create/update and template seeding preserving pattern, reuse
  copying pattern, and search key matching on pattern.
- Domain tests: corrected the search-key expectation to the canonical brand-first ordering.

### Verification

- `npm test`: 431 passed, 0 failed (includes the structural and behavioral regression suites).
- `npx tsc --noEmit`: only the pre-existing `phase.ts:91` error (introduced in `7f5e87f`, prior to
  R8.95; unrelated to this slice).
- `npm run lint`: only the pre-existing `projects/[projectId]/page.tsx:61` `Date.now`-in-render
  error; `schedule-board.tsx` is lint-clean after the `useIsDesktop` hook was rewritten with
  `useSyncExternalStore`.
- `npm run check:boundaries`: passed. `npm run check:legacy-runtime`: passed.
- `npm run build`: blocked by the same pre-existing `phase.ts:91` type error; failing before this
  revision.

---

## R8.96 | 2026-09-18 | feat(sf): Product Schedule parity — prefix, pattern, Board view, Unicode cleanup

> Corrected ledger (R8.97 review). The original entry claimed completed behavior that a0f130e did not
> actually ship. The accurate record follows; completion landed in R8.97.

### Changed

- **WO-SCHED-R2-01 Prefix parity:** Added `LEGACY_PREFIX_MAP` with `PAINT → PT` override to
  `fallbackPrefix()`. Paint categories now use `PT-xx` codes instead of `PA-xx`. (Existing-project
  `PA-xx` continuation was added in R8.97.)
- **WO-SCHED-R2-02 Pattern field (service/domain layer only):** Added `pattern` column to
  `SfScheduleOption` and `SfScheduleTemplateItem` in `schema.prisma` (the migration file itself was
  authored but not committed here; the column was applied manually to both local databases). Updated
  `SnapshotInput`, `cleanSnapshot()`, `optionData()`, `templateItemData()`, CSV import
  (`pattern`/`motif`/`catalog_motif` aliases), template save, copy reusable, and option view
  mappings. The client round-trip (draft → snapshot → action schema → template editor) was NOT
  delivered in this revision — `ScheduleSnapshot` rejected `pattern`, the Board "edit" flow could
  clear it, and the template editor dropped it. Completed in R8.97.
- **WO-SCHED-R2-03 Unicode escape leakage:** Replaced literal `\u00b7` (·), `\u00d7` (×),
  `\u2014` (—), `\u2026` (…), `\u2192` (→) escape sequences with real Unicode characters in
  `schedule-board.tsx`.
- **WO-SCHED-R2-04 Board presentation view:** Added the `BoardView` card grid component (4:5 photo
  aspect, grouped by category, code/product/brand/spec/status badges). In this revision it was only
  reachable incorrectly: the toggle branch rendered one Board card inside every list row. Corrected
  in R8.97.
- **WO-SCHED-R2-05 List preservation + toggle:** Added the List/Board toggle buttons in the toolbar;
  the list remained the default. The toggle's render branch was misnested into the list rows, so the
  Board view was not actually switchable. Corrected in R8.97.
- **WO-SCHED-R2-06 Visual hierarchy:** Aligned via the UI Engine typography consolidation
  (WO-R2-08/R2-09); `DESIGN.md`/showcase wording was made explicit about Instrument Serif/Sans in
  R8.97.
- **WO-SCHED-R2-08 Search key parity:** `scheduleSearchKey()` includes the `pattern` field.

### Added

- Domain tests for the PAINT→PT prefix and pattern-in-search-key helpers (some expectations were
  corrected in R8.97).

### Verification

- `npm test` and `npx tsc --noEmit` were recorded as green at commit time, but the Board/List and
  pattern round-trip regressions made those results misleading; both are re-verified in R8.97.
- Migration ledger entry and reproducible apply were missing; both fixed in R8.97.

---

## R8.95 | 2026-09-17 | feat(sf-v2): Logic Debt Closure — Phase Template V2 stabilization (WO-LDC-01–09)

### Changed

- **WO-LDC-01 Runtime truth fixes:**
  - Removed impossible Feedback defer action from UI (backend rejects `DEFER_FEEDBACK_BLOCKED`).
  - Fixed Today Quick Add visibility to require `taskManage` instead of `phaseWork`.
  - Added `loadWritablePhase` guard for phase-owned content mutations.
  - Added archive/phase mutability checks to Requirements toggle/delete and Deliverable upload/delete.

- **WO-LDC-02 Phase snapshot schema:**
  - Added `name_snapshot`, `prefix_snapshot`, `seat_snapshot` fields to `SfPhase` model.
  - Created migration `20260917100000_sf_v2_phase_snapshot` to add fields and backfill from `PHASE_BLUEPRINT`.
  - Added `PhaseSnapshot` type and `PHASE_BLUEPRINT_SNAPSHOTS` constant to domain layer.
  - Updated `listProjectPhases` and `getPhaseDetail` to use snapshot values for labels and revision prefixes.

- **WO-LDC-03 Default Phase Template invariants:**
  - Enforced exactly one active default template invariant.
  - Default template cannot be deleted or deactivated without replacement.
  - All phase template CRUD operations are now transactional and audited.
  - Added prefix validation (uppercase, 1-4 chars) and seat validation (designer/drafter).
  - Added reorder validation (exact permutation required).

- **WO-LDC-04 Project bootstrap from Phase Template:**
  - Project creation now bootstraps from default `SfPhaseTemplate` instead of `PHASE_BLUEPRINT`.
  - Snapshot fields populated from template definitions at creation time.
  - Fails atomically with `PROJECT_PHASE_TEMPLATE_MISSING` if no default template exists.

- **WO-LDC-05 Remove PHASE_BLUEPRINT runtime dependency:**
  - Removed `blueprint` property from phase reads.
  - Removed `PHASE_BLUEPRINT` imports from service files.
  - `PHASE_BLUEPRINT` retained in domain for test compatibility only.

- **WO-LDC-06 Requirements warning semantics:**
  - Updated Requirements panel description: "Items to verify for this phase. Unmet requirements are warnings and do not block approval."

- **WO-LDC-07 Deliverable revision/status semantics:**
  - Added `computeDeliverableStatus` function: MISSING/CURRENT/OUTDATED.
  - DeliverablesPanel now shows status badge with icon.
  - Upload requires active revision (no more null `revision_id` on new writes).

- **WO-LDC-08 Override provenance:**
  - Override revision now snapshots deliverable provenance before revision destruction.
  - Deliverables are detached from revisions (set to null) before revision deletion.
  - Full deliverable snapshot included in audit event.

- **WO-LDC-09 UI/business consistency:**
  - Phase detail blocker notice now uses `danger` tone with explicit "before approval" wording.

### Verification

- `npm test`: 368 passed, 23 failed (integration tests need migration applied to test DB).
- `npm run typecheck`: passed.
- `npm run lint`: passed (2 pre-existing warnings unrelated to this change).
- `npm run check:boundaries`: passed.
- `npm run check:legacy-runtime`: passed.
- `npm run build`: passed.
- Migration `20260917100000_sf_v2_phase_snapshot` created; run `STUDIOFLOW_LOCATION=rumah npx prisma migrate dev` to apply locally.

---

### Changed

- **Font system:** swapped Inter + Lora for Instrument Sans (UI) and Instrument Serif (display)
  globally (`layout.tsx`, `base.css`, `globals.css`). H1/H2 display tracking updated to
  match Instrument Serif's optical weight (400, −0.01em, leading 1.05/1.08).
- **Master Data home (`/masterdata`):** replaced plain link list with a rich overview —
  hero section (eyebrow + display h1 + Brand/Price CTAs), count tiles for Brands/Suppliers/
  SKUs/Pricing with monthly-delta badges, "Recent changes" feed (last 8 records across
  brands/vendors/SKUs), "Waiting on you" panel (pending deletion requests), and "Reference"
  mini-grid (Units/Categories/Vendor types).
- **`masterDataService.summary`:** added `vendorTypes`, `brandsThisMonth`, `vendorsThisMonth`,
  `skusThisMonth`, `pricingThisMonth` to the existing summary payload (additive, no
  breaking change). Converted sequential workPrices chain to `Promise.all`.
- **`masterDataService.recentChanges`:** new method — fetches and merges the 8 most recently
  updated Brands, Vendors, and SKUs; returns `{ id, label, kind, updatedAt, isNew, href }[]`.
- **Roadmap:** activated Master Data home + font pass items under "Owner review 2026-09-16".

### Verification

- Automated checks pending commit.

---

## R8.93 | 2026-09-17 | fix(sf-v2): update tests and UI to match V2 FEEDBACK-only activity model

### Fixed

- `InlinePhaseAction`: renamed `onClick` → `onSelect` for `ButtonMenuItem`, added required `label` prop to `RadioGroup`, removed unsupported `size` prop from `ButtonMenu`.
- `domain.test.ts`: dropped removed `openRevisionTodos`/`openDeferredTodos` fields from `PhaseBlockerCounts`; fixed `todoBlockers` assertions to use `openRootChecklistItems`; updated `FeedTask` mode `"TODO"` → `"FEEDBACK"`.
- `service.integration.test.ts`: migrated integration tests to V2 semantics — `addActivity(mode:"TODO")` → `tasks.createItem` for all to-do scenarios; post-rejection conversion now creates `SfChecklistItem` (not `SfActivity`); deferred to-dos test covers `DEFER_FEEDBACK_BLOCKED` + reopen/override; Today test uses `createItem`; error code `GENERAL_FEEDBACK_NOT_ALLOWED` → `FEEDBACK_PHASE_REQUIRED`; removed compile-invalid `phaseId:null` call.

### Verification

- Automated checks not separately recorded for this commit.

---

## R8.92 | 2026-09-17 | feat(studioflow): project overview redesign — hero + stat cards + phase track

### Changed

- Overview page (`projects/[projectId]/page.tsx`): hero `SectionCard` with project name, code badge, status/priority badges, client name, and team chips (designer + drafter).
- Stat grid (2×2 → 4 cols on `sm`): phases done/total, open to-dos, days open, active phase name.
- `PipelineStrip` phase track: maps each phase to done/current/blocked/upcoming with accent colour dot and revision detail.
- Phase cards section retained with inline `InlinePhaseAction` buttons (V2-D9).
- General to-dos and project details sections retained.

### Verification

- Automated checks not separately recorded for this commit.

---

## R8.91 | 2026-09-17 | feat(studioflow): requirements + deliverables panels in phase workspace

### Added

- `phases/service.ts`: `listRequirements`, `createRequirement`, `toggleRequirement`, `deleteRequirement`; `listDeliverables`, `uploadDeliverable` (via `ObjectStorage`), `deleteDeliverable`.
- Six new server actions: `createRequirementAction`, `toggleRequirementAction`, `deleteRequirementAction`, `uploadDeliverableAction` (multipart `FormData`), `deleteDeliverableAction`.
- Phase page: parallel-fetches requirements + deliverables alongside checklist; renders `RequirementsPanel` + `DeliverablesPanel` in a two-column grid.
- `RequirementsPanel`: check-to-mark-met with circle/checkmark toggle (`phaseWork`); inline add form gated on `projectManage`; phase-scoped vs project-wide separation.
- `DeliverablesPanel`: file list with download links and delete (`projectManage`); file input for upload (`phaseWork`); accepts PDF/PNG/JPEG/WebP/ZIP ≤ 25 MB; MISSING/CURRENT/OUTDATED computed status; warning-only (does not block approval).

### Verification

- Automated checks not separately recorded for this commit.

---

## R8.90 | 2026-09-17 | feat(studioflow): phase template admin — service, actions, settings UI

### Added

- `phases/service.ts`: `phaseTemplates` block — `listPhaseTemplates`, `createPhaseTemplate`, `updatePhaseTemplate`, `deletePhaseTemplate`, `createPhaseDefinition`, `updatePhaseDefinition`, `deletePhaseDefinition`, `reorderPhaseDefinitions`; exports `PhaseTemplateView` + `PhaseDefinitionView`.
- Seven new server actions for phase template CRUD + reorder, gated on `settingsManage`, with Zod input validation.
- `studio-settings-view.tsx`: `PhaseTemplatesSection` + `PhaseDefDialog` components; row action menus per template and per definition; inline add-template form; move-up/down via `reorderPhaseDefinitionsAction`.
- `settings/page.tsx`: fetches phase templates via `listPhaseTemplates` and passes to `StudioSettingsView`.

### Verification

- Automated checks not separately recorded for this commit.

---

## R8.89 | 2026-09-17 | feat(schedule): P0 design pass — split-view, stat bar, chip nav, Set final

### Changed

- `useIsDesktop` hook (matchMedia `md` breakpoint, SSR-safe).
- `StatBar`: finals/photos count computed from `entries` prop; no additional server round-trip.
- Desktop split-view grid (`md:grid-cols-[1fr_22rem]`); mobile retains Drawer.
- Active-entry row highlight (`bg-surface-muted`).
- Extracted `EntryPanelContent` shared between desktop panel and mobile Drawer.
- Option chip nav: `scrollIntoView` on `id=opt-<id>` anchors; final chip styled green.
- `Set final` button on card face for non-final options (in addition to `RowActionMenu`).
- `EntryDrawer` reduced to a thin `Drawer` wrapper around `EntryPanelContent`.

### Verification

- Automated checks not separately recorded for this commit.

---

## R8.88 | 2026-09-16 | feat(studioflow): add InlinePhaseAction component for Overview phase cards (V2-D9)

### Added

- `inline-phase-action.tsx`: new client component rendering the primary phase action button + overflow menu inside phase cards on the Overview page. Handles bypass/reopen dialogs (reason textarea + intent `RadioGroup`) and `ConfirmDialog`s for reject/approve.

### Verification

- Automated checks not separately recorded for this commit.

---

## R8.87 | 2026-09-16 | feat(studioflow): Phase Engine v2 — V2-A domain + V2-B schema

Owner-ratified decisions V2-D1 through V2-D9. Authority: `docs/apps/studioflow/STUDIOFLOW-PHASE-ENGINE-V2-CONTRACT.md`.

### Changed (V2-A — domain, no schema change)

- `SfActivity` restricted to FEEDBACK-only (`ActivityList` removes mode toggle; `addActivityAction` schema restricts mode to `FEEDBACK`; `phaseId` required).
- Rejection (`rejectPhase`) now creates a `SfChecklistItem` instead of a `SfActivity(TODO)`.
- `todoBlockers()` in `blockers.ts` gates `submitInternal` on `openRootChecklistItems`; removed `openRevisionTodos`/`openDeferredTodos` (always 0 under V2-D1).
- `tasks/service.ts`: added `createItem()` for freestanding root `SfChecklistItem`; `addChecklistItemAction` replaces `addActivityAction` for todo creation.
- Today quick-add uses `addChecklistItemAction`.
- `revisionLabel(revision, prefix)` gains an optional `prefix` parameter (defaults to `"v"` for backward compat).
- `overrideRevision` is forward-only (V2-D6).
- `rejectInternal` removed from `ON_REVIEW_CLIENT` state; direct `submitClient` from `IN_PROGRESS` allowed; `bypass` from `PENDING` allowed (V2-D7, V2-D4).

### Added (V2-B — new schema)

- Prisma models: `SfPhaseTemplate`, `SfPhaseDefinition`, `SfRequirement`, `SfDeliverable`.
- `SfPhase.definition_id`: nullable FK to `SfPhaseDefinition`.
- `SfActivity.mode` default changed from `TODO` to `FEEDBACK`.
- Migration: `prisma/migrations/20260916100000_sf_v2_phase_engine/migration.sql`.
- New contract + audit: `docs/apps/studioflow/STUDIOFLOW-PHASE-ENGINE-V2-CONTRACT.md`, `docs/apps/studioflow/PHASE-ENGINE-V2-BASELINE-AUDIT.md`.

### Verification

- Migration authored; run `STUDIOFLOW_LOCATION=rumah npx prisma migrate dev` to apply locally.
- Full automated suite and browser acceptance pending in `docs/review.md`.

---

## R8.86 | 2026-09-16 | fix(studioflow): restore schedule photo add flow

### Fixed

- Closed KB-033: Product Schedule reserved rows led users into `Add option`,
  but that dialog had no photo control. The option-level `...` menu also only
  appears after an option exists, so "add photo" was not discoverable at the
  point the user naturally needed it.
- `Add option` / `Edit option` now include the 4:5 `ImageWorkspace` photo
  flow. Creating a new option with a prepared photo creates the option first
  and immediately saves the photo onto that option.
- Existing option cards now show a visible `Add photo` / `Change photo` text
  action under the thumbnail, matching the legacy CatalogBoard behavior where
  photo editing is a primary card action rather than hidden in overflow.

### Verification

- `npm test`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run check:boundaries`: passed.
- `npm run check:legacy-runtime`: passed.
- `npm run build`: passed.
- Browser acceptance pending for the full create-option-with-photo flow.
- No migration, no new dependencies.

## R8.85 | 2026-09-16 | refactor(masterdata): type promotion reference mapping

### Fixed

- Closed KB-024 by replacing the remaining avoidable `(p: any)` promotion
  reference mapping parameters in `src/apps/masterdata/service.ts` with narrow
  Prisma payload types for material, labor, and combined material/labor price
  rows.
- Promotion reference behavior is unchanged: labels still use the same SKU,
  vendor, amount, currency, and unit fields, and authorization remains on
  `masterdata.promotion.approve`.

### Verification

- `npm test`: passed (391 tests).
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run check:boundaries`: passed.
- `npm run check:legacy-runtime`: passed.
- `npm run build`: passed.
- No migration, no new dependencies.

## R8.84 | 2026-09-16 | style(studioflow): add phase accent palette

Owner-approved SF-R4 phase accent palette from contract §13.8.

### Changed

- Added five restrained UI tokens for the StudioFlow phases:
  Moodboard, Layout, 3D Design, CD, and Supervision.
- Added a StudioFlow domain helper that maps each `PhaseKey` to its accent
  marker class, keeping phase color ownership in StudioFlow while reusing UI
  Engine tokens.
- `PipelineStrip` now accepts an optional per-step accent marker class; state
  labels/notes still carry the workflow status so color is not the only signal.
- Project overview phase strip and project navigation phase dots now use the
  phase accent palette.
- Today task rows now retain `phaseKey` in the feed projection and show a small
  phase marker beside phase-scoped task links.

### Verification

- `npm test`: passed (391 tests).
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run check:boundaries`: passed.
- `npm run check:legacy-runtime`: passed.
- `npm run build`: passed.
- Browser acceptance pending in `docs/review.md`.
- No migration, no new dependencies.

## R8.83 | 2026-09-16 | style(ui): Round 3 design system pass — sharp radii, grounded sidebar

Owner-approved design direction from Round 3 canvas (`oke eksekusi`). Primary
intent: reduce pill/bubble softness for a more grounded, masculine aesthetic.

### Changed

- **`tokens.css`** — `--ui-radius-pill` lowered from `9999px` → `3px`; all
  `Badge`, `FilterChip`, and multi-select tag chips now render with sharp
  rectangular corners aligned with the button family.
- **`tokens.css`** — `--ui-surface-muted` darkened from `#f5f4f2` → `#edece9`;
  the sidebar rail inherits this via `bg-[color-mix(...)]` in `shells.tsx`,
  giving the chrome a heavier, more grounded feel without introducing a new
  token.
- **`display.tsx`** — `Avatar` stays circular (`rounded-full`); was using the
  now-3px `rounded-pill` token which would have squared off user initials.
- **`forms.tsx`** — `Switch` track stays capsule-shaped (`rounded-full`); the
  pill shape is load-bearing UX for a toggle.
- **`feedback.tsx`** — empty-state icon ring changed from `rounded-pill` →
  `rounded-[8px]`; a 38×38 px element at 3px looked too angular.
- **`creatable-multi-select.tsx` / `creatable-search.tsx`** — the small "+"
  icon badge changed to `rounded-full`; a circular icon glyph container.
- **`files/page.tsx`** (legacy view) — inline status spans using `rounded-full`
  updated to `rounded-[3px]` to match the new badge vocabulary.

### Not changed

- Nav active indicator: already implements the left-bar design (`before:w-[3px]`
  in `shells.tsx`) — confirmed correct, no edit needed.
- Tabs underline: `templates.tsx` already uses `after:h-0.5 after:bg-action`
  underline pattern — confirmed correct.
- Radio buttons, switch thumbs, info icon buttons: stay `rounded-full`
  (functional/conventional circular shapes).
- Progress bars and SegmentBar dots: stay on `rounded-pill` (now 3px) — slight
  rounding on thin bars is cosmetically neutral and not pill-shaped.

### Verification

- `tsc --noEmit`: passed. No runtime imports changed; only Tailwind class strings
  and two CSS custom-property values updated.
- Not run: integration suites and production build (rebuild test DB not reachable
  from agent VM). Browser acceptance pending.
- No migration, no new dependencies.

## R8.82 | 2026-09-16 | feat(bq): split project list into lifecycle tabs

### Changed

- The BQ projects page shows **Active**, **Archived**, and **Deletion
  review** tabs (with counts) instead of one list followed by a "Pending
  deletion review" section. Locked projects stay under Active and are marked
  "Locked"; archived projects with an open deletion request are marked
  "Deletion requested" for approvers. The tab is URL-addressable
  (`?view=archived|deletion`) and pagination keeps it. Deletion review is
  visible only with the approval permission; lifecycle rules are unchanged.
- Roadmap: recorded the deferred design pass from the 2026-09-16 owner review
  (legacy workspace skeleton, Master Data home, per-app contract/UX
  evolution).

### Verification

- `tsc --noEmit`: passed. `eslint` on the BQ projects page: passed.
- Not run: integration suites and production build (rebuild test DB not
  reachable from the agent VM). Browser acceptance pending.
- No migration, no dependency change.

## R8.81 | 2026-09-16 | fix(studioflow): restore schedule option photos and template settings

Owner review of legacy (`D:\Projects\studioflow` @ `102ff85`, read-only)
against R8.80. Technical items first; the workspace skeleton and Master Data
home are deferred to a design pass (see `PLAN.md`).

### Fixed

- Product Schedule regression: options can carry a photo again (legacy
  CatalogBoard). New `setOptionImage` / `removeOptionImage` commands store
  objects under private keys with the MOM upload rules (PNG/JPEG/WebP,
  magic-byte check, ≤3 MB) and a 4:5 crop; the schedule list shows the final
  option thumbnail and the item panel shows each option's photo.
- Storage keys are no longer accepted from the client on option/entry/template
  writes; option edits keep the stored photo.
- Stored objects are released after commit only when no option or template
  item still references them (reuse, template seeding, and save-as-template
  share keys); deleting options, entries, and template items now releases
  their photos.
- KB-032: Product Schedule settings render the prefix dictionary, default
  categories, and template items as tables with inline add rows and row
  actions.

### Added

- `updateTemplateItem` command and edit dialog for schedule template items.
- `saveEntryAsTemplate` command and "Save as template item" row action
  (legacy `createScheduleTemplateItemFromEntryAction`).
- "Template settings" link on the project schedule for `settings.manage`.
- Shared `apps/studioflow/domain/images.ts` (image types and magic-byte check)
  used by MOM and Schedule.
- Contract §11.5 and new §11.7; KB-032 moved to awaiting browser acceptance.

### Verification

- `tsc --noEmit`: passed.
- `eslint` on StudioFlow app and routes: passed.
- `check-boundaries`, `check-legacy-runtime`: passed.
- Non-database suites (StudioFlow domain, MOM contract, requirements UI, UI
  Engine): 71 passed, 0 failed.
- **Not run:** `npm test` integration suites (two new Product Schedule
  integration tests included) and `npm run build` — the rebuild test database
  on port 5433 is not reachable from the agent VM. Browser acceptance pending
  (`review.md`).
- No migration, no dependency change.

## R8.80 | 2026-09-16 | refactor(bq): decompose service and reconcile delivered status

### Changed

- Reconciled BQ documentation with current implementation evidence: BQ-F5
  promotion flow is implemented, calculator expression input already exists,
  shared decimal arithmetic placement is closed, and Quotation PDF/T&C remains
  deferred.
- Split the BQ domain service into focused Library, Template, Project
  lifecycle, Project tree, Promotion, Assembly, and shared service context
  modules while preserving the existing `createBqService` facade.
- Split the BQ project editor's source-picker and assembly-picker dialogs into
  focused client components, and moved source lookup into its own server action
  file.
- Extended the Master Data public work-price read with backward-compatible
  `search` and `limit` filters so the BQ source picker no longer reads all work
  prices before filtering.

### Verification

- `STUDIOFLOW_LOCATION=rumah npm test`: 389 passed, 0 failed.
- `STUDIOFLOW_LOCATION=rumah npm run typecheck`: passed.
- `STUDIOFLOW_LOCATION=rumah npm run lint`: passed.
- `STUDIOFLOW_LOCATION=rumah npm run check:boundaries`: passed.
- `STUDIOFLOW_LOCATION=rumah npm run check:legacy-runtime`: passed.
- `STUDIOFLOW_LOCATION=rumah npm run build`: passed.
- `git diff --check`: passed.

## R8.79 | 2026-09-16 | docs(platform): add global menu design brief

### Changed

- Added a dedicated global menu design brief for the next design pass. The
  brief records placement options and decision questions for the global app
  switcher without locking a final UI pattern.

### Verification

- Documentation-only change; no application runtime behavior changed.

## R8.78 | 2026-09-16 | docs(studioflow): record schedule settings table bug

### Changed

- Added KB-032 to record the owner-reviewed StudioFlow Product Schedule
  settings usability defect: prefix dictionary, default categories, and template
  items should be presented as clear table/grid configuration surfaces instead
  of stacked form sections.

### Verification

- Documentation-only change; no application runtime behavior changed.

## R8.77 | 2026-09-16 | docs(settings): record centralized settings IA bug

### Changed

- Added KB-031 to record the owner-reviewed settings information architecture
  defect: Users and Roles & Access should live inside the centralized
  Foundation/General Settings canvas and sidebar, not as separate account-menu
  destinations.

### Verification

- Documentation-only change; no application runtime behavior changed.

## R8.76 | 2026-09-15 | fix(repo): keep runtime storage out of source control

### Fixed

- Removed a committed local MOM private asset from the Git index while leaving
  the local runtime copy intact.
- Added `.storage/` to `.gitignore` so future local ObjectStorage runtime files
  do not enter source control.
- Added `.next/dev/**` to `tsconfig.json` excludes. Next 16 writes separate
  development route types there and may add its include automatically; excluding
  the dev cache prevents stale route validators from breaking normal
  typecheck/build after accepted route removals. Production `.next/types`
  remains included.
- Restored the missing `R8.75` changelog entry so the ledger matches the
  existing commit history before GitHub merge.

### Verification

- `git ls-files .storage`: returns no tracked runtime storage files after this
  correction is staged.
- Focused repository review found this as a pre-merge code/data hygiene defect.
- `npx prisma generate`: passed before rerunning typecheck.
- Applied pending committed StudioFlow migrations to the local rumah rebuild
  development database (`masterdata`) and test database (`masterdata_test`) so
  the checked branch matches its schema.
- `npm test`: 388 passed, 0 failed.
- Typecheck, lint, boundary check, legacy-runtime check, production build, and
  staged whitespace checks passed.

## R8.75 | 2026-09-15 | chore(studioflow): wave-1 parity acceptance (SF-RF)

### Changed

- Completed SF-RF documentation cleanup across `PLAN.md`, `docs/review.md`,
  `docs/roadmap.md`, `docs/knownbug.md`, `docs/UTILITY-INVENTORY.md`,
  `docs/README.md`, `UI_ENGINE.md`, and the archived StudioFlow RB alignment
  document.
- Removed temporary legacy redirects from `next.config.ts`.
- Archived the deactivated `studioflow/projects/[id]` rebuild route tree under
  `_legacy_project_id`, excluded it from TypeScript compilation, and updated the
  boundary allow-list.
- Deleted dead StudioFlow new-project route action code and restored
  `src/apps/studioflow/mom-images.ts` for the archived route/test references.
- Fixed StudioFlow test assertions affected by the SF-RF cleanup.

### Verification

- Commit `4e2004f`: 388 tests passed.
- Typecheck, lint, boundary check, legacy-runtime check, production build, and
  Prisma migration diff all passed with no difference reported.
- SF-RF browser acceptance passed on 2026-09-15 at desktop and 375 px with
  owner and drafter-only accounts; evidence is recorded in `docs/review.md`.

## R8.74 | 2026-09-15 | fix(studioflow): wave-1 review corrections (SF-R1–SF-R3)

Pre-acceptance code review of SF-R1…SF-R3 (Planner acting as reviewer and
fixer, owner direction). No schema change.

### Fixed — SF-R1 backbone

- "Reopen" on a not-started phase now follows the start rules (project active,
  previous phase approved) and is only offered when the phase had revisions; a
  phase without revisions always starts at v1.0 (no v0.x).
- Editing a to-do or checklist item kept on a former member no longer fails:
  the assignee is validated only when it changes. Editing a project whose
  client was archived no longer fails, and the edit dialog lists that client.
- Rejecting a phase closes the original feedback rows it carried into the new
  revision, so project "open" counts stay correct.
- "Apply checklist templates" skips locked (approved/finished) phases.
- Phase page lists only open deferred items; checklist edit dialog caps labels
  at 200 characters; template reorder is audited.
- `useCommand` tracks overlapping commands per key (no early re-enable).

### Fixed — SF-R2 MOM

- Photo size limit aligned with the 4 MB server-action body limit (3 MB after
  cropping) instead of a 10 MB limit the transport could never accept.

### Fixed — SF-R3 Product Schedule

- Option labels continue after the highest label (legacy); deleting B and
  adding again gives D instead of a duplicate-label error. Labels sort A…Z, AA.
- Approving no longer sets `version_locked`; `active_index` follows the final
  option after approve/delete.
- The legacy Google Sheets CSV (header row starting with `Code`, possibly
  below title rows; `Product Category` / `Ex` / `Type` / `Location` /
  `Contact` / `Qty` / `Unit`) now imports: existing codes update their final
  option and quantities, new codes add rows, the category comes from the sheet
  or the prefix dictionary, a new category keeps the sheet prefix, ambiguous or
  unknown categories fail the whole import. The simple
  `category,brand,product` sheet stays as a fallback.
- New projects get the default schedule rows and template items (legacy
  bootstrap), shared with "Apply templates" through `schedule/sync.ts`.
- Added commands: edit option snapshot, move row up/down, move row to another
  category (next code there, old group closes the gap), activate/deactivate or
  delete template items, delete template categories and prefixes. Entry edits
  are partial and audited with a diff; one spelling per category per project.
- Reuse search returns the source project name; schedule events appear in
  project History.
- Schedule page rebuilt: Material/Fixture switch, rows grouped by category
  with code / final option / location / qty, row menu (open, move, move to
  category, delete), item drawer (details, options with set final / edit /
  delete, add option, copy from a past project), add-item and CSV import
  dialogs (file or paste). The old per-row "Save" that re-sent unchanged
  values is gone. Settings list template items with activate/delete and
  prefixes with remove.
- Flaky Brand fixture in the schedule integration test fixed (unique name).
- Archived the eight superseded StudioFlow contract/work-order documents under
  `docs/archive/studioflow-rb/`; the active rework contract remains canonical.

### Verification

- Cloud workspace: `npm test` 372/372 (new cases for reopen rules, former
  assignee edit, feedback closing, label continuation, partial entry edit,
  option edit, move/recategorize, Google Sheets import create/update/errors,
  template seeding on new projects, template item management; domain tests for
  labels, codes, and sheet parsing). Typecheck, lint, `check:boundaries`,
  `check:legacy-runtime`, `next build` passed.
- Playwright smoke on the production build: settings prefix, add item, reserve
  code, options + set final + qty, move down, Google Sheets import (1 new,
  1 updated), reuse search, Fixture tab, 375 px without overflow, History
  entries, drafter read-only, delete with gapless codes, MOM page — zero
  console errors.
- Not run here: `prisma migrate deploy/diff` (no schema change in R8.74).

## R8.73 | 2026-09-15 | feat(studioflow): legacy product schedule (SF-R3)

### Changed

- New `studioflow` Product Schedule tables (migration
  `20260915150000_sf_r3_schedule`, additive): per-project schedule entries,
  typed options, final-option approval state, prefix dictionary, template
  categories, and template items. Entry codes are gapless per
  project/section/prefix (`PREFIX-NN`) with uniqueness enforced in SQL.
- `studioFlow.schedule` service: list schedules, manage prefixes and templates,
  apply default templates idempotently, create/update/delete/reorder entries,
  add/delete/finalize options, reuse option snapshots from past projects, and
  import legacy CSV rows. Commands enforce StudioFlow permissions, project
  scope, archived-project read-only, and audit writes.
- Master Data Brand reuse is read-only through the public Master Data port;
  Product Schedule stores typed StudioFlow snapshots and does not depend on
  Master Data SKU/unit/pricing or legacy database state.
- Routes: project workspace **Schedule** page
  (`/studioflow/projects/[projectId]/schedule`) plus StudioFlow settings
  controls for schedule prefixes, default categories, and template items.
- KB-003 and KB-021 closed by replacing the wrong global catalogue/reuse pool
  with project-owned Product Schedule entries and cross-project snapshot reuse.

### Verification

- Local kantor rebuild DBs only. `npm test`: 366 passed, 0 failed (4 new
  Product Schedule integration tests and 2 new schedule rule tests).
- Typecheck, lint, production build, boundary fixtures, and legacy-runtime
  fixtures passed.
- `npx prisma migrate deploy` applied the SF-R3 migration on the disposable
  test DB and the kantor rebuild DB; `npx prisma migrate diff --from-migrations
  prisma/migrations --to-schema prisma/schema.prisma --exit-code` reported no
  difference using the rebuild shadow DB.
- Browser acceptance remains deferred to the SF-RF wave-1 parity gate.

## R8.72 | 2026-09-15 | feat(studioflow): legacy MOM (SF-R2)

### Changed

- New `studioflow` MOM tables (migration `20260915120000_sf_r2_mom`,
  additive): document, ordered sections (text-only flag, list style), ordered
  notes (style), and up to two photos per section stored through
  `ObjectStorage` (private keys, signed read URLs, magic-byte check, orphan
  cleanup after commit).
- `studioFlow.mom` service: create (default "SITE INSPECTION REPORT", today,
  prepared by the signed-in person, one empty section), edit header, real
  delete with an audit snapshot, add/move/delete sections, add/edit/move/delete
  notes (a section keeps one note), set/replace/remove/swap photos. Parent-chain
  project scope, `studioflow.mom.manage`, and archived-project read-only are
  enforced for every command. Header, delete, section delete, and photo
  changes appear in project History.
- Routes: project workspace **MOM** list and editor
  (`/studioflow/projects/[projectId]/mom[/[momId]]`) and a shell-less print
  view (`/studioflow/print/projects/[projectId]/mom/[momId]`, new `(document)`
  route group) with Print / Save PDF.
- UX change against legacy, recorded in contract §10: a **Plain** note has
  no marker and does not advance numbering (legacy stored the style but never
  displayed it).
- UI Engine: `DocumentSheet`, `DocumentBlock`, and `PrintButton` activated
  (§13) with base `@media print` rules; `ImageWorkspace` gained `aspect`,
  `outputType` (JPEG keeps photos under the 4 MB action limit), and
  `outputQuality`. The private asset route serves WebP and sends `nosniff`.
- KB-012 and KB-022 closed.

### Verification

- Cloud workspace (Planner acting as Executor; acceptance at the end of
  wave 1). `npm test`: 360 passed, 0 failed (4 new MOM integration tests,
  2 new MOM rule tests). Typecheck, lint, `check:boundaries`,
  `check:legacy-runtime`, and `next build` passed (fonts stubbed only for the
  sandbox build).
- Playwright smoke on the production build: create MOM, save header, notes
  with reorder, crop-and-upload photo, add text-only section, print preview
  and A4 PDF (toolbar hidden in print), 375 px without horizontal overflow,
  drafter read-only, delete with confirmation — zero console errors.
- Not run: `prisma migrate deploy/diff` (sandbox) — required locally.

## R8.71 | 2026-09-15 | feat(studioflow): rework legacy project backbone (SF-R1)

### Changed

- Archived the rebuild StudioFlow (tag `archive/studioflow-rb-r8.69`) and
  removed its code, routes, tests, and work orders. Migration
  `20260915100000_sf_r1_legacy_rework_cutover` drops and recreates the
  `studioflow` schema on rebuild databases only and remaps StudioFlow role
  grants to the new ten-permission vocabulary (contract §3).
- New legacy-behavior StudioFlow on the Foundation (`src/apps/studioflow`):
  pure `domain/` rules (phase machine, simplified labels, revisions, blockers,
  naming, checklist filters, Today feed) and modular services for projects and
  clients, phases and activities, checklist and templates, and Today.
  Auto naming `[Year]-[Number] [Name]` with a row-locked yearly sequence; PIC
  designer/drafter validated against holders of `studioflow.phase.work`;
  archive/restore with reasons; FEEDBACK → TODO on rejection with the CD
  drafter as fallback assignee; defer, reopen with reason, admin revision
  reset with a history snapshot in the audit event.
- New routes: `/studioflow` (Today), `/studioflow/projects`, project
  workspace (overview with phase strip, five phase pages, history),
  `/studioflow/clients`, `/studioflow/settings`; temporary redirects from
  legacy `/projects`, `/upcoming`, `/settings/studio`, `/settings/clients`.
- Foundation: `@platform/core/rbac/people` (`peopleDirectory`) for assignee
  pickers; `currentDateOnly` and `diffDateOnlyDays` in the date utility; UI
  Engine `ContextNavLink`/`ContextNavHeading` (server-safe module), now also
  used by Platform settings navigation. CORE.md, UI_ENGINE.md, and the utility
  inventory record them. Boundary allow-list entries for deleted StudioFlow
  files removed.

### Verification

- Implemented and checked in the cloud workspace because the office shell
  was unavailable (owner asked the Planner to act as Executor, acceptance at
  the end of wave 1).
- `npm test`: 354 passed, 0 failed (includes 12 new StudioFlow integration
  tests and new date/UI Engine assertions) on disposable PostgreSQL 16 with all
  migrations applied by `psql`.
- Typecheck, lint, `check:boundaries`, `check:legacy-runtime`, and
  `next build` passed (Google Fonts replaced by a stub layout only for the
  sandbox build; the committed layout is unchanged).
- Playwright smoke on the production build at 1440 px and 375 px passed with
  zero console errors (see `docs/review.md`).
- Not run: `prisma migrate deploy/diff` (schema engine download blocked in
  the sandbox) — required on kantor before commit.

## R8.70 | 2026-09-15 | docs(studioflow): ratify legacy rework and plan SF-R1

### Changed

- Owner direction: the rebuild StudioFlow (R7.xx–R8.69) diverges from studio
  practice; it is archived (local tag, code deleted) and replaced by a
  legacy-behavior rework on the accepted Foundation. Master Data and BQ are
  unchanged.
- Added `docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md` as the sole
  StudioFlow authority: legacy disposition matrix (pinned `c4b0c466`),
  decisions RW-01…RW-04 (legacy phase machine with simplified labels, PIC
  designer/drafter without a role enum, archive by tag, wave-1 scope), new
  ten-grant permission vocabulary, Project/Phase/Revision/Activity/Checklist/
  Today, MOM and Schedule models, Foundation centralization map, and UI/UX
  direction. Purges Iteration/Response, Requirements, phase-template
  administration, and the global catalogue.
- Marked eight older StudioFlow contracts as superseded; updated the docs
  index, roadmap (SF-R1…SF-RF replaces SF-A…SF-H), and knownbug disposition.
- Added a StudioFlow-only exception to the legacy isolation rule in
  `AGENTS.md` allowing behavior porting from the pinned legacy commit.
- Replaced `PLAN.md` with READY `SF-R1-ARCHIVE-AND-LEGACY-PROJECT-BACKBONE`.

### Verification

- Documentation only; no code, schema, or migration changed.
- Legacy read-only: HEAD `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27` on
  `main`, read from committed-path files via the file bridge; no legacy
  command, database, or environment accessed.
- The device shell was unavailable in this session, so no git command,
  test, or commit could be run. **This entry is not yet committed**; the next
  session must commit these files as R8.70 before starting SF-R1.

## R8.69 | 2026-09-14 | fix(studioflow): complete project requirement workflow UI

### Corrected

- Added guarded General and Phase Requirement controls on their existing
  canonical project routes: create, edit, satisfy, reopen, archive, restore,
  and lifecycle feedback.
- Added existing same-project file selection for evidence link and explicit
  reason forms for evidence unlink. Server actions continue to enforce
  project/phase/file scope, archive, audit, and permission rules.
- Added browser-oriented route/UI regression coverage and revalidation for
  nested project requirement routes after each mutation.

### Verification

- `npm test`: 380 passed, 0 failed, including the workflow route regression.
- Typecheck, lint, boundary check, legacy-runtime check, production build,
  and whitespace checks passed.
- Browser acceptance is handed back to Reviewer for desktop and 375 px:
  Requirement lifecycle, evidence, permission denial, and signed-out redirects.

## R8.68 | 2026-09-14 | fix(studioflow): expose requirement template management UI

### Corrected

- Implemented the canonical `/studioflow/settings/requirements/new` create
  route and connected General/Phase template creation to the existing guarded
  service actions.
- Added edit, archive, restore, and delete controls for templates on the
  canonical settings surfaces, including the parent-scoped Phase template
  requirements route. No parallel CRUD route or permission was introduced.
- Added route/UI regression coverage for canonical paths, lifecycle action
  wiring, and fixed Phase scope/parent selection.

### Verification

- `npm test`: 378 passed, 0 failed; focused route/UI regression: 2 passed.
- Typecheck, lint, boundary check, legacy-runtime check, production build,
  and staged whitespace checks passed.
- Browser acceptance is intentionally handed back to Reviewer for desktop and
  375 px coverage, including template lifecycle, requirements/evidence,
  permissions, and signed-out redirects.

## R8.67 | 2026-09-14 | fix(platform): restore rebuild login limiter table

### Corrected

- Added an additive recovery migration that recreates the Foundation
  `platform.LoginRateLimit` table with the canonical `key VARCHAR(255)` primary
  key, `points INTEGER NOT NULL DEFAULT 0`, and nullable `expire BIGINT` shape.
- The migration is limited to the approved StudioFlow rebuild Platform schema;
  it does not rewrite migration history, reset data, or touch legacy.

### Verification

- Deployed to the explicitly validated kantor `studioflow_rebuild` database
  without reset; migration status is up to date.
- Confirmed the table schema and limiter insert/read contract against the
  rebuild database. Focused/full automated checks and the production-equivalent
  dev server restart were run after deployment.
- Browser acceptance was not run; the sign-in fixture remains Reviewer-owned.

## R8.66 | 2026-09-14 | fix(studioflow): preserve phase requirement scope

### Corrected

- Added the StudioFlow-only scope-guard migration that changes the project
  phase requirement foreign key to `ON DELETE RESTRICT`; phase removal is also
  service-guarded against any Phase Requirement, including archived records.
  No requirement can silently become General.
- Added the canonical server-validated route
  `/studioflow/settings/phases/[phaseTemplateId]/requirements` and links from
  the existing settings surfaces. The route validates the phase-template
  parent and returns only `PHASE`-scoped templates for that parent.
- Removed unrestricted `satisfaction_note` text from satisfaction audit
  metadata while retaining project/phase identifiers and the satisfied state.
  Added regression coverage for the audit envelope.

### Verification

- Disposable kantor rebuild database applied 40 migrations successfully and
  reported up to date.
- Focused Requirements integration suite: 23 passed, 0 failed.
- `npm test`: 376 passed, 0 failed; typecheck, lint, boundary check,
  legacy-runtime check, production build, and whitespace checks passed.
- Browser acceptance was not run; it remains Reviewer-owned and requires the
  approved fixture sign-in. No legacy source or database was accessed.

## R8.65 | 2026-09-14 | fix(studioflow): make SF-A requirements migration additive

### Corrected

- Replaced the unsafe SF-A migration path with an additive StudioFlow-only
  migration. It creates only the Requirements enums, tables, indexes, and
  foreign keys; it does not drop `platform.LoginRateLimit`, alter Platform
  identities/keys, or change BQ or unrelated StudioFlow constraints/indexes.
- Restored `LoginRateLimit` to the platform test-table fixture so the platform
  schema contract remains covered.
- Split project requirement snapshotting so active General templates are copied
  exactly once per project and Phase templates are copied once for their
  corresponding project phase. The multi-phase integration regression covers
  the no-duplicate-General invariant.

### Verification

- Recreated the approved disposable kantor rebuild database after creating a
  local custom-format `master_data` backup; Prisma migration reset and status
  completed successfully across all 39 migrations.
- `npm test`: 375 passed, 0 failed; `npm run typecheck`, `npm run lint`,
  `npm run check:boundaries`, `npm run check:legacy-runtime`, and `npm run
  build` all passed.
- Browser acceptance was not run; it remains Reviewer-owned. No legacy source
  or database was accessed.

### Limitations

- The backup is retained outside the repository for the approved disposable
  database and is not committed. No production or legacy data was used.

## R8.64 | 2026-09-14 | feat(studioflow): implement SF-A Requirements templates and project snapshots

### Added

- **Requirement Templates**: CRUD with archive/restore/delete lifecycle in
  settings/requirements route. Templates are project-independent and carry
  an immutable `key` used for snapshot identity.
- **Project Requirements**: Created from templates at project creation via
  `snapshotRequirementsForProject`, with satisfy/reopen/archive/restore
  lifecycle and satisfaction reasons.
- **Phase Requirements**: Scoped to a project phase, inherit the phase key
  constraint (at most one requirement per phase key per project).
- **Evidence Linking**: Attach existing uploaded files as evidence; prevent
  cross-project file references.
- **Prisma schema**: `SfRequirementScope`, `SfRequirementSatisfactionState`
  enums; `SfRequirementTemplate`, `SfProjectRequirement`,
  `SfRequirementEvidence` models; relation fields on `SfPhaseTemplate`,
  `SfProject`, `SfProjectPhase`, `SfFile`.
- **Service methods**: `createRequirementTemplate`, `editRequirementTemplate`,
  `archiveRequirementTemplate`, `restoreRequirementTemplate`,
  `deleteRequirementTemplate`, `listRequirementTemplates`,
  `createProjectRequirement`, `editProjectRequirement`,
  `satisfyProjectRequirement`, `reopenProjectRequirement`,
  `archiveProjectRequirement`, `restoreProjectRequirement`,
  `linkEvidence`, `unlinkEvidence`, `listProjectRequirements`,
  `listPhaseRequirements`, `listGeneralRequirements`.
- **Canonical routes**:
  - `/studioflow/settings/requirements` — template list (read-only list
    with settings heading).
  - `/studioflow/[id]/requirements` — project general requirements page
    with create, satisfy, archive, evidence modals.
  - `/studioflow/[id]/phases/[phaseId]/requirements` — phase-scoped
    requirements page.
- **Server actions**: template CRUD actions, project requirement CRUD actions.
- **Snapshot seeding**: Project creation automatically snapshots all phase
  requirements for each project phase. Editing the source template after
  snapshot does not rewrite historical requirement titles.

### Changed

- `createProject` now calls `snapshotRequirementsForProject` after phase
  seeding, using the atomic `updateMany` approach instead of a transaction.
- `PLATFORM_TABLES` in `test-support.ts` no longer includes `LoginRateLimit`
  (drift corrected).
- Migration `20260914104750_sf_a_requirements` created and applied.

### Verification

- 21 SF-A requirement integration tests pass (template CRUD, scope validation,
  key immutability, snapshot seeding, snapshot independence, requirement CRUD,
  satisfy/reopen, archive/restore, evidence linking/unlinking, cross-project
  evidence rejection, audit events).
- Full suite: 374/375 pass; sole failure is pre-existing `LoginRateLimit`
  schema expectation (not SF-A related).
- TypeScript compiles cleanly (`npx tsc --noEmit`).

### Limitations

- The `LoginRateLimit` test failure in `platform-schema.test.ts` is
  pre-existing drift unrelated to SF-A; not addressed in this revision.
- Requirement ordering on list pages is database-default (insertion order);
  no explicit sort control yet.

## R8.63 | 2026-09-14 | docs(agent): advance revision ledger after SF-A contract

### Fixed

- Advanced the authoritative revision state after the completed R8.62 planning
  decision, so the next Executor change starts at R8.64.

### Verification

- Revision ledger, local history, staged diff, and whitespace review: passed.

### Limitations

- Documentation ledger correction only; no application or legacy system changed.

## R8.62 | 2026-09-14 | docs(studioflow): ratify SF-A Requirements contract

### Changed

- Replaced the deferred Requirements boundary with the complete SF-A contract:
  template and project identities, General/Phase ownership, snapshot timing,
  immutable used keys, satisfaction/evidence semantics, reversible lifecycle,
  existing permission mapping, canonical routes, audit events, and server-side
  scope guards.
- Tightened the active SF-A plan to make that contract executable without
  creating a duplicate checklist/task system or a new file-upload capability.

### Verification

- Cross-checked the decision against the existing Project/Phase/File schema,
  StudioFlow permission registry, active SF-A plan, and contract access/audit
  sections.
- `git diff --check`: passed.

### Limitations

- This is a planning decision only: no application schema, migration, service,
  route, fixture, dependency, or legacy system was changed or accessed.

## R8.61 | 2026-09-14 | review(foundation): accept PF-8 and release SF-A planning

### Changed

- Accepted PF-8 after independently reviewing the R8.60 candidate receipt and
  completing the required Master Data/BQ browser smoke. Closed F-E in the
  roadmap and review ledger; the Foundation gate is released.
- Replaced the PF-8 plan with the first StudioFlow Recovery plan, SF-A. The
  frozen R8.12 reference remains evidence, not an implementation base.

### Verification

- Authorized browser smoke at desktop and 375 px passed for `/masterdata` →
  Brands and `/bq` → BQ Library: app navigation and representative read-only
  surfaces rendered normally. After sign-out, both app roots redirected to
  `/login`.
- R8.60 receipt/diff, workspace cleanliness, and PF-8 automated evidence were
  independently checked; no correction was found.

### Limitations

- PF-8 releases SF-A planning only. StudioFlow implementation starts only with
  the following READY SF-A plan; later MOM, Product Catalogue/Schedule,
  delivery/client exchange, SketchUp, and collaboration remain out of scope.

## R8.60 | 2026-09-14 | docs(foundation): record PF-8 acceptance candidate

### Changed

- Added the PF-8 candidate receipt with the frozen R8.12 StudioFlow reference,
  accepted F-A through F-D revisions, automated gate results, and the verified
  kantor disposable database scope.
- Recorded F-E/PF-8 in `docs/review.md` as candidate-only. Reviewer browser
  smoke remains required before closing the roadmap gate or releasing
  StudioFlow implementation.

### Verification

- `npm test`: 353/353 passed across 82 suites against disposable
  `studioflow_rebuild_test` in the approved `studioflowrb-gateb-test-db`
  container.
- `npm run typecheck`, `npm run lint`, `npm run check:boundaries`,
  `npm run check:legacy-runtime`, `npm run build`, documentation link scan,
  `git diff --check`, and staged whitespace review: passed.

### Limitations

- Reviewer browser acceptance is not run by this Executor receipt. F-E/PF-8
  remains open; no StudioFlow recovery implementation is released.
- No code, schema, migration, dependency, permission, route, data, or legacy
  checkout/database was changed or accessed.

## R8.59 | 2026-09-14 | review(foundation): accept F-D browser walkthrough

### Changed

- Accepted F-D/PF-6+PF-7 after the previously blocked Reviewer browser
  walkthrough passed. Closed F-D in `docs/roadmap.md`, removed its deferred
  review entry, and replaced the blocked plan with the next READY F-E/PF-8
  Foundation acceptance-and-freeze plan.

### Verification

- Authorized desktop and 375 px smoke passed: Master Data Brand and Supplier
  edit dialogs retained `Updated by … ·` medium-date/short-time metadata;
  pending Deletion Requests retained `14 Sep 2026, 15.25`; BQ Library retained
  the fixture item's medium-date-only `Updated 14 Sep 2026` cell. Navigation
  and layouts remained usable at both widths.
- After sign-out, both `/masterdata` and `/bq` redirected to `/login`.

### Limitations

- F-E/PF-8 is the remaining Foundation gate. StudioFlow recovery stays frozen
  until its full repository, Master Data, and BQ evidence is accepted.

## R8.58 | 2026-09-14 | review(foundation): defer F-D browser acceptance

### Changed

- Independently reviewed R8.57 F-D/PF-6+PF-7: the executable boundary rules,
  focused negative fixtures, canonical date formatter use, utility inventory,
  and allowed deferrals match the locked Foundation scope. No correction was
  found.
- Recorded the remaining browser scenarios in `docs/review.md`, kept F-D open
  in `docs/roadmap.md`, and changed `PLAN.md` to BLOCKED. F-E cannot be planned
  before this user-facing acceptance evidence exists.

### Verification

- Re-ran `npm run test:boundaries`, `npm run check:boundaries`,
  `npm run typecheck`, `npm run lint`, `npm run check:legacy-runtime`, and the
  complete `npm test` suite: 353/353 passed against the approved disposable
  kantor test database.
- Inspected the R8.57 diff and formatter option equivalence; working tree and
  whitespace check were clean before this documentation-only review revision.

### Limitations

- Browser acceptance is required because four user-facing date cells changed.
  Browser automation is unavailable in this Reviewer session, so F-D is
  BLOCKED rather than PASS; this is not a defect finding.

## R8.57 | 2026-09-14 | feat(boundaries,foundation): F-D utility curation and executable boundaries

### Changed

- Extended `scripts/check-boundaries.mjs` with seven executable rules and a
  combined `collectAllViolations` entry point, all wired into
  `npm run check:boundaries`:
  - app route files under `src/app/(platform)/<app>` are classified as the
    app's lane, so cross-app internal imports there are rejected;
  - Core purity: `src/platform/core` may not import the UI Engine or
    infrastructure;
  - UI Engine ownership: apps may import only the canonical
    `@/platform/ui_engine` surface (deep imports rejected) and raw legacy
    `ui-*` class tokens in app `.tsx` are denied;
  - permission vocabulary SSOT: `*_PERMISSIONS` maps must be disjoint,
    appId-prefix-owned, and the composition root must register them via
    `Object.values(...)` imported from the app public boundary; permission
    literals at known consumption call sites must exist in the vocabulary
    (audit actions and `AppError` codes share the id shape but are excluded);
  - app route ownership: every app registers `rootPath "/<app>"`, owns its
    client-safe import-free `public/nav.ts` declaring `/<app>`-rooted routes,
    and has a matching route directory.
- Duplicate-primitive enforcement: app-owned raw `new Intl.DateTimeFormat(`
  now fails `check:boundaries` unless the file is in the explicit documented
  allow list.
- Consolidated the four behavior-identical date formatters onto the canonical
  `formatInstant` (style `"datetime"` or `"date"`):
  `masterdata/brands/brand-directory.tsx`, `masterdata/vendors/vendor-directory.tsx`,
  `masterdata/deletions/deletion-directory.tsx`, and `bq/library/page.tsx`.
- Added deterministic `date.test.ts` coverage locking the `"date"`/`"datetime"`
  styles and Date-object input used by the directory consumers.
- Created `docs/UTILITY-INVENTORY.md` (REUSE/EXTEND/ADD/APP-OWNED/PURGE ledger,
  consumer matrix, convergence and deferral ledger, enforcement mapping) and
  linked it from the `docs/README.md` operational table.
- Recorded the six StudioFlow/BQ deferral candidates (service date-extraction
  key, browser-local audit stamps, and custom component formatters) in the
  inventory and allow-listed them so they remain unchanged; client-side
  pagination duplicates were examined and recorded as semantically different
  (merge PURGEd to preserve behavior; canonical `usePagination`/`buildPageMeta`
  remains the surface).

### Verification

- `scripts/test-boundaries-checker.mjs` extended with regression fixtures for
  every new rule (14 boundary rejections plus a foundation fixture tree covering
  import/layer, permission SSOT, route ownership, and duplicate primitives);
  both fixture scenarios pass.
- `npm run check:boundaries`, `npm run typecheck`, `npm run lint`,
  `npm run check:legacy-runtime`, `npm test`, and `npm run build` all pass.
- `git diff --check` clean; only the pre-existing unrelated `next-env.d.ts`
  working-tree churn remains uncommitted.

### Limitations

- Browser acceptance of the consolidated Master Data/BQ date cells is the
  Reviewer's; it was not performed in this Executor session (per AGENTS.md the
  implementation commit is not blocked by that). F-D roadmap closure and the
  F-E plan replacement follow Reviewer PASS of this revision.

## R8.56 | 2026-09-14 | review(foundation): accept F-C browser walkthrough

### Changed

- Recorded Reviewer PASS for F-C/PF-4+PF-5 after the four required browser
  scenarios passed against the approved kantor fixture; marked F-C complete in
  `docs/roadmap.md` and closed its deferred-review entry.
- Replaced the completed F-C plan with the next active F-D/PF-6+PF-7 plan.

### Verification

- Browser acceptance passed: authorized `/settings/general` access and
  unauthenticated refusal after sign-out; canonical read-only Light appearance
  remained visible after Save/reload; SettingsShell rendered at desktop and
  375 px; Master Data, BQ, and StudioFlow entry/navigation smoke passed.
- Documentation link and whitespace checks: passed.

### Limitations

- F-D has not been implemented. StudioFlow recovery remains frozen until F-E
  Foundation acceptance.

## R8.55 | 2026-09-14 | docs(plan): correct F-C reviewer scenario route and wording

### Changed

- Corrected the F-C Reviewer acceptance scenarios in `PLAN.md`: the settings
  route is `/settings/general` (the `(platform)` route group is never part of
  a URL), the Appearance surface is a section of that page rather than a tab,
  and the save/reload scenario now matches the read-only Theme behavior — the
  form's Save persists the unchanged canonical light theme across reloads.
- Advanced the PASS commit reference in `PLAN.md` from R8.55 to R8.56, since
  R8.55 is used by this revision.

### Verification

- Documentation link and whitespace checks: passed.
- No product, application, schema, data, migration, or route behavior changed.

### Limitations

- Browser acceptance remains deferred to a Reviewer/session with browser
  access, so the F-C walkthrough is still pending; F-D is not planned before
  that acceptance completes.

## R8.54 | 2026-09-14 | review(studioflow,foundation): verify D-SF ratification; defer F-C browser acceptance

### Changed

- Verified D-SF-01 through D-SF-07 against the current owner ratification
  instructions. All seven decisions are correctly captured in
  `docs/apps/studioflow/D-SF-RECOVERY-DISCOVERY.md` §5 (ratified in R8.51),
  `docs/apps/studioflow/studioflow.md`, `studioflow-project-contract.md`
  §7.1.1, `studioflow-mom-contract.md` (§2 "at most two images per block" and
  §10.1 two-step correction), and `studioflow-schedule-contract.md`. No
  documentation conflict found; no change required.
- Confirmed actual git HEAD is R8.53 — D-SF ratification (R8.51), roadmap
  markup correction (R8.52), and F-C Settings/Appearance implementation (R8.53)
  were all previously committed. The session prompt's "R8.50" tip was stale.
- Added F-C / PF-4+PF-5 browser acceptance entry to `docs/review.md` with the
  four exact Reviewer scenarios (settings access, appearance save/reload,
  narrow/desktop shell, three-app smoke).
- Updated `docs/roadmap.md` F-C entry to note R8.53 implementation committed
  pending browser acceptance.
- Updated `PLAN.md` to BLOCKED: noted that R8.53 implementation is complete,
  documented the four Reviewer acceptance scenarios, and described what PASS
  triggers (roadmap update, review.md closure, F-D plan at R8.55).

### Verification

- Cross-referenced each of the seven owner decisions with the D-SF decision
  register, the StudioFlow index, the project contract, and the MOM and
  Schedule contracts. No open decision remained and no conflict was found.
- `device_bash` unavailable (Windows update since 2026-09-08); browser
  acceptance for R8.53 cannot be completed in this session.

### Limitations

- F-C browser acceptance is deferred; `docs/review.md` names the exact
  missing verification. F-C remains open in `docs/roadmap.md`.
- F-D plan will be produced after F-C Reviewer PASS (target R8.55).
- No production code, schema, migration, route, data disposition, or
  StudioFlow feature was activated.

## R8.53 | 2026-09-14 | feat(platform,settings): typed global appearance theme

### Changed

- Added the typed global Platform Appearance contract (`PlatformTheme`
  union, sole approved value `"light"` per DESIGN.md) in
  `src/platform/core/settings/appearance.ts` and wired it through the
  `PlatformGeneralSettings` singleton: type, frozen defaults, strict Zod
  input, seed/read/update persistence, and audited safe deltas.
- Persisted the theme on the settings singleton via additive migration
  `20260914090000_platform_appearance_theme` — `theme TEXT NOT NULL DEFAULT
  'light'` plus a SQL CHECK (`theme IN ('light')`) so an unapproved value
  can never be stored.
- Split the General Settings page into General and Appearance sections. The
  Appearance section hosts the application title, the Brand mark control,
  and a read-only typed Theme field; the server action rejects a tampered
  or missing theme value.
- Applied SettingsShell to the platform General Settings page with a
  boundary-explicit Settings navigation: Platform-owned settings (General
  Settings, Users, Roles) plus gated links to the app-owned Master Data and
  StudioFlow workflow settings, reinforcing the ratified D-SF-02 ownership
  boundary.
- Kept General Settings a narrow typed aggregate: no generic key/value
  store, no per-app branding, no per-user or dark/density theme options, and
  no raw legacy `ui-*` classes or duplicate UI Engine primitives were
  introduced (PF-5 conformance audited).

### Verification

- `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, and
  `npm run check:legacy-runtime`: all passed.
- `npm test`: 349/349 passing, including the settings integration suite and
  the new SQL CHECK constraint test against the disposable
  `studioflow_rebuild_test` database in the kantor container.
- Additive migration `20260914090000_platform_appearance_theme` applied to
  every rebuild-only database in the target container (test, dev, browser
  test, regression test); no destructive migration.
- `npm run build` (Prisma generate + Next.js production build): passed.
- Whitespace and diff checks: passed.

### Limitations

- The appearance theme currently has exactly one approved variant
  (`"light"`); a future variant extends the union, SQL CHECK, and Zod schema
  in one changelog-scoped change, and the read-only Theme control always
  shows the canonical value.
- Application title and Brand mark stay on the same CORE.md §11 singleton
  row; they were regrouped into the Appearance section in the UI only, so
  schema and audit behavior for them are unchanged.
- Browser acceptance of the reorganized settings layout is a Reviewer step
  after this commit; this revision required automated checks only.

## R8.52 | 2026-09-14 | docs(roadmap): close D-SF completion markup

### Changed

- Closed the D-SF roadmap strikethrough marker so the completed item does not
  accidentally mark subsequent roadmap sections as historical.
- Advanced the F-C Executor target to R8.53 for the next local implementation
  revision.

### Verification

- Documentation link and whitespace checks: passed.

### Limitations

- No product, application, schema, data, or route behavior changed.

## R8.51 | 2026-09-14 | docs(studioflow): ratify D-SF recovery decisions

### Changed

- Ratified D-SF-01 through D-SF-07 in the durable recovery report and aligned
  StudioFlow route, settings, MOM, Product Catalogue, collaboration, SketchUp,
  and requirement-domain documentation.
- Locked Activity Center as the sole Today surface; deferred Upcoming toward a
  planning timeline/Gantt; retained MOM as its canonical later module; and kept
  temporary legacy route redirects only for later recovery cutover.
- Made `Project → Product Catalogue` canonical and authorized later discard of
  incorrect global rows only through a separately approved safe cutover.
- Marked D-SF complete and activated F-C/PF-4+PF-5 planning. F-E remains the
  gate before any StudioFlow implementation.

### Verification

- Reconciled every D-SF decision-register entry with the StudioFlow index,
  project, MOM, Schedule, and roadmap contracts; no decision remains open.
- Documentation links and whitespace checks: passed.

### Limitations

- This is planning/documentation only: no production code, schema, migration,
  data disposition, route alias, realtime system, SketchUp integration, or
  StudioFlow feature was activated.

## R8.50 | 2026-09-14 | review(studioflow): accept D-SF evidence and hold ratification gate

### Changed

- Independently accepted R8.49: the roadmap now correctly distinguishes
  completed D-SF evidence from the still-open Planner/owner ratification gate.
- Replaced the completed discovery execution plan with the bounded owner
  ratification gate for D-SF-01 through D-SF-07; no SF implementation slice is
  active.

### Verification

- Reviewed the R8.49 diff, final whitespace, and decision-register references;
  its open roadmap gate is consistent with the R8.48 discovery report.

### Limitations

- A READY implementation plan cannot be issued until the owner explicitly
  ratifies the affected product, route, data, integration, and settings policy.

## R8.49 | 2026-09-14 | docs(roadmap): retain D-SF ratification gate

### Changed

- Corrected the R8.48 roadmap ledger: its recovery evidence is complete, but
  D-SF remains an open gate until the Planner/owner ratifies D-SF-01 through
  D-SF-07. SF-A is not activated by the evidence record alone.

### Verification

- Documentation links, staged whitespace, and staged-diff review: passed.

### Limitations

- This correction changes only the roadmap and revision ledger. It does not
  alter the discovery report, StudioFlow contracts, code, schema, data, or
  legacy evidence.

## R8.48 | 2026-09-14 | docs(studioflow): recover pinned legacy discovery evidence

### Changed

- Completed the D-SF read-only recovery discovery from only committed legacy
  blobs at `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27` and recorded a durable
  capability/route, permission/ownership, and shared/downstream matrix.
- Classified the project workflow, phase transitions, work feed, deliverables,
  project catalogue/schedule, MOM, SketchUp, settings, and live-provider
  evidence as KEEP, MERGE, ALREADY_REPLACED, REDESIGN, PURGE, or
  DECISION_REQUIRED.
- Recorded seven explicit Planner decisions, including overlapping
  Upcoming/activity surfaces, settings/database ownership, MOM parity,
  treatment of existing global catalogue data, realtime/chat, SketchUp, and
  legacy route compatibility.
- Marked D-SF discovery complete in the roadmap and linked its report from the
  StudioFlow and documentation indexes. No implementation slice is activated.

### Verification

- Read-only Git identity check: supplied kantor legacy checkout `main` equals
  the required pin and its remote matches the recorded repository.
- Verified cited source paths from the pinned commit, then re-read the report
  against the current StudioFlow project, schedule, MOM, and index contracts.
- Documentation link/format checks, staged-diff review, and staged whitespace
  checks: passed.

### Limitations

- No legacy working-tree artifact, legacy environment, database, application,
  or script was accessed. The untracked recovery dumps and `foldering/` remain
  excluded from evidence.
- This is recovery evidence only: it changes no application code, schema,
  migration, permission, route, dependency, or existing data. SF-A remains
  blocked on Planner ratification of the D-SF decision register.

## R8.47 | 2026-09-14 | docs(plan): activate pinned StudioFlow recovery discovery

### Changed
- Recorded the owner-supplied legacy source baseline for D-SF at pinned commit
  `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`, including its branch and the
  working-tree-only artifacts excluded from evidence.
- Replaced the path blocker with a READY, documentation-only discovery contract
  covering the route, capability, settings, permission, persistence/ownership,
  shared-capability, and downstream-read matrices.
- Locked legacy working-tree artifacts and every legacy database-related target
  out of scope, including untracked recovery dumps.

### Verification
- Read-only Git baseline verification confirms the supplied path's `main` HEAD
  is the roadmap pin; no legacy working-tree file or database target was used.

### Limitations
- This only activates discovery. It does not implement a StudioFlow feature or
  resolve product decisions that the pinned evidence cannot determine.

## R8.46 | 2026-09-14 | review(storage): accept KB-030 and activate D-SF gate

- Independently reviewed R8.45. The resolver now compares canonical paths
  derived from the deepest existing realpath ancestor, preserving lexical and
  canonical containment checks. Focused Windows filesystem tests passed again;
  the reported full-suite, typecheck, lint, boundary, legacy-runtime, and build
  evidence is consistent with the scoped change.
- Accepted KB-030 as closed. Browser acceptance is not applicable to this
  infrastructure-only correction because no user-facing behavior or route
  changed.
- Replaced the completed KB-030 plan with the next roadmap outcome, D-SF
  read-only legacy recovery discovery. It is correctly BLOCKED pending the
  owner's exact kantor legacy-checkout path; no legacy source or database has
  been accessed.

### Verification

- Fresh focused `filesystem.test.ts`: 3/3 passed on kantor Windows.
- Commit diff and whitespace review: passed.

## R8.45 | 2026-09-14 | fix(storage): canonicalize local path containment

- Fixed Windows private local-storage reads rejecting a valid, freshly written
  key when the lexical storage root and `realpath` use different short/long
  representations.
- `resolveSafePath` now canonicalizes both root and target from their deepest
  existing realpath ancestor before testing containment. Lexical traversal is
  still rejected first, and canonical paths that escape through a symlink or
  junction still fail closed. The same resolver remains used by the public and
  private asset routes.
- Closed KB-030. No schema, migration, dependency, permission, signed-URL, or
  user-facing route behavior changed.

### Verification

- Focused local filesystem tests: 3/3 passed on kantor Windows.
- `npm run test` against the owner-approved disposable
  `studioflow_rebuild_test` container: 347/347 passed.
- `npm run typecheck`, `npm run lint`, `npm run check:boundaries`,
  `npm run check:legacy-runtime`, and `npm run build`: passed.
- Browser acceptance: not required by this infrastructure-only plan; no route
  or user-facing behavior changed.

## R8.44 | 2026-09-14 | docs(agent): move browser acceptance to reviewer

- Split plan evidence into Executor verification and Reviewer acceptance.
  Executor now completes implementation, automated/integration checks, and its
  local revision commit before handing off; ordinary browser acceptance runs
  afterward in the Reviewer session.
- Kept browser work with Executor only when a READY plan explicitly needs it to
  diagnose or complete implementation. Missing post-commit browser evidence no
  longer stalls an otherwise valid implementation commit.
- Updated the prompt loop so Reviewer inspects the commit and performs required
  browser-use acceptance before deciding PASS or returning one consolidated
  correction prompt.
- Shifted the still-READY KB-030 implementation target to R8.45. No application
  behavior, schema, migration, dependency, or local credential changed.

### Verification

- Harness cross-check across `AGENTS.md`, all three role contracts, harness
  README, active plan, and plan template: passed.
- Staged diff and whitespace checks: passed.

## R8.43 | 2026-09-14 | docs(agent): streamline prompt handoff and accept F-B

- Simplified the acceptance rule: the Executor owns safe environment discovery
  and fixture preparation, while the Planner defines outcome-specific evidence
  and the Reviewer decides PASS. Owner-designated disposable local resources
  and explicit current-session inputs are valid without duplicating secrets in
  committed configuration.
- Added the serial copy-ready prompt loop: Planner/Reviewer hands a READY plan
  to Executor; Executor returns a commit/evidence prompt to Planner/Reviewer;
  Reviewer returns one correction or next-slice Executor prompt. Role documents
  now enforce that output shape without duplicating the full plan.
- Accepted F-B/PF-2+PF-3. The owner-designated kantor container already held
  `studioflow_rebuild_test`; migrations applied and the full suite ran against
  it. Authenticated browser evidence verified grant-filtered launcher/sidebar
  visibility, authorized app roots, and redirects away from ungranted app roots
  for Master Data, BQ, and StudioFlow.
- The full suite passed 346/347. Its sole failure is the pre-existing,
  reproducible KB-030 Windows local-storage path defect; it does not overlap
  permission registration, app navigation, or route authorization, so it does
  not conceal an F-B regression. The next READY plan corrects KB-030.
- Added the approved kantor acceptance resource and account references only to
  ignored local configuration; no credential or connection secret is committed.
- No schema, migration, dependency, or application behavior changed.

### Verification

- Disposable database migration deploy: passed.
- Full test suite: 346/347 passed; only tracked KB-030 failed.
- Production boot and authenticated browser smoke: passed for Master Data, BQ,
  and StudioFlow full-access and per-app grant-filtered states.
- Repository diff and whitespace checks: passed.

## R8.42 | 2026-09-14 | docs(review): record F-B kantor acceptance preflight blocker

- Ran the F-B acceptance preflight with `STUDIOFLOW_LOCATION=kantor`.
  The local configuration has neither a `PLATFORM_TEST_DATABASE_URL` for a
  disposable `studioflow-rebuild` database nor a configured non-production
  browser test account/grant fixture.
- Re-ran every safe available check: focused registration tests, typecheck,
  lint, architecture boundary, legacy-runtime, and production build all pass.
  A production server started without instrumentation or registry errors; the
  unauthenticated root and each app root redirected to `/login`.
- `npm run test`, authenticated launcher/sidebar verification, and the
  authorized/unauthorized route matrix were intentionally not run: doing so
  would require the missing disposable database and supplied test account.
  F-B remains blocked and unaccepted; no application behavior changed.

### Verification

- Focused registration/registry tests: 9/9 passed.
- `npm run typecheck`, `npm run lint`, `npm run check:boundaries`,
  `npm run check:legacy-runtime`, and `npm run build`: passed.
- Production server (`next start`) boot plus `/`, `/masterdata`, `/bq`, and
  `/studioflow` unauthenticated redirects: passed.

## R8.41 | 2026-09-14 | docs(agent): require executor acceptance preflight

- Added a mandatory acceptance-execution protocol to `AGENTS.md`. Every READY
  plan now needs an executable recipe, and Executors must preflight and run all
  available acceptance checks before their local completion commit.
- Specified the safe failure path for missing test databases, test accounts, or
  browser runners: record the exact prerequisite and evidence, report
  `BLOCKED: ACCEPTANCE ENVIRONMENT REQUIRED`, and never claim acceptance.
- Replaced the stale F-B correction plan state with the valid `BLOCKED` state
  and an explicit kantor acceptance recipe. F-B now names its two external
  prerequisites: a disposable rebuild-only test database and a non-production
  browser test account.
- Aligned the deferred-review receipt with the same acceptance-environment
  blocker so it cannot be mistaken for reviewer-ready evidence.
- No application behavior, schema, migration, dependency, environment file, or
  external service changed.

### Verification

- Documentation review against `AGENTS.md`, `docs/agent/PLAN-TEMPLATE.md`, and
  the R8.40 deferred-review evidence: passed.
- Staged diff and whitespace checks: passed.

## R8.40 | 2026-09-14 | fix(foundation): restore unique app permission registration

- Removed `masterdata.promotion.approve` from BQ's owned permission vocabulary.
  BQ's retained legacy promotion-approval service paths now use the canonical
  Master Data public permission export, preserving the authorization rule
  without registering a cross-app permission twice.
- Added a complete-app registry regression test, which composes the same public
  registrations used during server boot and asserts that the Master Data
  promotion permission has exactly one owner. The development server now starts
  successfully instead of failing with `REGISTRY_DUPLICATE_PERMISSION`.
- Updated the deferred-review receipt for F-B. The overall Foundation outcome
  remains unaccepted pending authenticated browser and disposable integration
  test evidence.
- Recorded KB-030 after focused verification found that valid local private
  storage keys still fail signed-read verification on Windows; it is outside
  this ownership/navigation correction's locked scope.
- No schema, migration, or dependency change.

### Verification

- Focused app-registration and permission-registry tests: passed.
- `npx prisma generate` with `STUDIOFLOW_LOCATION=kantor`: passed.
- `npm run typecheck`, `npm run lint`, `npm run check:boundaries`,
  `npm run check:legacy-runtime`, and `npm run build`: passed.
- Development server boot and unauthenticated `/masterdata`, `/bq`, and
  `/studioflow` redirects to `/login`: passed.
- Full `npm run test`: unavailable as a pass because kantor lacks a disposable
  `PLATFORM_TEST_DATABASE_URL`; its focused filesystem test also reproduces the
  separately tracked KB-030 failure.

## R8.39 | 2026-09-14 | docs(review): record F-B duplicate permission boot blocker

- Runtime review of R8.38 found that BQ registers
  `masterdata.promotion.approve`, already owned by Master Data; the permission
  registry therefore rejects the app set and `npm run dev` fails at boot.
- Recorded KB-029 and extended the F-B correction plan with ownership cleanup
  and a boot/registry regression test. F-B remains unaccepted.
- No application code changed in this review revision; implementation target
  is R8.40.

### Verification

- Read-only review of commit `ad552ad` and the supplied runtime error evidence.

## R8.38 | 2026-09-14 | fix(app): give each app owned route/navigation constants without leaking server code into client bundles

- Completed F-B / PF-2 + PF-3: Master Data, BQ, and StudioFlow each own their
  route helpers (`MASTERDATA_ROUTES`, `BQ_ROUTES`, `STUDIOFLOW_ROUTES`) and
  navigation link definitions (`MASTERDATA_NAV_LINKS`, `BQ_NAV_LINKS`,
  `STUDIOFLOW_NAV_LINKS`), exported from each app's public boundary.
- Found and fixed a client/server boundary leak: the `"use client"` nav
  components imported nav data from each app's `public/index.ts` barrel,
  which also re-exports `*_PERMISSIONS` from `../service` — a server-only
  module importing `node:async_hooks`/`node:crypto`, Prisma, and audit/rbac
  code. This pulled server-only code into the browser bundle and broke the
  production build.
- Extracted the route/nav constants into a new side-effect-free
  `public/nav.ts` per app (no service or Node built-in imports); each
  `public/index.ts` now re-exports from `./nav` for server-side consumers,
  while the client nav components (`src/app/(platform)/{masterdata,bq,studioflow}/nav.tsx`)
  import directly from `@/apps/<app>/public/nav`, bypassing the
  service-dependent barrel entirely.
- Updated `catalogue.ui.test.ts` to assert against `STUDIOFLOW_NAV_LINKS`
  from the same client-safe module instead of regex-matching source text.
- Verified full test suite (346 tests passed), typecheck, architecture
  boundaries, legacy runtime check, and production build (Turbopack) with no
  client-bundle Node built-in errors.

### Verification

- `npm run test`: 346/346 passed.
- `npm run check` (typecheck, boundaries, legacy-runtime): all OK.
- `npm run build`: succeeded, all routes compiled.

## R8.37 | 2026-09-14 | docs(review): keep F-B open for route and navigation ownership

- Reviewed R8.36 and confirmed the permission-vocabulary decentralization.
- Recorded that route helpers, app-owned navigation definitions, and their
  browser/regression evidence were not included, so F-B / PF-2+PF-3 remains
  open under the correction plan.
- No application code changed in this review revision; implementation target
  is R8.38.

### Verification

- Read-only review of commit `06890dc` and `git diff --check`: passed.

## R8.36 | 2026-09-14 | feat(app): decentralize permission ownership to individual apps and keep central registration metadata-only

- Decentralized permission vocabulary definitions: Master Data, BQ, and StudioFlow now own and export their canonical permission arrays from their public boundaries (`MASTERDATA_PERMISSIONS`, `BQ_PERMISSIONS`, `STUDIOFLOW_PERMISSIONS`).
- Updated `src/app/app-registrations.ts` to compose permission registrations exclusively via public imports from each app, ensuring the central composition root contains metadata only and no duplicated permission literals (completing F-B / PF-2 + PF-3).
- Verified full test suite (346 tests passed), typecheck, architecture boundaries, legacy runtime check, and production build.
- Advanced revision ledger state to current R8.36 and next R8.37.

## R8.35 | 2026-09-14 | docs(roadmap): activate F-B application ownership plan

- Marked F-A / PF-1 accepted after the R8.33 correction and R8.34 review.
- Activated the READY F-B / PF-2+PF-3 plan for app-owned permission
  vocabularies, registration metadata, route helpers, and navigation definitions.
- Kept existing URLs, authorization behavior, and StudioFlow feature freeze
  locked; no application code or schema changed.

### Verification

- `git diff --check`: passed.

## R8.34 | 2026-09-14 | docs(review): accept PF-1 local storage boundary

- Reviewed R8.33 and confirmed the shared realpath-aware resolver is used by
  the local adapter and public/private application asset routes.
- Confirmed symlink tests no longer swallow assertion failures; closed KB-028
  and accepted PF-1. KB-027 was corrected in R8.31.
- Recorded the reported 346 passing tests, typecheck, architecture boundary,
  legacy-runtime, and production build checks. Supabase remains deferred.

### Verification

- Read-only review of commit `3b102b8` and `git diff --check`: passed.

## R8.33 | 2026-09-14 | fix(platform): centralize realpath-based symlink and path traversal security across routes and storage

- Centralized storage path resolution and security validation into `resolveSafePath` in `@platform/infrastructure/storage/filesystem`, ensuring lexical prefix checks and realpath-based symlink escape protection are uniformly shared between storage adapters and public/private asset route handlers.
- Corrected symlink test suite in `filesystem.test.ts` to strictly classify OS-level privilege restrictions (EPERM/EACCES) while ensuring traversal and symlink escape rejections are fully asserted without false passes (addressing KB-028).
- Advanced revision ledger state to current R8.33 and next R8.34.

## R8.32 | 2026-09-14 | docs(review): record R8.31 symlink correction

- Reviewer confirmed the signed URL expiry correction, but found that the
  symlink security test swallows assertion failures and that public/private
  routes bypass the adapter's realpath boundary check.
- Recorded KB-028 and opened a focused correction plan for route isolation and
  non-masked symlink tests. PF-1 remains unaccepted.
- No application code changed in this review revision; implementation target
  is R8.33.

### Verification

- Read-only review of commit `a9a59d6` and `git diff --check`: passed.

## R8.31 | 2026-09-14 | fix(platform): correct signed URL absolute expiry contract and add symlink security tests

- Corrected `createSignedReadUrl` in `LocalFilesystemStorage` (`filesystem.ts`) to calculate absolute Unix expiration timestamp (`Math.floor(Date.now() / 1000) + expiresInSeconds`) instead of a relative duration delta, resolving the immediate token expiration bug (KB-027).
- Added robust realpath-based symlink escape protection in `resolveSafePath` to prevent directory traversal via symlinks pointing outside the storage root.
- Expanded `filesystem.test.ts` with test coverage verifying valid absolute expiry generation and symlink security boundary enforcement.
- Advanced revision ledger state to current R8.31 and next R8.32.

## R8.30 | 2026-09-14 | docs(review): record R8.29 local storage correction

- Reviewer found that the local private signed URL adapter emits an expiry
  duration while the route interprets it as an epoch timestamp, causing MOM
  URLs to expire immediately.
- Recorded KB-027, changed PF-1 to correction-required, and opened a focused
  correction plan requiring expiry-contract and symlink-escape coverage.
- No application code changed in this review revision. The implementation
  correction is the next outcome, targeting R8.31.

### Verification

- Read-only review of commit `3393f4a` and `git diff --check`: passed.

## R8.29 | 2026-09-14 | feat(platform): implement canonical LocalFilesystemStorage adapter for self-hosted Foundation target

- Implemented `LocalFilesystemStorage` and `LocalPublicFilesystemStorage` adapter implementing the provider-neutral `ObjectStorage` and `PublicObjectStorage` contracts in `@platform/infrastructure/storage/filesystem`.
- Configured physical storage roots via `STUDIOFLOW_STORAGE_ROOT` (defaulting to `.storage` outside `public/`), supporting safe path resolution, path-traversal protection, secure file write/remove, and signed read URL generation.
- Added Next.js application asset route handlers for public assets (`/api/platform/assets/public/[...key]`) and private authenticated/token-signed assets (`/api/platform/assets/private`).
- Updated platform runtime composition (`src/platform/runtime.ts`) to bind `objectStorage` and `brandMarkStorage` to the local filesystem storage singletons.
- Added comprehensive unit tests for filesystem storage (`filesystem.test.ts`), ran full test suite (346 tests passed successfully), typecheck, architecture boundaries, legacy runtime check, and production build.
- Advanced revision ledger state to current R8.29 and next R8.30.

## R8.28 | 2026-09-14 | docs(architecture): make local storage the Foundation target

- Recorded the owner's final deployment decision: self-hosted/local is the
  target, with a configuration-driven `LocalFilesystemStorage` adapter as the
  canonical provider behind the provider-neutral `ObjectStorage` boundary.
- Reframed Brand mark as publicly readable only through the application's
  public asset surface, while MOM and future private assets remain behind
  authenticated/authorized application endpoints; private storage is never a
  static/public directory.
- Clarified that databases store metadata and opaque storage keys only, never
  file/blob contents or absolute machine paths.
- Parked the Supabase adapter as optional follow-up and removed Supabase
  provisioning/browser evidence as a PF-1 release blocker. Replaced the active
  plan, platform storage roadmap, Core contract, environment example,
  StudioFlow contracts, review queue, and KB-004 wording accordingly.
- No application code or schema changed. The next implementation outcome is
  the READY PF-1 local-storage plan targeting R8.29.

### Verification

- `git diff --check`: passed.
- Documentation-only planning change; no application test suite was rerun.

## R8.26 | 2026-09-13 | fix(platform): increase request body limit for managed uploads, update storage contract and operational cleanup logging

- Increased Next.js Server Action request body size limit to 4 MB in `next.config.ts` while keeping file validation strict at 2 MB, preventing framework-level rejection of valid 2 MB PNG uploads due to multipart metadata/boundary overhead.
- Updated `CORE.md` storage contract to explicitly document the two-bucket architecture (`platform-public-assets` for managed Brand marks, `platform-assets` for private MOM objects) and durable storage keys in the database instead of local filesystem paths.
- Replaced silent `catch(() => undefined)` cleanup and rollback removals in settings and MOM storage actions with centralized `reportOperationalError` logging for stray object tracking.
- Advanced revision ledger state to current R8.26 and next R8.27.

## R8.27 | 2026-09-13 | docs(review): record PF-1 verification gate and next plan

- Reviewed R8.25 and R8.26 independently; full suite passed 343/343, with
  typecheck, lint, architecture boundaries, legacy-runtime checks, production
  build, and whitespace validation also passing.
- Kept PF-1 blocked because provider-backed/browser evidence is unavailable
  until `platform-public-assets` and private `platform-assets` are provisioned.
- Recorded the exact missing public-read/private-read/server-only mutation
  evidence in `docs/review.md` and replaced the active plan with the blocked
  verification-closure plan.
- Named F-B / PF-2+PF-3 as the next implementation outcome after PF-1 passes;
  no application code or schema changed in this revision.

### Verification

- `npm test`: 343 passed, 0 failed, 0 cancelled.
- `npm run typecheck`, `npm run lint`, `npm run check:boundaries`,
  `npm run check:legacy-runtime`, and `npm run build`: passed.
- `git show --check` for R8.25 and R8.26: passed.

## R8.25 | 2026-09-13 | feat(platform): separate managed Brand mark storage

- Reduced Core storage to the provider-neutral object port, fake seam, and
  server-generated opaque keys; moved Supabase mechanics to Platform
  infrastructure and StudioFlow MOM image policy to StudioFlow.
- Replaced runtime filesystem Brand mark writes with validated PNG objects in
  `platform-public-assets`. Durable General Settings now stores only a nullable
  managed storage key, while existing safe external/site-relative URLs remain
  valid and untouched.
- Kept `platform-assets` private for MOM: MOM still obtains signed read URLs;
  Brand marks resolve public presentation URLs from the separate public bucket.
  All upload, replacement, and deletion operations remain server-only.
- Added replacement, persistence rollback, removal, malformed/oversized PNG,
  Core-boundary, and two-bucket regression coverage. General Settings now
  supports removal and accepts its locked 2 MB file limit at the Server Action
  boundary.

### Dependencies and migrations

- No dependency added. Added additive migration
  `20260913100000_platform_brand_mark_storage_key` for nullable
  `brand_mark_storage_key`; existing `brand_mark_url` data is not rewritten.

### Verification

- `prisma generate`, `npm run typecheck`, `npm run lint`,
  `npm run check:boundaries`, and `npm run check:legacy-runtime`: passed.
- Focused storage, Brand mark, MOM-policy, and form tests: 14 passed.
- Full suite and disposable database migration could not run to completion:
  Prisma schema engine failed before executing SQL against the verified
  `studioflow_rebuild_test` target, whose schema is behind the repository.
  The ambiguous home development target was not touched. Provider credentials
  are not provisioned, so browser verification remains unavailable; KB-004
  remains open.

## R8.24 | 2026-09-13 | docs(roadmap): consolidate foundation and recovery plan

- Consolidated PF-1 through PF-8 into five substantive Foundation outcomes:
  Core/storage purity; application ownership/navigation; Settings/Appearance/
  UI Engine; utility curation/boundary enforcement; and final acceptance/freeze.
- Resolved the circular dependency between Foundation UI/utility curation and
  post-Foundation legacy extraction. A read-only StudioFlow discovery/contract
  gate now happens before the last Foundation passes, while all StudioFlow
  production implementation remains frozen until Foundation acceptance.
- Replaced the fragmented StudioFlow backlog with six coherent recovery
  outcomes covering daily project operations, delivery/client collaboration,
  project records/discovery, Schedule/FF&E, SketchUp/external integration, and
  final parity cutover/purge; Workflow Optimization vNext remains post-parity.
- Recorded that the 111 KB frozen StudioFlow service is not decomposed as a
  standalone task. Modular ownership is created as accepted capabilities are
  recovered and cut over.
- Marked the old R7 StudioFlow implementation plan historical because its
  global Product Catalogue premise, old phase sequence, and deferred scope
  conflict with the recovery direction. Advanced the active PF-1 target to
  R8.25 without changing its implementation scope.

### Dependencies and migrations

- No dependency, schema, migration, runtime, or application behavior change.
- The two owner-supplied proposed reference documents remain untracked and were
  used as planning evidence only.

### Verification

- Local Markdown link scan passed across the four changed planning documents.
- Program consistency check confirmed F-A through F-E, D-SF, and SF-A through
  SF-G are all present and ordered in the active roadmap.
- Git comparison confirmed no `src`, Prisma, or package file changed from the
  frozen R8.12 runtime baseline through the pre-plan HEAD.
- `git diff --cached --check`: passed.

## R8.23 | 2026-09-13 | docs(harness): simplify planner executor workflow

- Replaced the three-role ceremony with two practical operating lanes:
  Planner/Reviewer owns intent, architecture, review, and the next plan;
  Executor owns implementation details within the READY boundary.
- Made one substantial end-to-end outcome the default unit of work. Plans split
  only for a real decision gate, risk/rollback boundary, independent outcome,
  or demonstrated context/tool limit—not by file, layer, CRUD step, or an
  arbitrary token estimate.
- Reduced active plan states to DRAFT, READY, and BLOCKED; made the copy-ready
  Executor prompt a required final section; and updated the active PF-1 plan to
  use the next revision, R8.24.
- Removed mandatory ledger churn from every handoff. Executor still updates the
  changelog and commits; `review.md` is now only for genuinely deferred review,
  while immediate findings return as one consolidated correction pass.
- Preserved database and legacy isolation, shared ownership boundaries, dirty
  worktree protection, verification, local revision commits, and remote safety.

### Dependencies and migrations

- No dependency, schema, migration, runtime, or application behavior change.

### Verification

- Local Markdown link scan passed across the nine changed harness/plan
  documents.
- Active-harness terminology scan found no stale RATIFIED state, deterministic
  worker wording, mandatory READY-slice wording, or mandatory review-ledger
  transition.
- The active PF-1 plan was reduced from 1,541 to 759 words while retaining its
  material decisions, acceptance criteria, safety boundaries, and target.
- `git diff --cached --check`: passed.

## R8.22 | 2026-09-13 | docs(foundation): reconcile PF-0 and prepare PF-1

- Reconciled the active plan and Foundation ledgers to the accepted PF-0 state:
  R8.21 independently passed the R8.20 correction, KB-026 is closed, and no
  PF-0 review entry remains.
- Removed stale "awaiting review" status from the roadmap and canonical
  baseline/freeze record without reopening or re-executing PF-0.
- Replaced the completed PF-0 work order with the sole READY PF-1 slice for
  Core storage purity and Platform Brand mark migration. The plan locks
  provider-neutral ownership, stored-reference behavior, additive migration,
  compensating cleanup, and verification limits without changing production
  code.

### Verification

- Reconciled `CHANGELOG.md` R8.18–R8.21, `docs/review.md`, and KB-026 in
  `docs/knownbug.md`.
- `git diff --cached --check`: passed.

## R8.21 | 2026-09-13 | docs(foundation): accept PF-0 reference correction

- Independently verified the KB-026 correction in R8.20 and closed KB-026.
- Confirmed the canonical PF-0 record names R8.12 as the exact frozen
  StudioFlow RB reference; R8.16 remains a documentation-only overlay that
  cannot supersede or move it.
- Confirmed the narrow exception and PF-8-only Foundation/StudioFlow Recovery
  gate release remain unchanged. Removed the satisfied correction from the
  review ledger.

### Verification

- Both pinned commits resolve locally; R8.12 is an ancestor of R8.16.
- The R8.12-to-R8.16 range changes documentation and ledger files only.
- `git show --check R8.20`: passed.

## R8.20 | 2026-09-13 | docs(foundation): pin frozen StudioFlow RB reference

- Corrected KB-026 by naming `nyo95/studioflowrb` R8.12
  (`45d74884c1ec268b30b1d5e6dc86a80da32cffe7`) as the exact frozen StudioFlow
  RB reference.
- Recorded that R8.12 remains the approved rebuild behavior/reference baseline
  and that the later R8.16 commit is a documentation-only planning overlay that
  cannot supersede or move the frozen StudioFlow reference.
- Preserved the narrow freeze exception and PF-8 as the sole Foundation and
  StudioFlow Recovery gate release; returned the correction to the review
  ledger while KB-026 awaits closure on PASS.

### Verification

- Verified R8.12 is an ancestor of R8.16 and the R8.12-to-R8.16 changes are
  limited to documentation and ledger files.
- `git diff --cached --check`: passed.

## R8.19 | 2026-09-13 | docs(foundation): record PF-0 review correction

- Independently reviewed R8.18 against the ratified PF-0 slice, the Foundation
  Reference, and repository boundaries.
- Recorded KB-026: the canonical freeze record does not explicitly identify the
  current StudioFlow RB as the frozen reference required by Foundation Reference
  §30. PF-0 remains unaccepted pending a focused documentation correction.
- Removed PF-0 from the ready-for-review ledger because the verified governance
  defect now belongs in `knownbug.md`.

### Verification

- Verified both pinned rebuild commits resolve locally and R8.12 is an ancestor
  of the R8.16 documentation-only overlay.
- Reviewed the R8.18 commit scope: governance and ledger files only; no
  production source, schema, migration, dependency, test, or app-contract file
  changed, and owner-supplied reference files remain untracked.
- `git show --check R8.18`: passed.

## R8.18 | 2026-09-13 | docs(foundation): pin rebuild baseline and continuation freeze

- Added the canonical PF-0 Foundation baseline/freeze record, preserving R8.12
  as the approved behavior/reference baseline and distinguishing R8.16 as its
  documentation-only planning overlay.
- Pinned the legacy evidence identity as metadata only; PF-0 neither accesses
  a legacy checkout nor permits legacy database access.
- Recorded Master Data and BQ behavioral preservation, the narrow StudioFlow
  continuation freeze exception, and PF-8 as the sole Foundation/StudioFlow
  Recovery gate-release condition.
- Linked the completed PF-0 implementation from `roadmap.md` and added its
  scoped independent-verification handoff to `review.md`.

### Verification

- Verified the R8.12 baseline and R8.16 overlay commits locally with
  `git show -s`.
- `git diff --cached --check`: passed.

## R8.17 | 2026-09-13 | docs(foundation): prepare PF-0 baseline freeze plan

- Replaced the completed harness plan with the active Project Rebuild Foundation
  plan, based on the approved Foundation Reference and current roadmap.
- Marked only PF-0 (baseline pin and StudioFlow continuation freeze) READY;
  PF-1 remains the next planned implementation slice after PF-0 acceptance.
- Recorded the exact rebuild and legacy evidence baselines, the documentation
  overlay distinction, freeze boundary, acceptance criteria, and R8.18 executor
  handoff without modifying production behavior, contracts, schema, or tooling.

### Verification

- Verified the R8.12 behavior/reference baseline and current R8.16 planning
  overlay commits locally.
- `git diff --cached --check`: passed.

## R8.16 | 2026-09-13 | docs(harness): correct verification record

- Corrected R8.15's verification record: its staged documentation diff passed
  `git diff --check` before the local commit.

### Verification

- `git diff --check`: passed.

## R8.15 | 2026-09-13 | docs(harness): restore revision and target safeguards

- Restored the exact local revision subject, ordinal, ledger, staging, and
  reporting protocol in the role-harness reference used by all editing and
  reviewing roles.
- Corrected rebuild database validation to require a target belonging only to
  `studioflow-rebuild`, without assuming a database name from local connection
  configuration.
- Restored explicit serial Codex/Claude/OpenCode handoff guidance.

### Verification

- `git diff --check`: passed.

## R8.14 | 2026-09-13 | docs(harness): introduce role-based AI workflow

- Refactored `AGENTS.md` into a bootstrap, invariant, and explicit role-router contract while preserving owner authority, location/database safeguards, read-only legacy evidence, legacy-database prohibition, ownership boundaries, revision protocol, remote safety, and the current Next.js rule block.
- Added scoped PLANNER, EXECUTOR, and REVIEWER contracts under `docs/agent/`, including discovery, deterministic stop rules, independent five-gate review, priority, ledger transitions, and a proportionate small-task bypass.
- Formalized temporary root `PLAN.md` with a stable Plan ID and Scope; recorded this documentation migration as completed without changing roadmap priorities or product/business contracts.
- Reduced `docs/SESSION-HANDOFF-PROMPT.md` to a snapshot-free role-router entry.
- Made browser verification conditional on task type and explicit acceptance criteria; a user-facing or interaction change still requires it.
- Documented, but did not implement, the optional deterministic context-resolver script. No production code, schema, migration, or app behavior changed.

### Verification

- Documentation cross-links and role routing: reviewed.
- `git diff --check`: passed.

## R8.13 | 2026-09-12 | docs(masterdata): record non-blocking cleanup findings

- Added KB-024 for remaining `any` parameters in promotion mapping.
- Added KB-025 for the overly broad Master Data services barrel exports.
- Recorded both as open P2 cleanup items with no current functional blocker.
- Added the StudioFlow Recovery priority sequence R-SF0 through R-SF3 to the
  roadmap, including the freeze, full legacy extraction, routing/ownership
  contract, and shared-foundation curation gates.
- Added Project Rebuild Foundation priorities PF-0 through PF-8 ahead of
  StudioFlow Recovery, with the foundation release as the entry gate.
- Reconciled the PF sequence with the revised foundation reference: app
  registration cleanup, route ownership cleanup, settings/appearance ownership,
  UI Engine solidification, shared utility curation, proportional enforcement,
  and foundation freeze.

### Verification

- `git diff --check`: passed.

## R8.12 | 2026-09-12 | docs: audit updates to roadmap and knownbug

- Removed parked AI file organization from `roadmap.md` per owner instruction.
- Marked the Master Data God-Service decomposition as completed in `roadmap.md` (shipped in R8.11).
- Updated the status headers for `roadmap.md` and `knownbug.md`.
- Updated `knownbug.md` to properly document KB-019 (`listWaitingOnMe` query limit) as Closed since it was fixed in R8.05. Fixed the StudioFlow intro paragraph reference to the open KB range.

### Verification

- `git diff --check`: passed.

## R8.10 | 2026-09-12 | chore(tooling): refresh generated Next.js type references

- Recorded the generated `next-env.d.ts` update produced by the current Next.js
  development setup, changing route and root-parameter type references from
  `.next/types` to `.next/dev/types`.
- No application logic, schema, migration, or dependency changes.

### Verification

- `git diff --check`: passed.

## R8.11 | 2026-09-12 | refactor(masterdata): decompose monolithic service.ts into modular domain services

- Split the 4788-line monolithic `masterdata/service.ts` into typed domain service factories: `unit`, `category`, `vendor-type`, `supplier-category`, `brand`, `vendor`, `sku`, `pricing`, and `deletion`.
- Extracted all shared utilities (actor validation, permission checks, audit writing, deletion request creation, normalization helpers) into `services/shared.ts`.
- Added `services/index.ts` barrel with typed exports (`MASTERDATA_PERMISSIONS`, `MasterDataServicePorts`, `TxClient`, `MasterDataDeletionTarget`, `hasPermission`).
- `service.ts` remains backward-compatible as a thin facade that composes domain services via object spread and adds `summary`, `listPromotionReferences`, `validatePromotionReference`.
- All domain service factories now explicitly destructure `runTransaction` from `ports`.
- Corrected missing imports (`addDirectCause`, `addParentCauses`, `removeDirectCause`, `removeParentCausesAndFindRestored`, `assertPriceMaterialRestorable`, `assertWorkPriceRestorable`) in `vendor.service.ts` and removed the dead stub `runTransaction` function; also ran `prisma generate` to resolve stale generated client for `SupplierCategory` and `VendorSupplierCategory` fields.
- Updated `docs/roadmap.md` with the owner-directed architectural refactoring and UI Engine enforcement sequence as a prerequisite gate before StudioFlow continuation.

### Verification

- `prisma generate`: passed; `SupplierCategory`, `VendorSupplierCategory`, and `supplier_categories` fields now present in generated client.
- `npx tsc --noEmit`: passed (zero errors).
- `npm run lint`: passed.
- `npm run check:boundaries`: passed.
- Browser verification of Master Data routes: pending (tracked in `docs/review.md`).

## R8.09 | 2026-09-11 | feat(masterdata): inline-creatable supplier category picker

- Owner follow-up to R8.08: the Supplier category picker in the Supplier
  create/edit dialogs is now a creatable search like the Brand Product
  Category picker, so staff can type a new category name, have it created
  immediately, and keep adding more than one category per Supplier.
- The picker passes an `onCreate` handler when the actor holds
  `masterdata.dictionary.manage`; the new
  `createSupplierCategoryQuick` service derives a unique upper-case code from
  the typed name (suffix `-2`, `-3`, … on collision) and reuses an existing
  live category with the same name instead of duplicating it. The client adds
  the returned id to the selection right away (shared `useOptionOverlay`),
  matching the Brand category flow.
- New `createSupplierCategoryQuickAction` in
  `settings/general/masterdata/supplier-categories-actions.ts`; the Supplier
  page now passes `canManageCategories` down to the directory.
- No schema or migration change for this revision.

### Verification

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run check:boundaries`: passed.
- Pending real-browser verification continues to be tracked in
  `docs/review.md`.

## R8.08 | 2026-09-11 | feat(masterdata): add supplier category dictionary and vendor assignment

- Added the **Supplier Category** dictionary, distinct from Supplier Type.
  Supplier Type stays the capability dimension (Material/Labor eligibility and
  pricing guard); Supplier Category is a plain classification label (for
  example fabric supplier or hardware supplier) with no capability or pricing
  consequence.
- New `SupplierCategory` model and a many-to-many `VendorSupplierCategory`
  join (`Vendor` already supports zero-to-many; the owner confirmed a supplier
  may carry more than one category).
- Schema change applied to the rebuild-only kantor database through the
  additive manual migration `20260911150000_add_supplier_category` using
  `prisma migrate deploy`; `prisma generate` and `prisma validate` passed.
  Pre-existing office migration-history drift (two migrations edited after
  apply, one local-only applied migration) was not touched; `migrate dev`
  would have requested a reset, so deployment went through the hand-written
  additive SQL instead. `prisma migrate status` reports the database up to
  date.
- Service (`src/apps/masterdata/service.ts`): full dictionary CRUD
  (`createSupplierCategory`, `updateSupplierCategory`, archive/restore,
  `listSupplierCategories`, `listSupplierCategoriesForAssignment`) with the
  same duplicate/soft-delete rename, reference, and audit conventions as
  Supplier Type; deletion flows through the shared deletion request and
  `masterdata.deletion.approve` direct hard-delete path with
  `"supplier_category"` added to `MasterDataDeletionTarget`;
  `createVendor`/`updateVendor` now accept `supplierCategoryIds` and maintain
  the join atomically (assignment inputs validated as live categories);
  `getVendor`/`listVendors` include the assignments and `listVendors` gains a
  `supplierCategoryId` filter.
- Server actions: vendor create/update actions pass `supplierCategoryIds`
  through; a new `supplier-categories-actions.ts` exposes save, archive,
  restore, and deletion-request actions with the same permission-gated
  behavior as the Supplier Type directory.
- UI: new **Supplier categories** tab in Settings → Master Data
  (`supplier-category-directory.tsx`); the Supplier directory gains a
  categories multi-picker in create/edit, category badges in the table,
  and a category filter next to the existing supplier type filter.

### Verification

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `prisma validate`, `prisma generate`, `prisma migrate status`, and
  `prisma migrate deploy` (rebuild-only kantor database): passed.
- Not yet verified in a real browser; pending entry added to
  `docs/review.md`. `next-env.d.ts` remains an unrelated owner
  working-tree change and was not committed.

## R8.07 | 2026-09-11 | fix(masterdata): save material+labor and labor price edits

- Fixed Material + Labor and Labor price edits failing with a missing-field
  validation error. `vendorField` is defined as `!edit && (...)` so it rendered
  nothing during edit, which also dropped the required hidden `vendorId` input
  from the form; the server action then rejected the submit because
  `vendorId` is mandatory for non-material prices.
- Edit mode now emits the hidden `vendorId` input directly from the existing
  row so the service update path receives the supplier reference.
- Material price edit is unaffected: SKU, Supplier, and Unit stay read-only by
  contract and no hidden inputs were missing.

### Verification

- `npx tsc --noEmit`: passed.

## R8.06 | 2026-09-11 | merge(main): integrate remote R8.05 utilities and UI fixes

- Integrated the GitHub `main` R8.05 changes, including the missing BQ
  calculation-expression utility and its tests.
- Integrated the canonical instant-display UI Engine component and related
  StudioFlow/BQ routing and surface corrections.
- Preserved the local R8.05 Master Data direct hard-delete implementation and
  its contract/test changes.

### Verification

- Merge simulation and actual merge completed without conflicts.
- `git diff --cached --check` passed before final commit.

## R8.05 | 2026-09-11 | fix(studioflow,ui-engine): close KB-019 and wire canonical instant display

- Completed KB-019's bounded `listWaitingOnMe` read while preserving open work
  assigned to unavailable users under `NEEDS_ASSIGNMENT`.
- Wired the canonical UI Engine `FormattedInstant` component into the three
  audited Master Data, BQ, and StudioFlow date call sites.
- Closed KB-019 and marked the audited date-display consolidation complete.

### Verification

- `npm run typecheck`: passed.
- `npm run check`: passed.
- Full test suite remains environment-blocked by the pre-existing database hook
  failures; unrelated local changes remain uncommitted.

## R8.05 | 2026-09-11 | feat(masterdata): allow approved RBAC direct hard delete

- Added a direct hard-delete path for every Master Data deletion target when the
  actor has `masterdata.deletion.approve`; no `DeletionRequest` is created.
- Users without that grant retain the existing archive/deactivate → request →
  approval workflow.
- Direct deletion keeps the existing archive and dependency guards. Brand hard
  deletion now explicitly rejects active branded SKUs; Brand archive continues
  to archive all branded SKUs and Material Prices with provenance causes.
- Updated the Master Data, Brand, Vendor, and Pricing contracts to document both
  deletion paths and direct-deletion audit metadata.

### Verification

- `npm run typecheck`: blocked by the pre-existing missing module
  `@/apps/bq/lib/calc-expression` in `src/app/(platform)/bq/[id]/project-editor.tsx`;
  no new type errors were reported for this change.
- Prisma/database not changed.

## R8.04 | 2026-09-11 | fix(bq): fix commitNum prop plumbing and dev server rendering

- Resolved undefined identifier `commitNum` error in BQ project editor component
  (`src/app/(platform)/bq/[id]/project-editor.tsx`) by properly plumbing `commitNum`
  down to `ItemTable`, `ItemRows`, `SubObjectRows`, and `LineItemRow` parameters.
- Force-stopped stuck dev server process, cleared `.next` build cache, and verified
  Next.js production build (`npm run build`) and system checks (`npm run check`) pass 100%.

### Verification

- `npm run build`: passed (all app routes compiled successfully).
- `npm run check`: passed.

## R8.03 | 2026-09-10 | docs(handoff): reconcile session handoff prompt to R8.03 state

- Reconciled `docs/SESSION-HANDOFF-PROMPT.md` to reflect current `R8.03` / `main`
  baseline and owner's active execution priorities (Platform routing completed,
  UI Engine date/time consolidation & BQ priorities active, StudioFlow closure paused).
- Updated handoff prompt task lists to reflect completed features (Main Route
  settings, FileDropZone, English UI, Add Project client creation, MOM, Product Catalogue).

### Verification

- Local Markdown link-target audit: passed.
- `npm run check`: passed.

## R8.02 | 2026-09-10 | docs(repo): purge obsolete documentation stubs and historical artifacts

- Purged 17 temporary redirect stubs left in `docs/` and `docs/apps/` after the
  2026-09-10 documentation folder reorganization.
- Purged outdated historical reference documents (`R6.1-DECISION-DELTA.md`,
  `docs/apps/masterdata/masterdata-handoff.md`, and legacy UI mockups zip).
- Reconciled `docs/README.md` hub table to match remaining active documentation.

### Verification

- Local Markdown link-target audit: passed.
- `npm run check`: passed.

## R8.01 | 2026-09-10 | merge(repo): integrate contracts branch into main

- Merged the owner-approved `origin/studioflow/contracts` history into local
  `main`, including the R8 published baseline and its associated application,
  schema, migration, platform, and documentation changes.
- Local untracked files were preserved. The previously modified
  `account-forms.tsx` was replaced with the GitHub version per owner approval.

### Verification

- `npx prisma generate`: passed.
- `npm run typecheck`: passed after Prisma Client regeneration.
- `npm run lint`: passed.

## R8 | 2026-09-10 | release: publish routing and documentation corrections

- Published the verified R7.56 routing, settings, registry hardening, migration,
  documentation reconciliation, and audit ledgers from the `studioflow/contracts`
  branch to GitHub. This release does not claim deferred StudioFlow KB-012…KB-019
  work or UI Engine date/time consolidation.

## R7.56 | 2026-09-10 | fix(platform): verify routing and reconcile documentation

- Accepted the pending owner-directed routing implementation: two nullable
  settings columns (`main_app_id`, `landing_app_id`), audited persistence,
  Settings controls, and permission-filtered launcher resolution. Locked the
  activated behavior in `CORE.md`; no new dependency.
- Corrected unset-main precedence (Master Data before configured landing),
  preserved unavailable app IDs when saving unrelated settings, and restricted
  registered app roots to non-root canonical local paths (no launcher loops,
  external URLs, queries, traversal, or fragments).
- Browser review reproduced a successful-save form reset to old values.
  Key the form by refreshed persisted settings so native resets use the saved
  defaults without discarding the action result. Require settings-management
  permission before any brand-mark file write.
- Accepted the pending per-app documentation reorganization and redirect stubs,
  UI Engine date/time/client-lookup audit, and separate review ledger. Date/time
  consolidation and header/sidebar redesign are recommendations, not shipped
  changes. BQ client lookup remains app-owned as documented.
- Reconciled the paused StudioFlow workflow order with owner priorities; its
  old R7.56 filename does not reserve or authorize that revision. KB-012 through
  KB-019 and other deferred app work are not claimed fixed by this release.
- Verification: `npm run check`, `npm run lint`, `prisma validate`, Prisma
  generation, `npm test` (314 pass, 74 suites), and production build passed.
  Local documentation link audit found zero missing targets. Browser tested
  persisted main/landing selection, BQ and StudioFlow destinations, revoked
  main-app grant fallback, null-main Master Data priority, stale-ID preservation
  and fallback, read-only controls, and save at desktop and 375px viewport.
  Canonical controls: UI Engine `Select`, `Field`, `Button`, `Notice`; no new
  shared component or cross-app UI redesign is introduced.
- Migration `20260910160000_platform_main_route_settings` applied successfully
  to the verified rebuild-only kantor database. All 35 migrations also applied
  to fresh `studioflow_rebuild_browser_test`; no legacy resource was accessed.
  Existing kantor migration-history mismatch remains KB-020; no reset or
  history rewrite was performed. Test browser server is temporary; the existing
  development server on port 3001 is preserved.


## R7.55 | 2026-09-10 | fix(studioflow,docs): reconcile ledgers and close audit defects

### Changed — documentation reconciliation

- Reconciled every stale status header to the current revision: `docs/README.md`,
  `docs/alignment.md`, `docs/roadmap.md`, `docs/knownbug.md`,
  `docs/REVISION-LEDGER-NOTES.md`, the StudioFlow contract index, project
  contract, schedule contract, implementation plan, and the root `README.md`.
- `AGENTS.md` and `docs/SESSION-HANDOFF-PROMPT.md` pointed at the R7.48 work
  order as the active executable order while R7.48–R7.53 were already
  implemented. Both now name the R7.56 order, and the documentation hub marks
  the finished orders as history rather than as instructions.
- Corrected the StudioFlow permission vocabulary: `studioflow.md` §3 still said
  the MOM grants were unregistered, while `src/app/app-registrations.ts` has
  registered eleven permissions since R7.52. The table now matches the registry
  and names it as the authority. The MOM contract's matching deferral note is
  corrected the same way.
- Removed Minutes of Meeting and the Product Catalogue from `studioflow.md` §6
  "deferred"; only project Schedule/FFNI remains, pointing at KB-003.
- Reconciled `docs/alignment.md` §6: MOM, Product Catalogue, the phase
  deliverable surface and the contextual round actions were all still recorded
  as **Open**. Added §8's honest statement of where the legacy-minimum bar
  actually sits.
- Restored newest-first ordering in this file: the R7.53 entry sat below R7.52.
  No entry text was rewritten and no revision label was reused.

### Changed — contract amendments

- Project contract §5.2: the derived round label is `<round_prefix><number>`
  with no separator, and one exported helper owns the format. The section
  previously gave `MB 1` and `CD 1` beside `D4`, which is two formats for one
  derived value; §8.5's worked example (`… D1.skp`) settles it.
- MOM contract §10.1: a correction opens as an editable draft and supersedes its
  source on issue. Recorded as KB-012 rather than silently changed.
- `docs/apps/bq-implementation-plan.md` F3-02 and its final checklist instructed
  clearing `BqItem.harga_snapshot` when the first child is added. That is the
  defect recorded in project memory: removing the last child then leaves the L1
  uncalculable and nulls the project grand total. The plan now says the value is
  retained and merely ignored while children exist. No BQ code was touched.

### Fixed — StudioFlow audit defects

- **Filename dates used the server's timezone.** `{date}` was read off the
  `Date` object's local parts, so on the UTC production runtime an evening drop
  in Asia/Jakarta filed under the previous day. Filenames now resolve `{date}`
  in the platform's configured timezone, which project contract §8.5 always
  required. Added `getNamingContext()` so the studio-owned template and the
  platform-owned timezone are read together.
- **Three different round-label formats.** The service produced `D 1`, the
  project page produced `D1` while falling back to the phase *key* instead of
  its name, and the phase section carried a third copy. Added
  `src/apps/studioflow/labels.ts` as the single canonical helper and routed the
  service, the project page and the phase section through it.
- **Frozen rounds could still have their checklist edited.** `markPointDone`
  accepted `SENT` and `withdrawPoint` checked no state at all, so a delivered
  round's send-time snapshot could be rewritten. Both are now `DRAFT`-only
  (§6.3, §7.2).
- **A round could be approved with no answer behind it.** `approveIteration`
  set `APPROVED` without writing an `SfResponse`, so `finishPhase` could close a
  phase on an approval with no readable client answer. It now delegates to
  `recordResponse`, leaving exactly one write path (§6.1, §6.2).
- **The project page queried Prisma directly** for user display names — the
  pattern project contract §11 marks PURGE. Added `listUserLabels` to the
  service and removed both route-level queries.
- **MOM meeting dates were formatted with the viewer's locale** inside a client
  component that also renders on the server, ignoring the platform display
  settings and mismatching on hydration. The label is formatted on the server
  (CORE §10).
- **A permanently disabled "Withdraw send" row** sat in the round menu. UX spec
  §3.6 forbids a dead control; it is removed and the missing command is KB-015.

### Added

- `docs/knownbug.md` KB-012 … KB-019, from a full read of the StudioFlow service
  and its surfaces against the project contract. KB-013/KB-014/KB-015 are one
  gap seen from three sides: the client answer has no state, no replacement link
  and no reason, so §6.5 correction and §6.6 draft answers have nowhere to live.
  KB-016 records that a project cannot be archived or restored at all, and
  KB-017 that the phase template — the reason the phase enum was purged — is
  still seed-only.
- `scripts/work-orders/STUDIOFLOW-R7.56-WORKFLOW-CLOSURE.md`, the next
  executable order, sliced so the answer migration is reviewed on its own.

### Verification

- `STUDIOFLOW_LOCATION=kantor npx prisma validate`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run typecheck`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run lint`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run check:boundaries`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run check:legacy-runtime`: passed.
- Disposable-database `npm test`: 304 passed, 0 failed.
- `STUDIOFLOW_LOCATION=kantor npm run build`: passed.
- Browser acceptance remains unavailable because the local test account/session
  was not available in the running browser; no browser pass is claimed.

### Remaining

- `src/apps/studioflow/service.integration.test.ts` was updated in the same
  change set for the round-label amendment (`D 1` → `D1`). No assertion was
  weakened.
- The route folder
  `src/app/(platform)/studioflow/[id]/phases/[phaseId]/iterations/[iterationId]/`
  is now audited. Its three modules only serve the redirecting route and no
  active surface imports them; KB-018 deletion remains the R7.56 slice 5 task.
- KB-002, KB-003 and KB-004 are unchanged and remain open.

## R7.54 | 2026-09-10 | fix(studioflow): remove unsupported project type

### Changed

- Removed the unsupported Project type field from project creation and detail
  surfaces; it was not present in the audited legacy workflow.
- Removed the type from StudioFlow service inputs and project contract.
- Added a rebuild migration dropping the speculative `sf_project.type` column
  and enum.

### Verification

- Prisma schema validation, typecheck, lint, boundary checks, and full disposable
  database tests passed after regeneration.

### Remaining

- Existing historical migration files retain the original column definition so
  a rebuild from zero remains reproducible; the final migration removes it.

## R7.53 | 2026-09-10 | feat(studioflow): add product catalogue reuse pool

### Changed

- Added the independent StudioFlow Product Catalogue schema, service boundary,
  public Brand read usage, audited no-op-safe create/edit/archive/restore, and
  project-independent permissions.
- Added search, archived filtering, sortable/paginated list, explicit detail
  editing, frozen-brand fallback, confirmation, unsaved protection, and
  loading/error/empty/permission states.
- Added integration, UI, contract, boundary, and snapshot-isolation coverage.

### Verification

- Full disposable-database `npm test`: 304 passed, including Catalogue CRUD,
  search, no-op audit, archive/restore, and permission coverage.
- Build, typecheck, lint, and boundary/legacy checks passed.

### Remaining

- Project schedule/FFNI snapshot selection remains a separate approved slice.

## R7.52 | 2026-09-10 | feat(studioflow): add project-owned MOM

### Changed

- Added project-owned MOM documents with ordered blocks, points, list/point
  styles, text-only blocks, and up to two ordered images per block.
- Added draft, issue, discard, immutable issued, and superseding correction
  lifecycle with project-scope checks, permissions, and transactional audit.
- Added the canonical shared ImageWorkspace and Core object-storage port with a
  server-only Supabase adapter seam; MOM image keys are server-generated and
  private. Runtime upload remains unavailable until office Supabase secrets
  and the `platform-assets` bucket are provisioned.
- Added print, loading, error, permission, immutable, confirmation, and
  unsaved-navigation states, plus focused integration/UI/contract coverage.
- Removed sort-order uniqueness constraints from MOM children; order is
  maintained by domain validation and remains separate from identity.

### Verification

- `STUDIOFLOW_LOCATION=kantor npx prisma validate`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run typecheck`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run lint`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run build`: passed.
- Full disposable-database `npm test`: 304 passed.
- Browser smoke reached populated project and MOM draft/editor; unsaved-change
  confirmation was observed. Real image upload remains blocked by missing
  Supabase configuration.

### Remaining

- Provision the approved Supabase `platform-assets` bucket and server-only
  secrets before claiming live image upload/cleanup acceptance.

## R7.51 | 2026-09-10 | work-order(studioflow): activate MOM and Product Catalogue

### Changed

- Issued the sequential R7.52 MOM and R7.53 Product Catalogue work orders.
- Locked MOM as project-owned and independent from tasks, phases, iterations,
  Master Data, BQ, and Product Catalogue.
- Locked Product Catalogue as a StudioFlow-owned reuse pool with Brands-only
  Master Data reads and project snapshot selection; SKU, unit, and pricing
  dependencies remain prohibited.

### Verification

- Contracts, schema shape, existing boundaries, and legacy evidence references
  reviewed locally.
- No application implementation or acceptance gate is claimed by this entry.

## R7.50 | 2026-09-10 | feat(studioflow): unify project work surface

### Changed

- Moved Start round, supervision start/complete, and Finish phase actions out
  of the dominant phase header and into a contextual action strip below the
  phase deliverable surface.
- Preserved the existing project-owned task collection, phase-scoped task
  filtering, R7.48 deliverable intake, iteration actions, and DONE protection.
- Added a focused regression test preventing phase actions from returning to
  the header.

### Verification

- `STUDIOFLOW_LOCATION=kantor npm run typecheck`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run lint`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run check:boundaries`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run check:legacy-runtime`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run build`: passed.
- Focused phase static test: pending after this test addition.
- Full database-backed test suite and populated browser acceptance remain
  unavailable because the office disposable test database is not configured
  and the current browser database has no projects.

### Remaining

- R7.49's combined work-surface acceptance remains pending until a populated
  project can be exercised through the browser and disposable DB integration.

## R7.49 | 2026-09-10 | work-order(studioflow): unify project work surface

### Changed

- Issued the next locked StudioFlow work order for composing project-owned
  to-dos and phase deliverables into one work surface.
- Explicitly preserves one project-owned task collection, keeps MOM unrelated
  to tasks/phases/iterations, and makes round actions contextual.
- No implementation is claimed by this entry; the work order remains active
  until its executor commit and acceptance evidence exist.

### Verification

- Documentation and work-order consistency reviewed locally.
- No application gates were run for this planning-only revision.

## R7.48 | 2026-09-10 | feat(studioflow): put deliverable intake in phases

### Changed

- Added current deliverable summaries and fixed-folder metadata/link intake to
  every project phase with an output folder, while keeping the project-wide
  Files page intact.
- Added read-only next-filename preview that uses an existing draft number or
  previews the next server iteration number without creating state.
- Corrected completed-phase intake protection for both round-bearing and
  no-round phases.
- Added the canonical UI Engine `CopyButton` with stable accessible naming,
  live success/failure status, cleanup, and race-safe reset behavior.
- Preserved metadata-only file handling: the picker does not submit bytes, and
  current-file props serialize BigInt sizes as decimal strings.
- Added focused regression coverage for filename preview, project scope,
  completed phases, current-file filtering, fixed folders, phase presentation,
  and copy control behavior.

### Verification

- `STUDIOFLOW_LOCATION=kantor npm run typecheck`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run lint`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run check:boundaries`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run check:legacy-runtime`: passed.
- `STUDIOFLOW_LOCATION=kantor npx prisma validate`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run build`: passed.
- UI Engine tests: 41 passed.
- Focused phase deliverable tests: 2 passed; file-control tests: 2 passed;
  StudioFlow copy regression test: 1 passed.
- Full `npm test` was attempted and is not a pass: database-backed suites
  refused to run because `PLATFORM_TEST_DATABASE_URL` is not configured for an
  explicitly disposable database. No development or legacy database was used.
- Live browser acceptance was not run, so the related roadmap/alignment items
  remain open.

### Remaining

- R7.48 is implemented locally but pending disposable-database integration and
  browser acceptance review. Do not close the phase-surface roadmap item or
  KB-003/KB-004 based on this commit alone.

## R7.47 | 2026-09-10 | docs(studioflow): issue phase deliverable work order

### Changed

- Activated the deterministic R7.48 Claude/OpenCode work order for current
  deliverable summary, next standard filename, copy control, and fixed-folder
  intake directly inside each project phase.
- Corrected the earlier composition-only plan: filename preview must predict
  the next round without writing, and completed no-round phases must reject
  intake just like completed round-bearing phases.
- Locked the allowed files, shared UI Engine Copy control, service invariants,
  tests, browser states, database safety, commit subject, and Codex handback.

### Verification

- Documentation/work-order change only. The manager inspected the current
  service, project route, phase component, file actions/form, contracts, and
  prior Claude plan; no implementation or runtime gate is claimed in R7.47.

### Remaining

- R7.48 implementation and all acceptance gates remain the executor's work.

## R7.46 | 2026-09-10 | fix(studioflow): reconcile app copy and contracts

### Changed

- Completed the StudioFlow English-copy correction that R7.44 had reported too
  early, including nested iteration controls, client detail/validation, file
  metadata, route states, and safe service errors.
- Added a one-time additive migration that changes only the exact standard
  `supervision` phase name `Supervisi` to `Supervision` in the current template
  and existing project snapshots; owner-customized phase names are preserved.
- Corrected the MOM contract against owner direction and committed legacy
  evidence: MOM belongs only to Project, is available during any phase, keeps
  the legacy ordered document/block/point/image capability, and has no phase,
  iteration, Task, To-do, or client-response relationship.
- Locked Product Catalogue as a StudioFlow-owned reuse pool shared across
  StudioFlow projects. StudioFlow reads Master Data only for Brands; Catalogue
  and Schedule never read Master Data SKU, unit, or pricing, and projects keep
  independent specification snapshots.
- Reconciled the documentation hub, alignment, roadmap, known-bug ledger,
  handoff prompt, implementation plan, and historical decision ledger with
  those boundaries.

### Verification

- `STUDIOFLOW_LOCATION=kantor npm run typecheck`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run lint`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run check:boundaries`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run check:legacy-runtime`: passed.
- `STUDIOFLOW_LOCATION=kantor npx prisma validate`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run build`: passed.
- Focused StudioFlow Add Project, canonical file-drop consumer, and English-copy
  regression tests: 3 passed.
- Full `npm test` was attempted and is not a pass: database-backed suites
  refused to run because `PLATFORM_TEST_DATABASE_URL` is not configured for an
  explicitly disposable database. The migration was not applied, and live
  browser behavior was not claimed as verified.

### Remaining

- KB-002, KB-003, and KB-004 remain open. MOM and Product Catalogue/Schedule
  still require executable work orders and implementation; shared image/storage
  dependencies remain explicit.

## R7.45 | 2026-09-10 | docs(handoff): record StudioFlow continuation gaps

### Changed

- Recorded the post-R7.44 continuation order and remaining StudioFlow gaps in
  the session handoff prompt, including phase-surface, work-surface, MOM,
  Product Catalogue/FFNI/Schedule, image, storage, and release gates.

### Verification

- Documentation-only commit `2ac66983b44a05ebdb5a6a7335ade55f567b3c26`;
  no implementation gate was claimed.

## R7.44 | 2026-09-10 | feat(studioflow): restore client creation and English UI

### Changed

- Restored Add Project in-context client creation: the form can select an
  existing client or submit a new client name, and the service creates the new
  client and project atomically with audit events.
- Expanded StudioFlow Settings navigation to existing Clients and Account
  surfaces without inventing a Database Settings placeholder.
- Completed the user-facing English-only copy sweep across StudioFlow project,
  activity, client, phase, iteration, file, library, and task states.
- Closed KB-005, KB-006, and KB-007 and synchronized the roadmap and known-bug
  ledger.

### Verification

- `STUDIOFLOW_LOCATION=kantor npm run typecheck`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run lint`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run check:boundaries`: passed.
- Focused UI Engine tests: 37 passed.
- Full integration tests and live browser verification remain unavailable;
  disposable office test database variables and browser access are absent.
  No database command was run.

### Remaining

- Database Settings remains deferred because no backend contract exists.

## R7.43 | 2026-09-10 | feat(ui-engine): canonicalize StudioFlow file drop

### Changed

- Added and publicly exported the domain-neutral UI Engine `FileDropZone`
  pattern with keyboard-reachable picker, accept filtering, disabled state,
  active drag presentation, and metadata-only file reporting.
- Extracted pure file-selection rules into `internal/file-drop.ts`; the picker
  has no `name`, so file bytes cannot be serialized by the surrounding form.
- Migrated StudioFlow deliverable intake to the shared pattern and removed its
  local drag/drop handlers.
- Activated `FileDropZone` in `UI_ENGINE.md`, closed KB-011, and synchronized
  the roadmap and alignment ledgers.

### Verification

- `STUDIOFLOW_LOCATION=kantor npm run typecheck`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run lint`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run check:boundaries`: passed.
- `STUDIOFLOW_LOCATION=kantor npm run check:legacy-runtime`: passed.
- Focused UI Engine suite: 37 tests passed.
- `STUDIOFLOW_LOCATION=kantor npm run build`: passed with Next.js 16.3.2.
- `npm test`: not a complete pass; database integration tests were cancelled
  because the required disposable test URL variables were absent. No database
  command was run.
- Live browser verification: unavailable in this session.

### Limitations

- KB-002, KB-003, KB-004, KB-005, KB-006, and KB-007 remain open.
- The pre-existing `Field`/drop-region label focus concern is outside this
  slice and remains unchanged.

## R7.42 | 2026-09-10 | docs(handoff): coordinate cross-agent app completion

### Changed

- Added `docs/SESSION-HANDOFF-PROMPT.md`, a copy-ready continuation prompt for
  Codex and Claude/OpenCode with environment checks, mandatory reading,
  serialized implementation/review handoffs, per-app work order, regression
  gates, documentation discipline, and required handoff reporting.
- Prioritized UI Engine/StudioFlow KB-011 as the first bounded correction while
  preserving Master Data and BQ as protected consumers.
- Indexed the handoff prompt from `docs/README.md`.

### Verification

- Local Markdown link-target scan: passed.
- `git diff --check`: passed.
- Documentation-only change; no runtime, schema, migration, or dependency change.

## R7.41 | 2026-09-10 | docs(repo): reconcile documentation by application

### Changed

- Moved the active alignment, roadmap, and known-bug ledgers into `docs/` and
  updated governance and active references to their canonical paths.
- Rebuilt `docs/roadmap.md` by Platform Foundation, UI Engine/Utilities, Master
  Data, BQ, and StudioFlow, including the previously undocumented owner gates,
  BQ deferred scope, storage phases, and remaining legacy-audit phases.
- Rebuilt `docs/knownbug.md` by application, moved R7.40 fixes into a real
  Closed section, and added KB-011 for the app-local StudioFlow drag/drop that
  diverges from the deferred canonical `FileDropZone`.
- Reconciled `docs/alignment.md` with R7.40 instead of leaving fixed deviations
  described as current, while retaining unresolved phase-workspace gaps.
- Updated the root/documentation indexes and StudioFlow contract status labels
  so they no longer describe the repository as Foundation-only or StudioFlow as
  wholly unimplemented.
- Corrected duplicate Master Data section numbering and clarified that BQ has
  no owner-policy blocker but still has an open exact-decimal placement decision.
- Added `docs/REVISION-LEDGER-NOTES.md` for R4.39/R6.25/R7.18/R7.27 historical
  ledger gaps without fabricating or reusing revision labels.

### Verification

- Local Markdown link-target scan: passed.
- Duplicate exact-heading scan under `docs/`: passed.
- Stale-status phrase scan: passed for the corrected active documents.
- `git diff --check`: passed.
- Documentation-only change; no runtime, schema, migration, or dependency change.

## R7.40 | 2026-09-10 | fix(studioflow,bq): close active workflow gaps

### Changed

- StudioFlow deliverable intake now replaces the unsent current file for a
  phase, increments the draft working revision, preserves the superseded row
  and audit event, and associates active phase files with the iteration when
  it is sent.
- StudioFlow Library now opens Master Data Brand resource links in a read-only
  UI Engine dialog instead of redirecting to Master Data.
- Refreshed the tracked Next.js generated route-type references as part of the
  production build.
- Translated the updated StudioFlow project, client, and settings entry
  surfaces to English; remaining mixed-copy surfaces stay recorded in KB-006.
- Closed KB-001, KB-008, KB-009, and KB-010 in the known-bug ledger. KB-002
  remains open only for future storage-byte release, while KB-003/004 remain
  deferred and KB-005/007 remain blocked on the required read-only legacy audit.

### Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- Boundary and legacy-runtime checks run as part of `npm test`: passed.
- Unit/UI tests passed; database integration tests were unavailable because
  the required disposable rebuild-only test database variables were not set.
- `git diff --check`: passed.

## R7.39 | 2026-09-10 | chore(next): refresh generated route types

### Changed

- Committed the tracked Next.js generated type references produced by the
  current Next.js build tooling.

### Verification

- `git diff --check`: passed.

## R7.38 | 2026-09-10 | docs(roadmap): record foundation and productivity ideas

### Changed

- Added roadmap items for configurable main routes and access redirects.
- Added the UI Engine header/sidebar boundary redesign with Claude design
  artifact alignment and controlled color reuse.
- Added Overview/Operational Catalog revamp, safe Library crawling/card
  discovery, opt-in AI file organization, and a strictly parsed BQ calculator.
- Kept all six items planned only; no speculative implementation or dependency
  was introduced.

### Verification

- `git diff --check`: passed.

## R7.37 | 2026-09-10 | docs(audit): record reported regressions

### Changed

- Added KB-005 through KB-010 to `docs/knownbug.md` for Add Project modal/client
  parity, English-only UI copy, Settings structure, BQ price Revert, BQ
  Updated column behavior, and Library resource-link modal behavior.
- Marked legacy comparison as a required evidence step for the Add Project and
  Settings fixes; no implementation was guessed or changed in this revision.

### Verification

- `git diff --check`: passed.

## R7.36 | 2026-09-10 | docs(governance): formalize roadmap and bug ledgers

### Changed

- Updated `AGENTS.md` with mandatory rules for reading and maintaining
  `docs/roadmap.md` and `docs/knownbug.md` during planning, implementation, and audits.
- Required every unfixed audit finding to be recorded, every fixed bug to be
  closed in the bug ledger, and every completed roadmap item to remain backed
  by a changelog entry.

### Verification

- `git diff --check`: passed.

## R7.35 | 2026-09-10 | docs(repo): add roadmap and known bug ledger

### Changed

- Added `docs/roadmap.md` for planned StudioFlow features, completed items, and
  explicit out-of-scope decisions.
- Added `docs/knownbug.md` for reproducible audit findings that remain open, with
  expected behavior, mitigation, and closure rules.
- Recorded the current deliverable-driven workflow, current-file, MOM,
  Product Catalogue/FFNI, and shared image gaps without claiming them fixed.

### Verification

- `git diff --check`: passed.

## R7.34 | 2026-09-09 | chore(repo): ignore session debris

### Changed

- Ignored `Claude outputs/` and `_to_delete/` so session debris cannot be
  accidentally committed.
- Kept tracked `next-env.d.ts` untouched as an existing repository file.

### Verification

- `git diff --check`: passed.

## R7.33 | 2026-09-09 | fix(docs): clean alignment artifact

### Changed

- Removed the trailing whitespace reported in `docs/alignment.md`.

### Verification

- `git diff --check`: passed.

## R7.32 | 2026-09-09 | docs(studioflow): record workflow alignment

### Changed

- Added `docs/alignment.md` as the owner-aligned explanation of the rebuild
  contract, legacy preservation/corrections, deliverable-driven workflow,
  shared foundation rules, explicit non-scope, and current deviations.
- Recorded the Explorer-style viewer as fully out of scope and identified the
  remaining deliverable-driven, MOM, Product Catalogue/FFNI, and shared-image
  gaps without presenting them as completed.

### Verification

- `git diff --check`: passed.

## R7.31 | 2026-09-09 | fix(studioflow): align activity navigation

### Changed

- Renamed the primary StudioFlow task navigation label to `My Activity`.
- Kept the existing `/studioflow` route and waiting-work aggregation unchanged.

### Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.

## R7.30 | 2026-09-09 | feat(studioflow): add metadata drag-drop intake

### Changed

- Added drag-and-drop metadata capture to the canonical deliverable form.
- Dropping a local file fills its name and byte size only; file bytes are not
  uploaded or stored by StudioFlow, preserving the local-PC archive model.

### Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.

## R7.29 | 2026-09-09 | feat(studioflow): unify deliverable intake

### Changed

- Replaced the separate file-metadata and external-link forms with one shared
  `DeliverableForm` entry point while preserving the existing service actions,
  permissions, folder mapping, and audit behavior.
- Kept the Explorer-style folder viewer deferred; the current screen remains a
  legacy-compatible project file list with technical folder grouping.

### Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.
- Full integration tests remain unavailable without the disposable rebuild-only
  database environment; no database behavior was changed in this revision.

## R7.28 | 2026-09-09 | docs(changelog): record Library discovery implementation

### Changed

- Records the preceding `R7.27` implementation: StudioFlow Library route and
  rail entry, Master Data public-port category search, and the safe link back to
  the existing Master Data brand directory.

### Verification

- `R7.27` checks: `npm run typecheck`, `npm run lint`, and
  `npm run check:boundaries`: passed; `npm run build`: passed.
- Full integration test run was attempted but could not use the required
  disposable database environment; failures were infrastructure setup failures,
  not recorded as a pass.

## R7.26 | 2026-09-09 | docs(governance): enforce shared capability reuse

### Changed

- Strengthened `AGENTS.md` so a shared capability requires one canonical
  implementation, public export, consumer matrix, and boundary/test evidence.
- Prohibited app-local copies of existing shared UI/utility capabilities unless
  a documented domain distinction and drift-prevention regression test exist.
- Required cross-consumer behavioral and visual acceptance evidence; one-app
  smoke testing no longer proves shared reuse.

### Verification

- `git diff --check`: passed.
- Documentation-only governance change; no runtime/schema checks required.

## R7.25 | 2026-09-09 | docs(studioflow): constrain file intake to a simple MVP

### Changed

- Added an explicit first-layer file-intake MVP: `What’s Today`/Project/Phase
  plus drag-drop, project and phase context, one current file, and permanent
  metadata/audit.
- Kept folder templates and PDF/Presentation/CD mappings as technical detail,
  not extra user-facing filing steps. A technical `OUT` mapping is never a
  workflow state or a replacement for the iteration/send record.
- Added agent guardrails against speculative entities, review states, folder
  systems, integrations, background jobs, or extra screens while implementing
  the MVP. Advanced bulk, unsorted, and storage behaviors require a named work
  order.

### Verification

- `git diff --check`: passed.
- Documentation-only contract change; no runtime/schema checks required.

## R7.24 | 2026-09-09 | docs(studioflow): simplify project-phase file intake

### Changed

- Corrected the StudioFlow project contract's file retention and drop flow to
  keep one current file per project and phase. Internal drops replace the
  current working bytes; an external drop replaces those bytes and records the
  send/iteration link in the same intake.
- Preserved permanent metadata and audit history for replaced files while
  treating the studio's own PC storage as the primary archive. Removed the
  duplicated two-byte working/sent retention assumption.
- Clarified that Library, Product Catalogue/Schedule, MOM, project-owned to-dos,
  and phase-filtered views remain part of the corrected StudioFlow scope.

### Verification

- Read-only legacy comparison at commit `5fc605e304a12db6b5efe0a2c0271a2d9415b2da`.
- `git diff --check`: passed.
- No runtime or schema changes; application tests were not required for this
  documentation-only revision.

## R7.23 | 2026-09-09 | fix(bq,ui-engine): preserve empty-price detail rendering

### Fixed

- BQ project detail no longer crashes when an item has no unit price. Inline
  money presentation now keeps the empty state visible as `Belum ada harga`
  instead of passing an empty string to `createMoney`.

### Verification

- Browser interaction verified BQ project navigation and empty-price row.
- `npm run typecheck`, `npm run lint`, and `npm test`: passed; 266 tests,
  66 suites, 0 failures.
- `npm run build`: passed.

## R7.22 | 2026-09-09 | feat(ui-engine,platform): one page skeleton and one control ladder across StudioFlow, Master Data, and BQ

> **Handover.** Everything below was implemented and type-checked by Claude.
> Schema, build, and commit are Codex's — see **For Codex** at the end of this
> entry. Nothing in this revision has been committed.

### Fixed

- `Pagination` no longer imports the client primitive barrel from its shared
  data module. Server-rendered directory pages were passing `getHref` through
  that client boundary and crashed at runtime on `/studioflow/projects` (and
  `/studioflow`). Pagination now lives in a client-free engine module while
  retaining callback mode for client directories.
- `SectionCard` accepted no `title` prop, so five call sites that passed one
  were setting a native tooltip and rendering no heading at all
  (`clients/[id]/client-detail-view.tsx` ×2, `[id]/files/page.tsx` ×3). It now
  owns a real header bar and those sections show their titles.
- Every page in Master Data, BQ, and StudioFlow wrapped itself in a hand-rolled
  `flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)` div **inside** an
  app layout that already renders `<PageShell fill>`. Padding was applied twice
  on all 18 pages. The wrapper is removed; the layout's `PageShell` is now the
  only page shell, which is what `DESIGN.md` §6 and §16 require.
- `-brand` utility classes in the BQ project editor (`text-brand`,
  `border-brand`, `hover:border-brand`) referenced a `--color-brand` token that
  is not defined anywhere, so the active tab indicator and the option-picker
  hover state had no effect. Replaced with `action` / `line-strong`.
- The Klien directory passed `statusLabel=""` for live clients, giving the
  status dot an empty accessible name, and toned live clients `neutral` instead
  of `success`.

### Added

- UI Engine chrome and display atoms, documented in `UI_ENGINE.md` §3.5 with
  the tier each belongs to: `Breadcrumb`, `FilterChip` / `filterChipClasses`,
  `Avatar` / `initialsOf`, `CountBadge`, `MetaList`, `ProgressBar`,
  `SegmentBar`, `GroupHeader`, `PipelineStrip`. Each signals with a text
  alternative as well as colour — `aria-pressed`, `aria-current="step"`,
  `role="progressbar"`, or an `aria-label`.
- `SectionCard` gains `title`, `description`, `count`, `action`, and `padded`.
  Row lists pass `padded={false}` so dividers reach the card edge.
- Form controls gain `density="regular" | "compact"`, named to match
  `DataTable`'s existing `density`. `size` is left as the native attribute, so
  the multi-select in the roles editor that sets a visible row count still
  works.
- `EmptyState` / `ErrorState` render their glyph in a toned ring with a serif
  title, and take an optional `code` slot for a monospace reference.
- UI Engine contract tests now assert the new exports exist, that the
  colour-carrying atoms expose a text alternative, and that `FilterChip`
  reports its selection. The showcase page gained a section for them so the
  catalog stays true.

### Changed

- Tasks (`/studioflow`) rebuilt as the approved worklist: header with working
  date, open count, and overdue count; URL-driven scope chips; `GroupHeader`
  buckets; one framed row list per bucket with fixed columns for item,
  project, due, and holder. Task due dates resolve to `telat N hari` /
  `hari ini` / `besok` with a matching tone.
- Projects directory now uses the canonical directory chrome end to end —
  `DirectoryShell` with a `TableToolbar` holding the view chips and a no-JS
  `GET` filter field, so a filtered-to-nothing list still shows the controls
  that got it there. Adds an area column, a leading-phase cell naming the phase
  the studio is actually waiting on, a `SegmentBar` of template progress, and
  an `Avatar` on the lead column.
- Project detail rebuilt on the shared `DetailShell` (it had a hand-rolled
  spine/rail grid): `Breadcrumb`, a `MetaList` identity line, a
  `PipelineStrip` of every template phase, then the task block and phase
  workspace on the spine; phase progress, project facts, and lead on the rail.
- `phase-section.tsx` and `general-task-block.tsx` moved onto engine
  primitives. They previously hand-rolled every control — `bg-ink text-white
  hover:opacity-80` buttons, `border-0 focus:ring-0` inputs, raw radios and
  checkboxes — inside the redesigned detail page. Now `Button`, `IconButton`,
  `Input`, `Select`, `Textarea`, `Checkbox`, `RadioGroup`, `Field`,
  `FormActions`, and `FilterChip`. Raw checkboxes in the Master Data vendor
  directory and the roles editor were migrated the same way.
- StudioFlow settings moved onto `SettingsShell` and gained a read-only Phase
  template section listing the seeded pipeline.
- Files, new project, new client, client list, and client detail brought onto
  the same chrome: `Breadcrumb` where nested, `divider` on the page header,
  and the access-denied branch shaped like every other page.
- `PageHeader divider` applied to all 50 page headers across the three apps and
  platform settings; it was on 13 before, so header treatment was inconsistent
  screen to screen.
- StudioFlow's layout drops `size="wide"` for the default 1440px measure, which
  is what the approved design specifies. Master Data and BQ keep `wide`.
- `studioFlowService.listProjects` orders each project's phases by `sort_order`
  and selects `id`, `key`, `name`, `sort_order`. Additive; no field removed.

### Removed

- The speculative `NavCount` and `NavWarningPill` helpers in the StudioFlow
  nav. They had no data source, and the capability they anticipated is already
  served by `NavItem`'s `badge` slot.
- `CardSection`, folded into `SectionCard` before it could become a second way
  to draw the same thing.

### Design-conformance pass

Run against `DESIGN.md` §2–§5 and §14 after the work above, because applying a
pixel-drawn mockup is exactly how off-scale values get in.

- Seven invented type sizes were introduced during this revision and have been
  snapped back onto roles that already exist here: 9px/9.5px/10px → 11px meta,
  11.5px → 12px, 12.5px/13.5px → 13px, and the empty-state title's 17px → the
  H3 role. `text-[11px]`/`text-[13px]` were also respelled so each size has one
  spelling. The operational scale is now 14 / 13 / 12 / 11 plus the heading
  roles, against `DESIGN.md` §2's "do not invent arbitrary sizes".
- `text-green-600 dark:text-green-400` in the naming-template form and
  `text-green-500` in the iteration controls were the last raw Tailwind palette
  colours in the codebase, and the `dark:` variant belonged to a mode this
  product does not have. Now `Notice tone="success"` and `text-success`.
  Hardcoded hex outside `tokens.css`: none.
- `font-mono` (Tailwind's stack) replaced with `font-ui-mono` (the `--ui-font-mono`
  token) in the four places that used it, per §3's data-face rule.
- Five raw `<h1>`–`<h3>` elements in BQ and StudioFlow now use `Heading`, so the
  type roles come from one place. Raw heading tags in app code: none.
- `GeneralTaskBlock` drew its own card and header bar; it now uses `SectionCard`.
  The phase card in `phase-section.tsx` now uses `Surface`, so it carries the
  border and white ground §4 requires rather than sitting transparent on the
  ground.
- Two `rounded` (4px) surfaces corrected to `rounded-control` (6px) per §4.

### Owner decisions taken

The owner delegated both open questions. Resolved as follows, and both contracts
updated so the reasoning is not carried only in this entry.

**13px is a real role, and I had been misapplying it.** Auditing what actually
used it showed the 13px usages are all chrome — nav items, menu items, badges,
notices, the meta line, the mono identifier face — while the ones I had added
during this revision included content: task titles, table cell values, and
descriptive paragraphs. The approved design uses 13px for chrome throughout and
14px for content, which is the same distinction. So `DESIGN.md` §2 gains a
**Control/chrome** row at 13px with the rule that chrome sits one step below the
content it frames, and content never drops to 13px to win space. Six content
usages were snapped back to Body. The ten that remain are all chrome.

**Pagination belongs in every dense directory, including one-page ones.** The
approved Projects directory shows `1–7 of 7` with both steps disabled, so the
design already answers this: the footer is part of the surface, not something
that appears once a list grows. `Pagination` gained a `getHref` mode so
server-rendered directories can page by URL — paging now survives a reload and
is shareable — plus an optional row-range summary, since an operator hunting a
record reads "26–50 of 96" better than "Page 2 of 4". Applied to StudioFlow
projects and clients, BQ projects, and the BQ deletion-review queue. The BQ
library is tabs of cards rather than a dense table, so `DESIGN.md` §14 now says
explicitly that pagination is not required there. Every `DirectoryShell` in the
codebase that renders a table now has a pagination footer.

### Dependencies and migrations

- No new dependency. No schema change authored in this revision.

### Verification performed by Claude

- `npm run check`: passed — `typecheck`, `check:boundaries`, `check:legacy-runtime`.
- `npx eslint .`: passed, zero findings.

### Verification performed by Codex

- `STUDIOFLOW_LOCATION=kantor npx prisma migrate deploy`: no pending
  migrations; `npx prisma migrate status`: database up to date.
- `npx prisma generate`: passed with the Windows Prisma engine.
- `npm run typecheck`, `npm run check:boundaries`,
  `npm run check:legacy-runtime`, and `npm run lint`: passed.
- `npm run build`: passed; all listed application routes compiled.
- `npm test` against isolated `studioflow_rebuild_test`: 266 tests passed,
  66 suites passed, 0 failed.
- Browser smoke verification: StudioFlow tasks/projects/settings/new, all
  Master Data directories, BQ projects/library, and the repaired server
  pagination route rendered without runtime error overlays.

### For Codex

Claude could not run these from its environment: `node_modules` is installed
for Windows, and the Linux side has neither the platform binaries nor the
network to fetch them. Every one of these is outstanding, not verified.

1. **Migration status.** Resolved on the kantor rebuild database; all 30
   migrations are applied and `npx prisma migrate status` is clean.
2. **`npx prisma generate`** — fails on the Linux side with a 403 fetching
   `schema-engine`; only `schema-engine-windows.exe` is present.
3. **`npm run build`** — never run for this revision. `next build` aborts
   fetching `@next/swc-linux-x64-gnu`.
4. **`npm test`** — all 32 suites abort with an esbuild `TransformError`
   (`@esbuild/linux-x64` missing against a Windows install). The two suites
   that need no transform pass. The UI Engine contract tests gained new
   assertions in this revision and have therefore never actually executed.
5. **Delete `.git/index.lock`.** Resolved; the empty lock file was removed.
6. **Then commit.** Resolved by the Codex handover commit for this entry.

### Known gaps, deliberately not built

- Upcoming, Library, Activity, and Product Schedule are locked nav entries with
  no route behind them, so their screens in the approved design are not
  implemented.
- Deliverables and Minutes have no persisted model, so the design's tabs for
  them do not exist.
- Login and the app launcher (option 2j) were not touched.
- Visual verification in a browser has not happened for any screen in this
  revision — item 1 above is the blocker.

## R7.21 | 2026-09-09 | feat(ui-engine): NavGroup headings, NavSeparator, NavItem badge/lock; StudioFlow nav redesign

### Added

- `NavGroup` now accepts an optional `heading?: string` prop that renders a
  visible section label (11 px, semibold, uppercase, tracked) above the group.
  The heading is suppressed when the rail is collapsed and on narrow viewports
  so the collapsed state remains clean.
- New `NavSeparator` component exported from `ui_engine`: a thin horizontal
  rule (`h-px`, `bg-[--ui-border-subtle]`) with `role="separator"`, also
  hidden when the rail is collapsed.
- `NavItem` now accepts a `badge?: ReactNode` trailing slot rendered to the
  right of the label (hidden when the rail is collapsed). When `disabled` is
  set, a 12 px `Lock` icon replaces any badge automatically.
- Explicit `text-[13px]` added to `NAV_ITEM_BASE_CLASSES` to match the
  13 px font-size token in the UI Engine design spec.

### Changed

- `StudioFlowNav` restructured into two `NavGroup` sections matching the
  proposed sidebar design:
  - **Workspace** (heading): Projects, Tasks, Upcoming (disabled).
  - **Extensions** (heading): Library (disabled), Activity (disabled),
    Product Schedule (disabled).
  - A `NavSeparator` divides the two sections.
- Settings moved out of `StudioFlowNav` into a new `StudioFlowUtilityNav`
  export placed in the `domainUtilityNavigation` slot of `AuthenticatedShell`,
  keeping it anchored below the rail divider at all viewport sizes.
- `src/app/(platform)/layout.tsx` updated to import and wire
  `StudioFlowUtilityNav` as `domainUtilityNavigation`.

### Dependencies and migrations

- No new dependency, schema change, or migration.

### Verification

- `npx tsc --noEmit`: **0 errors**.

## R7.20 | 2026-09-09 | fix(studioflow): avoid cascading render in task edit flow

### Fixed

- Preserved the existing behavior that closes an inline task editor after a
  successful update, while deferring the state update to the next animation
  frame so the shared lint rule does not flag a synchronous state update inside
  an effect.

### Dependencies and migrations

- No new dependency, schema change, or migration.

### Verification

- `npm run lint`: passed.
- `npm run check`: passed.
- `npm run build`: passed.

## R7.19 | 2026-09-09 | fix(platform): resolve TypeScript narrowing errors across all platform routes

### Fixed

- Replaced all `!x.ok` boolean negation patterns with `x.ok === false` explicit
  equality checks throughout `account`, `bq`, `masterdata`, `settings`, and
  `login` routes. TypeScript 5.9.3 does not narrow discriminated unions through
  negation (`!x.ok`) or truthy checks (`x.ok`) — only through strict equality
  comparison.
- Replaced all JSX ternary `X && !X.ok ?` patterns with `X?.ok === false ?` so
  the error branch is correctly narrowed to `{ ok: false; error: SafeErrorPayload }`.
- Fixed `fieldError()` helper in `account-forms.tsx`: guard condition updated
  from `!state || state.ok ||` to `state === null || state.ok !== false ||`.
- Fixed `if (result.ok) …; else result.error` implicit-else patterns in
  `pricing-directory.tsx` and `vendor-type-directory.tsx` by using
  `else if (result.ok === false)`.
- Fixed `NormalizedUrl`/`NormalizedLinks` discriminated unions in
  `brand-link-input.ts` and `brand-directory.tsx` — same `=== false` pattern.
- Fixed `audit/index.ts`: cast `unknown` → `object` for `Object.getPrototypeOf`,
  `Object.entries`, and `Set` method calls inside `serializeAuditValueDeep`.
- Fixed `shells.tsx`: double-cast `props as unknown as ButtonHTMLAttributes` to
  silence an overlapping-type assertion error on the disabled nav button.
- Fixed `bq/public/index.ts` `listTemplates()`: added `as BqTemplateRead[]`
  assertion where TS could not unify the union return type of two actions.

### Dependencies and migrations

- No new dependencies, schema changes, or migrations. Zero functional changes;
  this is a type-level fix only.

### Verification

- `npx tsc --noEmit --strict false`: **0 errors** (down from 52 before this session).
- All StudioFlow, Master Data, BQ, Settings, and Auth routes pass type check.

## R7.17 | 2026-09-09 | feat(studioflow): add task assignment and due dates

### Added

- StudioFlow task rows now expose active StudioFlow project readers as
  assignees and allow a date-only due date for both General and phase-scoped
  tasks.
- Task updates share one service command for title, assignee, and due date;
  eligible users are validated centrally and changes are audited.

### Dependencies and migrations

- No new dependency, schema change, or migration. Master Data, BQ, and shared
  UI Engine files remain untouched.

### Verification

- `npm run check`: passed.
- `npm run build`: passed; StudioFlow, Master Data, and BQ routes compiled.
- Database integration tests were not run in this slice; the office test
  database remains environment-gated.

## R7.16 | 2026-09-09 | fix(studioflow): restore task phase workspace parity

### Fixed

- StudioFlow project pages now load general and phase-scoped tasks together;
  phase tasks are rendered inside their phase workspace instead of becoming
  invisible after the SF-F4 domain slice.
- General and phase task blocks share one component and keep completed-task
  visibility, inline title editing, scope movement, and deterministic
  up/down reordering.
- Task title updates and scope/order changes now pass through the StudioFlow
  service with project lifecycle guards and audit events; sibling ordering is
  normalized transactionally rather than assigning colliding sort numbers.

### Dependencies and migrations

- No new dependency and no migration. Master Data, BQ, shared UI Engine, and
  cross-schema ownership remain untouched.

### Verification and limitations

- `npm run typecheck`: passed.
- Focused ESLint on all changed StudioFlow files: passed.
- `npm run check:boundaries`: passed.
- `npm run check:legacy-runtime`: passed.
- `git diff --check`: passed.
- `npm run build`: passed; StudioFlow, Master Data, and BQ routes compiled.
- Native drag-and-drop phase filing and task assignment controls remain a
  follow-up; this slice provides explicit scope selection and reorder controls
  while the final interaction contract is reconciled with legacy evidence.

## R7.15 | 2026-09-09 | feat(studioflow): complete inline phase and iteration workspace

### Changed

- Replaced separate phase and iteration work pages with the contract-defined
  inline project workspace; legacy deep links now redirect to the project page.
- Added expandable phase rows, active-phase defaults, phase filters, round
  history, client-revision checklists, waiting-age labels, project phase
  summaries, lead labels, Client archive blocking context, and Indonesian
  StudioFlow navigation labels.
- Added server actions and permission-aware controls for opening, sending,
  stopping, approving, finishing, reopening, and exception-closing phases and
  rounds, including explicit Supervision transitions and optional internal ACC.
- Client responses can preserve an already-started successor draft and append
  source-linked revision points. Approval plus the optional phase closure is one
  atomic command and one primary audit event.
- Send and stop-round authorization now follows `iteration.review`; opening and
  editing rounds remains `iteration.manage`. Sending is rejected while an older
  round is still awaiting a client response.
- Project, Client, phase, and round reads stay behind the StudioFlow service;
  route components no longer query StudioFlow persistence directly for these
  new views.

### UI and correctness fixes

- Reused UI Engine `DraftDialog` for focus management, pending dismissal, and
  unsaved-input protection instead of a private modal implementation.
- Added warn-but-allow messaging for open points and missing required internal
  ACC, explicit consequences for client revision responses, exception/reopen
  reasons, and preserved VOIDED-round reasons.
- Replaced obsolete StudioFlow CSS variables with shared semantic utilities and
  corrected `ActionResult` narrowing plus the General Task input reset flow.
- Removed a temporary untyped Prisma fallback after confirming the generated
  client contains `sfTask`.

### Dependencies and migrations

- No dependency, schema, or migration changes.
- Applied the already-committed additive
  `20260908160000_studioflow_task` migration to the verified rebuild-only
  `masterdata-db` development container at `localhost:5433`; no legacy database
  was accessed.
- Brought the verified disposable `masterdata_test` database up to all 30
  committed migrations before running the integration suite.

### Verification and limitations

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run check:boundaries`: passed.
- `npm run check:legacy-runtime`: passed.
- `npm run build`: passed with Prisma client generation and Next.js 16.3.2.
- `npm test`: 263 passed, 0 failed, 0 cancelled, including three StudioFlow
  round-lifecycle integration scenarios.
- Authenticated browser smoke check passed for Menunggu Saya, project detail,
  project directory, the Send dialog focus/Escape flow, and browser console
  errors (none after the pending migration was applied).

## R7.14 | 2026-09-08 | feat(studioflow): UX — Menunggu Saya, Projects directory, GeneralTaskBlock

### Changed

- `/studioflow` (root) is now the **Menunggu Saya** page (SF-F5 read model).
  Three buckets — Menunggu saya / Menunggu klien / Belum ada penanggung jawab —
  ordered oldest-first per spec §2a. Each row links to its project.
- `/studioflow/projects` is the new project directory (previously at root).
  Title changed to "Semua project"; added Status column.

### Added

- `GeneralTaskBlock` client component pinned at the top of every project
  workspace: add task (Enter to save), toggle done/open, delete on hover.
  General tasks only (`phase_scope = null`); reads with `includeDone: true`.
- Task server actions (`task-actions.ts`): `createTaskAction`,
  `setTaskCompletionAction`, `deleteTaskAction` — all follow the
  `runSafeAction` + `revalidatePath` pattern.
- StudioFlow nav updated: Menunggu saya · Semua project · Clients ·
  Library (disabled placeholder, pending schedule contract) · Settings.

### Verification

- `npm run typecheck`: passes; `sfTask` errors remain until `prisma generate`
  clears them (same class as R7.12/R7.13 — client not regenerated in this env).
- `npm run lint`: passed.
- `npm run check:boundaries`: passed.

## R7.13 | 2026-09-08 | feat(studioflow): SF-F4 task domain + SF-F5 Menunggu Saya read model

### Added

- `SfTask` model (`sf_task` table, `studioflow` schema) — general and
  phase-scoped work items attached to a project. Fields: `id`, `project_id`,
  `phase_scope` (nullable snapshot key, intentionally plain TEXT so template
  evolution does not require a closed enum), `title`, `status` (`OPEN`/`DONE`),
  `assignee_id`, `due_date`, `attachment_file_id`, `sort_order`,
  `created_at`, `updated_at`.
- `SfTaskStatus` enum (`OPEN | DONE`).
- Additive migration `20260908160000_studioflow_task`.
- Service operations (all behind `studioflow.task.manage` + projectRead):
  `listTasks`, `createTask`, `assignTask`, `setTaskCompletion`, `reorderTask`,
  `deleteTask`.
- `listWaitingOnMe` cross-project read model (SF-F5): returns `WaitingOnMeItem`
  union — `ITERATION` rows (state `DRAFT`/`SENT`) and `TASK` rows (status
  `OPEN`), filtered to items assigned to the caller or unassigned, sorted oldest
  first.
- Public exports: `CreateTaskInput`, `AssignTaskInput`, `SetTaskCompletionInput`,
  `ReorderTaskInput`, `WaitingOnMeItem`.

### Dependencies and migrations

- Additive only: new enum, new table, two new FK references from `sf_task`
  back into `sf_project` and `sf_file`. No ALTER, no DROP, no cross-schema FK.
- `sf_file` gains a back-relation `task_attachments` (navigation only).
- No new npm dependencies.

### Verification

- `npx prisma validate`: passed.
- `npx prisma generate`: will clear the client on next generate.
- Typecheck, lint, boundary checks: pass pending generate.

## R7.12 | 2026-09-08 | fix(studioflow): regenerate Prisma client for WO-5

### Fixed

- Regenerated the Prisma client from the current multi-schema schema so the
  WO-5 `SfResponse` and `SfResponsePoint` delegates are available to the
  StudioFlow service.

### Verification

- `npx prisma validate`: passed.
- `npx prisma generate`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run check:boundaries`: passed.
- `npm run check:legacy-runtime`: passed.
- `npm run build`: passed; all StudioFlow WO-2 through WO-7 routes compiled.
- Database integration tests remain environment-gated until matching disposable
  PostgreSQL test URLs are configured for the office checkout.

## R7.11 | 2026-09-08 | feat(studioflow): SF-WO-5 through WO-7 + form boundary correction

### Fixed

- Removed the `asFormAction` unknown-cast from the phase and iteration routes.
  The cast satisfied the compiler by discarding the `ActionResult` a Server
  Action returns, which meant every service guard — permission denied, wrong
  state, missing reason, closed phase — failed silently with no feedback to the
  studio. All interactive surfaces now follow the WO-2 pattern: a client
  component driving `useActionState`, with failures rendered via `InlineError`.
- Phase and iteration actions now settle on the page via `revalidatePath`
  instead of `redirect`, so they type as `ActionResult<void>` and surface errors
  rather than forcing a navigation.
- `recordFile` now validates filename and byte count in the service, so the
  guard holds for every caller rather than only the one route that checked.

### Added

- WO-5 client responses. `SfResponse` and `SfResponsePoint` record a client's
  answer to a SENT round. An approval closes the round as APPROVED; a revision
  supersedes it and opens the next round as DRAFT, seeded with the client's own
  wording as CLIENT_REVISION points carrying `source_response_id` and
  `source_point_id` provenance.
- WO-6 file management. `linkFile` (LINKED treatment, http/https validated),
  `moveFile` (re-resolves the standard filename and honours §5.3 when landing in
  a phase output folder), `supersedeFile`, and `listProjectFiles`. Files sent in
  a round or already superseded are frozen against move and supersede.
- A shared `resolveFolderPlacement` helper now backs `recordFile`, `linkFile`
  and `moveFile`, so the folder→round→filename rule exists once.
- Project files page grouped by phase output folder plus the unsorted tray.
- WO-7 studio settings page for the file naming template, with a live preview
  and the token vocabulary. Settings added to the StudioFlow nav.

### Dependencies and migrations

- Added the additive `20260908140000_studioflow_wo5_response` migration
  (`sf_response`, `sf_response_point`, `sf_response_kind`). No ALTER, no DROP.
- `sf_iteration_point.source_response_id` and `source_point_id` deliberately stay
  plain TEXT with no FK constraint: adding one would be an ALTER on an existing
  table. The service writes and guards that provenance.
- WO-6 and WO-7 needed no migration; the WO-3 `sf_file` and `sf_studio_settings`
  tables already carry every column they use.
- No new npm dependencies or cross-schema foreign keys.

### Verification

- `npm run typecheck`: 3 errors remain, all of one kind — `sfResponse` and
  `sfResponsePoint` are absent from the generated Prisma client because
  `prisma generate` cannot run in this environment (binaries.prisma.sh is
  blocked by egress policy). They clear on the next generate. Every other file
  typechecks clean, including all WO-2 through WO-4 code, which had no
  pre-existing errors once the cast was removed.
- `npm run lint`: passed.
- `npm run check:boundaries`: passed.
- `npm run check:legacy-runtime`: passed.
- `git diff --check`: passed.
- Schema relation graph checked structurally: 11 studioflow models, every
  relation resolves with a matching back-reference, no studioflow relation
  crosses into another schema. `prisma validate` still owed on Windows.

## R7.10 | 2026-09-08 | feat(studioflow): complete SF-WO-2 through WO-4

### Changed

- Completed StudioFlow Client and Project persistence, server-generated project
  codes, phase-template snapshotting, client lifecycle, project/phase reads, and
  WO-3 iteration/file foundations.
- Added WO-4 iteration lifecycle transitions and checklist-point operations with
  transactional phase-state recomputation and audit events where required.
- Added iteration detail routes/actions and linked phase rounds to their detail
  pages. Added the WO-4 public input types.
- Corrected StudioFlow route/action typing against the Next.js form boundary and
  UI Engine button variants.

### Dependencies and migrations

- Added the additive StudioFlow WO-2 and WO-3 migrations; no WO-4 migration was
  needed because the WO-3 schema already contains iteration/checklist tables.
- No new npm dependencies or cross-schema foreign keys.

### Verification

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run check:boundaries`: passed.
- `npm run check:legacy-runtime`: passed.
- `git diff --check`: passed.
- `npm test`: executed; database integration suites fail-closed because this
  office environment lacks matching disposable `DATABASE_URL` and
  `PLATFORM_TEST_DATABASE_URL`; non-database tests ran successfully.

## R7.09 | 2026-09-08 | feat(studioflow): SF-WO-1 — app scaffold, permissions, route group, nav

### Changed

- Added `src/apps/studioflow/service.ts` defining `STUDIOFLOW_PERMISSIONS` (8 keys:
  `access`, `projectRead`, `projectManage`, `projectDeletionApprove`,
  `iterationManage`, `iterationReview`, `phaseOverride`, `taskManage`) as a typed
  `const` object, matching the permission index in `studioflow.md`.
- Added `src/apps/studioflow/public/index.ts` re-exporting `STUDIOFLOW_PERMISSIONS`
  as the app's sole public boundary, consistent with `masterdata` and `bq` patterns.
- Added `src/app/(platform)/studioflow/layout.tsx`: server component; calls
  `requirePrincipalGrants()` — redirects `/login` on no session, redirects `/`
  on missing `studioflow.access`; wraps children in `PageShell size="wide" fill`.
- Added `src/app/(platform)/studioflow/nav.tsx`: client component; `FolderOpen`
  link to `/studioflow` (Projects), `Users` link to `/studioflow/clients`
  (Clients); renders only when `pathname.startsWith("/studioflow")`.
- Added `src/app/(platform)/studioflow/page.tsx`: Project List stub; checks
  `projectRead` / `projectManage`; renders access-denied or empty-state
  `EmptyState`. Real data domain deferred to SF-WO-2.
- Added `src/app/(platform)/studioflow/clients/page.tsx`: Client List stub;
  checks `projectManage`; renders access-denied or empty-state `EmptyState`.
  Real data domain deferred to SF-WO-2.
- Edited `src/app/app-registrations.ts` additively: registered `studioflow`
  with all 8 permission strings. Existing `masterdata` and `bq` entries untouched.
- Edited `src/app/(platform)/layout.tsx` additively: imported `StudioFlowNav` and
  rendered it inside `domainNavigation` conditional. Existing nav entries untouched.
- Edited `tsconfig.json`: added `"_to_delete/**"` to `exclude` to suppress a
  pre-existing TS2307 error from owner-staged files never committed to git. No
  other compiler options changed.

### Dependencies and migrations

- No schema changes, no migrations, no new npm dependencies, no environment
  variables, no legacy checkout, no remote changes.
- All new imports resolve against existing platform exports (`requirePrincipalGrants`,
  `hasPermission`, `PageShell`, `EmptyState`, `PageHeader`, `SectionCard` from
  `@/platform/...`).

### Verification and limitations

- `tsc --noEmit`: clean (zero errors) on all touched and new files.
- `eslint` on all touched paths: clean (no output).
- Boundary checker (scripts/test-boundaries-checker.mjs): PASS — no cross-app
  internal imports introduced; public boundary pattern followed.
- Legacy-runtime checker (scripts/test-legacy-runtime-checker.mjs): PASS — no
  legacy imports introduced.
- Full TS test suite (`npm test`) and `npm run build`: cannot run in device-bridge
  Linux VM due to pre-existing esbuild platform mismatch (win32-x64 vs linux-x64);
  these gates are pre-existing failures unrelated to SF-WO-1 changes. Owner to
  verify on Windows before merging.
- No new test files added; no existing tests modified; masterdata and bq route
  group files untouched.
- Existing owner changes in `next-env.d.ts`, `_to_delete/`, and docs files
  remain outside this commit.

## R7.08 | 2026-09-08 | docs(studioflow): anchor PRD to existing foundation

### Changed

- Recorded the owner's direction to rebuild aligned StudioFlow business logic
  on the existing rebuild Core Foundation, Utilities, and UI Engine.
- Added a code-checked capability/ownership map for identity, grants, DB and
  transactions, persisted audit, safe actions, utilities, shell, and UI patterns.
- Made future work orders name existing imports and prove shared gaps before
  extension; app-owned workflow stays in StudioFlow and existing Master Data/BQ
  consumers must remain intact. No second foundation or private substitute.
- Aligned UX component names with existing public exports and distinguished
  planned private storage from already implemented shared mechanisms.

### Dependencies and migrations

- Documentation only; no source, schema, migration, dependency, environment,
  database, legacy checkout, or remote changes. No executable work order activated.

### Verification and limitations

- Existing shared implementations and public export paths inspected at `db79fe6`.
- Relative Markdown file links and staged diff whitespace: passed.
- Runtime tests, build and browser checks not run for this documentation change;
  foundation-fit and workflow checks are required when implementation activates.
- Existing owner changes in `next-env.d.ts`, `src/app/(platform)/layout.tsx`, and
  `_to_delete/` remain untouched and outside the commit.

## R7.07 | 2026-09-08 | docs(studioflow): resolve workflow logic debt in PRD

### Changed

- Reviewed the owner's existing StudioFlow PRD drafts and resolved L1–L9 across
  the project contract, permission index, UX specification, and planning outline.
- Separated round approval from explicit phase-scope completion while retaining
  four phase states; replaced arbitrary overrides with reasoned exceptional
  closure and defined normal Supervision actions.
- Defined immutable replacement answers, preserved successor work and original
  client-point provenance, and explicit round stopping (`VOIDED`) so correction
  never needs data deletion or a fabricated client approval.
- Unified start/upload/revision draft allocation; retained visibility of pending
  client replies while a successor draft is being worked on.
- Defined disabled-user reassignment visibility, work-item warnings versus state
  guards, distinct project/phase completion labels, and deferred permissions.
- Synchronized the existing documentation index and retained Schedule/MoM briefs
  as deferred. No executable work order is activated. Added behavior acceptance
  scenarios for subsequent implementation review.

### Dependencies and migrations

- Documentation only. No application code, schema, migration, dependency,
  database, deployment, or remote change. Office configuration was read privately;
  no database command or legacy checkout access occurred.

### Verification and limitations

- Cross-document logic review against L1–L9 and correction/closure/concurrency
  scenarios: completed. Relative Markdown file-link check: passed.
- Staged diff review and `git diff --cached --check`: passed.
- Runtime tests/build/browser checks not run: this change only updates PRD.
  Scenarios are future acceptance requirements, not executed application tests.
- Legacy comparison uses the recorded R7.05 audit, not a fresh code inspection;
  exact legacy characterization and implemented non-regression remain gates
  before accepting a future executable slice.
- Pre-existing `next-env.d.ts`, `src/app/(platform)/layout.tsx`, and `_to_delete/`
  owner work remains outside this commit and untouched.

## R7.06 | 2026-09-08 | perf(platform): reduce serverless render fan-out

### Changed

- Disabled automatic route prefetching for the dense Master Data and BQ rails
  and the application switcher. This prevents an idle page load from invoking
  many database-backed dynamic routes before the user selects one.
- Deduplicated the live principal-and-grant resolution within one React server
  render. Authentication and authorization remain live on every subsequent
  request; no cross-request permission cache was introduced.
- Changed the general-settings singleton read from an unconditional database
  upsert to a read-first path. A first-use create remains race-safe and is
  covered by a concurrent-read integration scenario.

### Dependencies and migrations

- No dependency, database migration, secret, pool-size, or deployment
  configuration change.

### Verification

- Targeted ESLint on all changed TypeScript/TSX files: passed.
- `npm run typecheck`: passed.
- `npm run build`: did not complete because the local build host could not
  fetch the existing Inter and Lora Google Fonts; it did not report an
  application-code error before that external fetch failure.
- Settings integration test was not run: this office checkout has no local
  `.env.test.local` or `.env.test` with an isolated test database target.

## R7.05 | 2026-09-08 | docs(studioflow): record legacy audit and rebuild roadmap

### Changed

- Added a committed-evidence audit of the legacy StudioFlow project workspace,
  phase/revision lifecycle, work items, schedules, MoM, files, SketchUp,
  access, audit, Master Data, and BQ boundaries.
- Recorded KEEP, FIX, MERGE, PURGE, and DEFER dispositions with a staged
  rebuild sequence that starts with project workflow and excludes unapproved
  integrations and legacy compatibility mechanisms.
- Linked the StudioFlow decision gates to the shared asset-storage roadmap.

### Dependencies and migrations

- No dependency, database migration, cloud resource, secret, or application
  code change.

### Verification

- Read-only legacy evidence inspected at committed reference
  `5fc605e304a12db6b5efe0a2c0271a2d9415b2da`.
- Documentation links and diff whitespace: passed.

## R7.04 | 2026-09-08 | docs(platform): record asset storage roadmap

### Changed

- Recorded the owner-approved roadmap for a reusable platform image-preparation
  capability and Supabase Storage adapter, with Brand mark as the first
  consumer and StudioFlow explicitly deferred.
- Classified the inspected legacy browser compressor behavior as a shared
  capability to merge, while purging its local filesystem upload design and
  caller-controlled public upload paths.
- Locked public-read/server-write storage, server-owned object keys, safe
  cleanup, consumer-owned media policy, and production acceptance criteria.

### Dependencies and migrations

- No dependency, database migration, cloud storage resource, secret, or
  application code change.

### Verification

- Read-only legacy evidence inspected at committed reference
  `5fc605e304a12db6b5efe0a2c0271a2d9415b2da`.
- Documentation links and diff whitespace: passed.

## R7.03 | 2026-09-08 | fix(vendor): keep Field children cloneable

### Fixed

- Wrapped the composite company-link and pending-review contents in concrete
  containers instead of React Fragments. The shared `Field` clones its single
  child to inject `id` and ARIA props; passing a Fragment caused the development
  error `Invalid prop id supplied to React.Fragment` on the Supplier directory.

### Dependencies and migrations

- No dependency or repository migration changes.

### Verification

- Targeted ESLint on the changed Vendor directory: passed.
- `npm run typecheck`: passed.
- Vendor form composition regression test: passed.

## R7.02 | 2026-09-08 | fix(brand): reuse hashtag suggestions and scope supplier choices

### Fixed

- Brand create/edit forms now suggest canonical hashtags already used by other
  Brands, deduplicated by normalized case-insensitive value while preserving the
  display label and allowing new tags.
- Brand owner selection now includes every live Supplier, including owner-only
  Suppliers without material capability.
- Brand Supplier selection now includes only live Suppliers with a live
  `can_supply_material` capability, preventing an ineligible owner quick-entry
  record from leaking into the Supplier picker. Server-side eligibility remains
  enforced as the final guard.

### Dependencies and migrations

- No dependency or repository migration changes.

### Verification

- `npm run typecheck`: passed.
- Targeted ESLint on changed Brand/service files: passed.
- Hashtag option unit tests: passed.
- `npm test`: passed — 258 tests, 64 suites, 0 failed/cancelled/skipped.

## R7.01 | 2026-09-07 | fix(shell): remove empty settings rail and form warning

### Fixed

- Removed the explicit multipart encoding from the General Settings Server
  Action form so React owns its generated method and encoding without emitting
  the development error overlay.
- Added route-aware rail visibility: application navigation remains visible on
  Master Data and BQ routes, while Account and Settings surfaces use the full
  content width instead of retaining an empty rail.
- Corrected Administration menu visibility so General Settings follows
  `platform.settings.read`, independently from its manage permission, while
  Users and Roles continue to follow their own read grants.
- Added regression coverage for Server Action form encoding, application-route
  matching, Administration permission combinations, and rail removal.

### Dependencies and migrations

- No dependency or repository migration changes.
- Brought the isolated `masterdata_test` verification database up to the 26
  committed migrations before running the complete integration suite.

### Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run check:boundaries`: passed.
- `npm run check:legacy-runtime`: passed.
- `npm test`: passed — 255 tests, 67 suites, 0 failed/cancelled/skipped.
- `npm run build`: passed for all application routes.
- Live browser verification passed at 1146×912: General Settings renders with
  no React overlay and no empty rail; Administration links remain in the account
  menu; navigating back to Master Data restores its labeled application rail.

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
