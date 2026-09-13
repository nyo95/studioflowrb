# CORE.md — Platform Core Contract

Status: **LOCKED — Foundation F0 execution contract (PM/TL, 2026-08-29)**
Scope: reusable platform behavior, identity/access, general settings, and the rules for growing shared capabilities.

Authority: this is the single shared backend/utility contract. Product policy remains owned by an owner-approved active app contract; none is executable in the current foundation-only phase.

## Locked foundation decisions

These decisions govern Foundation F0 unless the owner explicitly amends them:

1. one User may hold multiple persisted Roles; effective permission is the union of explicit RolePermission rows;
2. login uses revocable database sessions and live server-side grants, not a long-lived role/permission JWT;
3. there is no public signup and no fallback/admin bypass; the first owner is created by a one-time bootstrap command;
4. Platform General Settings initially owns only organization/app title, locale, timezone, currency, week start, and brand mark;
5. F0 implements identity/access/settings and essential mechanics; UI-F1 activates just before Master Data; all other ideas remain deferred;
6. authentication is implemented behind Core ports without a general auth framework: `@node-rs/argon2@2.1.0` provides Argon2id password hashing, Node `crypto` provides opaque session-token generation plus SHA-256-at-rest verification, and `rate-limiter-flexible@11.2.0` provides an atomic PostgreSQL login limiter;
7. a session has a 12-hour idle limit, a non-sliding 7-day absolute limit, and a throttled 15-minute last-seen/idle-extension write; session cookie caching and role/permission claims are forbidden;
8. the owner-operated OpenCode executor implements the locked Foundation work order in one run, commits it as the assigned local revision, and the navigator reviews that commit before Master Data is activated.

## 1. Core boundary

Platform Core owns only technical behavior whose meaning is identical across StudioFlow, Master Data, and BQ:

- Prisma client and transaction convention;
- authentication, session, and user lifecycle boundary;
- persisted role/grant composition and permission evaluation mechanics;
- platform-wide General Settings;
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

## 3. Identity, login, and session

Identity is a required foundation capability, not a future app concern. Master Data is not allowed to ship on an environment-configured operator identity. Core defines the stable session/application contract; provider/framework details stay inside `src/platform/core/auth` infrastructure.

```ts
type SessionPrincipal = {
  userId: string;
  roleIds: readonly string[];
  displayName: string;
  email: string;
};
```

Rules:

- `getPrincipal()` returns `SessionPrincipal | null`.
- `requirePrincipal()` returns a principal or throws `UNAUTHENTICATED`.
- Missing, malformed, expired, revoked, deleted, disabled, or role-less identities are rejected. There is no fallback role.
- A User may hold multiple Roles. The principal contains stable role IDs for presentation/debug context, never trusted grants.
- Session claims/cookies contain an opaque session identity only. Effective Roles and permissions are resolved server-side from current persisted policy on every protected request, so disable/role/grant changes take effect immediately.
- Client-visible session data is for presentation, never authorization.
- Route gating is defense-in-depth only. Every protected server use case performs its own permission check.
- Next.js 16 `proxy.ts` performs only an optimistic session-presence/public-route check; it does not fetch the database or replace authorization.
- App entry and landing selection are derived after server-side grant resolution from explicit `<app>.access` permissions. Core owns the generic resolver, while each app registers its root route and label outside the evaluator.
- Authentication logs never include passwords, password hashes, raw tokens, or secrets.

### Persisted identity shape

The platform schema owns these concepts in the `platform` namespace:

- `User`: UUID, normalized unique email, display name, password credential reference/hash when credentials are enabled, `ACTIVE | DISABLED`, created/updated timestamps, and optional disabled timestamp;
- `Role`: UUID, immutable normalized code, display name, description, system flag, created/updated timestamps, and optional archived timestamp;
- `UserRole`: unique User × Role assignment;
- `RolePermission`: unique Role × namespaced permission ID grant;
- `Session`: opaque-token hash, User ID, created/last-seen/idle-expiry/absolute-expiry/revoked timestamps, and safe client metadata when justified.

