# Active Plan

Plan ID: F-B-APP-OWNERSHIP-NAVIGATION-R8-CORRECTION
Scope: Application permission ownership, registration metadata, route helpers, and navigation definitions
Status: CORRECTION REQUIRED
Priority: P1
Owner: Repository owner
Target revision: R8.40
Last updated: 2026-09-14

## Outcome

Complete F-B / PF-2 + PF-3. Each app owns its permission vocabulary and public
registration metadata; the central composition root only combines public app
metadata and must not define app permission policy. Route helpers and
navigation definitions must have one clear owner per app, while existing route
URLs and behavior remain unchanged.

R8.36 completed only the permission-vocabulary and metadata portion. Route
helpers, navigation ownership, and their browser/regression evidence remain
open and are required for acceptance.

R8.38 also exposed KB-029: BQ registers a permission owned by Master Data,
causing the registry to reject the app set at dev boot. Correct ownership and
add a boot regression test before accepting F-B.

## Context

- PF-1 local storage was accepted in R8.34.
- `src/app/app-registrations.ts` currently contains the permission arrays for
  Master Data, BQ, and StudioFlow, so permission ownership is still centralized.
- The roadmap sequences F-B before StudioFlow recovery discovery and before UI
  Engine/utility curation.
- This is Foundation work only; it does not redesign StudioFlow routes, add
  features, create a plugin framework, or change persisted RBAC behavior.

## Locked decisions

- **Ownership:** Master Data, BQ, and StudioFlow each own and export their
  canonical permission vocabulary. Core owns only domain-neutral registration,
  authorization interfaces, and evaluation helpers.
- **Composition:** The central registration file imports public app metadata,
  route roots, and permission lists; it does not duplicate, edit, or invent
  app permissions.
- **Routes:** Preserve every existing URL and access result. Add or reuse
  app-owned route helpers only where current code has duplicated route strings.
  No route redesign or redirect policy change is allowed.
- **Navigation:** Each app owns its navigation definition. The shell consumes
  public metadata and filters by existing grants; it must not contain hidden
  app-specific navigation policy.
- **Security:** Existing permission names, grant checks, and unauthorized
  behavior remain intact. Rename or semantic change requires owner approval.
- **Boundaries:** `app -> platform` remains allowed; platform must not import
  app internals; cross-app internal imports remain forbidden.
- **Scope:** No database migration, role redesign, new dependency, plugin
  framework, or StudioFlow feature implementation.

## Acceptance criteria

1. Master Data, BQ, and StudioFlow each have one canonical public permission
   vocabulary consumed by their own policy and by central registration.
2. `src/app/app-registrations.ts` contains composition metadata only; no
   duplicated app-owned permission literals remain there.
3. Each app has one public route/navigation definition where needed, with no
   duplicate conflicting route ownership.
4. Existing launcher, sidebar, login redirect, route access, and unauthorized
   behavior remain unchanged for all three apps.
5. Tests prove registration completeness, permission consistency, navigation
   visibility by grant, route helper output, and boundary rules.
6. No new cross-app internal import, Core-to-app dependency, database change,
   or permission semantic change is introduced.
7. Typecheck, lint, full tests, boundary check, legacy-runtime check, and
   production build pass. Browser smoke covers launcher/navigation and one
   authorized plus unauthorized route per app.
8. Executor updates `CHANGELOG.md`, stages only owned files, verifies the
   staged diff/whitespace, and creates local revision R8.40.

## Risks and recovery

The main risk is silently changing permission meaning or navigation visibility.
If an app's current vocabulary or route ownership is ambiguous, stop and
report the exact conflict instead of inventing a name or changing behavior.
Revert only the local correction commit; do not touch unrelated owner files.

## Executor Prompt

You are the Executor. Location: rumah. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this `PLAN.md`. Implement the complete F-B / PF-2
+ PF-3 outcome within the locked ownership, route, security, and boundary
decisions. Complete the remaining route-helper and navigation ownership work,
preserve current URLs and behavior, run all required checks and browser smoke,
update the changelog, and create local revision R8.40. Stop for
any material ambiguity about permission meaning, route ownership, or security;
do not redesign StudioFlow or add a plugin framework.
