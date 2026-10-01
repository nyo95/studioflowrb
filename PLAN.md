# Active Plan

Plan ID: WO-MD-PROGRAM-01
Scope: Master Data backend program, four ordered phases, each its own local revision: (1) unit codes lowercase in storage, (2) Brand → Supplier → Price enforcement, (3) bulk price commands, (4) shared text-case normalization on the server. Backend and the minimal wiring needed to exercise it only; the Lead owns all layout, the bulk table, and UI Engine behavior.
Target revision: one per phase, starting at the next unused revision in `CHANGELOG.md` (expected R8.270 … R8.273). Derive the numbers from the ledger; do not guess.
Status: READY
Priority: P1
Owner: owner (Product Owner). Owner instruction 2026-10-01: Codex finishes the whole program; the Lead must be able to check it quickly.
Last updated: 2026-10-01

## Outcome

Master Data enforces the supplier-centred chain (brand → supplier → price), stores unit codes in lowercase everywhere, accepts many prices in one all-or-nothing request, and normalizes the capitalization of typed names on the server. Every phase ends with a short Review Card so the Lead can verify it in minutes.

## How to run this program

- Execute phases **in order**. Each phase = one cohesive local commit with its own changelog entry, and it must leave `npm test`, `npm run check`, and `npm run lint` green before the next phase starts.
- If a phase hits a locked-decision conflict, stop with a `BLOCKED / CONFLICT` report; do not skip ahead or silently redefine it. Earlier completed phases stay committed.
- Start from a clean committed tree (the correction pass R8.268 must already be committed and reviewed). Record HEAD and dirty files first.
- Use only the rebuild databases after verifying the target (`studioflow_rebuild`, `studioflow_rebuild_test` on `localhost`); never the legacy database. Apply every new migration to the office development and the disposable test database and report the pre-check results.
- Do not run `npm run build`, or restore `next-env.d.ts` before staging if you do. `git diff --cached --stat` must not contain it.

### Review Card (required, one per phase)

Keep a single file `docs/audits/WO-MD-PROGRAM-01-REVIEW-CARDS.md`, appended per phase, and put the same summary in the changelog entry. Each card contains:
1. **What changed, in plain words** (3 to 6 lines).
2. **Requirement → evidence table**: each numbered requirement below, the test name (file and `it(...)` title) or query that proves it, and PASS/FAIL.
3. **Three commands the Lead can run** to re-check it (test filter, a read-only SQL query, a migration status check).
4. **Rows affected** by any data migration, per table, before and after.
5. **Deviations and deferred items**, empty if none.

## Locked Decisions

Phase 1 — unit codes
- Unit codes are stored lowercase (`m2`, `cm`, `sheet`, `pcs`). Unit names keep their own capitalization.
- A CHECK enforces `code = lower(code)`. The migration pre-checks for two codes that collapse to the same lowercase value and stops with counts if any.
- Unit strings copied as plain text into BQ (`purchase_unit`, `base_unit`, `*_snapshot`, line `unit`) and StudioFlow (`unit` columns) are rewritten to lowercase **only where the value equals a Master Data unit code ignoring case**. Free-typed text that matches no code is left alone. This is a one-off, meaning-preserving case normalization and an explicit owner-approved exception to the no-cross-app-write rule; it is done in the migration only, never at runtime. Report affected row counts per table.
- Service and workbook import accept any case and store lowercase. Public read ports return the stored lowercase value.
- Minimal UI wiring allowed: the Unit form input lowercases instead of uppercasing; hard-coded unit lookups in screens keep working (they already compare case-insensitively). Tests that look units up by uppercase code are updated.

Phase 2 — Brand → Supplier → Price
- A **material price** (create, update, restore, SKU initial prices, workbook apply, sample-request price sync) is allowed only when the SKU has no Brand, or the supplier is linked to the SKU's Brand through `BrandSupplier`, or the supplier owns the Brand. Otherwise reject with `PRICE_BRAND_SUPPLIER_NOT_LINKED`, naming brand and supplier.
- Unlinking a Brand from a Supplier, and changing a SKU's Brand, are blocked while live material prices would then violate the rule (`BRAND_SUPPLIER_IN_USE`, `SKU_BRAND_CHANGE_BLOCKED`), naming how many prices block it.
- Restoring a Brand, Supplier, SKU, or price re-checks the rule; a restore that would resurrect a violating price fails with the same code.
- New command `linkBrandToSupplier({ brandId, vendorId })`: idempotent, requires either brand-manage or supplier-manage permission, requires the supplier to be material-capable, audited. This is what the pricing form's "link this brand to the supplier" shortcut will call.
- `listPricingMaterialRefs` additionally exposes, per supplier, the ids of brands it can price (linked or owned), so the form can narrow the list. No other read shape changes.
- A read-only check function (service or script) lists current violations; the office result is reported in the Review Card (expected 0).

