# Active Plan

Plan ID: WO-PLAT-TABULAR-01
Scope: Platform utilities — one shared tabular export (Excel, CSV, PDF) and import (Excel, CSV, downloadable template) capability, and the two existing consumers moved onto it. Backend/utility only; the Lead redesigns the Master Data workbook page and the download UI afterwards.
Target revision: R8.238
Status: READY
Priority: P2
Owner: owner (Product Owner). Approved 2026-09-30: shared utility; export as Excel or PDF; import as Excel or CSV "like Product Schedule"; templates built where needed; PDF is a simple table for now, and each app/module must be able to customize its PDF model later.
Last updated: 2026-09-30

## Outcome

Any app can hand a small description of a table (title, columns, rows) to one shared utility and get back an `.xlsx`, `.csv` or `.pdf` file. Any app can hand an uploaded `.xlsx` or `.csv`
to one shared utility and get back clean rows keyed by column, with the header matching, size limits and "which columns are missing or unknown" reporting done once. A blank import template
(headers, an optional example row, short notes) comes from the same column description, so the template and the importer can never disagree.

Today the Excel code lives only inside Master Data's SKU price workbook, and Product Schedule has a private CSV parser. After this plan both use the shared utility, so there is one
implementation.

## Context and Evidence

- Master Data: `src/apps/masterdata/services/sku-price-workbook.service.ts` uses `exceljs` directly (export `exportSkuPriceWorkbook`, preview/apply import, `HEADERS`, 5 MB / 2000-row limits, strict header-row match). Action: `src/app/(platform)/masterdata/workbook/actions.ts` returns `{ filename, base64 }`.
- StudioFlow: `parseLegacyScheduleCsv` in `src/apps/studioflow/domain/schedule.ts` (generic CSV → header-keyed rows, lowercases headers with `id-ID`) is the only generic part; `parseLegacyScheduleSheet` (Google Sheets layout) and `schedule/service.ts` `importCsv` (two formats: "gsheets" and "simple") are schedule semantics and stay app-owned.
- `exceljs` is already a dependency. No PDF library exists. `src/platform/utilities/*` has the pure helpers (date, money, …); registry and rules: `docs/UTILITY-INVENTORY.md`, enforced by `scripts/check-boundaries.mjs`.

## Locked Decisions

- **Home:** `src/platform/utilities/tabular/` with public exports only through its `index.ts` (import path `@platform/utilities/tabular`). Server-side only (it depends on Node libraries); it must not import any app code.
- **Disposition:** ADD in `docs/UTILITY-INVENTORY.md`, with the consumer matrix (Master Data SKU price workbook, StudioFlow schedule import). Add a boundary rule so an app file may not import `exceljs` (or the PDF library) directly; the two existing app consumers are migrated in this plan, so the rule starts with no exceptions.
- **Column description is the single source:** one `TableColumn` list drives export, template and import matching: `{ key, header, aliases?: string[], type?: "text" | "number" | "date" | "money", width?, required?, example?, note? }`. Header matching is case/space-insensitive on `header` and `aliases`.
- **Formats:** export `xlsx | csv | pdf`. Import `xlsx | csv` (by file name/type; unreadable or wrong type gives a plain `AppError`). CSV export is UTF-8 with BOM (opens correctly in Excel), quoted per RFC 4180. CSV import accepts BOM, quoted fields, embedded newlines, and `,` or `;` delimiters (detected from the header line).
- **Dependency (owner-visible):** add exactly ONE PDF library. Recommended: `pdf-lib` (pure JavaScript, no bundler/font-file problems in Next). The Executor may pick another only if it proves `pdf-lib` cannot meet the acceptance criteria, and must say so. Whatever is chosen must not crash on characters outside plain Latin (replace them safely or embed a font); Indonesian text, `×`, `–` and currency symbols must render or degrade gracefully, never throw.
- **PDF model is customizable by data, per caller:** a `PdfTableTemplate` plain object with defaults: `{ pageSize: "A4" | "Letter", orientation: "portrait" | "landscape", title?, subtitle?, headerText?, footerText?, showPageNumbers, showGeneratedAt, accentColor?, zebraRows, columnWidths? }`. Callers pass overrides; the utility ships one sensible default template. Layout-as-code (custom drawing functions) is explicitly out of scope now; the template object is the seam so a later plan can let an app register named templates without changing callers.
- **Import stays two-stage:** the utility returns rows and column diagnostics only. Domain validation, preview/apply, permissions and audit stay in the app service (Master Data keeps its existing preview/apply and hash-based flow).
- **Money/dates:** cells are written as real Excel numbers/dates for `number`/`money`/`date` columns when the value parses; amounts remain decimal strings on the way in (no float arithmetic in the utility; reuse `@platform/utilities/decimal` / `money` for formatting in PDF/CSV).

## Business Rules and Architecture Constraints

