# Active Plan

Plan ID: WO-MD-AUDIT-01
Scope: Master Data — read-only audit of the whole relational schema and the Master Data logic, as the first step of a backend and hardening roadmap. NO code, schema, migration, or behavior change in this plan.
Target revision: R8.264
Status: READY
Priority: P1
Owner: owner (Product Owner). Lead plan written 2026-10-01 after R8.262 (supplier categories merged into categories).
Last updated: 2026-10-01

## Outcome

One written, evidence-backed audit that tells the Lead exactly what is wrong, risky, or missing in (a) the relational model of every schema and (b) the Master Data service and action logic, ranked by severity, with a recommended fix and a target work order for each finding. The Lead then turns the findings into the hardening work orders in the Roadmap below. Nothing is fixed in this plan.

Why now: Master Data just changed its relational shape (R8.262) and is about to take three more backend changes (a supplier-driven brand → supplier → price chain, bulk price entry, text normalization). Auditing first stops us building on a defect.

## Context and Evidence

- Schemas: `prisma/schema/` has four domains (`master_data` 21 models, `studioflow` 29, `bq` 16, `platform` 14). Boundary rules are in `AGENTS.md` (no cross-app foreign keys; consumers snapshot facts) and `docs/MODULE-BOUNDARIES.md`.
- Master Data services: `src/apps/masterdata/services/*.ts` (brand, category, deletion, pricing, sample-request, sku, sku-price-workbook, unit, vendor, vendor-contact, vendor-type, shared) plus `service.ts`, `public.ts`, and the server actions under `src/app/(platform)/masterdata/**/actions.ts` and `settings/general/masterdata/`.
- Contracts: `docs/apps/masterdata/` (`masterdata.md`, `brand-contract.md`, `vendor-contract.md`, `pricing-contract.md`).
- Known gaps already observed (verify, do not assume):
  - A material price does not require that the SKU's Brand is linked to the supplier (`BrandSupplier`); `PriceMaterial` only stores `sku_id` and `supplier_vendor_id`.
  - `DeletionRequest.target_type`, `ArchiveCause.entity_type` and audit entity ids are free strings, not relations.
  - Several create paths do check-then-insert; confirm each has a matching database unique constraint.
  - `listVendors` and similar list queries load wide nested selects with no pagination.
- Current office development data is small (13 brands, 15 suppliers, a handful of prices), so findings about volume are about design, not measured slowness.

## Locked Decisions

- This is an **audit only**. No edits to `src/`, `prisma/`, tests, or contracts. The only files written are the audit report and the backlog entries described below.
- Scope = all four schemas for the relational audit (so cross-app and platform boundary problems are caught), and **Master Data** for the logic audit. StudioFlow and BQ logic are out of scope except where they read Master Data through its public ports.
- Database access is **read-only** and only against the rebuild database. This checkout has `.env.kantor` only, so use `STUDIOFLOW_LOCATION=kantor`; before any query verify the target is `studioflow_rebuild` on `localhost`. Never touch the legacy database or any other target. Use read-only sessions (`SET default_transaction_read_only = on`). Never print secrets.
- Severity scale: **P0** data loss/corruption or a permission bypass; **P1** wrong business result or an integrity gap reachable from the UI; **P2** latent risk, missing guard or constraint, performance design; **P3** cleanup and drift.
- A finding needs evidence (file:line, query result, or a reproducing sequence). Hunches are listed separately as "to verify", not as findings.

## Business Rules and Architecture Constraints

Audit against these rules (they are the intended invariants):

1. Supplier is the pivot: Brand → Supplier → Price. A supplier carries brands (`BrandSupplier`), categories (`VendorCategory`), and types (`VendorVendorType`); prices belong to a supplier.
2. Soft-delete model: Master Data entities archive (`deleted_at` or a status) with `ArchiveCause` propagation; permanent deletion goes through `DeletionRequest` approval. Archive/restore must be symmetric and must not strand children.
3. Category is one shared list with `kind` PRODUCT or WORK; names are unique per kind among ACTIVE rows; merge keeps the same kind.
4. Money is `Decimal`, currency is a 3-letter code, units must be active and match the SKU's purchase or base unit for material prices.
5. Every write is permission-checked in the service (not only in the action), audited with an actor, and runs in one transaction.
6. Apps never write each other's tables or hold foreign keys into each other; consumers snapshot facts.

## Audit Method (what the Executor must cover)

**A. Relational schema (all four schemas).**
- Produce a relation map per schema: models, foreign keys, `onDelete` behavior, nullability, and which relations are string ids instead of foreign keys (and why).
- Check: missing foreign keys; `onDelete` choices that can strand or wrongly cascade rows; missing indexes on foreign keys and common filters; missing unique or partial-unique constraints that code assumes (compare against the service code and raw-SQL indexes in `prisma/migrations`); nullable columns that code treats as required; enum versus string drift; `Decimal` precision; `updated_at` and `created_at` consistency; soft-delete consistency (`deleted_at` versus `status`) across Master Data models.
- Check boundaries: any `platform → app` or `app → other-app` foreign key or implicit cross-app write; places that should snapshot but store a live reference.
- Run read-only data checks for orphaned string references, duplicate live names or slugs, rows that violate the invariants above, and prices whose supplier/brand/category/unit are inactive.

