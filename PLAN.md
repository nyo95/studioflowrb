# Active Plan

Plan ID: WO-MD-IMPORT-01
Scope: Master Data workbook export/import for SKUs and their material prices (backend + minimal wiring)
Target revision: R8.213
Status: READY
Priority: P2
Owner: owner (Product Owner); approach approved 2026-09-28 (Decision gates in `docs/BACKLOG.md`), details below decided by the Lead
Last updated: 2026-09-29

## Outcome

A Master Data user with the right permissions can export the SKU + material-price catalogue to an Excel workbook, edit it, and import it
back. Import is two steps: a **preview** that saves nothing and reports exactly what would happen per row, then an **apply** that is
all-or-nothing. Unknown vendors, units, categories or brands are rejected (never created). The Lead builds the screens afterwards; this plan
delivers the server contract, the workbook format, tests, and a minimal way to exercise it.

## Context and Evidence

- SKU: `prisma/schema.prisma` `Sku` (`code?`, `name?`, `brand_id?`, `base_unit_id`, `purchase_unit_id?`, dimensions, `purchase_to_base_factor` derived,
  categories via `SkuCategory`). Price: `PriceMaterial` (`sku_id`, `supplier_vendor_id`, `amount` Decimal(16,2), `currency`, `unit_id` derived, `notes`).
- Existing write paths to REUSE (do not write to tables directly): `createSku`, `updateSku` in `src/apps/masterdata/services/sku.service.ts`,
  `createPriceMaterial` / price update in `pricing.service.ts`. They already own validation, derived fields, permissions, audit and slug rules.
- Transactions: `runTransaction` (Serializable + retry) from the app runtime; audit through the existing writer.
- Public read port: `src/apps/masterdata/public/index.ts`. Nothing outside Master Data needs to change.

## Locked Decisions

- **Dependency approved:** add exactly one spreadsheet library, `exceljs` (maintained, reads/writes `.xlsx`). No other new dependency.
- **Format:** `.xlsx` only (no CSV in this plan). One sheet named `SKU Prices`, header row fixed, one row per (SKU, supplier price). A SKU
  with no price is one row with blank supplier/amount. Columns: `SKU ID` (opaque; blank = new SKU), `Code`, `Name`, `Brand`, `Category`,
  `Base unit`, `Purchase unit`, `Length`, `Width`, `Thickness`, `Dimension unit`, `Notes`, `Price ID` (blank = new price), `Supplier`, `Amount`,
  `Currency`, `Price notes`. Export fills the IDs; a second read-only sheet `Reference` lists valid brands, categories, units and suppliers.
- **References resolve by exact name or code, case-insensitive, trimmed** (units by code, vendors/brands/categories by name). Unknown or ambiguous
  reference => row error; **never create** a vendor, unit, category or brand.
- **Preview** parses and validates the whole file and returns per-row outcome `create | update | unchanged | error`, per-row errors
  (`{ row, column, message }`, plain language), totals, and a **content hash**. It writes nothing.
- **Apply** takes the same file plus the preview hash; it re-parses and re-validates, refuses if the hash differs or any row errors, then applies **all rows
  in one transaction** (any failure rolls back everything). One audit event per apply with counts only (no row contents).
- **Limits:** 5 MB, 2,000 data rows; over the limit is a validation error, not a truncation.
- **Update semantics:** a row with `SKU ID` updates that SKU's fields and the given price; rows never delete SKUs or prices (deletion stays in the normal
  screens). Archived/deleted targets are an error.
- **Permissions:** requires both the SKU manage and pricing manage permissions that the existing services already require; export requires read.
- Currency stays per row; amount is a decimal string, never a JS float.

## Business Rules and Architecture Constraints

- Master Data owns this; put it under `src/apps/masterdata/` (a service module, not in platform). Expose it through the app's service/runtime, and a server
  action in the Master Data route lane only for minimal wiring. No cross-app reads or writes. No new abstraction layers; no changes to the schema.
- Money and decimals through the existing `@platform/utilities/money`/decimal helpers used by the pricing service.
- Preview must be deterministic for the same file and database state; apply must be safe against concurrent edits (re-validate inside the transaction).

## Backend Contract

`exportSkuPriceWorkbook({ grants }) -> Buffer`; `previewSkuPriceImport({ grants, file }) -> { hash, totals, rows, errors }`;
`applySkuPriceImport({ grants, actor, file, hash }) -> { totals }`. Errors use `AppError` kinds; validation failures return the per-row list.

## UI Contract

Minimal wiring only: one server action per function and a bare test page or button that downloads the export and posts a file to preview/apply.
The Lead designs the real screens (upload, preview table with error highlighting, confirm) as the next revision.

## Boundaries and Non-goals

No CSV, no vendor/labor/material+labor price sheets (SKU material prices only), no background jobs, no file storage of uploads, no partial apply, no
creation of reference data, no deletion via import.

## Acceptance Criteria

- Round trip: export, change one amount and one name, preview shows `update` for those rows and `unchanged` for the rest, apply changes only those.
- A file with an unknown vendor, a bad decimal, an unknown SKU ID, and a duplicate row reports every problem with row and column, and apply is refused.
- Apply failing midway (simulated) leaves the database unchanged.
- Over-size and wrong-type files are rejected before parsing.

## Verification

Integration tests against `masterdata_test` covering the above, plus unit tests for the parser. `npm run check`, `npm run test:boundaries`,
`npm run test:legacy-runtime`, eslint, full `npm test`, and **`next build`**. Also **render `/masterdata` and every route you touch once in `next dev`** and
report it: R8.210 shipped a page that crashed only at runtime, which `npm test` and the build did not catch.

## Reviewer Acceptance

The Lead exports from the dev database, edits the workbook in Excel, previews and applies it in the browser after the UI revision.

## Regression Risks and Recovery

Largest risk is a partial write; the single-transaction apply and a rollback test cover it. Recovery: revert the single commit (no migration).

## Executor Prompt

You are the Backend Executor. Location: <rumah|kantor>. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the entire READY backend
outcome and nothing beyond it. Inspect current repository evidence, preserve unrelated owner work, make sound in-scope implementation decisions, run the
required checks (including opening the touched routes in `next dev`), update `CHANGELOG.md`, and create the target local revision commit R8.213. Stop only for
a material locked-decision conflict or unsafe boundary, using the BLOCKED / CONFLICT report. Report the commit, checks, limitations, and remaining unrelated dirty files.
