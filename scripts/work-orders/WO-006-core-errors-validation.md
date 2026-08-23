# WO-006 — Shared Errors and Validation

Owner: PM/TL
Executor type: deterministic coding executor
Status: READY FOR EXTERNAL EXECUTOR — WO-005 implementation commit `4cbdf43` passed PM/TL review

Mandatory shared context: `scripts/work-orders/00-EXTERNAL-EXECUTOR-CONTEXT.md`

Rebuild context: merge/rewrite only cross-app-safe error and validation behavior. Legacy wrappers are evidence, not a framework to port wholesale.

## Scope

Implement the error taxonomy, safe transport mapping, Prisma known-error mapping, Zod issue mapping, and shared scalar schemas locked in `CORE.md` §§6–7.

## Source evidence

- `../studioflow/src/lib/error-types.ts`
- `../studioflow/src/lib/action-wrapper.ts`
- `../studioflow/src/lib/validations/index.ts`

## Target files

- `src/platform/core/errors/**`
- `src/platform/core/validation/**`
- focused tests

## Exact allowed changes

1. Implement `AppError`, canonical error kinds, safe serialization, and type guards.
2. Implement centralized known-Prisma-error mapping without app entity names.
3. Preserve framework redirect/not-found control-flow errors through a narrow adapter/helper.
4. Implement Zod-to-validation-issues mapping with `{ path: string[], message: string }[]`.
5. Add only shared UUID, ISO instant, and date-only scalar schemas. Decimal scalar work belongs to WO-007.
6. Reject unknown mutation keys by convention/tests.

## Forbidden changes

- No generic server-action/CRUD wrapper.
- No app validation schema or Prisma enum import.
- No raw unexpected message/cause serialization.
- No logging framework, toast/UI code, or HTTP framework redesign.
- No DB queries or schema changes.

## Acceptance criteria

- Tests cover every canonical error category, safe serialization, unknown error fallback, Prisma mappings, field paths, strict-object behavior, null/omitted distinction, UUID, instant, and date-only validation.
- No stack, raw Prisma message, constraint value, SQL, or cause crosses the safe result boundary.
- Tests, typecheck, boundary checks, and build pass.

## Stop conditions

- Framework control-flow errors cannot be detected without importing unstable internals; report the discrepancy instead of guessing.
