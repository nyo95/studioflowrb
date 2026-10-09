# Active Plan

Plan ID: WO-E2E-ACCEPT-01 (browser acceptance as Playwright specs, in four stages)
Scope: turn the owner's manual browser walk (`docs/BROWSER-ACCEPTANCE.md`) into repeatable Playwright specs, so every `[UNVERIFIED]` entry in `docs/BACKLOG.md` gets a PASS/FAIL without the owner clicking through it. Tests only.
Target revisions: one Executor commit per stage, next unused revisions (R8.467 onward; R8.466 is the Lead's record of this plan).
Status: READY (Stage 1 first; stop after each stage and report)
Priority: P2
Owner: Product Owner. Lead: Claude. Last updated: 2026-10-09

## Outcome

`npm run test:e2e` covers the walk's sections below and reports a clear PASS/FAIL per
step. A failing step is a finding, not something to quietly fix. The existing harness
is reused: its own dev server on :3101, build folder `.next-e2e`, the disposable test
database only (`playwright.config.ts`, `e2e/global-setup.ts`, `e2e/seed.ts`).

## Hard rules

- Test database and port 3101 only. Never the owner's dev server (:3001), dev database,
  or any legacy resource. `e2e/seed.ts` keeps its disposable-database guard.
- **No application code changes.** Add only files under `e2e/` (and a seed helper if a
  stage needs more data), plus `CHANGELOG.md` and the `docs/BACKLOG.md` results. If a
  step fails because the app is wrong, do not fix the app: record it as `[BUG]` in
  `docs/BACKLOG.md` with the step id, what was expected, what happened, and the
  screenshot path. If it fails because the test is wrong, fix the test.
- Find elements by role, label and visible text (as `e2e/settings.spec.ts` does). Do not
  add `data-testid` to the app. If an element cannot be reached without one, report it
  as a finding and use the closest accessible locator.
- Every record a spec creates is named `ZZ-Test …` (the walk's convention) and each spec
  file is independent: it creates what it needs and does not rely on another spec's
  order. Seed shared fixtures (suppliers, brand, SKUs) in a helper, not by clicking.
- File uploads use `setInputFiles` with files generated inside the test (the built-in
  browser could not do this; Playwright can). Do not commit binary fixtures; build
  CSV/PNG buffers in code.
- No fixed sleeps. Wait on visible state (`expect(...).toBeVisible()`), as the existing
  specs do. On failure keep a screenshot in `e2e/.tmp/<stage>/`.
- One test per walk step group, titled with the walk's section and step number
  (for example `2.4 save the valid rows`) so results map back to the document.
- Use the checks' real labels from the screen; if a label differs from the walk text by
  a word, follow the screen and note it in the changelog.

## Stages (each its own commit; stop and report after each)

1. **Master Data pricing** — walk sections 2, 3 and 4: material price rows with a new
   supplier for a brand, quoted text amounts, "save the valid rows" with two good and
   two bad rows then fixing and re-saving, labor and material+labor entry, the
   several-suppliers grid including paste of a tab-separated block, supplier and brand
   create/edit/duplicate-input checks.
2. **Archive/restore and samples** — sections 5 and 6: supplier archive and restore
   cascades through brand, SKU and price; price-less SKU; the sample shelf (add, lend,
   return, history, send to client, mark lost, discard, right-click menu, filters).
3. **StudioFlow** — sections 7 and 8: client-note images (upload with `setInputFiles`,
   a generated PNG), formatted notes (bullet button, Enter continuing a list), phase
   notes as a chat (R8.446), Timeline dates and plan, Product Schedule, re-layout on
   real data, "From a past project" (needs two seeded projects; this is the case the
   owner's local database could not cover), Schedule codes never reused after a delete
   (R8.464).
4. **Platform and the rest** — sections 0, 1, 9, 10: first-use tour (fresh account
   created by seed helper), Integration tokens page on My preferences (create shows the
   secret once, list statuses, Revoke, a user without the permission does not see the
   section), the Ideas board, older Master Data items, layout and theme at phone and
   desktop width.

## Reporting (end of each stage)

A table in the changelog entry: every walk step in the stage with PASS / FAIL /
NOT COVERED and why. New `[BUG]` entries in `docs/BACKLOG.md` for real failures. Do not
remove `[UNVERIFIED]` entries; the Lead does that after reading the result.

## Verification

`npx tsc --noEmit`, `npm run lint`, `npm run test:e2e` (the whole suite must still pass
or each failure must be a recorded finding), `npm run check:boundaries`. Specs that need
a Chromium install: report if it is missing; do not skip silently.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, `docs/BROWSER-ACCEPTANCE.md`, `e2e/` and this `PLAN.md`.
Do Stage 1 only: write the Playwright specs under `e2e/`, run them, record results
as the plan says, update `CHANGELOG.md`, create one local commit, no push. Do not
change application code; a failing step is a finding. Stop with a BLOCKED / CONFLICT
report if a step cannot be reached by role/label/text, or if the test database is
ambiguous. End with the Planner/Reviewer prompt: stage, commit, per-step results, new
`[BUG]` entries, limitations, dirty files.