**B. Master Data logic.** For every public method of each Master Data service and action file, record: permission check present; validation; transaction boundary; race exposure (check-then-insert without a database constraint, read-modify-write without a lock); archive/restore/delete symmetry; audit event present with actor; error code mapping; and whether the client can pass ids it should not be trusted with. Specifically trace these flows end to end:
- Brand ↔ Supplier ↔ SKU ↔ Price (including the gap in "Known gaps").
- Category create, rename, deactivate, merge, permanent delete (now including `VendorCategory`).
- Vendor type capability guards versus existing prices.
- Archive cascade and restore of Vendor, Brand, SKU, and the three price kinds.
- Deletion request lifecycle and `hardDeleteMasterDataTarget`.
- Workbook import/export and the quick-create actions used by the pricing form.
- Sample-request intake and its public read port.
- Public read ports (`public.ts`) exposed to StudioFlow and BQ: stability, what they leak, what they assume.

**C. Test and constraint coverage.** For each invariant above, state whether a database constraint, a service check, and a test each exist. List invariants with none.

## Deliverables

1. `docs/audits/MASTERDATA-RELATIONAL-LOGIC-AUDIT-2026-10.md` containing: scope and method actually used; relation map summary; findings table (ID, severity, area, evidence, impact in plain words, recommended fix, proposed work order); "to verify" list; invariant coverage matrix; and an explicit statement of what was not audited.
2. `docs/BACKLOG.md`: each verified defect added as `[BUG]` and each cleanup as `[CLEANUP]` under the Master Data heading, referencing the finding ID. Do not remove or reword existing entries.
3. `CHANGELOG.md` entry for the revision. Docs only; no migration, no dependency.

## Verification

- `git diff --check` is clean; only the files above changed.
- Run `npm test` once at the start and once at the end and record the result in the report (baseline versus after). Any failure is reported, not fixed.
- Every finding cites evidence that a reader can re-run or open.

## Reviewer Acceptance

The Lead reviews the report for completeness against "Audit Method", spot-checks at least five findings against the code, and then issues the hardening work orders. No browser acceptance.

## Roadmap (not authorized by this plan; the Lead issues each as its own READY plan after reviewing the audit)

Sequence is deliberate: fix what the audit proves first, then build on a sound base.

1. **WO-MD-AUDIT-01 (this plan).** Audit.
2. **WO-MD-HARDEN-01.** Fix the audit's P0 and P1 findings and the cheap P2s: missing unique constraints and indexes, race conditions, missing guards and audit events, stranded-row risks. Data-safe migrations with a pre-check query for existing violations.
3. **WO-MD-CHAIN-01.** Enforce Brand → Supplier → Price: a material price is allowed only when its SKU's Brand is linked to the supplier (or the SKU has no Brand); a command that links a Brand to a Supplier from the pricing form; supplier-scoped reference lists (brands and SKUs a supplier can price); restore and archive paths re-check the chain. Lead builds the supplier-first form behavior.
4. **WO-MD-BULK-01.** Bulk price creation commands for labor-only, material + labor, and material with an existing SKU: one supplier and one category for many rows, one transaction, all-or-nothing, per-row error codes, a row cap, one audit event per price plus one batch event. Lead builds the table UI (name, unit, amount, notes; unit copies the previous row).
5. **WO-MD-TEXT-01.** Shared text normalization utility (first letter of each word uppercase, remaining letters untouched; lower-case for tags and hashtags; opt-outs for codes, emails, URLs, notes) in the platform utilities layer, applied on the server for Master Data names and by the importer. Lead builds the matching UI Engine field behavior. Existing data is not rewritten.
6. **WO-MD-WORKBOOK-01 and WO-SR-01.** Continue the already-approved workbook import/export and the incoming sample-request queue from `docs/BACKLOG.md`, after the owner's open decisions there are answered.

Each work order is committed as its own revision; the Lead records PASS, one consolidated correction pass, or a precise blocker.

## Executor Prompt

You are the BACKEND EXECUTOR for this checkout (D:\Misc\ProjectsHUB\studioflowrb, office computer, `STUDIOFLOW_LOCATION=kantor`). Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and the root `PLAN.md` (WO-MD-AUDIT-01). Perform the read-only audit exactly as scoped there: do not change code, schema, tests, or contracts; use only the rebuild database in read-only mode; write the audit report, the backlog entries, and the changelog entry; run `npm test` before and after and record the results; make one local commit with subject `R8.264 | docs(masterdata): audit relational schema and Master Data logic`. Stop with a `BLOCKED / CONFLICT` report if the database target is ambiguous. Finish with a Planner/Reviewer prompt (outcome, commit, checks, limitations, dirty files).