No app owns a second User, Role, or login table. Cross-app business history stores actor ID/label snapshots without foreign keys when its ownership contract requires durable decoupling.

### Credential and session rules

- Initial scope is invite/admin-created credentials and login/logout; no public self-registration, social login, password recovery email, or MFA is invented.
- Email is trimmed, Unicode-normalized where safe, and compared case-insensitively. Login failure copy is identical for unknown email, disabled user, and wrong password.
- Password policy is centralized, at least 12 characters, and checked server-side. Passwords are hashed by an approved maintained password-hashing implementation with a per-password salt; plaintext is never trimmed, logged, audited, returned, or stored.
- Authentication provider/library selection is an infrastructure decision locked in the identity implementation work order. It must satisfy this contract and use the Core ports; app code never imports that provider directly.
- Browser sessions use opaque high-entropy tokens; storage keeps only a one-way token hash. Cookies are `httpOnly`, `sameSite=lax`, `path=/`, and `secure` in production. Cookie mutation occurs only in a Server Function or Route Handler.
- Sessions have explicit idle and absolute expiry, rotate after login/security-sensitive changes, and are revoked on password reset, user disable, or explicit “sign out all sessions”. Ordinary logout revokes the current session.
- `lastSeenAt` persistence is throttled rather than written on every render/request; expiry and revocation checks remain authoritative.
- Login is rate-limited by a provider/infrastructure adapter using non-secret identifiers. Security failures are operational security events, not committed business audit rows.
- User/role/grant/general-setting mutations use normal permission, transaction, and audit rules. Password/hash/token material is forbidden from audit.
- Bootstrap of the first Platform Owner is an explicit one-time server-side command. It refuses to run when an active user already exists, never prints a password/hash, and creates explicit RolePermission rows rather than a wildcard bypass.

### Identity UI

Foundation owns these platform routes before the first app is considered deployable:

```text
/login
/account
/settings/general
/settings/access/users
/settings/access/roles
```

The root route is an authenticated app launcher built from live `<app>.access` grants. Login redirects to the sole accessible app when there is one, otherwise to the launcher. Unknown or inaccessible routes fail closed. A user can change their own display name/password and revoke sessions; managing other users/roles requires platform permissions.

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
- Permission vocabulary is registered by code; Role-to-permission grants are persisted and composed server-side outside the pure evaluator.
- Unknown roles and unknown permissions grant nothing.
- `hasPermission(grants, permission)` is pure and returns boolean.
- `requirePermission(grants, permission)` throws `FORBIDDEN` when absent.
- Multiple required permissions use explicit `all` or `any` helpers; no implicit admin bypass exists in the engine.
- Contextual rules such as project membership, assigned PIC, BQ project ownership, approval state, or price authority remain app-domain policies evaluated after the base permission check.
- UI visibility may reflect permissions but never replaces server authorization.

### Persisted RBAC policy

- Core owns Role/UserRole/RolePermission storage and grant resolution. Apps own permission IDs and contextual business policy.
- Required platform permissions are `platform.settings.read`, `platform.settings.manage`, `platform.user.read`, `platform.user.manage`, `platform.role.read`, `platform.role.manage`, and `platform.audit.read`.
- A Role grant may reference only a permission in the code-owned registry. Removing a permission from code requires an explicit migration/cleanup decision; unknown persisted grants grant nothing.
- Roles may be archived only when no active User assignment depends on them. System roles cannot be archived through ordinary UI.
- Seeds create explicit initial roles/grants idempotently. They never overwrite owner-customized RolePermission rows after bootstrap unless a migration names the exact delta.
- No `ADMIN`/`DEVELOPER` hardcoded bypass exists. A powerful role is powerful because its persisted explicit grants say so.
- The final active user capable of managing users and roles cannot be disabled, stripped of all such Roles, or have the last required grants removed. The whole change is validated atomically.
- Self-demotion is allowed only when another active access administrator remains. User restore/reactivation is explicit; creating an existing archived email never silently revives it.

