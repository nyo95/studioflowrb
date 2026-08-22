# WO-009 — Audit Envelope and Transactional Port

Owner: PM/TL
Executor type: deterministic coding executor
Status: READY after WO-001, WO-005, and WO-006

## Scope

Implement the domain-neutral audit envelope, safe serializer/diff helper, and transactional writer port locked in `CORE.md` §5. Do not add persistence schema or read models.

## Source evidence

- `../studioflow/src/subapps/master-data/services/audit-service.ts`
- `../studioflow/src/core/platform/audit/types.ts`
- `../studioflow/src/core/platform/audit/index.ts`
- legacy audit read models/undo executor as negative boundary evidence

## Target files

- `src/platform/core/audit/**`
- focused pure/contract tests

## Exact allowed changes

1. Define and validate `AuditEventInput`, actor, change, metadata, and app identifiers.
2. Implement recursive JSON-safe serialization: Decimal-like values to canonical strings, Dates to UTC ISO, arrays/objects recursively.
3. Implement explicit-key diffing that omits unchanged values.
4. Define an `AuditWriter` port whose write method requires the caller-provided transaction context.
5. Document/test one-operation/one-event, no-op omission, secret-field rejection, and same-transaction requirement at the API boundary.

## Forbidden changes

- No Prisma audit model/migration or DB adapter.
- No action vocabulary, read/query UI, undo/revert executor, retention job, or security-log framework.
- No User/project/phase/category relation or cross-domain FK.
- No automatic full-row capture or secret redaction guesswork; forbidden keys must fail.

## Acceptance criteria

- Tests cover user/system actors, UTC defaulting, request IDs, Decimal/Date serialization, nested structures, no-op diffs, forbidden secret keys, and transaction-context requirement.
- Audit code imports no app and contains no app action name.
- Tests, typecheck, boundary checks, and build pass.

## Stop conditions

- Persistence is required to satisfy a test or API; report it as the later schema-adapter work order.
- Serializing a value would require lossy numeric conversion.
