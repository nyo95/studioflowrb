# Active Plan

Plan ID: WO-MD-PRICE-LABEL-01
Scope: Master Data — a price may be a number or a quoted text label ("by request" with a reason). Backend and the shared parser only; the Lead builds the italic display and the form hints afterwards.
Target revision: R8.283 (Executor). The Lead's follow-up UI revision is R8.284.
Status: READY
Priority: P2
Owner: owner (Product Owner). Owner proposal 2026-10-01: use quotation marks to mark a text price; the value is whatever is inside the quotes, even "120".
Last updated: 2026-10-01

## Outcome

In the company price lists a price is sometimes not a number ("depends on the request", "call sales", "per project"). Today a price of 0 means "by request" (decision Q19, R8.281) but the reason is lost. After this plan a price can carry a short text label next to its amount of 0, entered with quotation marks in the amount field, in pasted Excel cells, and in imported workbooks, and the label survives export and import.

Context: WO-MD-PROGRAM-01 (units lowercase, Brand → Supplier → Price rule, bulk commands, name capitalization) was finished by the Lead after the Executor reached its limit (R8.272 to R8.281); there is nothing left of it to do. Read `docs/apps/masterdata/pricing-contract.md` Q19 and `CHANGELOG.md` R8.281 first.

## Locked Decisions

1. **Syntax.** The amount value as typed or read from a cell is interpreted by one function:
   - A number (Indonesian or spreadsheet style, optional "Rp") is a numeric price, as today.
   - A value that **starts with a quotation mark** (straight `"` or curly `“` `”`) is a text price: the label is the text inside the quotes (the closing quote is optional while typing), trimmed. The amount is stored as 0. This holds even when the inside looks like a number: `"120"` is the text 120, not a price of 120.
   - Unquoted `By Request`, `TBC`, `TBA`, `Nego`, `Negotiable` stay a price on request with **no label** (as R8.281).
   - `-`, `n/a`, and an empty cell still mean "not offered": no price is created (importer, grid and paste only; the single-price form still requires an amount).
   - Any other unquoted text is rejected with a clear message that says to put it in quotation marks if it is meant as text (`PRICE_AMOUNT_INVALID`).
   - An empty label (`""`) is rejected. A label is at most **64 characters**; longer is rejected (`PRICE_LABEL_TOO_LONG`) and the message points to Notes. Labels keep the case as typed (they are not title-cased) and have whitespace collapsed.
2. **Storage.** A new nullable column `amount_label` (varchar 64) on `PriceMaterial`, `PriceMaterialLabor` and `PriceLabor`, with a CHECK `amount_label IS NULL OR (amount = 0 AND char_length(btrim(amount_label)) BETWEEN 1 AND 64)`. A numeric price never has a label; changing a price to a number clears the label. Existing rows keep their 0 as "by request" with no label. No data is rewritten.
3. **One parser, three users.** A pure function (no server imports, usable from client components) turns a raw amount value into `{ amount: DecimalString, label: string | null }` or an error. The services call it, so the typed value can be passed straight through the existing `amount: string` inputs; the UI forms, the bulk and compare-suppliers commands, the SKU workbook and the new supplier/price workbook all use the same function. Existing numeric strings (`"120000"`, `"120000.50"`) keep working unchanged.
4. **Semantics unchanged downstream.** A text price is a price on request: never the lowest in comparisons, excluded from nothing else. BQ and StudioFlow keep receiving the amount 0; the label is exposed as an **additive** field (`amountLabel: string | null`) on the public price reads, nothing else about those shapes changes.
5. **Audit.** Create and update audit events record `amount_label` (from and to) when it changes, alongside the amount.
6. **Export and import (supplier/price workbook).** Export writes a text price as the label **with its quotation marks** (`"call sales"`) and an unlabelled price on request as `By Request`, so an export imports back unchanged. Import reads the same syntax from cells; an unchanged amount and label count as unchanged, a changed label counts as an update. The preview lists every cell read as a text price (sheet, row, label) as an information note.
7. The single-price edit form, the bulk tables and the compare grid already post the typed string; they keep doing so. No new UI field is added.

## Business Rules and Architecture Constraints

