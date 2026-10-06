# Active Plan

Plan ID: WO-UI-V2-02
Scope: The remaining DESIGN v2 slices: pill tab bar and context capsule, stat cards, counts on rail items, and Playwright screen-size checks. `DESIGN.md` v2 is the authority (§5, §6.1, §10.1–§10.3, §12).
Target revisions: R8.358 (plan entry; the file itself landed in R8.359), R8.360 (part A — patterns, adoption, counts; Executor), R8.361 (part B — Playwright; Executor), R8.362 (Lead review and polish).
Status: READY
Priority: P1
Owner: Product Owner.
Last updated: 2026-10-06

## Lane note (owner, 2026-10-06)

"Sisanya kamu oper saja ke Codex, kamu cek saja": the Executor builds every slice below, including UI Engine patterns and their adoption; the Lead reviews and polishes in R8.362. Stop with `BLOCKED / CONFLICT` and send a prompt back to the Lead if anything contradicts `DESIGN.md`, `UI_ENGINE.md` or the code.

## Locked Decisions

### Part A (R8.360)

1. **`PillTabs` — ADD to UI Engine (Pattern), DESIGN §10.3.** For sibling views inside a page only.
   - Items: `{ key, label, icon?, count?, active, href? | onSelect? }`. Link items render as a `<nav aria-label>` with `aria-current="page"` on the active one; button items as a `role="group"` with `aria-pressed`.
   - Look: a floating rounded bar (`bg-surface`, `shadow-float`, `rounded-pill`, small inner padding); items are icon + label; the active item has the graphite fill (`bg-action text-action-ink`) and semibold label; an optional count is a small mono number.
   - Narrow: below 560px inactive items that have an icon show the icon only (label stays as accessible name and `title`); the active item always shows icon + label. The bar scrolls horizontally inside itself (`max-w-full min-w-0 overflow-x-auto`, hidden scrollbar) and never widens the page.
   - Showcase entry in `src/app/ui-engine/ui-engine-showcase.tsx`, a UI Engine test, and a `UI_ENGINE.md` §3.5 row with its consumers.
2. **Adopt `PillTabs`** (replace the current chip rows; same routes/state):
   - StudioFlow project header nav — Phases, MOM, Schedule, Presentation, History, with icons and the existing counts (`project-nav-links.tsx`).
   - Product Schedule — Material / Fixture and Board / List (`schedule-board.tsx`). The decision filters (All, Needs a decision, …) stay `FilterChip`s: they filter, they are not sibling views.
   - StudioFlow Home — Mine / Everyone's and Running / Completed (`studioflow/page.tsx`), as two separate bars.
   - Master Data and BQ keep their current `Tabs` in this slice (record them as later consumers in BACKLOG).
3. **Context capsule — EXTEND `Breadcrumb`** with `variant="capsule"` (DESIGN §10.3): a small rounded floating capsule (surface, hairline, `shadow-float`), optional leading app mark (a small round chip with the app's short name or icon), entries separated by "/", the last one semibold and not a link, truncating within the page width. Add a `context` slot to `PageHeader`, rendered above the title.
   - StudioFlow project layout: remove the sticky breadcrumb strip; the project header shows the capsule "StudioFlow / Projects / <name>" in `context`.
   - `studioflow/clients/[clientId]/page.tsx`: switch its breadcrumb to the capsule in `context`.
   - Remaining default-variant consumers (if any) stay as they are.
4. **`StatCard` and `StatGrid` — ADD to UI Engine**, DESIGN §6.1: label, optional icon in a round chip, value in `MetricValue`, one caption, optional `href`; `StatGrid` lays out up to four cards, two-up below 840px and one-up below 400px. Showcase, test, `UI_ENGINE.md` row.
   - **MERGE:** Master Data's dashboard cards on `/masterdata` (`masterdata/page.tsx`) move onto `StatCard`, keeping their content and links.
   - **StudioFlow Home** gets one `StatGrid` above the cards, computed for the viewer's current scope (Mine / Everyone's) over running projects: *Waiting on you* — phases whose open round is `ANSWERED` where the viewer may act; *With client* — rounds `SENT`, caption "longest N days"; *Phases done* — done / total; *Samples waiting* — schedule options with a `REQUESTED` sample in those projects. Hide the grid when there are no running projects; never duplicate a number the page already shows.
