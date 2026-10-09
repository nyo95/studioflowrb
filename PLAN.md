# Active Plan

Plan ID: WO-MODULES-M1 (module registry, runtime switch, System Owner command)
Scope: Platform module foundation; StudioFlow Ideas Board and Presentation gated as optional modules
Module(s): platform (new module registry), studioflow, ideas, presentation
Target revision: next unused after R8.494 (check `CHANGELOG.md`)
Status: READY (correction pass after R8.495 review; see "Review of R8.495")
Priority: P1
Owner: owner decision 2026-10-09, `docs/apps/platform/MODULES-DECISION.md` (read it first)
Last updated: 2026-10-09 (Lead, R8.497 dependency rule locked)

WO-AUDIT-FIX-01 is done (R8.490-R8.492, Lead executed at the owner's request).

## Outcome

1. Every module has a manifest and is registered at boot: `platform` is implicit;
   `studioflow`, `masterdata`, `bq` are `core`; `ideas` and `presentation` are
   `optional` with `parent: "studioflow"`, `requires: ["studioflow"]`.
2. Platform stores each optional module's state (`ENABLED` / `DISABLED`) and the
   version it last ran with. With no stored row a built-in optional module is
   `ENABLED`, so the office loses nothing on upgrade.
3. Disabling `ideas` or `presentation` hides its nav entries and in-page entry
   points, makes its pages not-found, makes its server actions refuse with
   `MODULE_DISABLED`, and keeps all its data. Enabling it brings everything back.
4. Only the System Owner command on the server changes state:
   `npm run studioflow -- module list | enable <id> | disable <id>`; each change
   is audited with a `system` actor. No HTTP route, no server action, no RBAC
   permission can change module state.
5. The `platform-owner` role is displayed as "Company Administrator"
   (display name only; its code, grants and data stay).

## Context and Evidence

- Registry today: `src/platform/core/rbac/registry.ts` (`RegisteredApp`,
  `composePermissionRegistry`, `initializePermissionRegistry`), fed by
  `src/app/app-registrations.ts` from `src/instrumentation.ts` and
  `scripts/bootstrap.ts`.
- App entry gate example: `src/app/(platform)/studioflow/layout.tsx`.
- Ideas: `src/apps/studioflow/ideas/**`, routes `src/app/(platform)/studioflow/ideas/**`,
  nav `src/apps/studioflow/public/nav.ts` ("Ideas"), entry points elsewhere
  (e.g. "add to ideas / moodboard" in `notes-workspace.tsx`). Presentation:
  `src/apps/studioflow/presentation/**`, routes under
  `projects/[projectId]/presentation/**` and `(document)/studioflow/print/.../presentation/**`,
  `STUDIOFLOW_ROUTES.projectPresentation*`. Find every caller; the list above is
  a start, not complete.
- CLI precedent: `scripts/bootstrap.ts` (server-side operator tool, own Prisma
  client, audit writer, transaction runner).

## Locked Decisions

1. Manifest type lives in Platform (`src/platform/core/modules/`, a new Platform
   capability: ADD, domain-neutral). Fields: `id` (APP_ID_PATTERN), `name`,
   `version` (strict semver string), `kind: "core" | "optional"`, `parent?`,
   `requires: string[]`. Validation at boot fails loudly on: duplicate id, bad
   semver, unknown `parent`/`requires`, a cycle, a `core` module with a parent.
2. The existing app registrations gain `version` and `kind` (EXTEND, do not fork
   the registry). `ideas` and `presentation` are module registrations without a
   launcher tile and without their own permissions (they keep using
   `studioflow.*` permissions). Their manifests are exported from
   `src/apps/studioflow/public/`. Versions start at `1.0.0` for every module.
3. New table `platform.module_state` (`module_id` PK, `state` enum
   ENABLED/DISABLED, `last_version`, `updated_at`, `updated_by` text). A state
   row for a `core` module is refused. `last_version` is written at boot when it
   differs (no migration logic yet).
4. Read API in Platform: `isModuleEnabled(id)` and `requireModuleEnabled(id)`
   (throws `AppError` code `MODULE_DISABLED`, mapped like other refusals),
   cached per request at most; a disabled parent disables its children.
   Gates: page/layout → `notFound()`; server action and route → refuse; nav and
   entry points → hidden via a list of enabled module ids passed to the shell.
   StudioFlow must not import Platform module internals beyond the public API.
5. System Owner rights are **not** permissions: do not add anything to
   `PLATFORM_PERMISSIONS` or any app permission list for modules. The command
   is `scripts/studioflow.ts` (`npm run studioflow -- …`), same client/audit
   pattern as `scripts/bootstrap.ts`; audit action `platform.module.enabled` /
   `platform.module.disabled`, actor `{ kind: "SYSTEM", label: "system-owner-cli" }`
   (the existing `AuditActor` shape in `@platform/core/audit`).
6. Display rename: role name "Platform Owner" → "Company Administrator" for the
   bootstrap-created role (new installs) plus a data migration renaming the
   existing row's `name` only where `code = 'platform-owner'`.
7. No entitlement, no license, no build profiles, no data move of Ideas or
   Presentation in this plan.

## UI Contract

Executor: hide nav/entry points from the enabled-module list and return
not-found; no new screens. Lead afterwards: a read-only "Modules" section under
Settings (name, version, state, "changed only by the System Owner").

## Boundaries and Non-goals

No change to Ideas/Presentation behavior while enabled; no schema move; no new
dependency; no UI toggle; `check:boundaries` gains one rule: a module manifest's
`requires` must match the module's actual cross-app imports (add fixtures), or,
if that is disproportionate, stop and say why.

## Acceptance Criteria

- Boot fails with a clear error for each invalid manifest case (unit tests).
- Integration: default state ENABLED; `disable ideas` → Ideas page not-found,
  Ideas actions refuse `MODULE_DISABLED`, Ideas cards and usages still in the
  database; `enable ideas` → back. Same for `presentation` (board page and print
  route). Disabling `studioflow` is refused (core). A Company Administrator with
  every permission cannot change module state through any action or route
  (assert there is none: the RBAC vocabulary has no module permission).
- CLI: `list` shows id, version, kind, state; enable/disable write one audit row each.
- Role rename migration leaves code and grants unchanged.

## Verification

`npm run typecheck`, eslint, `npm test`, `check:boundaries`,
`check:legacy-runtime`, `prisma migrate` on a disposable rebuild-only database,
the Playwright specs that touch Ideas and Presentation with both modules enabled
(nothing may change for users).

## Reviewer Acceptance

Lead: disable Ideas from the command, see the nav entry and the "add to ideas"
entry points disappear and the page 404; enable it and see the cards again.

## Review of R8.495 (`99fdaaa`) — CORRECTION REQUIRED

Accepted as the foundation (keep, do not rewrite): manifest type and boot
validation (`src/platform/core/modules/manifest.ts`, all Locked Decision 1 cases
tested), `version`/`kind` on registrations, `platform.module_state` migration and
role display rename, `isModuleEnabled`/`requireModuleEnabled`/`enabledModuleIds`
with parent/requires cascade, boot `last_version` sync, the
`scripts/studioflow.ts` command with serializable transaction and one `SYSTEM`
audit row, core refusal, no new permission.

Not accepted — the plan asked for the whole outcome in one revision; the
Executor split it into "M1a" without a BLOCKED report. Findings, all fixed in
one correction revision:

1. **[High] Outcome 3 missing.** No Ideas/Presentation page, layout, print
   route, server action, nav or in-page entry point is gated. Expected: every
   one gated per Locked Decision 4 (page/layout/print → `notFound()`; action and
   route → `requireModuleEnabled` → `MODULE_DISABLED`; nav and entry points
   hidden from `enabledModuleIds()` passed down from the StudioFlow layout).
   Find callers by grep (`ideas`, `moodboard`, `projectPresentation`,
   `presentation/` imports); the list in Context is a start.
2. **[High] Manifests lie about dependencies.** `MODULE_MANIFESTS` gives every
   core app `requires: []`, but `bq` and `studioflow` import
   `@/apps/masterdata/public` (e.g. `src/apps/bq/runtime.ts`,
   `src/apps/studioflow/runtime.ts`). Expected: core manifests declare their real
   `requires` (registration field, not derived as empty), and the planned
   `check:boundaries` rule (manifest `requires` ⇔ actual cross-app `public`
   imports, with fixtures in `scripts/test-boundaries-checker.mjs`) exists and
   passes. Cross-app imports from tests may be ignored by the rule.
   **Locked after Executor BLOCKED (R8.497):** `requires` means "cannot run
   without": a runtime capability or data dependency, not a link. Masterdata's
   `sample-request-notifier.ts` imports `STUDIOFLOW_ROUTES` only to build a URL,
   so it is a link, not a requirement. Rule, per app directory `src/apps/<A>`
   (non-test files): an import from `@/apps/<B>/public…` with B ≠ A counts as a
   requirement unless it is a **link import** — its source is
   `@/apps/<B>/public/nav`, or every imported specifier name ends in `_ROUTES`.
   Each counted B must be in A's `requires`, and each entry in A's `requires`
   must be justified by at least one counted import (⇔). Expected result today:
   `masterdata: []`, `bq: ["masterdata"]`, `studioflow: ["masterdata"]`; no
   cycle; the R8.495 cycle rejection stays unchanged. `ideas`/`presentation`
   live inside `src/apps/studioflow` and are not checked by this rule. Fixtures:
   a counted import without `requires` fails, a `requires` without an import
   fails, a `public/nav` import and a `*_ROUTES`-only import pass.
3. **[Medium] Nothing stops app code from calling the state writer.**
   `src/platform/core/modules/admin.ts` is importable from any server action.
   Expected: a `check:boundaries` rule that only `scripts/**` and
   `src/platform/core/modules/**` (incl. tests) may import `modules/admin`, with
   a failing fixture.
4. **[Medium] Acceptance tests missing.** Required: an integration test on the
   disposable test DB (default ENABLED; disable ideas → state row + one audit
   row, data rows untouched; enable → back; disable studioflow refused; same for
   presentation) and an assertion that no registered permission id mentions
   `module` (the RBAC vocabulary has no module permission).
5. **[Low] `next-env.d.ts` committed in its build form** (`.next/types/...`);
   `next dev` will rewrite it to `.next/dev/types/...` and dirty the tree. Restore
   the dev form in the correction commit; never commit the build form.

Environment note (not a defect): the home development database still lacks
`20261009170000_platform_module_state`; boot now reads `module_state`, so
`next dev` against it fails until it is migrated. Migrating the ordinary dev DB
is allowed for this plan only after verifying it is the rebuild-only target.

## Executor Prompt

You are the Backend Executor. Location: <rumah|kantor> (ask the owner if not
stated). Read `AGENTS.md`, `docs/agent/EXECUTOR.md`,
`docs/apps/platform/MODULES-DECISION.md` and `PLAN.md` (WO-MODULES-M1),
especially "Review of R8.495". R8.495 is accepted as the foundation; do not
rewrite it. In one local revision commit (next unused revision in
`CHANGELOG.md`), fix findings 1-5: gate every Ideas and Presentation page,
layout, print route, server action, nav entry and in-page entry point; give the
core manifests their real `requires` and add the two `check:boundaries` rules
(manifest requires ⇔ cross-app public imports; only scripts and
`platform/core/modules` may import `modules/admin`) with fixtures; add the
integration and no-module-permission tests; restore `next-env.d.ts` to its dev
form. No behavior change for users while both modules are enabled; no new
screens, permissions or dependencies. Database commands only against a verified
rebuild-only database. Stop with BLOCKED / CONFLICT if a gate needs a UX
decision (e.g. an entry point whose surrounding layout breaks when hidden).
Run the checks in Verification (including the Ideas and Presentation
Playwright specs), then reply with only a Planner/Reviewer prompt: commit,
checks with results, limitations, dirty files, and a request for verdict.