- Capability labels: REUSE `requiredAmount` semantics for the numeric branch, `writeAudit`, `AppError`, and the existing price services; EXTEND the three price tables and the public price read types; ADD the pure parser module inside `src/apps/masterdata` (domain rule, app-owned, not a platform utility).
- Apps keep their boundaries: the public read ports gain one optional field, no other app code is edited.
- Migration begins with a pre-check (no existing row may violate the CHECK; none can, since the column is new) and is additive-safe. Apply it to the office development and disposable test databases after verifying the targets (`studioflow_rebuild`, `studioflow_rebuild_test` on `localhost`); never the legacy database.
- Do not run `npm run build`, or restore `next-env.d.ts` before staging.

## Backend Contract

- Parser module: given a raw string returns `{ amount: string; label: string | null }` (amount normalized as `requiredAmount` does) or throws `AppError` with the codes above. Table-driven unit tests cover: plain numbers in all styles, `Rp`, quoted text, quoted number, curly quotes, missing closing quote, empty quotes, 64 and 65 characters, whitespace, unquoted words (on request without label), dash and n/a (reported as "not offered" through a distinct result so callers decide), and rejected unquoted text.
- Services: `createPriceMaterial`, `updatePriceMaterial`, `createPriceMaterialLabor`, `updatePriceMaterialLabor`, `createPriceLabor`, `updatePriceLabor`, `createSku` initial prices, the bulk, matrix and per-row commands, and the SKU price workbook apply all resolve the amount through the parser and persist `amount_label`. Reads (`list*`, `get*`, `listPricingMaterialRefs` untouched) select `amount_label`; the public price reads add `amountLabel`.
- Restore and archive paths need no change; restoring a labelled price keeps its label.
- Supplier/price workbook: export and import per Locked Decision 6, preview counts unchanged.
- Error messages are readable by non-programmers and name the cell (sheet and row) where a cell is involved.

## UI Contract

The Lead builds, after this plan: italic, muted display of the label (or "By request") in place of the amount in the three lists and the SKU list; a hint under every amount field ("Use quotation marks for text, e.g. "call sales""); search across labels. The Executor adds **no** UI beyond what compilation requires.

## Tests Required

- Parser tests as above.
- Integration: create and update with a label for each of the three price kinds (label stored, amount 0, audit shows the change; a numeric update clears it); CHECK rejects a label with a non-zero amount if written directly; bulk, matrix and per-row commands accept a quoted cell and report a rejected unquoted text with the row; the supplier/price workbook round trip with a labelled price, a quoted number and an unlabelled by-request price (all `unchanged` on re-import); the SKU workbook accepts a quoted amount; public reads include `amountLabel`.
- Regression: all existing amount behavior (numbers, zero as by request, negative rejected) is unchanged.

## Regression Risks

- `requiredAmount` is also used by the sample-request flow and other numeric paths; leave those on the numeric function and use the new parser only where the user types or imports an amount.
- Excel cells that are real text (not numbers) such as `"135.000"` unquoted must still be read as a number, as today.
- The CHECK must not be added with `NOT VALID`; it applies to existing rows (all have a null label).

## Verification

`npm test`, `npm run check`, `npm run lint`, `git diff --cached --check`. Migration applied to both rebuild databases, pre-check output reported. Report the test counts before and after. Do not describe a skipped check as passed.

## Reviewer Acceptance

The Lead re-runs the suite, spot-checks the parser and two service paths, then builds the UI (R8.284) and runs the browser pass: type a quoted text in the single form, a table row and the compare grid; paste cells; import and re-import the company file with a labelled cell; export and re-import.

## Executor Prompt

You are the BACKEND EXECUTOR for this checkout (D:\Misc\ProjectsHUB\studioflowrb, office computer, `STUDIOFLOW_LOCATION=kantor`). Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, the root `PLAN.md` (WO-MD-PRICE-LABEL-01), `docs/apps/masterdata/pricing-contract.md` Q19, and `CHANGELOG.md` R8.281. Implement the whole plan: the pure parser with its tests, the migration with its pre-check applied to both rebuild databases, the three price tables and their services, bulk, matrix and per-row commands, the SKU and supplier/price workbooks, the additive public read field, and the regression tests. Add the changelog entry, update `docs/BACKLOG.md`, and make one local commit `R8.283 | feat(masterdata): text price labels written in quotation marks`. Use only the rebuild databases after verifying the target; never the legacy database. Do not run `npm run build` (or restore `next-env.d.ts` before staging). Re-run `npm test` yourself and report real counts. Stop with a `BLOCKED / CONFLICT` report if a locked decision cannot be met. Finish with a Planner/Reviewer prompt (outcome, commit, checks, limitations, dirty files).
