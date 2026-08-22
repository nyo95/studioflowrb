# CORE.md — Platform Core Contract

Status: **LOCKED — canonical minimum Platform Core contract (PM/TL, 2026-08-23)**
Scope: cross-app technical behavior only.

Authority: this file specializes `docs/01-PLATFORM-CORE-PRD.md`, `docs/06-DATA-OWNERSHIP.md`, and `docs/07-ENGINEERING-CONVENTIONS.md`. App PRDs remain authoritative for business policy.

## 1. Core boundary

Platform Core owns only technical behavior whose meaning is identical across StudioFlow, Master Data, and BQ:

- Prisma client and transaction convention;
- authentication/session boundary;
- permission evaluation mechanics;
- audit envelope and write convention;
- shared error taxonomy and safe transport mapping;
- boundary-validation convention;
- decimal, money, unit, and date representation/formatting conventions.

Core must not own app workflows, entity CRUD, pricing policy, BQ calculation semantics, StudioFlow project membership rules, Master Data lifecycle rules, route/navigation content, or domain status vocabularies.

## 2. DB / Prisma access

### Canonical client

- The generated Prisma client lives at `src/generated/prisma`.
- `src/platform/core/db` is the only module that constructs `PrismaClient` or the PostgreSQL pool/adapter.
- Server code imports the shared client from `@platform/core/db`; no app constructs another client.
- Use the Prisma 7 PostgreSQL adapter, one process-level pool, and a development singleton safe across hot reload.
- Pool limits come from environment configuration with conservative defaults. Secrets and URLs never appear in source.
- Do not use schema-specific delegate signatures, hardcoded table preflight lists, or per-request client construction.

### Layer access

- App `domain/` never imports Prisma or DB types.
- App `infrastructure/` owns Prisma queries for that app's data.
- App `application/` orchestrates infrastructure ports/use cases and transaction scope.
- Cross-app reads/writes go through the owning app's `public/` contract. A shared Prisma client does not authorize direct access to another app's models.
- Core provides no generic repository or active-record abstraction.

### Transactions

- A command that changes multiple records or writes an audit event uses one transaction.
- The transaction begins at the application/use-case boundary and is passed to participating infrastructure functions.
- Simple independent reads do not open a transaction by default.
- Never hide a second transaction inside a function already given a transaction client.
- Audit for a successful mutation is written in the same transaction. A rollback must also roll back its audit event.
- Raw SQL is limited to migrations or an explicitly reviewed infrastructure adapter when Prisma cannot express the operation safely.

## 3. Auth / session boundary

Core defines the session contract; authentication-provider details remain behind an adapter.

```ts
type SessionPrincipal = {
  userId: string;
  roleId: string;
  displayName: string;
  email?: string;
};
```

Rules:

- `getPrincipal()` returns `SessionPrincipal | null`.
- `requirePrincipal()` returns a principal or throws `UNAUTHENTICATED`.
- Missing, malformed, deleted, disabled, or unknown-role identities are rejected. There is no fallback role.
- Session/JWT claims contain identity only; effective permissions are resolved server-side from current policy on each protected request.
- Client-visible session data is for presentation, never authorization.
- Route gating is defense-in-depth only. Every protected server use case performs its own permission check.
- Core contains no app route matrix or landing-route policy.
- Authentication logs never include passwords, password hashes, raw tokens, or secrets.

Credential provider choice, user lifecycle, password policy, and persisted role catalog are separate identity implementation decisions. They must not leak into the cross-app session contract.

## 4. RBAC / permission contract

### Permission IDs

Permissions are namespaced strings:

```text
<owner>.<resource>.<action>
```

Examples:

```text
studioflow.project.read
masterdata.price.read
bq.breakdown.edit
platform.user.manage
```

App-entry permission uses `<app>.access`.

Rules:

- Platform Core owns pure evaluation helpers, not the app permission vocabulary.
- Each owning app defines and exports its permission constants from its public boundary when consumers genuinely need them.
- Role-to-permission grants are composed server-side outside the pure evaluator.
- Unknown roles and unknown permissions grant nothing.
- `hasPermission(grants, permission)` is pure and returns boolean.
- `requirePermission(grants, permission)` throws `FORBIDDEN` when absent.
- Multiple required permissions use explicit `all` or `any` helpers; no implicit admin bypass exists in the engine.
- Contextual rules such as project membership, assigned PIC, BQ project ownership, approval state, or price authority remain app-domain policies evaluated after the base permission check.
- UI visibility may reflect permissions but never replaces server authorization.

The legacy role list and permission matrix are evidence only. This contract does not lock the rebuild's persisted roles or grants.

## 5. Audit envelope

Platform Core owns an append-only, domain-neutral audit envelope:

```ts
type AuditEventInput = {
  appId: "studioflow" | "masterdata" | "bq" | "platform";
  action: string;
  entityType: string;
  entityId: string;
  actor: {
    kind: "USER" | "SYSTEM";
    userId?: string;
    label: string;
  };
  occurredAt?: Date;
  requestId?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  metadata?: Record<string, unknown>;
};
```

Rules:

- Apps own action names and decide which real business operations are auditable.
- One real operation produces one primary audit event; no-op updates produce none.
- Mutation audit writes use the same DB transaction as the mutation.
- Stored timestamps are UTC; `occurredAt` defaults to the write time.
- Decimal values serialize as canonical strings and dates as ISO-8601 UTC strings.
- Secrets, credentials, raw tokens, large blobs, and unnecessary personal data are forbidden in changes/metadata.
- `entityType`/`entityId` are polymorphic references without cross-domain foreign keys.
- Actor label is snapshotted for historical readability; `userId` may be absent for system activity.
- Audit infrastructure is append-only. Undo/revert behavior is app-owned and is not part of Core audit.
- Operational/security logs for failed attempts are distinct from committed business audit events.

Persistence schema and read models may be added only by a separate approved Core schema work order.

## 6. Shared errors

Canonical categories:

```text
VALIDATION
UNAUTHENTICATED
FORBIDDEN
NOT_FOUND
CONFLICT
INVARIANT
INFRASTRUCTURE
INTERNAL
```

The shared `AppError` carries:

- `kind`: one canonical category;
- `code`: stable machine-readable string;
- `safeMessage`: user-safe message;
- optional structured `details` for safe validation/conflict context;
- optional internal `cause`, never serialized to clients.

Rules:

- Expected errors are mapped once at the transport boundary.
- Unknown errors become `INTERNAL` with a generic safe message and are logged server-side with their cause.
- Raw Prisma errors, constraint names, stack traces, SQL, environment values, and unexpected `error.message` never reach clients.
- Prisma known errors map centrally: uniqueness → `CONFLICT`; missing write target → `NOT_FOUND`; FK/required relation → `CONFLICT`; other DB failures → `INFRASTRUCTURE`.
- Authentication failure and authorization failure remain distinct: `UNAUTHENTICATED` versus `FORBIDDEN`.
- Redirect/not-found framework control-flow errors must be rethrown, not converted.
- Apps may define namespaced error codes while using the shared categories and transport shape.

## 7. Validation convention

- Zod is the standard boundary-validation library.
- Validate untrusted input at HTTP/server-action/import/public-contract boundaries before orchestration.
- App validation schemas live with the owning app; Core contains only truly shared scalar schemas/helpers such as UUID, canonical decimal string, ISO instant, and date-only.
- Validation transforms representation only. Business invariants remain domain functions/use cases.
- Unknown keys are rejected for mutation inputs unless a contract explicitly permits passthrough.
- Omitted and explicit `null` remain distinct where clearing a value is meaningful.
- Validation failures map to `AppError(kind="VALIDATION")` with field issues shaped as `{ path: string[], message: string }[]`.
- Do not build a global mega-schema and do not import Prisma enums into generic Core validation.
- DB constraints remain the final race-safe enforcement layer, not a replacement for input validation.

## 8. Decimal and money conventions

### Decimal

- Cross-layer/public decimal values use normalized base-10 strings, never JavaScript floating-point numbers.
- Persistence adapters convert between canonical strings and `Prisma.Decimal`.
- JSON serialization preserves decimal strings.
- `NaN`, infinity, empty input, locale-formatted separators, and malformed values are rejected.
- Core may parse/normalize/compare decimal strings; arithmetic and rounding policy remain domain-owned.
- BQ's existing calculation semantics are not changed by this contract. Any BQ numeric migration requires its own manager approval and regression gates.

### Money

```ts
type Money = {
  amount: DecimalString;
  currency: string;
};
```

- Currency is an uppercase ISO-4217 code and is always explicit in persisted/public values.
- Default display settings are `IDR` and `id-ID`, but formatters accept explicit currency and locale.
- Formatting is display-only and must not mutate stored values or define calculation rounding.
- No implicit currency conversion exists in Core.
- Money arithmetic, allocation, tax, markup, and commercial rounding belong to the owning domain.

## 9. Unit convention

- Canonical unit vocabulary is Master Data-owned as stated in its PRD.
- Core provides only domain-neutral representation and formatting helpers.
- Public values use a canonical unit code string; display labels may be supplied by the owning dictionary/contract.
- Core does not infer conversions, compatibility, purchase units, usage units, or dimensional meaning.
- Unit conversion and validation against an entity's allowed units remain domain-owned.

## 10. Date/time convention

- Persist instants as UTC `DateTime`; serialize as ISO-8601 strings with `Z`.
- Represent date-only business values as `YYYY-MM-DD` strings and do not silently convert them through UTC instants.
- Default display locale/timezone are `id-ID` and `Asia/Jakarta`; formatters accept explicit overrides.
- Parsing must identify whether input is an instant or date-only value.
- Shared helpers may format and perform generic calendar operations. Holiday calendars, workday rules, project schedules, validity semantics, and business deadlines remain app-owned.
- Do not hardcode one year's holiday list or use server-local timezone implicitly.

## 11. Public surfaces

Apps use deliberate stable imports:

```text
@platform/core/db
@platform/core/auth
@platform/core/rbac
@platform/core/audit
@platform/core/errors
@platform/core/validation
@platform/utilities/decimal
@platform/utilities/money
@platform/utilities/unit
@platform/utilities/date
```

No app imports another app's Core adapter, internal infrastructure, or the legacy repository.

## 12. Explicit non-goals

- generic repository/service framework;
- dependency-injection container;
- event bus or workflow engine;
- generic CRUD/action framework;
- persisted permission designer;
- app route/navigation policy;
- domain calculation engine;
- unit-conversion engine;
- audit undo framework;
- app-specific validation registry.
