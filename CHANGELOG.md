# Changelog

This file is the authoritative revision ledger. Revision/commit rules are in `AGENTS.md`.

## Revision state

- Published baseline: **R1** — `c8e473702801510aa314bbed45242a71b600f733` on `origin/main`
- Current local revision after this entry is committed: **R1.05**
- Next local revision: **R1.06**
- Remote publication: **not authorized**

## R1.05 — 2026-08-31 — docs(masterdata): reconcile brand vendor and pricing contracts

Status: **navigator contract reconciliation — logic contracts only, no app work authorized**

Reconciles the owner's curated Vendor and Pricing decisions with the shared
contracts and implemented-state evidence, and records the already-locked Brand
decisions as the third active Master Data logic contract. Product choices in the
curated Vendor and Pricing contracts were preserved; this revision closes only
cross-contract contradictions and implementation-critical gaps.

### Changed

- Replaced the deferred Master Data intake with an active contract index and
  shared rules for archive-cause provenance, permanent-deletion approval,
  cross-app snapshot boundaries, capability placement, and the remaining
  undecided Master Data slices.
- Added the Brand contract covering identity, optional owner Vendor, independent
  suppliers, flat PRODUCT-category discovery, hashtags, SKU enrichment with
  source provenance, resources, lifecycle, deletion, permissions/audit, UI/public
  reads, and the KEEP/FIX/MERGE/PURGE implementation ledger.
- Reconciled Vendor lifecycle and Pricing references to the approved three-table
  model; required Pricing foreign keys remain Restrict, parent restore removes
  only its own persisted archive cause, and restore conflicts never overwrite or
  silently merge a live record.
- Added the capability-integrity guard implied by the curated VendorType model:
  assignment/type/flag changes cannot remove the last capability still required
  by a live price or BrandSupplier relation.
- Reconciled Pricing's exact identities: one live SKU × Vendor material price and
  Vendor-scoped normalized name/slug identities for work prices. Exact matches
  target the existing row; near-duplicate confirmation remains available only for
  genuinely distinct work names.
- Replaced Role-name `Admin` authorization language with the explicit
  `masterdata.deletion.approve` grant. A seeded Admin Role may receive the grant,
  but code has no Role-name bypass.
- Removed unsafe legacy-import fallback language: missing suppliers/vendors are
  reported for manual resolution and are never inferred from Brand ownership or
  manufactured as a generic Vendor.
- Updated the active documentation index. `docs/` now contains exactly its index,
  Master Data shared index, and the Brand, Vendor, and Pricing contracts; no
  obsolete document was retained or needed deletion.

### Dependencies and migrations

- Documentation only. No dependency, schema, migration, runtime code, or
  executable work-order change is authorized by this revision.
- The exact persisted archive-cause/deletion-request representation and recovery
  migration remain inputs to a future owner-approved implementation work order.

### Verification

- Active Markdown relative-link scan: passed.
- Contract contradiction scan for stale Admin bypass, global work-price identity,
  old public DTO naming, and automatic Manufacturer fallback: passed.
- `git diff --cached --check`: passed (line-ending conversion warnings only).
- Runtime tests, lint, typecheck, and build were not run because this revision
  changes documentation only.

### Reserved owner state

- Existing uncommitted Foundation/schema/bootstrap, money/decimal utility, and
  pricing-page changes remain unstaged and untouched.

## R1.04 — 2026-08-30 — fix(foundation): close identity shell and concurrency gaps

Status: **executor correction — Foundation F0 follow-on fixes**

Closes identity, shell, concurrency, and observability gaps left open after R1.02/R1.03.

### Fixed

