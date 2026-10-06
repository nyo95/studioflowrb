# Active Plan

Plan ID: WO-UI-V2-03
Scope: Finish adopting DESIGN v2 in Master Data and BQ — sibling page views become `PillTabs`, BQ project pages get the context capsule — and extend the Playwright screen-size checks to those screens. UI only.
Target revisions: R8.366 (this plan, Lead), R8.367 (implementation, Executor), R8.368 (Lead review and polish).
Status: READY
Priority: P2
Owner: Product Owner.
Last updated: 2026-10-06

## Lane note

Same arrangement as WO-UI-V2-02 (owner: "sisanya oper ke Codex, kamu cek saja"): the Executor builds; the Lead reviews and polishes in R8.368. Stop with `BLOCKED / CONFLICT` and send a prompt back to the Lead if anything contradicts `DESIGN.md` v2, `UI_ENGINE.md` or the code. R8.365 (Brand logos) was reviewed by the Lead: PASS (842/842 re-run).

## Rule being applied (DESIGN v2 §10.3)

- `PillTabs` = sibling views of a **page** (switching what the whole page shows).
- `Tabs` = sections **inside a panel, dialog or drawer**. Those stay as they are (e.g. the vendor directory's tabs inside its panel at `masterdata/vendors/vendor-directory.tsx:788`).
- Filters remain `FilterChip`s.

## Locked Decisions

1. **EXTEND `PillTabs`** with `disabled?: boolean` and `disabledReason?: string` per item (rendered `aria-disabled="true"`, not clickable, reason in `title`), and an optional `actions` slot rendered at the bar's right end (the same role `Tabs` `actions` plays today). Update its showcase entry and test.
2. **Adopt `PillTabs`** (same views, same order, same counts, same permission/disabled rules; content still switches in place):
   - BQ Projects (`bq/page.tsx`): Active · n / Archived · n / Deletion review · n.
   - BQ Library (`bq/library/page.tsx`): its view tabs.
   - Master Data Pricing (`masterdata/pricing/pricing-directory.tsx`): Material Prices / Material + Labor / Labor Only with their counts, the **New price** action at the right; the directory below keeps its viewport fill (`fill` behaviour: `flex min-h-0 flex-1`, internal table scroll) exactly as today.
   - Master Data Settings (`settings/general/masterdata/page.tsx`): Units / Categories / Supplier types / Deletion review / BQ approvals.
   - Keep `defaultValue`/URL behaviour where it exists (e.g. BQ `?view=`): if a view is chosen by URL today, the pills are links to those URLs; otherwise local state.
3. **Context capsule on BQ project pages** (`bq/[id]/page.tsx`, `bq/[id]/edit/page.tsx`, `bq/new/page.tsx`): `PageHeader` `context` with `Breadcrumb variant="capsule" appMark="BQ"` — "BQ / Projects / <project title>" (new: "BQ / Projects / New project"). Remove any back-link that the capsule now duplicates; keep `eyebrow` only where it adds information.
4. **e2e**: add BQ project page (seed one BQ project in `e2e/seed.ts`), Master Data Pricing and BQ Library to `ROUTES` in `e2e/screen-size.spec.ts`; every route keeps the no-sideways-scroll check at all five widths.
5. **BACKLOG**: remove the "StudioFlow top navigation overlaps its icons and labels at phone width" note from the re-layout `[UNVERIFIED]` entry if the 375px screenshot of the rail strip shows no overlap (the rail became a strip of icon chips in R8.357); otherwise leave it and report.

## Boundaries and Non-goals

- No schema, service, action or permission change. No token or spacing change.
- No restyling beyond the items above (tables, forms, dialogs unchanged).

## Contract updates

`UI_ENGINE.md` (PillTabs row: disabled/actions, consumer matrix incl. BQ and Master Data; one sentence stating the PillTabs vs Tabs rule), `DESIGN.md` status line (Master Data/BQ adoption done), `docs/BACKLOG.md`.

## Verification

`npm run typecheck`, `npm run lint`, `npm run check:boundaries`, `npm run check:legacy-runtime`, full `npm test` (baseline 842; run it in the background or with a long timeout), and `npm run test:e2e` (baseline 35 checks; disposable test database only). Report counts before/after.

## Reviewer Acceptance (Lead, R8.368)

Browser pass of the four adopted screens and the BQ project pages at desktop and 375px, light and dark; Playwright re-run.

## Executor Prompt

You are the Backend Executor, assigned WO-UI-V2-03 by the owner (UI work, same rules as WO-UI-V2-02). Location: kantor unless the owner says otherwise; verify every database target belongs only to studioflow-rebuild before any database command; Playwright uses the disposable test database only. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, `DESIGN.md` (v2, §10.3, §12), `UI_ENGINE.md` (§3.5, §15–17) and this `PLAN.md`, then implement it as revision R8.367, one local commit, nothing beyond the plan. If anything contradicts the documents or the code, stop with BLOCKED / CONFLICT and send it back to the Lead. Run the checks in `## Verification` (baseline 842 tests, 35 e2e checks), update the documents and `CHANGELOG.md`, and reply with a Planner/Reviewer prompt containing outcome, commit, checks (counts before/after, e2e result), limitations and dirty files.
