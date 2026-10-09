# WO-MD-IMPORT-SIMPLE-01 — template-first price import (QUEUED for Executor)

Status: READY, queued behind WO-E2E-ACCEPT-01 Stage 1 (only one Executor job runs at a time; the Lead copies this into `PLAN.md` when it is the next job).
Target revision: next unused. Executor does the backend and the tests; the Lead reshapes the screen afterwards.
Owner decision 2026-10-09: the import must not copy the company's complex Excel. The flow is **download template -> fill -> upload (checked at once) -> save**. The company-file layout is **removed**, not kept as an option. Moving data into the company Excel is done by copy and paste from the plain sheets.

## Outcome

1. The supplier-and-work-price database (`price-database-workbook.service.ts`, exposed in `masterdata/service.ts`, used by `(platform)/masterdata/workbook/actions.ts`) reads and writes **one flat shape** only. The old company-layout reader (sheets named `Database - <type>` and `Database Harga - <name>`, section-heading rows, one-column-per-supplier price lists, the `Harga Beli / Sumber` list reader) is deleted, with its tests.
2. **Template** (`buildPriceDatabaseTemplate`, xlsx and csv through `buildImportTemplate`): sheet **Suppliers** = Name, Type, Categories, Address, Phone, Email, PIC, Payment terms, Notes; sheet **Prices** = Category, Item, Specification, Unit, Supplier, Price, Notes (one row per price of one supplier); sheet **Notes** = plain instructions. Each data sheet has one example row. CSV is a single sheet, so the CSV template is **Prices** only and suppliers are then created from the Supplier column with their type left for the screen to ask (see Open items).
3. **Export of current data** uses exactly the same sheets and columns as the template, with no ID columns, so a downloaded file can be edited and imported back, and pasted into another workbook.
4. **Matching on import** is by natural key, case-insensitive and trimmed: Suppliers by Name; Prices by Supplier + Category + Item + Unit. A match updates the price (and notes); no match creates; identical rows report "unchanged". Categories and suppliers that do not exist are created exactly as today (existing creation rules and audit stay). "By Request" / "TBC" / "Nego" stay a price of 0 shown as "By request" (existing rule, keep).
5. **Apply the valid rows** (also closes the backlog item "workbooks reject the whole file"): the check returns a result per row (will create, will update, unchanged, error with reason). Save applies every valid row and skips the rows with errors, then reports `applied` and `skipped` counts with each skipped row's reason. Add the same `applyValidRows` behaviour to the **SKU price workbook** (`sku-price-workbook.service.ts`), which already computes per-row outcomes. Keep the preview-hash protection (the saved file must match the file that was checked).
6. The preview still saves nothing (real run rolled back, as today).

## Locked decisions

- No new dependency. Reuse `@platform/utilities/tabular` (`buildImportTemplate`, `parseTabularFile`, `exportTable`) and the existing Master Data commands; permissions unchanged (vendor and work-price manage for the database import; sku and material-price manage for the SKU import).
- Keep the 8 MB / row-limit guards. Keep audit on every created or updated record exactly as the current import writes it.
- Destructive part: deleting the company-layout reader is authorized by the owner. Do not delete the SKU workbook's ID columns here; the SKU import keeps accepting them (the Lead hides them from the main path in the screen).
- Server actions in `workbook/actions.ts` change only as far as the new service API needs (template download, check, apply with `applyValidRows`); the Lead owns every `.tsx` change on that page. If the screen no longer compiles, make the smallest compile fix and say so.

## Tests (disposable test DB)

Template with its example rows imports cleanly (create) and a second import of the same file reports unchanged; edited price updates; unknown unit or missing supplier name is a row error, the other rows still apply; "By Request" row; export then import round trip reports unchanged; the old company-layout file is now rejected with a clear message pointing to the template; preview saves nothing; apply with a file different from the checked one is refused; the same behaviour for `applyValidRows` on the SKU workbook; permissions (a user without manage cannot apply).

## Open items (Executor: do not decide, report)

- A CSV template has no place for supplier Type. Report how the current service obtains a supplier's type when a supplier is created from prices (the existing `defaultUnitId` / `priceKind` options hint at it) and keep that behaviour; the Lead decides the screen question.

## Verification

`npx tsc --noEmit`, `npm run lint`, `npm run check:boundaries`, `npm test`, `npm run check:legacy-runtime`, `npm run build`.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md` and this file, then implement it and nothing beyond it. Preserve unrelated owner work, never stage `next-env.d.ts`, run the required checks, update `CHANGELOG.md`, create one local commit, no push. Stop with a BLOCKED / CONFLICT report for a locked-decision conflict or an unsafe boundary. End with the Planner/Reviewer prompt: outcome, commit, checks, limitations, dirty files.
