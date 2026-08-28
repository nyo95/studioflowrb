# 08 — Current Rebuild Status

Status date: 2026-08-28
Repository head at audit start: `7472377`
Branch for documentation consolidation: `codex/documentation-consolidation`

## Executive state

The rebuild is the future implementation home. The current StudioFlow project is read-only reference evidence.

| Area | State | Honest interpretation |
|---|---|---|
| Platform Core | IMPLEMENTED / CHECKED | Strong reusable foundation. No broad rewrite is justified. Extend only for proven cross-app technical needs. |
| UI Engine | IMPLEMENTED / CHECKED | Tokens, primitives, reusable components/patterns/layouts and showcase exist. Apps should compose it instead of forking it. |
| Master Data | IMPLEMENTED WITH BLOCKING CONTRACT GAP | Broad domain/application/infrastructure/UI/public work exists. Singular SKU pricing conflicts with final multi-supplier product law. |
| BQ | CONTRACTED / NOT IMPLEMENTED | Rebuild app folders are shells. Final workflow, snapshot, calculation, hierarchy, and UI contracts are documented. |
| StudioFlow | CONTRACTED / NOT IMPLEMENTED | Rebuild app folders are shells. Reference capabilities are inventoried at product level; migration must proceed by vertical slice. |
| Production identity/RBAC persistence | OPEN | Current temporary adapter is not a production identity solution. |
| Legacy runtime coupling | CHECKED ABSENT | Rebuild is independent; the reference remains read-only evidence. |

## Verification observed during this audit

- `npm run check`: passed after documentation consolidation.
- `npm run build`: passed after documentation consolidation.
- `npm test` without the dedicated integration database: 185 passed, 49 canceled, exit code 1; the runner correctly reports that `DATABASE_URL` and `MASTERDATA_TEST_DATABASE_URL` must target the same disposable PostgreSQL database.

The last result does not prove product failure; it proves the test command/environment contract is incomplete for a fresh checkout. PostgreSQL/Prisma tests need an explicit disposable database runner and separate reporting from pure tests. See RA-04.

## Blocking corrections before BQ

1. Replace singular `SkuPrice.sku_id` uniqueness with race-safe SKU × supplier-pair uniqueness.
2. Change Master Data pricing service/repositories/UI/import from one price per SKU to current price per pair.
3. Change public material DTO from `price` to eligible `prices[]`.
4. Add integration and contract tests for multiple suppliers and null-supplier uniqueness.
5. Keep BQ snapshots immutable; do not implement refresh/drift replacement.

## Documentation authority

Normative current truth is the reading order in `README.md`. Historical handovers, work orders, and root `MASTER_DATA.md` remain evidence of how the present implementation was produced; they do not override the corrected pricing and snapshot contracts.

## Open owner decisions

1. Rebuild coding/executor governance, because current governance sources conflict.
2. Production identity, user lifecycle, and persisted grants.
3. StudioFlow MVP cutoff among Schedule, MOM, SketchUp, and Render Board extensions.
4. Production data/file migration and cutover plan.
