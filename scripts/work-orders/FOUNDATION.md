# Foundation F0 — Locked One-Run Work Order

Status: **LOCKED FOR OPENCODE EXECUTION**

Navigator: **Codex / PM-TL**

Executor: **owner-operated OpenCode session**

Expected starting revision: **R1.01**

Target executor revision: **R1.02**

Required commit subject: **`R1.02 | feat(foundation): implement reusable platform foundation`**

This is one execution run with internal checkpoints, one changelog entry, and one local implementation-candidate commit. Do not pause merely because an internal phase completed. Stop only for a real contract/code contradiction, destructive migration risk that is not covered here, unavailable required infrastructure, or a failing check that cannot be corrected within this contract.

## 1. Mandatory context and authority

Read in this order before editing:

1. `AGENTS.md`;
2. `CHANGELOG.md`;
3. `docs/README.md`;
4. `CORE.md`;
5. `DESIGN.md`;
6. `UI_ENGINE.md`;
7. `scripts/work-orders/00-EXECUTOR-CONTEXT.md`;
8. this work order;
9. `prisma/schema.prisma`, current migrations, relevant code, and tests;
10. the applicable Next.js 16 guides under `node_modules/next/dist/docs/` before changing routing, proxy, forms/actions, caching, cookies, or rendering.

`docs/apps/masterdata.md` is consumer evidence only. Do not resume Master Data product development. The only allowed Master Data edits are deterministic replacement of the unsafe configured operator with the new request identity, exposure of its permission registry through `public/`, and compatibility needed to protect its already-existing routes.

This completed work order used historical committed evidence recorded at commit
`6377ac0971e7a7cc0fd8fb58a8360c069675f9a5`; that record does not establish a
current checkout path or commit. Any later legacy access must follow the current
cross-location and strict isolation rules in `AGENTS.md`. Never read legacy
Markdown as behavior authority, copy a folder wholesale, use its dirty working
tree, or create a runtime dependency on it.

## 2. Repository safety and reserved owner state

Before editing, record HEAD, branch, and the full dirty-file list. At authoring time the following unrelated working-tree changes are reserved and must not be edited, reverted, staged, or committed:

```text
src/app/masterdata/pricing/page.tsx
src/app/masterdata/pricing/sku/[id]/page.tsx
src/platform/utilities/decimal/decimal.test.ts
src/platform/utilities/decimal/index.ts
src/platform/utilities/money/index.ts
src/platform/utilities/money/money.test.ts
```

Re-read `git status` at execution time. Preserve any additional pre-existing change the same way. If a required foundation correction overlaps a reserved file, stop and report the exact hunk instead of overwriting it. Existing decimal/money code may be verified through its public surface, but this work order does not authorize editing those reserved files.

Do not reset, clean, stash, amend, rebase, push, tag, publish, open a PR, or touch a remote. Add no dependency except the two exact production dependencies locked below.

## 3. Locked identity implementation decision

Do not install or introduce Better Auth, Auth.js/NextAuth, Lucia, Clerk, a second RBAC engine, JWT roles, or custom encryption. They are outside this contract.

Use exactly:

- `@node-rs/argon2@2.1.0` for password hashing and verification;
- `rate-limiter-flexible@11.2.0` with its atomic PostgreSQL adapter and the existing shared `pg` pool for login limiting;
- Node `crypto.randomBytes(32)` encoded as base64url for raw browser session tokens;
- Node SHA-256 for the database token verifier; only the lowercase hex digest is persisted.

Password rules:

- use Argon2id with `memoryCost: 19456`, `timeCost: 2`, `parallelism: 1`, and `outputLen: 32`;
- accept 12–128 Unicode code points; do not trim, normalize, log, audit, return, or persist plaintext;
- store the encoded PHC hash only;
- unknown email, disabled User, malformed credentials, and wrong password return the same safe copy and perform an equivalent Argon2 verification using a valid non-user dummy hash;
- password change verifies the current password, writes a new hash, revokes all prior sessions atomically, and creates/rotates the current session only after the transaction succeeds;
- there is no public signup, password-recovery email, social login, MFA, fallback password, or development bypass.

