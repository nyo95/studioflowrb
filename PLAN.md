# Active Plan

Plan ID: WO-MD-SKUBULK-01 (new SKUs and their first prices saved together from the price table)
Scope: Master Data backend only: one bulk save that accepts rows for existing SKUs and rows for SKUs that do not exist yet. The Lead builds the table screen afterwards.
Target revisions: next unused revision at commit time; one commit.
Status: READY
Priority: P2
Owner: Product Owner. Flow approved in chat on 2026-10-08 (kantor).
Last updated: 2026-10-08

Previous plan WO-SF-ITERNAME-01 was built by the Lead (R8.431).

## Outcome

In the New price window the person types a SKU name in a table row; when it does
not exist they choose "add as new SKU", fill a few details inline (category, an
optional size) and keep going. One "Create prices" saves existing and new SKUs
together. Today the backend can only create one SKU with its price (`createSku`)
or bulk-price existing SKUs (`createMaterialPricesBulk`); this plan adds the
missing mixed bulk save.

## Locked Decisions (owner 2026-10-08)

1. **One save for both kinds of row.** Row kind `existing` = a SKU id, supplier,
   amount, notes (as today). Row kind `new` = SKU details plus supplier, amount,
   notes.
2. **Valid rows save, invalid rows come back.** Same contract as the labor grid
   (`onInvalid: "save-valid"`, per-row isolation, rejected rows listed with their
   row number, a stable code and a plain message; when no row could be saved the
   error carries the rows).
3. **New SKU rules are the existing `createSku` rules, reused not copied:**
   identity (name or code; the UI sends the name), brand optional, base unit
   required, purchase unit optional, size (length, width, thickness, dimension
   unit) with the M² rule and the factor, at least one product category, brand
   and category must be active, audit entries as for a catalog SKU.
4. **Same new SKU on several rows** (same name once normalised, e.g. one SKU from
   two suppliers) creates the SKU once and adds one price per row. The SKU
   fields come from the first of those rows; a later row that disagrees on
   brand, category or units is rejected with a clear message.
5. **A "new" name that already exists** (same normalised identity as an existing
   SKU) is rejected for that row with the existing SKU's id in the details, so the
   screen can offer "use the existing one". Never silently reuse it.
6. **Price rules unchanged:** one active price per SKU and supplier; the supplier
   must support material; the R8.416 auto-link of supplier and brand applies to
   every saved price (new or existing SKU).
7. **Old paths stay.** `createSku`, `createMaterialSkuAction` and
   `createMaterialPricesBulk` keep working until the Lead removes their last
   callers; do not delete them here.

## Backend Contract

- **Service:** `createMaterialSkuPricesBulk({ grants, actor, currency, rows,
  onInvalid? })` in the Master Data pricing/SKU services; rows as in decision 1.
  Each row runs in its own transaction on the existing serializable runner with
  its retry; created SKU ids are returned in input order.
- **Permissions:** SKU manage for any `new` row; material price manage for all.
  A person who may only price existing SKUs can still send `existing` rows.
- **Result:** `{ batchId, ids, createdSkuIds, rejected?: Array<{ index, code,
  message, details? }> }` (same `batchId` and rejected shape as the labor grid).
- **Action:** `saveMaterialSkuPricesBulkAction(input)` next to the other bulk
  actions in `src/app/(platform)/masterdata/pricing/actions.ts`: zod, at most 100
  rows, revalidates the same paths as the other bulk actions. Wiring only; no
  screen changes.
- **Limits:** amount text limit as in the other bulk inputs.

## Tests

Mixed batch (existing and new rows) saves all; one bad row among good rows saves
the rest and lists the bad one; size with M² saves the factor; size with another
base unit is rejected for that row only; the same new name on two rows creates one
SKU and two prices; a new name equal to an existing SKU is rejected with its id;
inactive brand or category rejected; supplier without material support rejected;
auto-link of supplier and brand happens; permission split (price-only person
cannot send `new` rows); a retry of the same batch after a partial save does not
duplicate what was saved.

## Boundaries and Non-goals

No screens. No schema change unless a migration is truly needed (state why). No
change to the sample shelf, the workbook import or labor grids. No new
dependency. No push, tag, PR or release.

## Acceptance Criteria

1. A batch of 3 existing and 2 new rows saves 5 prices and 2 SKUs.
2. A batch with one invalid row saves the others and reports the invalid one with
   its row number.
3. The same new SKU on two rows gives one SKU and two prices.
4. A new row whose name matches an existing SKU is rejected with that SKU's id.
5. Every saved SKU and price has the same audit entries as the single paths.
6. Existing suites pass.

## Verification

`tsc --noEmit`, `npm run lint -- --quiet`, `check:boundaries`,
`check:legacy-runtime`, `npm test` (full), `npm run build`; run the long ones in
the background and finish them before the commit. Verify the database target is
rebuild-only before any database command; use the reachable rebuild-only database
on port 5433 as is and do not stop, remove or recreate any Docker container. Run
`npm test` against the shared test database only; the Lead uses its own database
for browser runs. Browser not required.

## Reviewer Acceptance

After the Lead's table screen: type a new SKU name in a row, fill category and a
size, add a second row for an existing SKU, save, and check the SKU list, the
price list and the sizes; repeat with one deliberately invalid row.

## Regression Risks and Recovery

The new path shares code with `createSku` and the bulk price save; a defect would
appear in both, so reuse the existing internal functions and keep their tests.
Revert is a single commit; no data migration.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and `PLAN.md`, then implement the entire READY outcome
(WO-MD-SKUBULK-01) and nothing beyond it, verified and committed once with the
next unused revision from `CHANGELOG.md`. Never commit a half-done change. Edit
only `src/apps/masterdata/**`, `src/app/(platform)/masterdata/pricing/actions.ts`,
`CHANGELOG.md` and `docs/BACKLOG.md`; do not touch screens (the Lead edits
`pricing-directory.tsx` in parallel) and stage only your own files. Reuse the
existing SKU creation and bulk price internals instead of copying their rules. Run
the long checks (`npm test`, `npm run build`) as background jobs and finish them
before the commit. Do not stop, remove or recreate any Docker container: use the
reachable rebuild-only database on port 5433 as is, and tell the Lead if it is not
reachable. Stop only for a material locked-decision conflict or unsafe boundary,
using the BLOCKED / CONFLICT report; otherwise report the commit, checks,
limitations, and remaining unrelated dirty files.