Phase 3 — bulk price commands
- Three commands: labor-only, material + labor, and material with an existing SKU. Work commands take one supplier, one work category, a currency (default IDR) and up to **100** rows of `{ name, unitId, amount, notes, scopeNote? }`; the material command takes one supplier and rows of `{ skuId, amount, notes }` (unit comes from the SKU). Row cap and the cap error are tested.
- **All-or-nothing in one serializable transaction.** Validate every row first and return all row problems together as `{ rowIndex, field, code, message }` (extend the action result shape minimally if it cannot carry them); write nothing if any row fails. Duplicate names inside the batch and duplicates of live rows are row errors, not a crash.
- Reuse the existing single-price validators so rules cannot drift (capability, category kind/active, unit active, amount/currency, Phase 2 chain rule).
- Audit: one event per created price plus one batch event with a batch id. The supplier is filed under the category once, audited once (existing `vendor.categories-linked`).
- Server actions: one per command, Zod-validated, `kind`/payload parsed with the shared parsers, permission re-checked in the service.

Phase 4 — text-case normalization
- A domain-neutral utility in `src/platform/utilities` (REUSE the existing slug/normalization neighbours; do not add a dependency) with: title-case-each-word (first letter of every word upper-case, remaining letters untouched, digits and symbols untouched, whitespace collapsed and trimmed) and lower-case. Pure, fully unit-tested including accents, `MEP`, `PT`, `iPhone`, `60x60`, apostrophes, hyphens, empty input.
- Applied on the server, on create and update, to these Master Data fields only: Brand name, Supplier name and legal name, SKU name (never SKU code), Category name, Unit name, Supplier Type name, work-price name (all three kinds), Supplier contact person name and job title. Hashtags are lower-case (verify existing behavior and make it use the shared utility). Codes, notes, addresses, emails, URLs, and links are untouched. Unit code is already lower-case from Phase 1.
- The SKU/price workbook importer and the bulk commands go through the same normalization.
- Existing stored data is **not** rewritten. Provide a read-only report (query or script) of how many existing names would change per entity, and put the totals in the Review Card so the owner can decide on a rewrite later.
- Uniqueness checks and slugs stay case-insensitive and must still behave (a name that only differs in case from an existing live name is still a conflict).

## Business Rules and Architecture Constraints

- Capability labels: REUSE `shared.ts` guards/`writeAudit`/`mapWriteError`, `AppError`, and the existing price validators; EXTEND `listPricingMaterialRefs` and the action result shape minimally; ADD the text-case utility and `linkBrandToSupplier`. Policy stays app-owned.
- Apps keep the boundary: runtime code never writes another app's tables. The Phase 1 unit-string rewrite is a migration-time exception stated above.
- Every migration begins with a pre-check that counts violations and raises a clear exception; none rewrites data beyond what a phase states.
- No change to public read-port shapes except the one additive field in Phase 2.

## Non-goals

Pagination (WO-MD-SCALE-01), StudioFlow/BQ cross-row constraints and non-Master-Data FK indexes (WO-SCHEMA-HARDEN-01), the sample-request screens, the workbook UI, and any screen layout, bulk table UI, or UI Engine field behavior (the Lead builds those after this program).

## Regression Risks

- Lowercasing unit codes touches unit lookups in tests and in BQ/StudioFlow text; run the whole suite after the migration and report any code that compared case-sensitively.
- The Phase 2 rule applies to every price path including the workbook and sample sync; a missed path would reopen the gap. List every code path that writes `PriceMaterial` and show each is covered.
- Phase 4 changes what gets stored on edit of existing records: an update must not fail or flag a "change" just because the stored name is not normalized; compare normalized input to normalized stored value, or normalize only fields the user actually changed.

## Verification

Per phase: `npm test`, `npm run check`, `npm run lint`, `git diff --cached --check`, migrations applied to both rebuild databases with pre-check output, and the Review Card complete. At the end, one final summary with the four commits, the full test count, and anything deferred.

## Reviewer Acceptance

After each phase the Lead reads the Review Card, reruns its three commands, spot-checks code, and records PASS or one consolidated correction. Browser acceptance (the supplier-first pricing form, the shortcut, bulk table) happens after the Lead builds the UI on top of this backend.

## Executor Prompt

You are the BACKEND EXECUTOR for this checkout (D:\Misc\ProjectsHUB\studioflowrb, office computer, `STUDIOFLOW_LOCATION=kantor`). Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and the root `PLAN.md` (WO-MD-PROGRAM-01). Implement all four phases in order, one local commit per phase, each with the migrations and pre-checks, tests, changelog entry, and Review Card the plan requires. Keep the backlog current (remove or update entries you complete, with the revision recorded in the changelog). Use only the rebuild databases after verifying the target; never the legacy database. Do not run `npm run build` (or restore `next-env.d.ts` before staging). Stop with a `BLOCKED / CONFLICT` report if a locked decision cannot be met. Finish with one Planner/Reviewer prompt: outcome per phase, commit hashes, checks, rows migrated, limitations, dirty files.