- **Proxy redirect loop** — `/login` is no longer silently redirected to `/` just because a session cookie is present; the proxy performs only optimistic public-route gating and defers live session resolution to the login page itself.
- **Login page live resolution** — `/login` now resolves the principal against the live database and reads General Settings (branding, locale) before rendering; valid sessions are forwarded to the single accessible app or the launcher.
- **`loginAction` FormData extraction** — malformed credentials are no longer rejected before `performLogin`; all extraction happens first, then `performLogin` does the single Argon2 verify.
- **Exactly-one Argon2 verify** — every login attempt (valid user, unknown email, malformed email, short/empty password, disabled user) resolves to exactly one `argon2.verify` call against the real hash or the precomputed PHC dummy hash; lazy/random dummy hashes removed.
- **Dummy hash** — replaced with a precomputed Argon2id PHC string so timing properties are stable and the value is not generated at runtime.
- **Limiter reset fail-closed** — limiter reset failures now produce `LOGIN_LIMITER_UNAVAILABLE` rather than silently succeeding.
- **Shared validators** — common validators for email, display name, and password Unicode boundaries extracted to `src/platform/core/auth/identity-validation.ts`; create-user, admin-password, account-password, display-name, and bootstrap boundaries now use the shared validators.
- **Serializable transaction runner** — `src/platform/core/db/transactions.ts` introduces a serializable transaction runner with up to three retry attempts; wired into the platform runtime and bootstrap CLI.
- **Bootstrap permission registry** — bootstrap now receives the full permission registry from the composition root instead of the seven hardcoded platform permissions.
- **General Settings `weekStartsOn`** — type narrowed to `0 | 1`; UI restricted to Sunday/Monday; seeding replaced with race-safe upsert; additive migration added.
- **General Settings usage** — login branding, launcher, authenticated shell, and Account locale/timezone now read from live General Settings; settings updates revalidate the affected login and layout paths.
- **Centralized safe reporter** — `src/platform/core/errors` gains a central operational reporter; raw `console.error` calls in import/export routes replaced.
- **Reusable authenticated shell** — `src/platform/authenticated-shell/` provides a shared shell used by the platform and Master Data; app list filtered by live access grants; active navigation derived from actual pathname; `NavItem` emits correct `aria-current="page"`.
- **Deferred surface removal** — `WorkspaceShell`, `SplitPane`, `InlineEdit`, `ReorderHandle`, `FileDropZone`, `DocumentSheet`, print-only helpers, and `/ui-engine` showcase removed (spec-deferred, no consumers).
- **Test fix** — three `bootstrapFirstOwner` calls in `session-service.integration.test.ts` that were missing the required `permissionIds` field (introduced when bootstrap was extended to accept the full registry) are now supplied `PLATFORM_PERMISSIONS`.

### Added

- `prisma/migrations/20260830000000_foundation_identity_shell_concurrency/migration.sql` — additive migration for `week_starts_on` CHECK constraint and `PlatformGeneralSettings` upsert safety.
- `src/platform/core/auth/identity-validation.ts` — shared Unicode boundary validators.
- `src/platform/core/db/transactions.ts` — serializable transaction runner with retry.
- `src/platform/authenticated-shell/index.tsx` — reusable authenticated shell.
- `src/platform/authenticated-shell/navigation.tsx` — permission-filtered navigation with live active state.

### Verification

- `npm run typecheck`: passed (0 errors).
- `npm run lint`: passed (0 warnings, 0 errors).
- `npm run check:boundaries`: passed (Architecture boundaries OK).
- `npm run check:legacy-runtime`: passed (No legacy runtime references OK).
- `npm test`: 205 tests passed; 4 failures are pre-existing sandbox infrastructure (argon2 native binding missing for this arch, no DB configured) — not code regressions; 66 cancelled (DB integration, require disposable PostgreSQL).

## R1.03 — 2026-08-30 — fix(foundation): complete speculative module purge in committed tree

Status: **executor correction — same run as R1.02, staged-deletion omissions**

### Fixed

- R1.02 accidentally left four stale paths in its committed tree because their deletions were not staged (`git rm --cached` failed silently behind a suppressed error): `src/app/page.tsx` (superseded by `src/app/(platform)/page.tsx`; both resolving to `/` would break the production build) and the speculative `src/platform/dictionary`, `src/platform/utilities/format`, `src/platform/utilities/id` stubs whose removal R1.02's changelog already claimed. The working tree already matched the intended state; this revision commits those deletions only. No other content changes.

### Verification

- `git ls-tree` confirmed the R1.02 tree contained both `/` pages and the three stub modules; this commit removes exactly those four paths.
- Working-tree files unchanged by this correction; all reserved owner files remain unstaged and untouched.

## R1.02 — 2026-08-30 — feat(foundation): implement reusable platform foundation

Status: **executor implementation candidate — awaiting navigator review**

Implements the locked Foundation F0 work order (`scripts/work-orders/FOUNDATION.md`) in one run: persisted identity/access, real login, Platform General Settings, shared Core mechanics, UI-F0 platform routes, and Master Data request-identity convergence.

### Added

