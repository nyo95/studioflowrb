# Shared Utility Inventory (Foundation F-D / PF-6+PF-7)

Evidence-backed disposition ledger for shared, domain-neutral capabilities and
their app-owned duplicates. Owned by the Platform Foundation; created in
**R8.57** (F-D) and enforced by `scripts/check-boundaries.mjs`.

## How this is governed

- A generic capability has **one canonical implementation** with a public
  export and an explicit consumer matrix.
- Every capability is classified **REUSE**, **EXTEND**, **ADD**, **APP-OWNED**,
  or **PURGE**. `docs/roadmap.md` F-D was accepted in R8.59 after Reviewer
  browser evidence confirmed the changed date consumers.
- Apps may not create private substitutes for a canonical capability. A
  convergence candidate that is proven **identical** is merged into the
  canonical surface; a candidate with **different semantics** is recorded here
  as a deferral, never silently rewritten.
- The executable checker is the enforcement authority; this document is the
  durable reasoning record. When they disagree, the checker reflects implemented
  state and this file must be updated in the same revision.

## Canonical utility registry

| Utility | Canonical path | Public surface | Disposition | Representative consumers |
|---|---|---|---|---|
| Date/time display | `src/platform/utilities/date` | `formatInstant`, `formatDateOnly`, `isDateOnlyString`, `isIsoInstantString`, `currentDateOnly`, `diffDateOnlyDays`, `DEFAULT_DISPLAY_LOCALE`, `DEFAULT_DISPLAY_TIME_ZONE` | **REUSE** (`currentDateOnly`/`diffDateOnlyDays` **EXTEND**, R8.71: StudioFlow due-date labels and Today filters) | account page, BQ library page, StudioFlow catalogue table, Master Data brand/vendor/deletion directories, `ui_engine/components/formatted-instant.tsx`, `core/validation` |
| Decimal arithmetic | `src/platform/utilities/decimal` | `toDecimalString`, `isDecimalString`, `formatDecimal`, `compareDecimals`, `addDecimals`, `multiplyDecimals`, `divideDecimals`, `truncateDecimal`, `DecimalString` | **REUSE** | BQ service/calculation engine, Master Data pricing service and directory, `money`, `measurement`, `core/audit`, `platform/contracts` |
| Money | `src/platform/utilities/money` | `createMoney`, `formatMoney`, `isValidCurrencyCode`, `DEFAULT_MONEY_LOCALE` | **REUSE** | BQ project pages, BQ library, Master Data pricing/SKU directories, BQ project editor |
| Normalization | `src/platform/utilities/normalization` | `normalizeText`, `normalizeEmail` | **REUSE** | `core/settings`, `core/auth` (login, identity-validation), Master Data unit service and shared service |
| Pagination | `src/platform/utilities/pagination` | `buildPageMeta`, `calcOffset`, `normalizePage`, `normalizePageSize`, `normalizeSortDirection`, `PageMeta` | **REUSE** | `ui_engine/patterns/pagination.ts` (`usePagination`) consumed by every directory |
| Slug | `src/platform/utilities/slug` | `toSlug` | **REUSE** | Master Data shared service (BRAND/SKU identity) |
| Measurement | `src/platform/utilities/measurement` | `calculateRectangleAreaSquareMeters` | **ADD** | Master Data shared service, pricing directory |
| People directory | `src/platform/core/rbac/people.ts` | `createPeopleDirectory`, `PersonSummary` (runtime: `peopleDirectory`) | **ADD** (R8.71) | StudioFlow PIC/assignee pickers and name resolution |
| Unit label display | `src/platform/utilities/unit` | `formatUnitLabel` | **ADD** (proven, pending consumer wiring) | its own test suite only; Master Data Units UI is the intended consumer plane |

### Recorded candidates (not yet shared)

- **Stepped sort order / sibling reorder** — StudioFlow checklist and checklist
  templates use `steppedSortOrders` (app-owned, `apps/studioflow/domain/checklist.ts`).
  BQ keeps its own ordering. Promote to `platform/utilities/ordering` only when a
  second app needs the same step-renumber semantics.
- **Drag-to-reorder list (`SortableList`)** — StudioFlow R8.71 uses explicit
  Move up/Move down menu actions instead. Add a UI Engine pattern once MOM or
  Schedule (SF-R2/SF-R3) needs drag reordering too.

## Duplicate convergence ledger

### Converged in R8.57 (behavior-identical, merged)

`formatInstant` styles `"date"` and `"datetime"` exactly reproduce the raw
`Intl.DateTimeFormat` options they replace: `dateStyle: "medium"` and
`dateStyle: "medium", timeStyle: "short"` with the same `locale`/`timeZone`
and the same instant input (conversion `Date -> toISOString()` is lossless).
Locked by `date.test.ts` "formatInstant display styles (shared by app
directories)". The four consumers merged in the same revision:

| File | Before | After |
|---|---|---|
| `src/app/(platform)/masterdata/brands/brand-directory.tsx` | raw `dateStyle medium + timeStyle short` on `updated_at` | `formatInstant(..., style: "datetime")` |
| `src/app/(platform)/masterdata/vendors/vendor-directory.tsx` | raw `dateStyle medium + timeStyle short` on `updated_at` | `formatInstant(..., style: "datetime")` |
| `src/app/(platform)/masterdata/deletions/deletion-directory.tsx` | raw `dateStyle medium + timeStyle short` on `requested_at` | `formatInstant(..., style: "datetime")` |
| `src/app/(platform)/bq/library/page.tsx` | raw `dateStyle medium` on `item.updatedAt` | `formatInstant(..., style: "date")` |

### Deferred convergence candidates (recorded, NOT merged — allow-listed in the checker)

Each is on the checker's `APP_DUPLICATE_PRIMITIVE_ALLOW_LIST` because its
semantics differ from `formatInstant` or its context is a proven app-owned
specialization. Removing a path from that allow list without moving the file
off the raw primitive fails `check:boundaries`.

| File | Reason for deferral |
|---|---|
| `src/apps/studioflow/service.ts` | `Intl.DateTimeFormat("en-CA")` used for deterministic date-only extraction to build a stable slug key, not for display; merging would change stored values |
| `src/app/(platform)/bq/project-deletion-review.tsx` | `"id-ID"` with no explicit time zone renders in the browser-local zone, deliberately (audit timestamp, zone-agnostic); `formatInstant` defaults to `Asia/Jakarta` |
| `src/app/(platform)/studioflow/page.tsx` | custom `dueFmt`/`headerFmt` options (weekday context) beyond the three supported styles |
| `src/app/(platform)/studioflow/[id]/page.tsx` | custom component-level formatters with distinct options (same pattern as above) |
| `src/app/(platform)/studioflow/[id]/files/page.tsx` | custom component-level formatter |
| `src/app/(platform)/studioflow/[id]/mom/[momId]/page.tsx` | `Intl.DateTimeFormat(undefined, ...)` intentionally formats in the viewer's locale without an app time zone |

If an upstream consumer ever needs one of these exactly, the correct move is to
**EXTEND** `formatInstant` (new style or option) and migrate the consumer, not
to unbundle the raw call.

### Examined and classified APP-OWNED or PURGE (no canonical merge)

- **Client-side pagination duplicates** in brand/vendor/category directories
  and pricing: their semantics differ from the canonical `buildPageMeta`
  (`pageCount` is `1` for an empty set here versus `0` canonical; local
  `min(page, pageCount)` clamp). **PURGE** merging; recorded instead. The
  canonical pagination surface remains `ui_engine/patterns/pagination.ts`.
- **Number/area/byte formatting** via `Intl.Collator`, `toLocaleString`, and
  `.toString` in app rows: app-owned display with no canonical equivalent.
- **Audit `action` strings and `AppError` codes** (e.g. `studioflow.project.not-found`)
  are *not* permission IDs even though they share the `owner.segment.segment`
  shape. The permission-vocabulary checker therefore only inspects the
  `*_PERMISSIONS` maps and known permission-consumption call sites and cannot
  false-positive on error codes or audit actions.

## Executable boundary rules (check:boundaries)

| Rule | Enforced by | What it guarantees |
|---|---|---|
| `app -> other-app/<internal>` | collected for app and route-lane importer files | cross-app imports only via `<app>/public` |
| `platform -> app` | collected for platform files | platform never imports app code |
| `core -> ui_engine`, `core -> infrastructure` | collected for `src/platform/core` files | core stays UI- and persistence-agnostic |
| `app -> ui_engine/<internal>` | collected for app files | apps reach the UI Engine only via `@/platform/ui_engine` |
| `app -> raw legacy ui-* class` | collected for app `.tsx` classes | no legacy `ui-*` token can bypass a canonical component |
| permission vocabulary SSOT | collected for `*_PERMISSIONS` maps, registrations, and consumption literals | disjoint, appId-prefix-owned vocabulary; composition root imports maps from app public via `Object.values(...)` |
| app route ownership | collected for `nav.ts`, `app-registrations.ts`, and `src/app/(platform)/<app>` | every app owns `/app` route root, client-safe nav constants, and a matching registration |
| app-local duplicate primitive | collected for raw `new Intl.DateTimeFormat(` in app-owned files | new raw display formatters fail the build unless explicitly allow-listed here |
