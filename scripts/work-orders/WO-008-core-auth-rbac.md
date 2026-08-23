# WO-008 — Auth Boundary and Pure RBAC Engine

Owner: PM/TL
Executor type: deterministic coding executor
Status: BLOCKED — becomes READY FOR EXTERNAL EXECUTOR only after external WO-006 output passes PM/TL review

Mandatory shared context: `scripts/work-orders/00-EXTERNAL-EXECUTOR-CONTEXT.md`

Rebuild context: rewrite provider-neutral session and pure permission mechanics only. Legacy providers, roles, matrices, route policy, and StudioFlow contextual authorization are not approved rebuild authority.

## Scope

Implement only the provider-neutral session boundary types/guards and pure grant evaluator locked in `CORE.md` §§3–4.

## Source evidence

- `../studioflow/src/auth.ts`
- `../studioflow/src/lib/auth.ts`
- `../studioflow/src/core/rbac/app-access.ts`
- `../studioflow/src/core/rbac/guards.ts`
- `../studioflow/src/core/rbac/matrix.ts`

## Target files

- `src/platform/core/auth/**`
- `src/platform/core/rbac/**`
- focused pure tests

## Exact allowed changes

1. Define `SessionPrincipal`, session-reader port, `getPrincipal`, and `requirePrincipal` behavior without selecting an authentication provider.
2. Reject absent/malformed/unknown-role results; never supply a fallback role.
3. Define permission-ID validation for `<owner>.<resource>.<action>`.
4. Implement pure `hasPermission`, `requirePermission`, `hasAllPermissions`, and `hasAnyPermission` over resolved grants.
5. Unknown permissions grant nothing; empty `all` and `any` behavior must be explicit and tested (`all([])=true`, `any([])=false`).
6. Throw shared `UNAUTHENTICATED`/`FORBIDDEN` errors from WO-006.

## Forbidden changes

- No Auth.js provider, password hashing, login UI, cookies, JWT configuration, User/Role schema, or migration.
- No role list, role-to-permission matrix, admin bypass, route prefix, landing route, or navigation policy.
- No StudioFlow membership/PIC/phase, Master Data authority, or BQ ownership rules.
- No client-side authorization hook.

## Acceptance criteria

- Tests prove fail-closed session behavior, no fallback role, namespace validation, exact grant matching, all/any semantics, and correct error distinction.
- Module is pure/provider-neutral except for the injected session reader.
- Tests, typecheck, boundary checks, and build pass.

## Stop conditions

- Implementation requires choosing a persisted role catalog or authentication provider.
- Any requested check needs app-domain context.
