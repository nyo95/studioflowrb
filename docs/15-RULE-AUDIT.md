# 15 — Rule and Implementation Audit

Status: ACTIVE
Audit date: 2026-08-28 (RA-01 disposition updated 2026-08-28 after Gate B)
Scope: documentation, schema, implementation claims, and reference behavior. No product code was changed by this audit beyond the explicitly recorded dispositions below.

## Method

Every finding below cites observable repository evidence or an explicit owner decision. “Implemented” is not treated as “approved product truth”. Where evidence is insufficient, the result is `OPEN`, not an invented rule.

## Findings

| ID | Severity | Status | Finding | Evidence | Required disposition |
|---|---|---|---|---|---|
| RA-01 | P0 | RESOLVED 2026-08-28 | Rebuild enforces one global SkuPrice per SKU, while final product law is one current price per SKU × supplier. | Original evidence retained. Resolution: migration `20260828000000_master_data_sku_pair_pricing` replaces `SkuPrice_sku_id_key` with partial unique indexes `SkuPrice_pair_supplier_uniq` + `SkuPrice_pair_nosupplier_uniq`; schema `Sku.prices SkuPrice[]`; pricing service upserts per pair in place; workbook validates/applies per pair; public DTO returns `prices[]`; pure + disposable-PostgreSQL suites pass (240/240). | Done. Regression tests cover multiple suppliers per SKU, pair uniqueness (incl. NULL supplier), update-in-place, unit readiness, audit-in-transaction, workbook round-trip, and `prices[]`. Existing NULL-supplier rows were not given invented suppliers. |
| RA-02 | P0 | CONFLICTED | Some rebuild docs permit explicit snapshot refresh/re-resolve; final BQ law prohibits refresh of an existing snapshot. | `06-DATA-OWNERSHIP.md`, `08-CURRENT-STATUS.md`, and historical `MASTER_DATA.md` wording versus final `PRD-BQ.md`. | Existing BQ snapshots are immutable. New source acquisition/reselection creates a new explicit snapshot; no refresh-all/selected/drift replacement. |
| RA-03 | P1 | MISLEADING | SSOT was marked DRAFT while other governance files treated it as authoritative. | `00-SOFTWARE-SSOT.md` status versus `AGENTS.md`/`08-CURRENT-STATUS.md`. | Mark active under the owner's rebuild decision and keep approval/status explicit. |
| RA-04 | P1 | UNVERIFIED CLAIM | Current-status document says the complete 234-test suite passes, but a clean clone without the dedicated DB cancels integration tests and exits non-zero. | `08-CURRENT-STATUS.md`; local clean-clone run: 185 passed, 49 canceled, exit 1. `.env.example` does not define the dedicated test DB setting. | Separate pure `npm test` from disposable PostgreSQL integration tests; document/env-wire a fail-closed test DB runner. Until then, state results with environment prerequisites. |
| RA-05 | P1 | OPEN GOVERNANCE | Rebuild governance says external OpenCode executes deterministic work; current reference project governance assigns coding to Codex. | Rebuild `AGENTS.md`/`09-EXECUTION-PLAN.md` versus current owner-authored reference `AGENTS.md`. | Do not silently choose. The owner must set one rebuild execution policy; product documentation remains valid either way. |
| RA-06 | P1 | STALE | Execution plan/status describe Master Data as next/active while current rebuild code contains MD-01–MD-09 implementation. | `09-EXECUTION-PLAN.md` versus repository tree/current commit. | Treat old work-order history as history. Maintain a short current-state matrix and a forward migration plan. |
| RA-07 | P1 | RESOLVED 2026-08-28 | `MASTER_DATA.md` presents singular pricing as a locked product contract even though it is now a known incorrect implementation baseline. | Numerous singular-cardinality statements in `MASTER_DATA.md`; RA-01 evidence. | Done: the file carries a prominent "pricing sections superseded 2026-08-28" banner; `03-MASTERDATA-PRD.md` and `apps/masterdata.md` govern new work. |
| RA-08 | P2 | INEFFICIENT | Large repeated governance/status narratives make current truth harder to locate and allow dated claims to look normative. | `08`, `09`, handovers, work orders, and root contracts overlap. | Keep normative rules in 00–07/app dossiers; keep audits/status/history separately and dated. Do not duplicate rules in changelog prose. |
| RA-09 | P2 | RISK | Legacy migration rule named only one immutable GitHub commit and rejected the current local reference, but owner explicitly designated the current project as the read-only reference. | Historical `07-ENGINEERING-CONVENTIONS.md`; owner direction 2026-08-28. | Allow read-only use of the current reference checkout after recording commit and dirty state. Never import it at runtime or copy folders/source wholesale. |
| RA-10 | P2 | OPEN | Production identity, user lifecycle, and persisted grant ownership are deferred. | `08-CURRENT-STATUS.md` and implementation adapter. | Resolve before production authorization claims. Keep every application write fail-closed and server-enforced meanwhile. |
| RA-11 | P2 | IMPLEMENTATION GAP | BQ and StudioFlow rebuild folders are empty architecture shells. | `src/apps/bq` and `src/apps/studioflow`. | Migrate vertical capabilities using the playbook; do not declare app completion from folders/contracts alone. |
| RA-12 | P2 | CORRECT FOUNDATION | Platform Core/UI Engine boundaries and dependency direction are materially reusable and should be retained. | `src/platform`, boundary checks, root contracts, build/check results. | Add shared capability only after the centralization test; keep app policy local. No broad foundation rewrite is justified. |

## Corrected rule set

1. Centralize infrastructure and reusable interaction systems, not app business policy.
2. Master Data owns reusable commercial truth; SkuPrice is current per SKU × supplier.
3. BQ explicitly selects one supplier price and freezes it. Existing snapshots never refresh.
4. StudioFlow owns project delivery and project snapshots; it never silently promotes into Master Data.
5. UI Engine owns tokens, primitives, reusable components/patterns/layouts, accessibility, and interaction mechanics. Apps own screen composition and vocabulary.
6. Tests must distinguish pure suites from PostgreSQL/Prisma semantics and must fail closed against a disposable test database.
7. Legacy evidence is read-only; migrate contracts and regression behavior, not file structure or text.

## Claims intentionally not made

- No final production identity provider or grant mapping is inferred.
- No final StudioFlow MVP extension cutoff is inferred.
- No guarantee is made that all legacy data can migrate without a rehearsal report.
- No source file was declared reusable merely because it exists.