The legacy role enum and static matrix are evidence only; they do not define rebuild roles. Initial role names/grants are a seed/work-order decision reviewed against the apps that actually exist.

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
- The default `IDR`/`id-ID` presentation is compact (`Rp.` followed by the
  grouped canonical amount) and does not pad absent fractional zeroes. Generic
  decimal display remains locale-aware and arbitrary-precision.
- Formatting is display-only and must not mutate stored values or define calculation rounding.
- No implicit currency conversion exists in Core.
- Money arithmetic, allocation, tax, markup, and commercial rounding belong to the owning domain.

## 9. Unit convention

- Canonical unit vocabulary is Master Data-owned as stated in its PRD.
- Core provides only domain-neutral representation and formatting helpers.
- Public values use a canonical unit code string; display labels may be supplied by the owning dictionary/contract.
- Core does not infer conversions, compatibility, purchase units, usage units, or dimensional meaning.
- Utilities may provide exact, pure geometry/measurement arithmetic when an
  approved consumer supplies the conversion factor explicitly. Unit vocabulary,
  dimensional compatibility, and the decision to derive a purchase-to-base
  factor remain app-owned; Utilities never query or classify the Unit dictionary.
- Unit conversion and validation against an entity's allowed units remain domain-owned.

## 10. Date/time convention

- Persist instants as UTC `DateTime`; serialize as ISO-8601 strings with `Z`.
- Represent date-only business values as `YYYY-MM-DD` strings and do not silently convert them through UTC instants.
- Default display locale/timezone are `id-ID` and `Asia/Jakarta`; formatters accept explicit overrides.
- Parsing must identify whether input is an instant or date-only value.
- Shared helpers may format and perform generic calendar operations. Holiday calendars, workday rules, project schedules, validity semantics, and business deadlines remain app-owned.
- Do not hardcode one year's holiday list or use server-local timezone implicitly.

## 11. Platform General Settings

R7.56 activates nullable `mainAppId` and `landingAppId` preferences under
`platform.settings.manage`. Core validates and persists opaque app IDs; the
launcher composition selects among live granted app registrations. An unset main
means Master Data; otherwise the configured main wins when accessible, then the
configured landing, then Master Data or the first accessible app. Unknown IDs
fall back safely. No accessible apps means no redirect. Registered roots must be
local non-root paths without query strings, fragments, or traversal segments.

General Settings is a small typed platform aggregate shared by every app, not a generic key/value dump and not StudioFlow project configuration.

Initial fields are:

```ts
type PlatformGeneralSettings = {
  organizationName: string;
  applicationTitle: string;
  defaultLocale: string;      // initial seed: id-ID
  defaultTimeZone: string;    // initial seed: Asia/Jakarta
  defaultCurrency: string;    // initial seed: IDR
  weekStartsOn: 0 | 1;        // Sunday or Monday
  brandMarkUrl: string | null;
};
```

Rules:

- exactly one row exists with a stable singleton ID; seed/upsert is idempotent;
- values are validated by a typed application service; there is no arbitrary JSON setting API;
- locale, IANA timezone, ISO currency, and brand mark are explicit and validated;
  a brand mark may be an existing safe HTTP(S)/site-relative URL or an
  owner-uploaded PNG (maximum 2 MB, verified PNG signature, server-generated permanent
  storage key under the public platform asset bucket, with durable database storage
  recording the key rather than a raw URL);
- settings supply defaults to formatters and shells, but callers can override display locale/timezone/currency explicitly;
- changing a display default never rewrites persisted business values or snapshots;
- read/manage use `platform.settings.read/manage`; updates are transactional and audited with safe field deltas;
- app-specific settings remain app-owned: StudioFlow templates/auto-numbering, Master Data dictionaries, and BQ markup/calculation policy do not belong here;
- per-user theme/density/preferences are a deferred capability, not fields added speculatively to this singleton.

