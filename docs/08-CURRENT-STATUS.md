# 08 — Current Rebuild Status

Status date: 2026-08-28 (updated after Gate B pricing correction)
Repository head at audit start: `7472377`
Branch for documentation consolidation: `codex/documentation-consolidation`

## Executive state

The rebuild is the future implementation home. The current StudioFlow project is read-only reference evidence.

| Area | State | Honest interpretation |
|---|---|---|
| Platform Core | IMPLEMENTED / CHECKED | Strong reusable foundation. No broad rewrite is justified. Extend only for proven cross-app technical needs. |
| UI Engine | IMPLEMENTED / CHECKED | Tokens, primitives, reusable components/patterns/layouts and showcase exist. Apps should compose it instead of forking it. |
| Master Data | IMPLEMENTED (pricing contract converged 2026-08-28) | Pair pricing per SKU × supplier is now schema-enforced, applied across services, workbook, UI, and the public `prices[]` DTO. Remaining open items: production identity, Samples slice. |
| BQ | CONTRACTED / NOT IMPLEMENTED | Rebuild app folders are shells. Final workflow, snapshot, calculation, hierarchy, and UI contracts are documented. Gate D may start against the converged Master Data contract. |
| StudioFlow | CONTRACTED / NOT IMPLEMENTED | Rebuild app folders are shells. Reference capabilities are inventoried at product level; migration must proceed by vertical slice. |
| Production identity/RBAC persistence | OPEN | Current temporary adapter is not a production identity solution. |
| Legacy runtime coupling | CHECKED ABSENT | Rebuild is independent; the reference remains read-only evidence. |

## Verification observed after Gate B (2026-08-28)

- `npm test` pure-only (no integration DB): 188 passed, 52 canceled — integration tests fail closed without the disposable database.
- `npm test` with `DATABASE_URL` = `MASTERDATA_TEST_DATABASE_URL` pointing at a disposable PostgreSQL 15 database (Docker container, created and discarded for this verification): 240 tests, 238 passed before final index-assertion and workbook-validator fixes; final rerun 240 passed, 0 failed, 0 canceled.
- `npx prisma validate`, `npx prisma generate`, `npx prisma migrate deploy` on a clean disposable database: both migrations apply; `migrate status` clean.
- `npm run check` (typecheck, boundary checks, legacy-runtime checks): passed.
- `npm run build` (production): passed.
- Targeted UI verification (dev server against the disposable database): SKU pricing lists one row per supplier pair (named supplier, "No supplier", amounts, per-pair Update/Clear); the price form lists every current pair, preselects the pair being edited, and explains that a different supplier adds a separate price.

The last result does not prove product failure; it proves the test command/environment contract is incomplete for a fresh checkout. PostgreSQL/Prisma tests need an explicit disposable database runner and separate reporting from pure tests. See RA-04.

## Blocking corrections before BQ

1. ~~Replace singular `SkuPrice.sku_id` uniqueness with race-safe SKU × supplier-pair uniqueness.~~ DONE 2026-08-28 (migration `20260828000000_master_data_sku_pair_pricing`).
2. ~~Change Master Data pricing service/repositories/UI/import from one price per SKU to current price per pair.~~ DONE 2026-08-28.
3. ~~Change public material DTO from `price` to eligible `prices[]`.~~ DONE 2026-08-28.
4. ~~Add integration and contract tests for multiple suppliers and null-supplier uniqueness.~~ DONE 2026-08-28.
5. Keep BQ snapshots immutable; do not implement refresh/drift replacement. Still applies to Gate D.

## Documentation authority

Normative current truth is the reading order in `README.md`. Historical handovers, work orders, and root `MASTER_DATA.md` remain evidence of how the present implementation was produced; they do not override the corrected pricing and snapshot contracts.

## Open owner decisions

1. Rebuild coding/executor governance, because current governance sources conflict.
2. Production identity, user lifecycle, and persisted grants.
3. StudioFlow MVP cutoff among Schedule, MOM, SketchUp, and Render Board extensions.
4. Production data/file migration and cutover plan.
