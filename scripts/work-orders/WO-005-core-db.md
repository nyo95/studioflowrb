# WO-005 — Core DB / Prisma Runtime

Owner: PM/TL
Executor type: deterministic coding executor
Status: READY FOR EXTERNAL EXECUTOR — WO-003/WO-003A passed PM/TL review

Mandatory shared context: `scripts/work-orders/00-EXTERNAL-EXECUTOR-CONTEXT.md`

Rebuild context: rewrite only the proven Prisma adapter/pool/singleton lessons against `CORE.md`; legacy schema sentinels, preflight tables, and app-specific DB behavior are intentionally purged.

## Scope

Implement only the Prisma 7 client, PostgreSQL adapter/pool, transaction client type, and stable public DB surface locked in `CORE.md` §2.

## Source evidence

- `../studioflow/src/core/platform/db.ts`
- `../studioflow/prisma.config.ts`
- current `prisma/schema.prisma`

## Target files

- `src/platform/core/db/**`
- `.env.example` for non-secret pool settings only
- focused DB construction/type tests that do not require a live database

## Exact allowed changes

1. Construct the generated Prisma client only in Core DB.
2. Use `@prisma/adapter-pg` and one `pg.Pool`.
3. Cache the client/pool safely across development hot reload; do not cache duplicate instances in production.
4. Support explicit non-secret pool limit/timeouts from environment with conservative documented defaults.
   - Any helper that reads pool settings accepts a narrow readonly environment shape containing only optional `DATABASE_URL`, `DB_POOL_MAX`, `DB_POOL_IDLE_TIMEOUT_MS`, and `DB_POOL_CONNECTION_TIMEOUT_MS` string fields. Do not type this helper as the full augmented `NodeJS.ProcessEnv`; it does not depend on `NODE_ENV`.
5. Export the shared client, transaction-client type, and an explicit close helper for short-lived scripts/tests.
6. Keep the module server-only.

## Forbidden changes

- No schema model/enum/migration changes.
- No delegate sentinel/version signature.
- No hardcoded table/column preflight.
- No repository abstraction, query helper, app adapter, or seed logic.
- No import from any app.

## Acceptance criteria

- Only Core DB constructs `PrismaClient`, `PrismaPg`, or `Pool` in production source.
- Importing the module does not connect until Prisma performs work.
- Type tests prove transaction clients are accepted without unsafe app-local aliases.
- Unit tests, typecheck, boundary checks, Prisma generate/validate, and build pass.

## Stop conditions

- WO-001 has not produced the declared generated-client output or adapter dependencies.
- Prisma/adapter runtime behavior differs from the locked convention.
