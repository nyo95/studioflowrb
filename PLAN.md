# Active Plan

Plan ID: WO-MD-HARDEN-01
Scope: Master Data backend hardening — fix the verified defects and missing guards from the audit `docs/audits/MASTERDATA-RELATIONAL-LOGIC-AUDIT-2026-10.md` that are backend-only and independent of the Brand → Supplier → Price rule. No new product behavior.
Target revision: R8.266
Status: READY
Priority: P1
Owner: owner (Product Owner). Lead review of WO-MD-AUDIT-01 (R8.264): **PASS** on 2026-10-01. Five findings spot-checked against code and confirmed: MD-AUD-001 (`vendors/actions.ts` swallows a JSON parse error and the vendor service then deletes the contacts missing from the list), 003 (`deactivateCategory` checks only its own status), 004 (`archiveVendorType` has no capability guard), 005 (`updateUnit` and the other root updates do not reject an archived root), 013 (`savePriceAction` routes any unknown kind to the labor branch).
Last updated: 2026-10-01

## Outcome

The Master Data write paths stop losing data, stop leaving active records pointing at hidden or archived parents, and the database itself rejects the bad scalar and lifecycle values the service already forbids. After this plan each fixed finding has a regression test that fails on the old code.

## Context and Evidence

- Source of truth: the audit report and its `[BUG]`/`[CLEANUP]` entries in `docs/BACKLOG.md` (MD-AUD-001 … 014). Read the finding rows for evidence and file:line before changing anything; re-confirm each one against current code first and report any that no longer reproduce.
- Office rebuild data holds none of the audited violations, so migrations in this plan must still carry a pre-check (below) because other machines may differ.
- Postgres is 15.x, so `UNIQUE NULLS NOT DISTINCT` is available.
- R8.262 added `VendorCategory` and the shared helpers `ensureVendorCategory` and `assertVendorCategoryRemovalSafe` in `services/shared.ts`; the Category guard below must include `VendorCategory`.

## Locked Decisions

1. **Category deactivation is blocked while active data uses it** (owner-agnostic default accepted by the Lead). The user must merge the category into another one first. No automatic cascade or reassign. Active data = a non-archived SKU with the category, a non-archived Brand with it, a non-archived Supplier with it (`VendorCategory`), or a live work price filed under it. Error code `CATEGORY_IN_USE`, message names the counts and says to merge first.
2. **Vendor Type archive runs the same capability guard as a type change.** For every supplier that holds the type, compute its remaining live types without this one and run `assertVendorTypeRemovalSafe`; block the archive on the first failure with the existing capability error codes, naming the supplier.
3. **Child audit events are restored.** Workbook apply and sample-request sync write one audit event per SKU/price changed (with the batch id or flow in metadata) plus the existing single batch event. `suppressAudit` is removed from the public service surface; any internal bypass must not be callable from actions or other apps.
4. **A request that contains a malformed or missing structured payload never changes stored data.** The Supplier contacts field is the case in point: an absent field means "do not touch contacts", an explicit empty list means "remove all", malformed JSON is a validation error. Sweep every Master Data action for the same silent-catch pattern and apply the same rule.
5. **Polymorphic type strings come from one canonical registry** (deletion targets and archive-cause entity types). The service allow-list, the migration CHECK, and a test that reads the live constraint definition and compares it to the registry all use that one list, so they cannot drift again.
6. **Archived or inactive roots are immutable through their services**: Unit, Category, Vendor Type, Brand, Supplier updates reject an archived/inactive record with a CONFLICT error (`<ENTITY>_ARCHIVED` / `_INACTIVE`), as SKU and price updates already do. The UI hiding the button is not the boundary.

## Business Rules and Architecture Constraints

- Capability labels: REUSE the existing `shared.ts` guards, `writeAudit`, `mapWriteError`, and the `AppError` codes; EXTEND `shared.ts` only where a guard is shared by two services; ADD one registry module for the polymorphic type lists. Master Data policy stays app-owned.
- Every migration is additive-safe: it starts with a `DO $$` pre-check that counts violating rows and raises an exception with the table, rule, and count if any exist, so nothing is rewritten silently. No data is changed or deleted by these migrations except dropping redundant duplicate indexes.
- Do not change public read-port shapes or any behavior StudioFlow and BQ rely on.
- Never touch the legacy database. Migrations are applied to the office development and the disposable test databases only, after verifying the target is `studioflow_rebuild` / `studioflow_rebuild_test` on `localhost`.

## Backend Contract

Deliver, in this order of priority:

