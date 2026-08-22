# 08 — Current Rebuild Status

Audit date: 2026-08-22
Role: PM / Technical Lead
Scope: rebuild repository plus targeted evidence from `../studioflow`

## Executive status

The rebuild is an architecture scaffold, not yet an operational application. The locked Category ownership and relation decisions are represented in documentation and as Prisma stubs, but Core, UI Engine, Master Data, and BQ application layers have not been implemented.

## Completed

- Modular target structure exists for Platform, StudioFlow, Master Data, and BQ.
- SSOT, data ownership, engineering conventions, and app PRDs exist.
- Manager-first delegation rules are recorded in `AGENTS.md`.
- Category decisions are locked and documented:
  - one `Category` table with `PRODUCT` and `WORK` kinds;
  - PRODUCT flat for MVP;
  - explicit `BrandCategory` discovery relation;
  - direct nullable `Sku.category_id` relation;
  - `search_synonyms` and `deleted_at` semantics;
  - BQ category snapshot contract.
- Category-related Prisma stubs exist for `Category`, `BrandCategory`, `Brand`, `Sku`, and `WorkPrice`.
- Basic source-boundary and legacy-location scripts exist.

## Partially completed

- Category schema is only a stub. There is no migration, no full Brand/SKU/WorkPrice shape, no generated client baseline, and no application enforcement for Brand/SKU rules.
- Pure utility migration is incomplete. `formatMoney`, `normalizeText`, and `toSlug` exist, but no migrated tests prove compatibility. The rebuild slug implementation also lacks the legacy canonical NFKD normalization behavior and is not yet approved as the platform contract.
- UI Engine implementation contains only minimal tokens and layout types. Its canonical shared contracts are now locked in `DESIGN.md` and `UI_ENGINE.md`; StudioFlow-specific components and domain-status inference remain explicitly excluded.
- Core implementation folders are still empty, but the minimum cross-app contract is now locked in `CORE.md`. Deterministic implementation is scoped by WO-005 through WO-009.
- Migration inventory was reconciled: the legacy category tree service is `REWRITE`, not a direct `MIGRATE`.

## Baseline defects

- `studioflow-rebuild` is now an independent Git repository on the initial `main` branch. No initial commit has been created yet.
- No dependency lockfile or local `node_modules` exists.
- `npm run typecheck` fails because React and its types are not installed locally.
- Prisma 7 validation fails because `datasource.url` is still in `schema.prisma`; Prisma 7 expects it in `prisma.config.ts`.
- No test runner/script exists in the rebuild.
- The current boundary checker only detects a narrow set of alias strings. It does not enforce platform-to-app prohibition, `@/apps/...` internal imports, or relative cross-app imports.
- `check:legacy` proves that the sibling repository exists; it does not prove absence of runtime imports or filesystem coupling.

## Legacy evidence classification

### Core

- DB client: **REWRITE**. Keep the Prisma 7 adapter/singleton/pool lessons; purge schema-specific delegate sentinels and legacy preflight tables.
- Auth/session: **REWRITE**. Credentials/JWT flow is evidence, but the rebuild identity model and route contract are not yet locked.
- RBAC: **MERGE/REWRITE**. Keep fail-closed access and pure permission evaluation patterns; purge legacy StudioFlow phase/PIC policy from Platform Core and do not copy the current role matrix without owner approval.
- Audit: **MERGE/REWRITE**. Keep generic audit envelope/infrastructure ideas; StudioFlow action vocabulary, phase queries, and undo behavior remain app-owned.
- Shared errors/validation/decimal/formatting: **AUDIT PENDING**. No coherent legacy platform package exists to copy.

### UI Engine

- Tokens and general page/container patterns: **MERGE** after a shared contract is approved.
- Page header, section card, table container, and generic shell composition: **REWRITE** against the new contract.
- Phase/project live providers, phase sections, project sections, project layout shell, and domain status inference: **STUDIOFLOW-LOCAL or PURGE from UI Engine**.
- UI implementation baseline is now approved as Tailwind CSS 4 plus accessible Radix-backed primitives, CVA where variants are justified, and Lucide icons. Legacy generated components remain evidence only and are not copied wholesale.

### Master Data / Category

- Generic category slug/path/input helpers: **REWRITE**, keeping only the three approved helpers.
- PRODUCT hierarchy constants/inference and ancestor dropping: **PURGE**.
- Category tree persistence: **REWRITE for WORK only** after the application contract is locked.
- Existing legacy tests are mixed suites; tests must be split by the module actually under test.

### BQ

- Calculation engine and snapshot behavior: **manager review required before classification** because calculation semantics are owner-gated.
- Master Data gateway: **REWRITE** to consume `masterdata/public` and the direct `Sku.category` relation.
- Legacy BQ already contains useful snapshot/readiness evidence, but it also assumes old schema fields and direct Master Data internals.

## Pending decisions

Only genuinely unresolved decisions are listed here.

1. Persisted identity implementation: authentication provider, user lifecycle/schema, canonical roles, and role grants.
2. Audit persistence schema, retention, and read/query policy.
3. Complete Master Data entity lifecycles, uniqueness, import/export, permission, and audit answers required by the Master Data PRD.

## Safe deterministic work

- WO-001: repair and lock the local toolchain baseline.
- WO-002: complete the approved pure Category helper extraction and split its tests.
- WO-003: strengthen dependency and legacy-runtime enforcement.

These work orders contain no new business, schema, pricing, or calculation decisions.

## Manager-only next work

1. Review deterministic Core executor output against locked `CORE.md`.
2. Review UI Engine executor output against the locked `DESIGN.md` and `UI_ENGINE.md` contracts.
3. Complete Master Data domain contracts before full schema/CRUD work orders.
4. Define the Master Data public read contract before BQ gateway implementation.
5. Review and freeze BQ readiness, snapshot creation, duplicate, refresh, and calculation contracts before any BQ schema/application migration.

## Recommended execution order

WO-001 toolchain baseline → manager Core contract lock → parallel deterministic lanes (Core implementation + WO-004 UI Engine foundation + WO-002 pure Category rules + WO-003 boundary enforcement) → manager review/convergence → Master Data domain/schema → Master Data public contract → BQ domain/schema/application → boundary and smoke tests.