Session rules:

- cookie name is `studioflow_session`;
- cookie is `httpOnly`, `sameSite=lax`, `path=/`, `secure` in production, and expires no later than the absolute session expiry;
- persist only `sha256(rawToken)`, never the raw token;
- idle expiry is 12 hours; absolute expiry is fixed at login and is 7 days;
- after 15 minutes since the last persisted touch, atomically set `lastSeenAt = now` and `idleExpiresAt = min(absoluteExpiresAt, now + 12 hours)`;
- every protected request checks token hash, revocation, both expiries, User status, live Role assignments, and live registered RolePermission grants from the database;
- do not use a session/JWT/cookie cache for User status, Roles, or grants;
- ordinary logout revokes the current row and clears the cookie; “log out all” and password/security changes revoke every active row;
- raw tokens, hashes, cookies, passwords, secrets, and database error detail never reach client results, audit rows, or logs.

Login rate limits:

- consume before credential verification;
- normalized-email key: SHA-256 of the normalized email, 5 attempts per 15 minutes, 30-minute block after exhaustion;
- network key: 25 attempts per 15 minutes, 30-minute block after exhaustion;
- trust forwarded client-IP headers only when an explicit server configuration enables them; otherwise use a non-spoofable deployment-local fallback bucket and record the limitation in operational configuration;
- never persist/log a raw email or raw session token as a limiter key;
- a limiter infrastructure failure fails login closed with `INFRASTRUCTURE`, not an authentication guess and not an in-memory multi-process fallback;
- successful login clears the normalized-email failure bucket but not the network bucket;
- security events are sanitized operational logs, not business AuditEvent rows.

This implementation remains private to `src/platform/core/auth`. Apps import only the Core identity/session ports and request-context builder.

## 4. Persisted platform shape

Add an additive reviewed migration and Prisma models in PostgreSQL schema `platform` for these exact concepts:

- `User`: UUID; canonical normalized unique email; display name; Argon2 PHC password hash; `ACTIVE | DISABLED`; created/updated/disabled timestamps;
- `Role`: UUID; immutable normalized unique code; name; optional description; system flag; created/updated/archived timestamps;
- `UserRole`: unique User × Role assignment plus assignment timestamp;
- `RolePermission`: unique Role × registered permission ID plus grant timestamp;
- `Session`: UUID; unique SHA-256 token hash; User relation; created, last-seen, idle-expiry, absolute-expiry, revoked timestamps; optional bounded user-agent and client-address metadata;
- `PlatformGeneralSettings`: database-enforced singleton plus typed fields from section 7;
- the rate-limiter storage table required by the locked PostgreSQL adapter, created by migration rather than implicit runtime DDL.

Required database protections:

- normalized email and Role code have race-safe uniqueness;
- assignment/grant pairs are unique;
- foreign-key deletion behavior cannot silently delete historical AuditEvent rows;
- Session indexes support live lookup, user revocation, and expiry cleanup;
- the settings singleton identity is enforced in SQL, not only application code;
- no wildcard permission, comma-separated role list, JSON settings bag, plaintext session token, app-owned User/Role duplicate, or production operator environment identity;
- the migration is additive, documents recovery, and refuses unsafe implicit conversion of any existing development operator environment values.

Add database contract tests for every constraint and the important negative cases. Do not use `prisma db push` as the migration artifact.

## 5. Core mechanics and boundaries

Complete or correct these shared mechanisms before route work:

1. safe server-action results under `src/platform/core/actions`, using existing Core errors and never leaking raw unknown errors;
2. pure pagination helpers under `src/platform/utilities/pagination`, with caller-supplied defaults/limits and no app query/sort/filter policy;
3. deliberate public exports for DB, errors, validation, audit, auth, RBAC, settings, decimal, money, date, Unit representation, text normalization, slug, and pagination—no catch-all utility barrel;
4. boundary checks preventing platform → app imports and cross-app internal imports;
5. deletion of unused speculative Core `events`/`files` and Utility `dictionary`/generic `format`/generic `id` modules only after `rg` proves no real consumer;
6. one code-owned permission registry that composes Platform permissions with each registered app's public permission list and rejects malformed/duplicate/unknown grants;
7. repair the known baseline ESLint 9 failure by adding the repository's flat `eslint.config.*` using the already-installed Next.js/TypeScript ESLint packages; add no lint dependency and do not weaken rules merely to make the command green.

