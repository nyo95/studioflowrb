# 09 — Rebuild Execution Plan

Status: ACTIVE DIRECTION
Updated: 2026-08-28

This plan replaces dated “Master Data execution next” work-order sequencing. Completed work-order records remain historical evidence in Git.

## Gate A — Documentation and boundary lock

- Keep `docs/README.md`, 00–07, the three app dossiers, rule audit, and migration playbook mutually consistent.
- Treat `CORE.md`, `DESIGN.md`, and `UI_ENGINE.md` as the implemented shared baseline.
- Do not start product implementation from a contradicted rule.

Exit: documentation links/checks pass and every known contradiction has an owner or explicit gap.

## Gate B — Master Data pricing correction

Status: COMPLETED 2026-08-28 (same date as plan; see `docs/08-CURRENT-STATUS.md` for evidence).

1. ~~Write regression tests for multiple supplier prices, null-supplier pair uniqueness, unit readiness, audit, workbook round-trip, and `prices[]` public DTO.~~ Done: pure tests (`pricing-service`, `masterdata-public`, `import-export`, `sku-rules`, `sku-service`, `xlsx-roundtrip`) plus disposable-PostgreSQL tests (`schema-contract` pair uniqueness/indexes, `workbook-applier` full-pair round-trip).
2. ~~Design and rehearse the Prisma migration from singular pricing to pair pricing without inventing supplier provenance.~~ Done: `20260828000000_master_data_sku_pair_pricing` drops `SkuPrice_sku_id_key` and adds partial unique indexes `SkuPrice_pair_supplier_uniq` and `SkuPrice_pair_nosupplier_uniq`; existing rows (including NULL suppliers) migrate unchanged; applied and verified on a clean disposable database.
3. ~~Update domain/application/infrastructure/public/UI in one bounded vertical correction.~~ Done: pair-aware pricing service/repositories, SKU relation state, workbook validation/applier/export, pricing list + form UI, and the `prices[]` public DTO.
4. ~~Run pure and disposable-PostgreSQL suites, boundary checks, build, and pricing UI checks.~~ Done: 240/240 tests with the disposable database, 188 pass / 52 fail-closed cancellations without it; `npm run check` and `npm run build` pass; targeted pricing UI verified against the disposable database.
5. ~~Reconcile any existing price rows and produce a migration exception report.~~ Done: because the previous schema enforced one row per SKU, no pair conflicts can exist in migrated data; the migration changes indexes only, keeps every row's supplier exactly as stored (NULL stays NULL, no supplier invented), and therefore produces zero rejected rows by construction.

Exit: Master Data exposes all eligible current supplier options and no singular-price assumption remains in active code/tests/docs. (Verified 2026-08-28.)

## Gate C — Test isolation and production identity

- Split pure `npm test` from fail-closed disposable PostgreSQL integration tests.
- Document required test environment and teardown.
- Resolve the production principal/user/grant model and enforce it at application boundaries.

These can be designed alongside Gate B, but production authorization cannot be claimed before completion.

## Gate D — BQ vertical migration

Recommended order:

1. pure calculation and post-order section rollup contract;
2. BQ project + two-level grouping + Works schema/use cases;
3. material/service snapshot lines with explicit supplier selection;
4. worksheet UI, quick-add/context actions, keyboard and lock behavior;
5. project-local lines and manual override;
6. recipe library using references/coefficients without stored prices;
7. legacy data rehearsal and parity report.

No refresh/drift-replacement feature is in scope.

## Gate E — StudioFlow vertical migration

Recommended order:

1. identity/RBAC prerequisite and Client/Project foundation;
2. Phase transition engine and review/revision evidence;
3. deliverables/files/comments;
4. activities/tasks/checklists and saved filters;
5. Master Data-backed catalog/schedule snapshots;
6. owner-selected extensions: MOM, SketchUp, Render Board, supervision tooling;
7. operational data/file rehearsal and cutover.

Each capability follows `16-LEGACY-MIGRATION-PLAYBOOK.md` and ends in a runnable product slice.

## Ongoing Core/UI Engine rule

Core/UI Engine are extended only when a concrete product slice proves a reusable gap. App-specific business logic is not preemptively centralized. Shared additions require a second real consumer or an explicit platform-level requirement, boundary tests, and showcase/documentation where visual.

## Release gates

Every releasable slice states:

- product contract and classification;
- schema/data migration impact;
- server-side permissions and audit;
- pure and integration test evidence;
- dependency/build result;
- critical browser/accessibility result;
- rollback/cutover considerations;
- remaining open decisions.
