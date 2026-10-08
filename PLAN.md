# Active Plan

Plan ID: WO-MD-ENTRY-01 (data entry that does not fight the person: auto-link on price save, "still used by N prices" details, save-the-valid-rows in the price grids)
Scope: Master Data backend for the three owner-approved recommendations of the 2026-10-08 data-entry review. The Lead changes the Pricing screens afterwards.
Target revisions: next unused revision at commit time; one commit per group, in order A, B, C. Stopping after any committed group is a valid result (report the rest as not started); never commit a half-done group.
Status: READY for group C only (A built at R8.416 and B at R8.417, both reviewed PASS)
Priority: P2
Owner: Product Owner. Decisions confirmed in chat on 2026-10-08 (kantor): "ikut rekomendasi".
Last updated: 2026-10-08

Previous plan WO-MD-CRUD-01 is BUILT (R8.412–R8.414); the Lead wired the Material+Labor supplier lists in the Pricing screen.

## Outcome

A person typing a supplier's price list is no longer stopped by rules the system
can work out for itself: pricing a Brand's SKU from a supplier makes that
supplier a supplier of the Brand; a "still in use" refusal says exactly which
Brand and supplier and how many prices so the screen can link to them; and in
the price grids one bad row no longer throws away the good ones.

## Locked Decisions

1. **Group A, auto-link.** When a material price is created for a SKU that has a
   Brand, and the supplier is not that Brand's owner and not yet one of its
   suppliers, the link (`BrandSupplier`, `is_authorized` false, no notes) is
   created in the same transaction instead of refusing with
   `PRICE_BRAND_SUPPLIER_NOT_LINKED`. The supplier must still be live and
   material-capable (unchanged). The link is audited as `brand.supplier-linked`
   with the price as the reason. This applies to every path that creates a
   material price: single create, `createMaterialPriceRows` and the bulk wrapper,
   the SKU-with-prices create, and the workbook imports. Anyone allowed to create
   the price may cause the link; no extra permission. Updating a price keeps its
   existing chain check. `linkBrandToSupplier` and the removal rules
   (`BRAND_SUPPLIER_IN_USE`, `BRAND_OWNER_IN_USE`) are unchanged.
2. **Group B, details on "in use".** `BRAND_OWNER_IN_USE` and
   `BRAND_SUPPLIER_IN_USE` (and the Supplier Type capability-in-use refusals)
   carry structured `details` the screen can use: the Brand id and name, the
   Supplier id and name, and the live price count. The message text stays
   human-readable. No behaviour change otherwise.
3. **Group C, save the valid rows.** The price grids get a second mode: save the
   rows that pass and return the rows that do not, each with its message, instead
   of refusing the whole batch. It applies to `createMaterialPriceRows` (and
   `createMaterialPricesBulk`), `createWorkPricesBulk` and `createWorkPriceMatrix`.
   - New input flag, e.g. `onInvalid: "reject-all" | "save-valid"`; the default
     stays `reject-all` so existing callers and tests keep working; the Lead
     switches the screens to `save-valid`.
   - Result in `save-valid` mode: the saved ids and a `rejected` list with the row
     index, supplier where the grid has one, field, code and message (the same
     shape `details.rows` has today). It succeeds when at least one row was
     saved, and still refuses with `BULK_ROWS_INVALID` when none was.
   - The unit of saving is the row (the cell, in the compare grid). A database
     error on one row must not poison the other rows: use a per-row savepoint (or
     per-row transaction) so the batch continues, never a swallowed error inside
     one aborted transaction.
   - One audit entry per batch with saved and rejected counts. Duplicate-in-batch
     and live-conflict checks keep working; rows rejected for them are listed
     like any other.
   - **Not in this work order:** the workbook imports keep their current
     preview-then-apply, all-invalid-rows-rejected behaviour.

## Business Rules and Architecture Constraints

Capability REUSE: the existing per-row creators and the archive/link helpers. No
schema change expected; if one proves necessary, stop with BLOCKED / CONFLICT.
Master Data stays the owner of Brand and Supplier links; StudioFlow and BQ are
untouched.

## Boundaries and Non-goals

No screen changes (the Lead does them). No change to permissions beyond the
side-effect link in group A. No change to the workbook imports, to SKU rules, or
to archive and restore. No push, tag, PR or release.

## Acceptance Criteria

1. A: a price for a SKU of Brand B from a supplier that is neither B's owner nor
   linked creates the price and the link in one transaction; an archived or
   non-material supplier is still refused; a failed price rolls the link back; the
   link appears once when two rows in one batch use the same new supplier; the
   audit shows the link; the old "not linked" refusal is gone from every create
   path.
2. B: each named refusal returns the ids, names and count in `details`; tests
   assert them.
3. C: a grid with some bad rows in `save-valid` mode saves the good ones and
   returns the bad ones with index, field, code and message; with all rows bad it
   refuses as today; a row that fails inside the database does not stop later
   rows; `reject-all` mode behaves exactly as before; the compare grid reports
   rejected cells with their supplier.
4. The existing suites pass unchanged except where a test asserted the old "not
   linked" refusal (name each changed expectation in the changelog).

## Verification

Per commit: `tsc --noEmit`, `npm run lint -- --quiet`, `check:boundaries`,
`check:legacy-runtime`, `npm test` (full), `npm run build`; run the long ones in
the background and finish them before the commit. Verify the database target is
rebuild-only before any database command; use the reachable rebuild-only test
database on port 5433 as is and do not stop, remove or recreate any Docker
container. Browser not required.

## Reviewer Acceptance

After the Lead's screen changes: enter a price for a Brand from an unlinked
supplier in the browser, try removing a supplier link that prices use and follow
the link in the message, and save a grid of ten rows with two bad ones.

## Regression Risks and Recovery

Group C touches the all-or-nothing guarantee the grids have today; the default
mode keeps it and each group reverts as one commit. A savepoint mistake could
leave a half-saved row; the "database error mid-batch" test is the guard.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and `PLAN.md`, then implement group C only of
WO-MD-ENTRY-01 (groups A and B are already committed as R8.416 and R8.417; do not
touch them), verified and committed on its own with the next unused revision from
`CHANGELOG.md`, and nothing beyond it. Never commit a half-done group. Edit only
`src/apps/masterdata/**`, `CHANGELOG.md` and `docs/BACKLOG.md`. The Lead may edit
other areas in parallel, so stage only your own files. Run the long checks
(`npm test`, `npm run build`) as background jobs and finish them before the
commit. Do not stop, remove or recreate any Docker container: use the reachable
rebuild-only database on port 5433 as is, and tell the Lead if it is not
reachable. Stop only for a material locked-decision conflict or unsafe boundary,
using the BLOCKED / CONFLICT report; otherwise report the commit, checks,
limitations, and remaining unrelated dirty files.