## 12. Public surfaces

Apps use deliberate stable imports:

```text
@platform/core/db
@platform/core/auth
@platform/core/rbac
@platform/core/audit
@platform/core/errors
@platform/core/validation
@platform/core/actions
@platform/core/settings
@platform/utilities/decimal
@platform/utilities/money
@platform/utilities/unit
@platform/utilities/date
```

No app imports another app's Core adapter, internal infrastructure, or the legacy repository.

## 13. Action/result and collection-helper contracts

### Server action result

Interactive app forms must not expose raw exceptions, Prisma messages, stack traces, or framework control-flow errors. Platform Core provides one framework-thin result boundary:

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: SafeErrorPayload };
```

The wrapper:

- executes an app-supplied command;
- rethrows redirect/not-found/framework control flow;
- converts expected `AppError`, Zod, and known Prisma failures through the existing safe error taxonomy;
- reports unexpected errors through an injected reporter and returns only the generic safe payload;
- owns no authentication, permission, transaction, revalidation, redirect, or domain policy.

Apps keep those policies in their application/action boundary and may provide a small typed unwrap helper for server-to-server composition. UI components receive pending/error/success state as data and do not import Core.

### Pagination and query normalization

Utilities provide deterministic, pure helpers for:

- positive page and page-size normalization with an explicit maximum;
- offset calculation;
- page-count and bounded current-page metadata from an explicit total;
- `asc`/`desc` normalization.

Allowed sort keys, filters, ranking, database queries, and URL routing remain app-owned. The shared helper never silently selects a business sort field.

### No placeholder surfaces

An empty barrel is not a foundation. `events`, `files`, generic `format`, generic `id`, and any other speculative module are removed until an approved feature proves a domain-neutral contract. ID generation remains an injected port. Formatting stays in specific tested modules such as money, decimal, date, and Unit.

## 14. Feature-to-Core expansion contract

The initial Core implementation is a baseline, not a closed catalog. Every approved feature slice performs a capability inventory before app code is written.

### Placement test for future agents

Evaluate in this order and record the answer in the feature contract/work order:

1. Does the behavior name an app entity, workflow, lifecycle, permission meaning, calculation, persistence policy, or business default? It is **APP-OWNED**, even if its code shape looks reusable.
2. Is it a security, identity, transaction, audit, safe transport, platform setting, or cross-app boundary invariant? It belongs in **CORE** behind a narrow port/API.
3. Is it pure deterministic representation/normalization/formatting/collection logic with identical meaning across consumers and no React/DB/framework policy? It belongs in **UTILITIES**.
4. Is it visual composition, accessibility, keyboard/focus behavior, or generic interaction state? It belongs in **UI ENGINE**; persistence and domain copy stay in the app.
5. Is it an infrastructure adapter for a shared port (auth provider, storage, notification, job runner)? The port belongs in Core only after activation; the adapter stays infrastructure-owned.
6. Is there no approved current/imminent consumer or no stable semantic contract? Record the idea as **DEFER** and create no code/export/dependency.

“Used by two apps” is useful evidence, not the only test. Security/global invariants may be central on their first consumer; identical-looking domain rules may remain app-owned forever.

For each required mechanism, the PM/TL records one disposition:

- **REUSE** — an existing Core/Utility contract already fits without semantic change;
- **EXTEND** — a domain-neutral contract exists but lacks proven behavior required by the slice;
- **ADD** — the mechanism is domain-neutral, reusable, and absent;
- **APP-OWNED** — the behavior encodes one app's policy and must remain inside that app;
- **PURGE** — legacy behavior is defective, obsolete, unsafe, or contradicted by higher authority.

When the disposition is EXTEND or ADD, the shared change is part of the same vertical work order and is completed before an app-local substitute is accepted. The PM/TL owns the classification and contract; a deterministic executor implements it literally.

Typical candidates discovered from the legacy codebase include action/result transport, debounce and optimistic option overlays, unsaved-change protection, confirmation orchestration, file/media handling, and stable revalidation helpers. Their existence in legacy does not automatically make them Core; each must pass the placement test and preserve app-owned policy.

Every feature work order must name exact imports to reuse, shared gaps to add, app-owned rules that must not leak into Core, and regression tests proving the boundary.

## 15. Foundation stages and closure gate

Foundation is deliberately staged. A capability can be documented before it is implemented; it becomes mandatory only when its stage or a consumer activates it.

### Stage F0 — required before any app delivery

- canonical DB/transaction boundary;
- safe errors, validation, action results, audit envelope/persistence;
- real login/logout, persisted User/Role/UserRole/RolePermission/Session, server-side grant resolution, route defense, bootstrap, and access-management UI;
- typed Platform General Settings and settings UI;
- decimal, money, date/time, Unit representation, text normalization, slug, and pagination primitives;
- Design/UI Engine minimum needed for login, settings, navigation, forms, tables, state feedback, confirmation, and unsaved changes;
- removal of fake operator identity and empty/speculative modules.

### Stage F1 — required before Master Data implementation resumes

- `CreatableSearch`, debounce, option overlay, safe confirmation, unsaved-change guard, and generic pending/action feedback;
- one authenticated Master Data route proving session → live grants → permission → transaction → audit → safe action result end to end;
- exact Master Data capability inventory and app contract approval.

### Deferred registry — idea is recorded, code waits for proof

| Candidate capability | Likely central owner | Activation trigger | Current decision |
|---|---|---|---|
| file storage/upload/download, virus/type/size policy | Core port + infrastructure; app policy outside | first approved media/document upload | **ACTIVATED for MOM image objects in R7.52**; Brand mark migration remains deferred |
| cache/revalidation helper | framework utility | repeated domain-neutral tag/path mechanism in two apps | **DEFER**; route/tag lists remain app-owned |
| background jobs/outbox/idempotency | Core infrastructure | first durable async workflow/integration | **DEFER**; no event bus placeholder |
| notification delivery | Core port + app-owned notification meaning | first approved email/in-app notification workflow | **DEFER** |
| observability/security event sink | Core infrastructure | deployment/identity implementation | **ADD with identity** for safe logs/rate-limit evidence; not business audit |
| app registry/launcher | Core contract + app registrations | identity Stage F0 | **ADD NOW**; registrations contain metadata/routes, not permissions policy |
| per-user preferences | Core/settings | proven user-specific theme/density need | **DEFER** |
| phone/email/URL scalar normalization | Utilities | second consumer or one foundation security need | **EXTEND on demand**, never a generic “format” bag |
| stable-ID collection diff/merge | Utilities | repeated ID-preserving child editing with identical create/update/remove output | **DEFER**; deletion policy stays app-owned |
| optimistic concurrency/idempotency primitives | Core/Utilities split | second stale-write flow or first externally retried command | **DEFER**; app decides which version/idempotency scope matters |
| localization/message catalogs | Core setting + app copy | second locale is approved | **DEFER**; locale-aware formatters already accept overrides |
| environment/config parsing | focused infrastructure modules | a new adapter needs typed server config | **EXTEND per adapter**; no global environment bag/client exposure |
| import/export codecs | app or focused shared adapter | same format/semantics proven across apps | **APP-OWNED first**; promote only stable mechanics |
| document/PDF generation | app + UI Engine presentation | first approved document workflow | **DEFER**; no generic report builder |
| tree/category algorithms | owning app domain | proven identical semantics across apps | **APP-OWNED**, not Utility by shape alone |
| ID generation | injected application port | any create use case | **REUSE port**; no global speculative ID module |

This table is a routing memory for future agents, not an instruction to create empty folders. Each activated capability gets a focused contract, consumer, tests, and work order in the same slice.

The active foundation is complete only when:

- every exported Core/Utility symbol has a stable purpose, test, and at least one real or imminent approved consumer;
- no empty/speculative public module remains;
- Stage F0 is implemented and its login/settings/access workflows pass focused and integration tests;
- action results, pagination/query normalization, DB, session resolution, RBAC, audit, errors, validation, decimal, money, date, Unit, slug, and text normalization pass focused tests;
- app code has no competing generic implementation for a capability listed above;
- boundary, typecheck, full unit tests, build, and one real app integration path pass.

“100% foundation” means 100% of the **activated stage**, with all registered future ideas still allowed to remain deferred. It never means prebuilding every possible helper.

## 16. Explicit non-goals

- generic repository/service framework;
- dependency-injection container;
- event bus or workflow engine;
- generic CRUD/action framework;
- runtime creation of new permission IDs outside the code-owned registry;
- app route/navigation policy;
- domain calculation engine;
- unit-conversion engine;
- audit undo framework;
- app-specific validation registry.

## 17. Code-derived evidence and current conformance

The ledger below preserves historical committed evidence recorded at commit
`6377ac0971e7a7cc0fd8fb58a8360c069675f9a5`; it does not establish a current
checkout path or commit. Any new legacy access follows the cross-location,
strictly read-only repository and PostgreSQL isolation rules in `AGENTS.md`.

| Exact code evidence | Decision | Foundation meaning |
|---|---|---|
| `src/auth.ts` Credentials authorization and login/logout flow | **KEEP + FIX** | Keep real credentials and guarded sessions. Remove 30-day role-bearing JWT, stale grants, debug identity logging, and fallback-role behavior. |
| `src/auth.config.ts#callbacks.authorized`, `src/proxy.ts`, `src/core/rbac/app-access.ts` | **KEEP + FIX** | Keep fail-closed public/protected routing and role-aware landing intent. Proxy is optimistic only; live grants and server use cases remain authority. |
| `src/core/rbac/constants.ts`, `matrix.ts`, `guards.ts#hasPermission` | **MERGE + FIX** | Keep namespaced granular permission checks. Replace static enum matrix and admin bypass with code registry + persisted grants + pure evaluator; contextual project policy stays app-owned. |
| `src/lib/services/user-service.ts#executeCreateUser`, `executeDeleteUser`, `executeUpdateUserRole` | **KEEP + FIX** | Keep password hashing, soft disable/history, audit, and last-admin guard. Use many-to-many Roles, explicit restore, session revocation, full safe deltas, and no silent email reactivation. |
| `src/lib/services/settings-service.ts#executeUpdateUISettings`, `src/app/(dashboard)/settings/studio/page.tsx` | **MERGE + PURGE** | Extract only organization/display defaults into typed Platform General Settings. Keep StudioFlow schedule/templates/auto-naming inside StudioFlow; remove direct page-level Prisma and arbitrary global UI JSON. |
| `src/lib/action-wrapper.ts#createAction`, `src/lib/result.ts` | **MERGE + FIX** | Preserve typed result/unwrap ergonomics; remove raw unknown error leakage and bundled auth/DB/transaction/revalidation/app role policy. |
| `src/lib/revalidation.ts#invalidateCache` and route tag registry | **APP-OWNED / DEFER** | Revalidation mechanics may later be shared, but app route/tag policy never enters Core. |

Current rebuild evidence:

- `src/platform/core/db`, `errors`, `validation`, `rbac`, `audit`, and provider-neutral `auth` are useful pure/mechanical baselines;
- `src/apps/masterdata/infrastructure/request-context.ts#configuredOperatorContext` is explicitly non-production and must be removed after real identity wiring;
- there are no persisted User/Role/UserRole/RolePermission/Session or Platform General Settings models/routes yet;
- `src/platform/core/events`, `files`, `src/platform/dictionary`, generic `format`, and generic `id` are empty/speculative and are not a finished foundation;
- the current `SessionPrincipal.roleId` and app request contexts must migrate to multi-role live grant resolution without weakening existing permission checks.