5. **Counts on rail items** (DESIGN §10.1; `NavItem` `badge` already exists):
   - StudioFlow **Home**: the *Waiting on you* number (same rule as 4).
   - Master Data **Sample requests**: open requests, only for viewers who can manage them.
   - Counts come from small **read-only** service reads in the owning app, exposed through its public boundary and computed in the layout/server component that renders the nav; nothing is computed inside the UI Engine; zero shows no badge. No schema change.

### Part B (R8.361)

6. **Playwright** (owner-approved dev dependency `@playwright/test`, Chromium only):
   - A separate script `npm run test:e2e` (not part of `npm test`); `playwright.config.ts`; specs under `e2e/`.
   - It runs the app against the **disposable test database only** (`.env.test.local` / `PLATFORM_TEST_DATABASE_URL`, verified rebuild-only), on its own port, never the owner's dev database or the running :3001 server. It seeds what it needs (a user with StudioFlow, Master Data and BQ access and one project with phases) through the existing test-support helpers, and signs in with test credentials generated or stored in the e2e fixture (never real credentials).
   - Checks at 375, 640, 839, 840 and 841 px on StudioFlow Home, a project page, its schedule, Master Data home, BQ projects and Settings: no page-level horizontal overflow (`main` and the project scroll container `scrollWidth <= clientWidth`); at ≥840px the mark cell and the rail share one width, collapsed and expanded; the rail expands only on the toggle (hover does not change its width); below 840px the rail is a strip and the account menu is in the top bar.
   - Document how to run it (one paragraph in `docs/agent/README.md` or the operations docs). If browser download or the test server cannot run in this environment, stop and report rather than skipping silently.

## Boundaries and Non-goals

- No schema or migration. No change to business rules, permissions or commands.
- No new tokens or global spacing changes beyond `DESIGN.md` v2.
- Master Data / BQ `Tabs` adoption and any other app restyling are out of scope.

## Contract updates

`UI_ENGINE.md` (§3.5 rows for `PillTabs`, `StatCard`/`StatGrid`, `Breadcrumb` capsule, `PageHeader` `context`), `DESIGN.md` header "Built so far" line, `STUDIOFLOW-REWORK-CONTRACT.md` §7 (Home stats and rail count) and §8 (project header capsule and pill tabs), `docs/BACKLOG.md` (close the DESIGN v2 entry or leave only what remains).

## Verification

Part A: `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, `npm run check:legacy-runtime`, full `npm test` (baseline 839), plus integration tests for the new count reads (permission and scope). Part B: `npm run test:e2e` passing locally, plus the Part A checks still green. Report counts before/after for both.

## Reviewer Acceptance (Lead, R8.362)

Browser pass of every adopted screen at desktop and 375px, light and dark; the counts against real data; Playwright run reproduced by the Lead.

## Executor Prompt

You are the Backend Executor, assigned WO-UI-V2-02 by the owner (UI Engine and UI work included; same reporting rules as the previous Work Orders). Location: kantor unless the owner says otherwise; load the matching .env file, set STUDIOFLOW_LOCATION, and verify every database target belongs only to studioflow-rebuild before any database command; Playwright must use the disposable test database only. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, `DESIGN.md` (v2), `UI_ENGINE.md` (§3, §15–17), `docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md` §7–§8 and this `PLAN.md`, then implement Part A as revision R8.360 and Part B as revision R8.361, one local commit each, nothing beyond the plan. If anything contradicts the documents or the code, or the e2e environment cannot run, stop with BLOCKED / CONFLICT and send it back to the Lead. Run the checks in `## Verification` (baseline 839 pass), update the contracts and `CHANGELOG.md`, and reply with a Planner/Reviewer prompt containing outcome, both commits, checks (test counts before/after, e2e result), limitations and dirty files.