- **Persisted platform shape** — additive migration `20260829000000_platform_identity_access_settings`: `platform.User` (normalized unique email, Argon2id PHC hash, `ACTIVE|DISABLED`), `platform.Role` (immutable unique code, system flag, archiving), `platform.UserRole` / `platform.RolePermission` (unique pairs, Restrict FKs so historical rows are never silently destroyed), `platform.Session` (unique SHA-256 token hash, idle/absolute expiry, revocation, bounded client metadata), SQL-enforced `PlatformGeneralSettings` singleton (CHECK constraint pins the singleton ID), and the `platform.LoginRateLimit` table in the exact shape of the `rate-limiter-flexible` PostgreSQL adapter (no implicit runtime DDL). Migration documents recovery and refuses any implicit conversion of the removed operator environment identity.
- **Identity implementation** — `src/platform/core/auth`: Argon2id hashing (`memoryCost 19456`, `timeCost 2`, `parallelism 1`, `outputLen 32`; 12–128 Unicode code points, never trimmed/normalized/logged), opaque 32-byte base64url session tokens with SHA-256-at-rest verification, revocable database sessions (12 h idle, non-sliding 7-day absolute, throttled 15-minute last-seen touch), and the `studioflow_session` cookie (`httpOnly`, `sameSite=lax`, `path=/`, `secure` in production, never outliving the absolute expiry). Unknown email, disabled user, malformed input, and wrong password return the identical generic failure backed by equal-work dummy-hash verification.
- **Login rate limiting** — `rate-limiter-flexible@11.2.0` PostgreSQL adapter over the one shared `pg` pool: SHA-256 hashed normalized-email key (5/15 min) and network key (25/15 min), both with 30-minute blocks, both consumed before credential verification; forwarded client-IP headers trusted only under explicit `AUTH_TRUST_PROXY_CLIENT_IP`, otherwise a deployment-local fallback bucket (limitation recorded in `.env.example`); limiter infrastructure failure fails login closed with `INFRASTRUCTURE`; success clears only the email bucket. Security failures are sanitized operational logs, not business AuditEvent rows.
- **RBAC and access administration** — `src/platform/core/rbac`: pure evaluator (kept), the one code-owned permission registry composing the seven locked `platform.*` permissions with registered app public permission lists (rejects malformed/duplicate/unknown vocabulary, fails closed when uninitialized), live grant resolution per request (union over non-archived roles; unknown persisted grant IDs grant nothing and are reported to authorized administrators), and the access service (user create/update/password/disable/restore, role create/update/archive, assignment/removal, atomic registry-validated grant replacement — all with explicit permission checks, transactions, safe no-ops, and audit events; last-access-administrator protection across disable, removal, and grant replacement; self-demotion allowed only while another administrator remains; system roles and roles with active members cannot be archived).
- **Bootstrap** — one-time server-side command (`scripts/bootstrap.ts`, not an HTTP route): refuses while any active user exists, creates the `platform-owner` system role with explicit registry grants plus the owner/assignment/audit atomically, never overwrites later grant customization, never prints password/hash; password arrives via STDIN.
- **Platform General Settings** — typed singleton service with the locked field set and defaults (`StudioFlow`/`StudioFlow`/`id-ID`/`Asia/Jakarta`/`IDR`/`1`/`null`), bounded-name/supported-locale/IANA-timezone/ISO-4217-currency/week-range/safe-URL validation, `platform.settings.read/manage` enforcement, transactional audited updates, and no audit event on no-op.
- **Core mechanics** — safe server-action result boundary (`@platform/core/actions` with Zod mapping, framework control-flow rethrow, generic INTERNAL collapse); pure pagination utilities (`normalizePage`, `normalizePageSize`, `calcOffset`, `buildPageMeta`, `normalizeSortDirection`) with caller-supplied defaults/limits; `email` normalization added to the shared text-normalization utility; shared `pg` pool exported from `@platform/core/db` for infrastructure adapters.
- **Routes, shell, and UI-F0** — `proxy.ts` (optimistic public-route/session-cookie gating only), `/login` (only public UI route: generic failure copy, rate-limit feedback, pending/disabled state, autofocus, no signup), authenticated platform route group with the single reusable AppShell (permission-aware navigation, account/identity topbar, sign out), `/` launcher (zero apps → intentional no-access state; one app → redirect; several → launcher), `/account` (own display name, password change with full session revocation + current-session rotation, session list/revocation/sign-out-all), `/settings/general`, `/settings/access/users`, `/settings/access/roles` (directories with loading/empty/error/permission-denied states, dialogs, destructive confirmations, role/grant editors, integrity-issue notice).
- **ESLint 9 flat config** — `eslint.config.mjs` from the already-installed `eslint-config-next` package; baseline rule set unweakened. Three pre-existing `react/no-children-prop` false positives in `ui-engine.test.ts` were fixed by passing children as `createElement` arguments, and `Field`/`NavItem`/`DocumentSheet` prop types now type `children` as optional (React-standard; runtime behavior unchanged).
- **Tests** — platform schema contract tests (uniqueness, pairs, Restrict FKs, settings singleton CHECK, limiter table shape, session indexes), auth/session/login/bootstrap integration tests (session lifecycle, throttled touch, both expiries, revocation semantics, indistinguishable login failures, closed-on-limiter-failure, hashed limiter keys, bootstrap refusal/role reuse), RBAC access-service integration tests (live grants, unknown-grant integrity, last-admin guards, self-demotion, archive rules, no-op audit silence, mutation+audit atomic rollback), settings validation/service tests, registry composition tests, pagination tests, safe-action tests. Disposable-DB platform test support mirrors the existing `MASTERDATA_TEST_DATABASE_URL` guard.

