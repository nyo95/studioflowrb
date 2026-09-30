# Active Plan

Plan ID: WO-PLAT-PREFS-01
Scope: Platform — per-person preferences (theme, personal date/number locale and timezone, start page) with server-side storage and validation, the effective display settings for the signed-in person, and a read-only storage usage report for administrators. Backend and minimal wiring only; the Lead builds the "My Preferences" screen, theme switching, start-page redirect and the Storage page afterwards.
Target revision: R8.249
Status: COMPLETE (implemented R8.249, reviewed R8.250 with one correction; browser acceptance in the acceptance backlog)
Priority: P2
Owner: owner (Product Owner). Settings structure approved 2026-09-30: "My Preferences (per user)", General Settings (Platform, then one group per app), each app keeps one Settings entry. The first content of My Preferences (theme, start page, personal timezone/date format) and a Storage page were proposed by the Lead and accepted ("setuju"). Details below are Lead defaults open to the owner's veto.
Last updated: 2026-09-30

## Outcome

Every signed-in person can save a few personal preferences that follow them across devices, and the app shows dates and times in their own timezone and format when they set one (falling back to the studio-wide General Settings when they do not). An administrator can see how much of the storage disk is used, by area, and how much is free.

## Context and Evidence

- Platform settings today: `src/platform/core/settings/index.ts` (`PlatformGeneralSettings` with `locale` and `timezone`, `isSupportedLocale`, `isSupportedTimezone`, validation and audit); the shell provides them to the UI through `DisplaySettingsProvider` (`src/platform/authenticated-shell/display-settings.tsx`, `index.tsx`), read in `src/app/(platform)/layout.tsx`.
- Users: `model User` in `prisma/schema/platform.prisma`; account page `src/app/(platform)/account/`. Auth helpers `requirePrincipalGrants` / `requirePrincipal` in `@platform/core/auth`.
- Storage: `src/platform/infrastructure/storage/` (local filesystem adapter, `storage-root.ts`, free-space guard added in R8.240 with `STORAGE_MIN_FREE_BYTES`, default reserve 2 GB); private objects live under `<root>/private-assets/`, public brand marks under `<root>/public-assets/`. Keys are prefixed by owner area, for example `studioflow/deliverables/<project>/…`, `messenger/…`.
- The shared settings sidebar and page pattern: R8.247 (`src/app/(platform)/settings/settings-navigation.tsx`). The Lead adds screens there; the Executor adds none.

## Locked Decisions

- **Storage of preferences:** one row per user in the platform schema (`user_preference`, keyed by `user_id`, `ON DELETE CASCADE` from the user), typed columns, all nullable meaning "use the default": `theme` (`SYSTEM` | `LIGHT` | `DARK`; null = system), `locale` (nullable, must pass `isSupportedLocale`), `timezone` (nullable, must pass `isSupportedTimezone`), `start_page` (nullable path), `updated_at`. No JSON blob. Additive migration; apply to dev and test databases.
- **Start page:** must be `/` or an application root path from the permission registry (`getPermissionRegistry().apps[].rootPath`) that the person currently has access to; anything else is refused with a plain error. Stored as the path; the Lead does the redirect.
- **Who may read/write:** only the signed-in person, only their own row. No new permission id. No audit event for preference changes (personal, low value); a validation failure never echoes raw input.
- **Effective display settings:** a read helper returns `{ locale, timezone }` = the person's values when set, otherwise the platform General Settings values; the (platform) layout passes these to `DisplaySettingsProvider` instead of the platform values. Server-rendered dates must use the same effective values wherever the code already reads the platform settings for the signed-in request (account sessions table, and any other place found in one search of `readPlatformGeneralSettings` used for display); do not refactor unrelated callers.
- **Theme is UI-owned:** the backend stores and returns `theme`; applying it (attribute on the document, no flash) is the Lead's next revision. Do not add a theming implementation here.
- **Storage usage report (read-only):** `getStorageUsage({ grants })` in platform (permission `platform.settings.read`), returning `{ totalBytes, freeBytes, minFreeBytes, groups: [{ prefix, files, bytes }], generatedAt }`. `groups` come from walking the private-assets root grouped by the first key segment (e.g. `studioflow`, `messenger`) plus one `public-assets` group; the platform must not import any app. Bound the walk (skip symlinks, cap at a fixed number of files with a `truncated` flag), and cache the result in memory for 60 seconds. `totalBytes`/`freeBytes` come from `fs.statfs` on the storage root; `minFreeBytes` is the configured reserve.
- **Non-goals guardrails:** no notification preferences (email/push do not exist), no per-app preference framework, no changes to General Settings behavior, no UI screens, no new dependency.

## Business Rules and Architecture Constraints

- Platform owns this; apps do not read the preference table directly. Only the effective display settings are exposed to the shell.
- Validation reuses the existing locale/timezone validators; do not duplicate lists.
- Reads must not make an unauthenticated request succeed; a person with no row gets defaults, and a row is created lazily on first save (upsert).

## Backend Contract

- `preferences.get({ userId })` → `{ theme: "SYSTEM"|"LIGHT"|"DARK", locale: string|null, timezone: string|null, startPage: string|null }`.
- `preferences.update({ userId, grants, ... })` upserts the given fields (a field explicitly `null` clears it), validating each as above.
- `preferences.resolveDisplay({ userId })` → `{ locale, timezone }` effective values.
- `getStorageUsage({ grants })` as above.
- Server actions for the account area: `updateMyPreferencesAction`, `getMyPreferences` read for pages; storage usage read for a page (the Lead builds both screens).

## UI Contract

The Executor adds no screen. It only makes sure the layout uses the effective display settings and that the actions and reads above exist and are tested. Layout, copy, theme application, start-page redirect and the Storage page are the Lead's.

## Boundaries and Non-goals

- Do not touch legacy or any legacy database. Do not change the roles/permissions vocabulary. No Master Data, BQ or StudioFlow domain changes.

## Acceptance Criteria

- A person can save and clear each preference; invalid locale, timezone and unauthorized or unknown start pages are refused with plain errors; one person cannot read or change another person's row.
- With a personal timezone set, a date rendered through the shell provider uses it; with none, it uses the platform value (test at the helper and provider-input level).
- The storage usage report returns correct per-prefix totals for a fixture directory, marks truncation, ignores symlinks, is cached for 60 seconds (injectable clock), and refuses a caller without `platform.settings.read`.
- Migration applies on a database that already has users without data loss; deleting a user removes their preference row.
- `npm test`, `npx tsc --noEmit`, `npm run check`, eslint on touched folders pass; `npm run build` only if the owner dev server is stopped (otherwise report it as not run).

## Verification

Executor: unit tests for validation and the effective-settings helper, integration tests against the disposable test database for the upsert/clear/ownership rules and cascade, and tests for the storage usage walk with a temporary directory. Record any skipped check as not passed.

## Reviewer Acceptance

Lead after the commit: build the My Preferences screen and Storage page, save each preference in the browser and confirm the display changes; view the storage report against the real folder.

## Regression Risks and Recovery

- The layout change touches every page's date display; the fallback to platform values when no preference exists must be covered by a test.
- Recovery: revert the revision; the extra table is unused.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the entire READY backend outcome and nothing beyond it. Inspect current repository evidence, preserve unrelated owner work, make sound in-scope implementation decisions, run the required checks, update `CHANGELOG.md` (next revision R8.249), and create the target local revision commit. Stop only for a material locked-decision conflict or unsafe boundary, using the BLOCKED / CONFLICT report; otherwise finish the coherent outcome and report the commit, checks, limitations, and remaining unrelated dirty files.
