# Active Plan

Plan ID: WO-PLATFORM-MODULE-USER-ACCESS-01
Scope: Ideas Board becomes usable only by the users the Developer lists (D11 widened, 2026-10-23b).
Module(s): platform `core/modules` (EXTEND), `ideas` (gate wiring); StudioFlow shell/nav and note-image actions (consumers).
Target revision: plan R9.237 (Lead); backend + minimal wiring (Codex) R9.238; console wording and UI review (Lead) R9.239.
Risk: medium - an authorization gate on every Ideas entry point; a missed caller leaks the feature, an over-broad
gate breaks background cleanup. Escalate (BLOCKED) if any Ideas entry point cannot reach the user id, or if gating
would require changing a StudioFlow or Presentation internal.
Status: READY
Priority: P1
Owner: Product Owner (decision 2026-10-23: Ideas and Workspace board stay off for the office; Ideas on only for listed users, like the Schedule Assistant and SketchUp)
Last updated: 2026-10-23

Previous plan: `WO-SF-SAMPLE-PHOTO-01` DONE (R9.225, R9.226); owner browser check owed.

## Locked Decisions

1. `IDEAS_MODULE_MANIFEST` gains `developerAccess: true`. Nothing else in the manifest changes.
2. EXTEND `@platform/core/modules` with one canonical per-user check for UI modules, e.g.
   `usableModuleIds(db, userId)` (enabled ids minus `developerAccess` modules the user is not listed for) and
   `requireModuleUsable(db, userId, moduleId)` (`MODULE_DISABLED` when off; the existing
   `INTEGRATION_ACCESS_DENIED`-style FORBIDDEN when not listed). Reuse the `platform.integration_access` table and
   `hasIntegrationModuleAccess`; no new table, no migration, no new permission. Modules without `developerAccess`
   behave exactly as today.
3. "Usable" = enabled AND listed AND the existing RBAC permission (`studioflow.ideas.manage`). The list adds no right.
4. For a person who is not listed, Ideas behaves exactly as when the module is off: no "Ideas" nav link, `/studioflow/ideas`
   is notFound, the note-image "Save to Ideas" and "Use in schedule" buttons and Ideas' "Add to moodboard" are hidden,
   and every Ideas server action refuses. (The note-image "Use in schedule" lives in Ideas today; it goes with Ideas.)
5. Not gated: `removeScheduleOptionUsage`, asset-cleanup retries, and any other system/background path invoked by
   StudioFlow through the ideas bridge. Only a person's use is gated.
6. The Developer console's existing per-user list renders every `developerAccess` module, so Ideas appears there
   with no Executor UI work. Its heading wording ("AI & Plugin Access") is the Lead's R9.239.
7. Workspace board (`workspace-board`) is untouched: it stays a global On/Off module and stays Off.
8. Integration token scopes (`integrations/index.ts`) keep their behavior; refactoring them onto the new helper is
   allowed only if it is a pure move with their tests unchanged.

## Contract

- Server: every call site that today uses `requireModuleEnabled("ideas")` (all of `src/apps/ideas/actions.ts`) or
  `isModuleEnabled("ideas")` (`src/apps/ideas/ui/page.tsx`) switches to the per-user check with the signed-in user.
- Shell: the module ids passed to `StudioFlowNav` (`src/app/(platform)/layout.tsx`) and to `StudioFlowModuleState`
  (`src/app/(platform)/studioflow/layout.tsx`, read by `useStudioFlowModuleEnabled` in `round-labels.tsx`) become the
  per-user usable ids. Presentation and other non-gated modules must read exactly as before.
- Minimal wiring only; no new screens, copy or layout.

## Non-goals

No change to Workspace board, Presentation, Schedule, RBAC roles, the console layout, or module On/Off semantics.
No licence/entitlement mechanism (D-section "not licensing" stands).

## Acceptance Criteria

1. Ideas On, user A listed with `ideas.manage`: nav link, page, all actions, note-image buttons work as today.
2. Ideas On, user B not listed (even Platform Owner): no link, page 404, note-image Ideas buttons hidden, every Ideas
   action refuses with FORBIDDEN; B's Presentation, Schedule and notes unchanged.
3. Ideas Off: everyone as today (MODULE_DISABLED / hidden).
4. Listed but without `ideas.manage`: refused as today.
5. Deleting a Schedule option still cleans its Ideas usage when the deleting user is not listed (background path).
6. Revoking A in the console takes effect on A's next request (no cache that outlives the request).

## Verification (Executor, before commit)

- `npm run typecheck`, `npm run lint`, boundary scan (`npm run check:boundaries` or the repo's equivalent).
- Unit + integration: `src/platform/core/modules/*`, `src/app/module-gates.integration.test.ts` (extend with listed /
  not listed / Platform Owner-not-listed / revoked cases), ideas tests, `note-actions.test.ts`,
  `asset-cleanup-actions.test.ts`, integration-access tests. Per-command timeout 10 min.
- `npm run build` (shell/layout changed). Database only on the disposable rebuild test target.
- Safe checkpoint if interrupted: manifest flag + core helper + its tests committed as a whole only; never commit a
  state where the flag is set but a caller still uses the global check.

## Reviewer Acceptance (Lead, after R9.238)

Browser on an isolated server: Developer console lists Ideas; with a listed and a non-listed account walk criteria
1, 2 and 6. Lead R9.239: console heading wording; confirm nothing visible changed for non-gated modules.

## Executor Prompt

```text
Role: BACKEND EXECUTOR. Read AGENTS.md, docs/agent/EXECUTOR.md and PLAN.md (WO-PLATFORM-MODULE-USER-ACCESS-01),
plus docs/apps/platform/MODULES-DECISION.md amendment 2026-10-23b. Location: ask the owner rumah/kantor (cloud: use a
disposable in-container PostgreSQL). Implement the whole plan: Ideas manifest developerAccess, one canonical per-user
module check in @platform/core/modules, every Ideas entry point and the StudioFlow shell switched to it, background
paths ungated; tests per Verification; changelog R9.238. No console/UI design work (Lead R9.239). Commit locally as
R9.238 (no push) and return the Planner/Reviewer prompt with outcome, commit, checks, limitations and dirty files.
```