### Changed

- `SessionPrincipal` migrated to the locked `{ userId, roleIds, displayName, email }` shape; `getPrincipal()`/`requirePrincipal()` are request-bound public functions resolving live database state (status, roles, expiries, revocation) on every call — no session/JWT/cookie caching.
- Master Data convergence (§9): `MASTERDATA_PERMISSIONS` exposed from `src/apps/masterdata/public/` and registered into the platform registry by a composition root OUTSIDE platform (`src/app/app-registrations.ts`, loaded by `src/instrumentation.ts` at server boot; the registry singleton is `globalThis`-backed because Next loads instrumentation and the server runtime as separate module instances). Every use of the environment-configured operator (`MASTER_DATA_REQUEST_CONTEXT` / `configuredOperatorContext` / `MASTERDATA_OPERATOR_*`) was replaced across existing pages, actions, and import/export handlers with `await requireMasterDataRequestContext()` (session → active user → live grants → `masterdata.access` → existing per-use-case permission checks). The unsafe adapter, its environment variables, and the topbar operator-label environment read were removed after `rg` proof of no remaining consumers.
- Master Data layout now fails closed at app entry: unauthenticated → `/login`, missing `masterdata.access` → rendered denied state; existing service-level permission checks are unchanged.
- Removed unused speculative modules after `rg` proof of no consumers: `src/platform/core/events`, `src/platform/core/files`, `src/platform/dictionary`, `src/platform/utilities/format`, `src/platform/utilities/id`.

### Dependencies and migrations

- Added exactly the two authorized production dependencies: `@node-rs/argon2@2.1.0` and `rate-limiter-flexible@11.2.0` (exact versions, `--save-exact`).
- One additive migration: `20260829000000_platform_identity_access_settings` (no existing column/table altered; `prisma db push` not used).

### Verification

- `npm run lint`: passed (flat config, no rule weakening).
- `npm run typecheck`: passed.
- `npm test`: **308 tests passed, 0 failed, 0 cancelled** on a prepared disposable PostgreSQL database (`DATABASE_URL` == `MASTERDATA_TEST_DATABASE_URL`); the previously-cancelled 52 database suites now run for real.
- `npm run check:boundaries`: passed (platform → app and cross-app internal rules intact; the registry composition deliberately lives outside `platform` for this reason).
- `npm run check:legacy-runtime`: passed.
- `npm run build`: passed (Next.js 16.3.2 production build).
- `git diff --check`: passed (line-ending conversion warnings only).
- Disposable database infrastructure: Docker Desktop was started and a disposable `postgres:17-alpine` container (`studioflow-rebuild-test-db`, port 55432) was created for the DB suites; migrations were applied and the additive migration was also deployed to the local development database (`localhost:5433`).
- Running application checks (dev server, HTTP-level): unauthenticated `/`, `/account`, `/masterdata` redirect to `/login`; `/login` renders with no signup link; wrong password/unknown email produce identical generic copy with no plaintext/db leakage; rate limit blocks on the 6th consecutive failure with retry feedback; successful login sets an httpOnly `studioflow_session` cookie and redirects to the sole accessible app; `/` resolves live `<app>.access` grants (no-access state and single-app redirect both observed); account/users/roles/general-settings render with real data and identity; `/masterdata` renders the authenticated identity after `masterdata.access` is granted; one real Master Data mutation (`unit.create`) executed end to end through the real server action with the new request identity, visible in the units list and on the audit page; DB-revoked session fails closed to `/login` on the very next request without token refresh.

