# Active Plan

Plan ID: WO-MD-CRUD-01 (Master Data CRUD audit fixes: restore, brand edit, duplicates, supplier archive cascade, Material+Labor supplier rule)
Scope: Master Data service fixes found by the Lead's read-only audit of 2026-10-08, with two owner decisions. Backend only; the Lead adjusts the supplier pickers and the quick-add supplier form afterwards.
Target revisions: next unused revision at commit time; one commit per item group, in order A, B, C. Stopping after any committed group is a valid result (report the rest as not started); never commit a half-done group.

Previous plan WO-PLAT-COST-02 is BUILT (items B and C at R8.406 and R8.409).
Status: READY
Priority: P2
Owner: Product Owner. Decisions confirmed in chat on 2026-10-08 (kantor).
Last updated: 2026-10-08

## Outcome

Master Data behaves the same on every path to the same state: a price-less SKU
and its Brand can be restored, a Brand can be edited while its owner is archived,
duplicate input never produces a generic error, archiving a Supplier archives
what depends on it, and a Material+Labor price can come from a material
supplier, a labor supplier or one that is both.

## Locked Decisions

Owner (2026-10-08):

1. **Supplier archive cascade.** Archiving a Supplier archives every price of it
   (Material, Labor, Material+Labor, as today) **and every Brand it owns**
   (`Brand.owner_vendor_id`), each Brand with its SKUs and their material prices
   exactly as `archiveBrand` does. A Brand that merely lists the Supplier as one
   of its suppliers stays live (other suppliers may still carry it). Restoring
   the Supplier restores what it caused, with the existing restore checks.
   The Brand-archived-by-Supplier uses the existing archive-cause model: a
   `PARENT` cause (`parent_type: "vendor"`) on the Brand; a Brand that was also
   archived by hand keeps its own direct cause and stays archived after the
   Supplier is restored.
2. **The "keep one live price" rule.** Archiving a single price by hand still
   refuses to archive a live SKU's last live price (`SKU_PRICE_REQUIRED`).
   Cascades (Supplier, Brand, SKU) are exempt, as they are today for Brand and
   SKU. No change to that rule's code beyond not applying it to cascades.
3. **Material+Labor supplier.** A Material+Labor price accepts a Supplier that
   can supply material, or can provide labor, or both. A Labor price still needs
   a labor-capable Supplier; a Material price still needs a material-capable one.

## Backend Contract

**Item group A — restore and edit bugs** (BACKLOG [BUG] entries of 2026-10-08):
- A1. A SKU with no archived-with-it prices restores. `assertSkuRestorable`
  (`services/shared.ts`) must stop demanding a restorable price when the SKU
  had none; it keeps every other check. `restoreSku` and `restoreBrand` both
  succeed for a price-less SKU. A SKU whose prices exist but are all still held
  by another archive cause keeps the current refusal.
- A2. `updateBrand` checks the owner Supplier only when the owner is being
  changed to a new one. Saving a live Brand whose current owner is archived
  works for every other field; setting an archived Supplier as the owner is
  still refused; `restoreBrand` keeps its own owner check.
- A3. Create paths collapse duplicate input like the update paths do: link
  URLs (trimmed, case as the unique index sees them), category ids, supplier
  ids and hashtags in `createBrand`; supplier type ids in `createVendor`. SKU is
  out: a SKU has exactly one category (`categoryId`), so it cannot repeat one.
  No generic error from a unique index for input the caller repeated.

**Item group B — Material+Labor capability** (decision 3):
- `createPriceMaterialLabor`, `updatePriceMaterialLabor`, the bulk/matrix
  creation for kind `material-labor`, `assertWorkPriceRestorable` for
  `material-labor`, and `assertVendorTypeRemovalSafe` use a new check
  "material-capable or labor-capable" for Material+Labor prices only.
  Removing a Supplier Type is blocked for Material+Labor prices only when the
  Supplier would end up with neither capability.
- `listPricingWorkRefs` returns the Suppliers a Labor price may use and
  separately the Suppliers a Material+Labor price may use (material- or
  labor-capable), so the screens can offer the right list. `createPricingVendorQuick`
  accepts capability `WORK` (either capability) for Material+Labor, still
  refusing a Supplier Type that supplies neither.
- The Lead then updates the pickers and the quick-add form; do not change screens.

**Item group C — supplier archive cascade** (decision 1):
- `archiveVendor` additionally archives the Brands it owns that are live, each
  with the same cascade `archiveBrand` runs (extract one shared helper; no
  second copy of that logic), records the audit counts for brands, SKUs and
  prices, and `restoreVendor` restores those Brands and their SKUs and prices
  through the existing cause bookkeeping, running the existing restore checks
  (identity conflict, archived category, archived unit, and so on); a failed
  check names the Brand and refuses the whole restore.

## Boundaries and Non-goals

No schema change expected (the cause table already carries parent type and id);
if one proves necessary, stop with BLOCKED / CONFLICT. No screen changes. No
change to the deletion-request workflow, to who may do what, or to SKU, unit,
category and workbook code except where an item names it. No push, tag, PR or
release.

## Acceptance Criteria

1. A: archive then restore a price-less SKU works; archive then restore a Brand
   holding a price-less SKU works; a SKU with prices still held by another cause
   still refuses; renaming a Brand whose owner is archived works; making an
   archived Supplier the owner is refused; creating a Brand with the same link
   URL, category, supplier or hashtag twice succeeds once each; the same for a
   Supplier's types.
2. B: Material+Labor price accepted for a material-only, a labor-only and a
   both-capable Supplier, refused for one with neither; Labor price still needs
   labor; restore and Supplier-Type removal follow the new rule; the matrix and
   bulk paths accept the same Suppliers as the single create.
3. C: archiving a Supplier archives its prices and the Brands it owns with their
   SKUs and prices, and not a Brand that only lists it as a supplier; restoring
   it brings back exactly what it caused; a Brand also archived by hand stays
   archived; a restore blocked by a check leaves everything unchanged.
4. Each group has its own integration tests in the existing style, and the
   existing suites pass unchanged except where a test asserted the old behaviour
   (name each changed expectation in the changelog).

## Verification

Per commit: `tsc --noEmit`, `npm run lint -- --quiet`, `check:boundaries`,
`check:legacy-runtime`, `npm test` (full), `npm run build`; run the long ones in
the background and finish them before the commit. Verify the database target is
rebuild-only before any database command. Browser not required.

## Reviewer Acceptance

The Lead walks the Pricing screen (Material+Labor supplier lists and the quick
add), archives and restores a test Supplier that owns a Brand, and restores a
price-less sample SKU, in the browser.

## Regression Risks and Recovery

The cascade touches every archive and restore path, so the existing archive
cause tests are the guard; item group C can be reverted alone as one commit. The
capability rule changes who may be picked for Material+Labor prices, never what
is stored.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and `PLAN.md`, then implement WO-MD-CRUD-01 as three
separately verified and committed groups in the order A, B, C (each takes the
next unused revision from `CHANGELOG.md` at commit time), and nothing beyond
them. Edit only `src/apps/masterdata/**`, `CHANGELOG.md` and `docs/BACKLOG.md`;
close the matching BACKLOG [BUG] entries only after their group is verified.
The Lead may edit other areas in parallel, so stage only your own files. Run the
long checks (`npm test`, `npm run build`) as background jobs and finish them
before each commit; never commit a half-done group. Stop only for a material
locked-decision conflict or unsafe boundary, using the BLOCKED / CONFLICT report;
otherwise report each commit, checks, limitations, and remaining unrelated dirty
files.