Update `SessionPrincipal` to the locked `userId`, `roleIds`, `displayName`, and `email` shape. `getPrincipal()` and `requirePrincipal()` are request-bound public functions; dependency injection needed for tests stays private/internal.

## 6. RBAC and platform access administration

Implement persisted repositories/services for Role, UserRole, and RolePermission and load the union of live grants on every protected request.

Platform permission registry:

```text
platform.settings.read
platform.settings.manage
platform.user.read
platform.user.manage
platform.role.read
platform.role.manage
platform.audit.read
```

Rules:

- no hardcoded admin/developer bypass and no fallback Role;
- an archived Role grants nothing and cannot be newly assigned;
- a disabled User authenticates as nobody and all of their sessions are revoked;
- unknown persisted permission IDs grant nothing and are visible as integrity failures to authorized administrators;
- grant replacement validates every ID against the code registry and is atomic;
- User create/update/disable/restore, password set, Role create/update/archive, Role assignment/removal, and grant replacement use explicit commands, permission checks, transactions, safe no-op behavior, and audit events;
- the final active User capable of both `platform.user.manage` and `platform.role.manage` cannot be disabled or lose that capability through UserRole removal, Role archive, or grant replacement;
- self-demotion is allowed only when another active access administrator remains;
- a system Role cannot be archived through ordinary UI;
- bootstrap creates one `platform-owner` system Role with explicit current registry grants and never overwrites later grant customization.

Create a one-time server-side bootstrap command. It accepts email, display name, and password through non-logged command input; refuses when any active User already exists; never prints password/hash; and creates User, Role, grants, assignment, and audit atomically. It is not an HTTP/public route.

## 7. Platform General Settings

Implement a typed singleton service under `src/platform/core/settings` and `/settings/general` with exactly:

```ts
type PlatformGeneralSettings = {
  organizationName: string;
  appTitle: string;
  locale: string;
  timezone: string;
  currency: string;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  brandMarkUrl: string | null;
};
```

Initial singleton defaults are `StudioFlow`, `StudioFlow`, `id-ID`, `Asia/Jakarta`, `IDR`, `1`, and `null`. Validate bounded names, supported locale/timezone, three-letter uppercase currency, week range, and safe optional URL/path. Reads require `platform.settings.read`; writes require `platform.settings.manage`, are atomic/audited, and emit no event on no-op. Currency/locale settings are injected into consumers; pure Utilities never read the database or environment themselves.

Do not add StudioFlow templates, schedule categories, Master Data pricing/import policy, BQ calculation settings, arbitrary key/value settings, file upload, or per-user UI preferences.

## 8. Platform routes, shell, and UI-F0

Implement and protect:

```text
/login
/
/account
/settings/general
/settings/access/users
/settings/access/roles
```

The authenticated app shell is the single reusable container for product identity, app navigation/launcher access, account/logout, and centralized General/Access Settings. Apps supply registration/navigation configuration; they do not fork shell styling or identity controls.

Use only the UI-F0 contract in `UI_ENGINE.md`. Audit existing components first, fix a generic weakness once at UI Engine level, then consume it. Do not add UI-F1 `CreatableSearch`/hooks yet and do not implement deferred file/document/workspace patterns.

Required behavior:

- `/login` is the only public UI route and has generic failure copy, rate-limit feedback, pending/disabled behavior, keyboard focus, and no signup link;
- `/` uses live `<app>.access` grants: zero apps shows an intentional no-access state, one app redirects there, several apps show the launcher;
- `/account` edits own display name/password and lists/revokes current/other sessions;
- Settings navigation is permission-aware but server authorization remains authoritative;
- user/role directories support loading, empty, error, permission/read-only, create/edit/disable/restore/archive/confirm, and safe stale-submit states;
- `proxy.ts` performs only optimistic public-route/session-cookie presence gating; all server pages, handlers, and mutations fail closed independently;
- redirects have no login/root/app loop;
- narrow viewport and collapsed desktop rail remain usable and visually consistent with `DESIGN.md`.