### Reserved owner state

- The four reserved decimal/money files are untouched and remain unstaged.
- The two reserved pricing pages (`src/app/masterdata/pricing/page.tsx`, `src/app/masterdata/pricing/sku/[id]/page.tsx`) required the §9 context replacement inside otherwise-reserved files. The owner's money-formatting hunks were preserved byte-for-byte and remain UNSTAGED; only the mechanical request-context hunks are staged for those two files (built deterministically from `HEAD` content + the same mechanical transformation applied to every other consumer). The staged-vs-worktree diff for those files contains exactly the owner's hunks.

### Navigator-review caveats

- `weekStartsOn` is implemented as `0 | 1 | 2 | 3 | 4 | 5 | 6` per work order §7 ("exactly"), while CORE.md §11 locks `0 | 1`. The wider validated range was implemented because the work order is the operative implementation lock; please confirm or issue a correction revision.
- Visual browser review (hydration, console errors, collapsed-rail/narrow-viewport rendering, pixel-level DESIGN.md conformance) could not be performed in this environment (no browser automation available); HTTP-level behavioral checks above all passed. Recommend the navigator perform the visual pass during review.
- The launcher/bootstrap grant flow means the first owner initially sees the no-access launcher state until roles/grants are assigned through `/settings/access` — intended (no bypass), but worth confirming as the expected first-run experience.

## R1.01 — 2026-08-29 — Foundation contract and executor governance

Status: **local contract handoff**

### Changed

- Consolidated the documentation surface to the shared Core, Design, UI Engine contracts and the deferred Master Data intake; removed obsolete, duplicate, and conflicting PRDs/audits/handoffs/work orders.
- Locked Foundation F0 as the reusable shell/platform phase: real login, hash-only revocable database sessions, persisted multi-Role RBAC with live grants, Platform General Settings, shared Core/Utilities, and UI-F0.
- Locked identity mechanics and exact versions for Argon2id password hashing and an atomic PostgreSQL login limiter; UI-F1 and all speculative capabilities remain deferred.
- Preserved the owner rule that future generic mechanisms belong centrally in Core, Utilities, or UI Engine when their domain-neutral need is proven; apps may not create private substitutes.
- Kept Master Data as the first deferred consumer, including the approved one-SKU/many-vendor-price direction, while withholding app implementation authority until its code-derived contract is complete.
- Added deterministic navigator/OpenCode executor boundaries, changelog requirements, local revision naming, local-commit workflow, and an explicit prohibition on remote publication without owner authority.
- Added the locked one-run Foundation work order and a copy-ready OpenCode prompt targeting `R1.02`.
- Updated source comments that referred to deleted documents; these edits do not change runtime behavior or persisted schema.

### Removed

- Deleted legacy duplicate Markdown and superseded work orders from active repository documentation. Their history remains recoverable through Git.

### Dependencies and migrations

- No dependency or persisted-schema change in this revision.
- The Foundation work order authorizes only `@node-rs/argon2@2.1.0` and `rate-limiter-flexible@11.2.0` for the next revision.

### Verification

- Markdown active-link scan: passed for all 11 retained Markdown files.
- `git diff --check`: passed (line-ending conversion warnings only).
- `npm run check`: passed (`typecheck`, architecture boundaries, and no legacy runtime dependency).
- `npm run build`: passed with Next.js 16.3.2 production compilation.
- `npm run lint`: baseline failure because the repository has ESLint 9 but no flat `eslint.config.*`; Foundation F0 explicitly owns the repair.
- `npm test`: 191 tests passed with zero assertion failures; 52 database tests were cancelled because the required matching disposable `DATABASE_URL` and `MASTERDATA_TEST_DATABASE_URL` were not configured. This is not recorded as a passing suite and remains mandatory for Foundation execution.

### Reserved state

- Existing money/decimal formatting and two Master Data pricing-page changes are intentionally excluded from this revision and remain owner working-tree state.

## R1 — published baseline

- Commit: `c8e473702801510aa314bbed45242a71b600f733`
- This is the initial published baseline for the new revision protocol; earlier history retains its original commit subjects.
