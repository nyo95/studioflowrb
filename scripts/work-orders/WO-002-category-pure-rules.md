# WO-002 — Category Pure Rules

Owner: PM/TL
Executor type: deterministic coding executor
Status: COMPLETE — PM/TL approved; implementation commit `d72b72a`

Mandatory shared context: `scripts/work-orders/00-EXTERNAL-EXECUTOR-CONTEXT.md`

Rebuild context: extract only the proven legacy pure helpers classified `REWRITE`; the rebuild architecture and locked flat-PRODUCT decision are authoritative. Do not port the legacy Category service or hierarchy model.

## Scope

Finish the interrupted pure Category helper extraction using the locked flat PRODUCT / hierarchical WORK decision.

## Source files

- `../studioflow/src/subapps/master-data/services/category-tree-rules.ts`
- `../studioflow/src/subapps/master-data/lib/slug.ts`
- `../studioflow/src/subapps/master-data/lib/slug.test.ts`
- Category-only portions of `../studioflow/src/subapps/master-data/services/sku-price.test.ts`
- `src/platform/utilities/slug/index.ts`

## Target files

- `src/platform/utilities/slug/index.ts`
- `src/apps/masterdata/domain/category-rules.ts`
- focused tests colocated with, or in the approved test mirror for, those two modules
- `package.json` test script only if WO-001 has not already established one

## Exact allowed changes

1. Make the platform slug utility implement the proven canonical behavior: NFKD normalization, combining-mark removal, lowercase, trim, non-alphanumeric runs to one hyphen, and edge-hyphen removal.
2. Export `categorySlug` as the same function reference as the platform slug utility.
3. Implement only:
   - `categorySlug`
   - `buildCategoryPath`
   - `splitCategoryInput`
4. Migrate and split only tests for those helpers and the canonical slug behavior.
5. Update imports only where required by the migrated focused tests.

## Forbidden changes

- Do not add `PRODUCT_LEVEL1`, `PRODUCT_PARENT_BY_LEAF`, `productParentFor`, or `dropAncestorTags`.
- Do not migrate `WORK_LEVEL1`; controlled dictionary contents are data/product decisions, not pure infrastructure.
- Do not implement category persistence, CRUD, auto-creation, re-parenting, or path propagation.
- Do not touch Prisma schema.
- Do not migrate pricing or Party-role tests.
- Do not add fallback behavior or extra parsing formats.

## Acceptance criteria

- Focused tests cover accents, whitespace, punctuation, idempotence, empty input, path construction, same-name parent/child path construction, and `>`/`/` input splitting.
- No retired PRODUCT hierarchy symbol exists in the rebuild.
- Category domain code has no Prisma, React, Next.js, or `server-only` import.
- `npm test`, `npm run typecheck`, and `npm run check:boundaries` succeed.

## Stop conditions

- Existing rebuild code depends on the current non-NFKD slug output in persisted data or an approved external contract.
- Test-runner choice is still unresolved after WO-001.
- Actual source behavior conflicts with the exact allowed functions above.