1. **MD-AUD-001 (P0).** Per Locked Decision 4. Regression tests: malformed JSON leaves existing contacts untouched and returns a validation error; field absent leaves contacts untouched; explicit `[]` removes them.
2. **MD-AUD-003 (P1).** Per Locked Decision 1, with tests for each of the four user families, for the allowed case (unused category), and for "merge then deactivate succeeds".
3. **MD-AUD-004 (P1).** Per Locked Decision 2, with tests for a blocked archive (live prices or brand-supplier links depend on the capability) and an allowed one.
4. **MD-AUD-005 (P2).** Per Locked Decision 6, with a direct service test per root.
5. **MD-AUD-006 (P2).** When a sample-request quote carries `priceMaterialId`, read that one price and require its `sku_id` and `supplier_vendor_id` to match the chosen SKU and supplier, in `start`, `recordQuote` and `markPriced`. Negative-combination tests.
6. **MD-AUD-007 (P2).** Per Locked Decision 3, with a test that queries audit events by entity id for a workbook-created SKU and price and for a synced sample price.
7. **MD-AUD-010 (P2).** One migration: CHECK `amount >= 0` and currency `^[A-Z]{3}$` on the three price tables; CHECK allow-list on `DeletionRequest.target_type` and `ArchiveCause.entity_type`; CHECK on the `ArchiveCause` kind/parent shape (DIRECT has no parent, PARENT has one); make the `ArchiveCause` uniqueness real for DIRECT rows (partial unique indexes or `NULLS NOT DISTINCT`, Executor's choice, with `shared.ts` still idempotent). Registry per Locked Decision 5.
8. **MD-AUD-009, Master Data only (P2).** Add leading indexes for the six Master Data FK columns the audit lists. BQ and StudioFlow indexes are out of scope.
9. **MD-AUD-011 (P2).** Workbook preview uses the same domain validators as apply in a dry-validation mode (units, dimensions parsing, supplier capability), so "ready" means apply will not fail on those rules. The brand-supplier rule joins later in WO-MD-CHAIN-01.
10. **MD-AUD-013 (P2).** `savePriceAction` and every other pricing action parse `kind` with the shared `PriceKind` parser before routing; unknown values return a validation error. Test.
11. **MD-AUD-014 (P3).** In a separate migration, drop exactly one of each identical duplicate index pair, keeping the one declared in the Prisma schema where there is one. Show the `pg_index` comparison in the changelog entry.

Pre-checks for items 7, 8, 11 must run against the target database before the constraint or drop is created.

## UI Contract

None. Errors from the new guards use the existing server-action error surface (`safeMessage`). The Lead owns any follow-up copy or layout. Minimal wiring the Executor may add: none beyond making sure the new error codes reach the existing dialogs.

## Non-goals

- MD-AUD-002 and the supplier-first form (WO-MD-CHAIN-01); bulk entry; text normalization.
- MD-AUD-008 pagination (UI-bearing; planned as WO-MD-SCALE-01).
- MD-AUD-012 and the non-Master-Data parts of MD-AUD-009 (WO-SCHEMA-HARDEN-01, after each app's service logic is reviewed).
- Renaming or re-modelling any table; changing price, category, or supplier meaning.

## Regression Risks

- The Category guard must not block `mergeCategory` (merge moves links first, then deactivates the source in the same transaction; keep that order).
- Removing `suppressAudit` changes workbook and sample-sync audit volume; keep one transaction and keep the batch event.
- CHECK constraints can reject legacy rows on another machine; the pre-check must fail loudly with counts rather than the migration erroring obscurely.
- The registry must include every target/entity type currently written (including `vendor_category` handling if any, and no removed `supplier_category`).

## Verification

Executor finishes before the commit: `npm test` (all pass, new regression tests included and shown to fail against the old behavior in the report), `npm run check`, `npm run lint`, `git diff --check`. Apply the new migrations to the office development and test databases and record the pre-check result. List any finding that no longer reproduces and any that was deferred with the reason.

## Reviewer Acceptance

The Lead re-reads each fix against its finding, runs a deliberate bad-input pass in the browser for the contacts case and the Category and Vendor Type guards (messages readable), checks that the audit trail shows child events, and then closes the matching `[BUG]` entries or returns one consolidated correction.

## Executor Prompt

You are the BACKEND EXECUTOR for this checkout (D:\Misc\ProjectsHUB\studioflowrb, office computer, `STUDIOFLOW_LOCATION=kantor`). Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, the root `PLAN.md` (WO-MD-HARDEN-01), and the audit report it names. Implement the whole plan, including migrations with the specified pre-checks and one regression test per fixed finding. Verify, add the changelog entry, remove each fixed `[BUG]`/`[CLEANUP]` entry from `docs/BACKLOG.md` with the revision recorded in the changelog, and make one local commit `R8.266 | fix(masterdata): harden the audited write paths and constraints`. Use only the rebuild databases (verify the target first); never the legacy database. Stop with a `BLOCKED / CONFLICT` report if a locked decision cannot be met. Finish with a Planner/Reviewer prompt (outcome, commit, checks, limitations, dirty files).