- REUSE `@platform/utilities/decimal`, `money`, `date` for formatting; do not add a second formatter.
- Limits are caller-supplied with safe defaults (default 5 MB, 5000 rows); over-limit gives a plain error naming the limit. Guard against formula injection on export: a text cell beginning with `=`, `+`, `-`, `@` is written as text (xlsx string cell) and prefixed with `'` in CSV/PDF-neutral form only where the format would otherwise evaluate it.
- Import rejects a file with no readable rows, duplicate header names, or a required column missing; unknown extra columns are reported, not fatal (the caller decides).
- The utility never touches the database, sessions, permissions or audit.

## Backend Contract

Public surface (names are the contract; signatures may be refined by the Executor within the same meaning):

- `exportTable({ format, filename, sheetName?, title?, columns, rows, pdf?: Partial<PdfTableTemplate> })` → `{ filename, mimeType, data: Buffer }`.
- `parseTabularFile({ data, filename, mimeType?, columns, maxBytes?, maxRows?, sheetName? })` → `{ format, rows: Array<{ row: number; values: Record<key, string> }>, missingRequired: string[], unknownHeaders: string[] }`. `row` is the 1-based spreadsheet row number for error messages.
- `buildImportTemplate({ format: "xlsx" | "csv", filename, sheetName?, columns, includeExample?: boolean, notes?: string[] })` → `{ filename, mimeType, data }`.

Migrations (in this plan):

1. **Master Data:** `exportSkuPriceWorkbook` and the workbook parser use the utility for the file layer. The exported `.xlsx` must stay import-compatible with the previous export (same sheet name, header order and cell meaning); existing preview/apply tests stay green. Add `format: "xlsx" | "csv" | "pdf"` to the export command (default `xlsx`; only `xlsx` and `csv` are re-importable, the PDF is read-only) and a template download for the workbook import. The PDF export of the price list uses a sensible template (landscape, title "SKU price list").
2. **StudioFlow schedule:** `importCsv` accepts `.xlsx` as well as CSV through the shared parser; the app-owned Google-Sheets layout detection and "simple" format keep their exact current behavior for CSV input (regression test: the current CSV fixtures give identical results). Remove the private generic CSV parser and use the shared one. Provide the "simple" schedule import template (category, brand, product, … exactly the columns the simple format reads today) from `buildImportTemplate`.

## UI Contract

Server actions the Lead's UI will call: a Master Data export action taking `format`, an import-template action, and the schedule import action taking a file (base64 + filename) in addition to the current pasted-CSV path. The Executor adds only the minimum wiring so these are callable and tested; the download/import screens, the redesign of the Master Data workbook page, and the Product Schedule dialog layout are the Lead's next revision.

## Boundaries and Non-goals

- No change to Master Data prices/SKU meaning, no new permissions, no schema or migration, no other app exports (BQ, StudioFlow reports) yet.
- No styled/branded PDF reports, images/logos, charts or multi-table PDFs (later, through the template seam).
- No Google Sheets layout support in the shared utility (schedule-specific).
- Do not touch legacy or any legacy database. Do not add a second PDF or spreadsheet library.

## Acceptance Criteria

- Round trip: `exportTable(xlsx)` → `parseTabularFile` returns the same values; the same for CSV, including commas, quotes, newlines, `;` delimiter, BOM, and Indonesian text.
- `exportTable(pdf)` returns a valid PDF (starts with `%PDF`, opens page count ≥ 1) for empty, small, and multi-page tables; long cells wrap or truncate without overflow errors; unusual characters never throw; the default template and an overridden template (landscape, custom title/footer) both work.
- Import diagnostics: missing required column, duplicate header, unknown column, empty file, oversize file, wrong type, unreadable xlsx each give the specified plain outcome.
- Formula-injection cells are neutralized in xlsx and csv.
- Master Data: a workbook exported before this change (fixture) still imports with identical preview results; new csv/pdf exports and the template download work; permissions unchanged.
- StudioFlow: existing schedule CSV tests unchanged and passing; an `.xlsx` with the simple columns imports the same rows as the equivalent CSV.
- Boundary check fails if an app file imports `exceljs` or the PDF library; passes now. `docs/UTILITY-INVENTORY.md` lists the utility with its consumers.

## Verification

Executor: unit tests for the utility (formats, diagnostics, PDF validity, injection), Master Data and StudioFlow integration tests for the two migrations, `npx tsc --noEmit`, `npm run check`, `npm test`, eslint on touched folders. Record any skipped check as not passed.

## Reviewer Acceptance

Lead after the commit: export each format from the Master Data workbook page and open the files (Excel/PDF viewer); import the exported xlsx back through preview; import an xlsx and a csv into a Product Schedule.

## Regression Risks and Recovery

- Master Data workbook compatibility is the main risk; a fixture built from the pre-change export guards it.
- Bundling: the chosen PDF library must work inside the Next server build (`npm run build` must pass).
- Recovery: revert the single revision; no data or schema changed.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the entire READY backend outcome and nothing beyond it. Inspect current repository evidence, preserve unrelated owner work, make sound in-scope implementation decisions, run the required checks, update `CHANGELOG.md` (next revision R8.238), and create the target local revision commit. Stop only for a material locked-decision conflict or unsafe boundary, using the BLOCKED / CONFLICT report; otherwise finish the coherent outcome and report the commit, checks, limitations, and remaining unrelated dirty files.
