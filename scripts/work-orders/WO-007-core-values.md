# WO-007 — Decimal, Money, Unit, and Date Utilities

Owner: PM/TL
Executor type: deterministic coding executor
Status: COMPLETE — PM/TL approved; implementation `53b9ea6` plus convergence correction `10d3881`

Mandatory shared context: `scripts/work-orders/00-EXTERNAL-EXECUTOR-CONTEXT.md`

Rebuild context: implement only the locked representation/formatting contract; legacy date and numeric helpers containing app policy are negative evidence and must not be migrated.

## Scope

Implement representation, parsing/normalization, comparison, and display helpers locked in `CORE.md` §§8–10. Do not implement domain arithmetic or conversion policy.

## Source evidence

- current `src/platform/contracts/index.ts`
- current `src/platform/utilities/money/**`, `unit/**`, and `date/**`
- `../studioflow/src/subapps/master-data/lib/slug.ts` only as a quality example for pure utility tests
- `../studioflow/src/lib/date-utils.ts` as negative evidence for app policy in shared utilities

## Target files

- `src/platform/contracts/index.ts`
- `src/platform/utilities/decimal/**`
- `src/platform/utilities/money/**`
- `src/platform/utilities/unit/**`
- `src/platform/utilities/date/**`
- focused tests

## Exact allowed changes

1. Add a validated/branded canonical decimal-string type and pure normalizer/comparator.
2. Reject empty, NaN, infinity, locale separators, and malformed decimal input; normalize sign, leading zeros, and trailing fractional zeros without scientific notation.
3. Define Money with canonical decimal amount and explicit uppercase ISO-style three-letter currency validation.
4. Format money using explicit/default currency and locale without changing stored values or defining calculation rounding.
5. Provide unit code/label formatting only; no registry or conversion.
6. Validate/format ISO instants and date-only strings separately.
7. Default display to `id-ID` / `Asia/Jakarta` while accepting explicit overrides.

## Forbidden changes

- No BQ calculation edit or number-to-decimal migration.
- No price/tax/markup/allocation/rounding rule.
- No currency conversion.
- No unit conversion or Master Data dictionary.
- No holidays, workdays, project scheduling, or validity policy.
- No Prisma import in isomorphic utility modules.

## Acceptance criteria

- Tests cover canonical decimal normalization/comparison, invalid values, very large values, negative/zero/fraction values, explicit currency, IDR display, timezone-boundary display, date-only stability, and unit formatting.
- Existing BQ files are untouched.
- Tests, typecheck, boundary checks, and build pass.

## Stop conditions

- Correct formatting would require converting arbitrary decimal strings to unsafe JavaScript numbers; stop and report rather than introduce precision loss.
