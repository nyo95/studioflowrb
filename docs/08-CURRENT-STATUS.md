# 08 — Current Rebuild Status

Status date: 2026-08-28 (updated after Gate B pricing correction)
Repository head at audit start: `7472377`
Branch for documentation consolidation: `codex/documentation-consolidation`

## Executive state

The rebuild is the future implementation home. The current StudioFlow project is read-only reference evidence.

| Area | State | Honest interpretation |
|---|---|---|
| Platform Core | IMPLEMENTED / CHECKED | Strong reusable foundation. No broad rewrite is justified. Extend only for proven cross-app technical needs. |
| UI Engine | IMPLEMENTED / CHECKED (Tailwind conversion 2026-08-28) | Tokens, primitives, reusable components/patterns/layouts and showcase exist. Styling now follows the §5 baseline: Tailwind 4 utilities with `tokens/tokens.css` as the single token source via an `@theme inline` bridge; Radix unchanged; engine.css removed; all app pages consume engine components (RA-13 resolved). |
| Master Data | IMPLEMENTED (pricing contract converged 2026-08-28) | Pair pricing per SKU × supplier is now schema-enforced, applied across services, workbook, UI, and the public `prices[]` DTO. Remaining open items: production identity, Samples slice. |
| BQ | CONTRACTED / NOT IMPLEMENTED | Rebuild app folders are shells. Final workflow, snapshot, calculation, hierarchy, and UI contracts are documented. Gate D may start against the converged Master Data contract. |
| StudioFlow | CONTRACTED / NOT IMPLEMENTED | Rebuild app folders are shells. Reference capabilities are inventoried at product level; migration must proceed by vertical slice. |
| Production identity/RBAC persistence | OPEN | Current temporary adapter is not a production identity solution. |
| Legacy runtime coupling | CHECKED ABSENT | Rebuild is independent; the reference remains read-only evidence. |

## Verification observed after Gate B and the UI Engine Tailwind conversion (2026-08-28)

- `npm test` pure-only (no integration DB): 188 passed, 52 canceled — integration tests fail closed without the disposable database.
- `npm test` with `DATABASE_URL` = `MASTERDATA_TEST_DATABASE_URL` pointing at a disposable PostgreSQL 15 database (Docker container, created and discarded for this verification): 240 passed, 0 failed, 0 canceled.
- `npx prisma validate`, `npx prisma generate`, `npx prisma migrate deploy` on a clean disposable database: both migrations apply; `migrate status` clean.
- `npm run check` (typecheck, boundary checks, legacy-runtime checks): passed.
- `npm run build` (production): passed; compiled CSS confirmed to emit token-referencing utilities (`bg-surface` → `var(--ui-surface)` etc.) and the `@keyframes` set.
- Targeted UI verification (server against the disposable database): SKU pricing lists one row per supplier pair (named supplier, "No supplier", amounts, per-pair Update/Clear); the price form lists every current pair and preselects the pair being edited; skus/units/audit/home/`/ui-engine` showcase all render 200 with engine utility classes and zero legacy `ui-*` classes in markup.

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