## 9. Existing Master Data convergence only

Expose `MASTERDATA_PERMISSIONS` from `src/apps/masterdata/public/` and register it with the platform registry without importing app internals into Platform.

Replace every use of `MASTER_DATA_REQUEST_CONTEXT` / `configuredOperatorContext` in existing pages, actions, and import/export handlers with a request-scoped context built from `requirePrincipal()` plus live grants. Require `masterdata.access` at app entry and keep each existing application-service permission check. Remove the operator environment variables and adapter only after `rg` proves there is no runtime consumer.

Do not alter Master Data entity meaning, price selection, schema, CRUD behavior, page design, money formatting, or the reserved files. This phase secures existing routes; it does not declare Master Data complete or active.

## 10. Audit and end-to-end proof

Reuse the existing append-only Core AuditEvent envelope. Prove one protected existing Master Data mutation end to end:

```text
login -> cookie/session lookup -> active User -> live Roles/grants ->
masterdata.access -> use-case permission -> transaction -> mutation + audit ->
safe action result -> revalidation only after commit
```

Also prove:

- User disable, Role removal, Role archive, and grant removal affect the next protected request without token refresh;
- missing/malformed/expired/revoked session, disabled/role-less User, unknown Role/permission, and inaccessible app fail closed;
- wrong password, unknown email, and disabled User have indistinguishable client failure;
- last-access-administrator and self-demotion paths roll back fully;
- duplicate/no-op/stale form cases do not create misleading audit rows;
- transaction failure rolls back both business mutation and audit event;
- secrets, hashes, raw tokens, limiter keys, and database details are absent from logs, audit, serialized action results, and HTML.

## 11. Required verification

Run focused unit, integration, route/action, boundary, and negative security tests, then all of:

```text
npm run lint
npm run typecheck
npm test
npm run check:boundaries
npm run check:legacy-runtime
npm run build
git diff --check
```

Database tests require a prepared disposable PostgreSQL database. Cancelled/skipped integration tests are not passing. If the required database is unavailable after checking documented local setup, stop and report the exact requirement; do not replace it with mocks and call the database contract complete.

Known starting-baseline evidence: `npm run lint` currently fails because no `eslint.config.js|mjs|cjs` exists, and database suites cancel unless both `DATABASE_URL` and `MASTERDATA_TEST_DATABASE_URL` name the same disposable PostgreSQL database. These are explicit inputs to fix/prepare, not acceptable final exceptions.

Run the application and browser-check login failure/success/rate limit, logout, account, session revoke, launcher states, General Settings, Users, Roles, permission denial, loading, empty, error, pending, unsaved input, destructive confirmation, desktop, collapsed rail, and narrow viewport. There must be no console error, hydration error, horizontal page overflow, or raw `ui-*` substitute where an activated UI Engine component exists.

## 12. Completion, changelog, and commit

When implementation and automated checks complete:

1. update `CHANGELOG.md` with `R1.02`, dependencies/migration, behavior delivered, exact checks, browser coverage, and any navigator-review caveat;
2. stage only work-order-owned files; reserved owner changes remain unstaged;
3. inspect `git diff --cached --stat`, `git diff --cached`, and `git diff --cached --check`;
4. commit locally with exactly `R1.02 | feat(foundation): implement reusable platform foundation`;
5. do not push or create a remote tag;
6. report commit hash, files changed by work item, migration name, commands/results, browser states, deviations, risks, and the still-uncommitted reserved files.

The executor commit is an implementation candidate. Foundation is accepted only after the navigator independently reviews that commit and its running behavior. Any correction becomes `R1.03` or the next unused local revision; never amend `R1.02` without explicit owner instruction.

UI-F1, the full Master Data code-derived contract, and Master Data feature work remain out of scope until that review passes.
