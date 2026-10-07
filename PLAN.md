# Active Plan

Plan ID: WO-PLAT-COST-01 (cheaper page loads and asset-route hygiene; items A and D)
Scope: Behaviour-preserving backend work found by the Lead's whole-repo audit of 2026-10-07. No product change, no schema change, no new dependency.
Target revisions: R8.400 (plan), R8.401 (re-scope after the Executor's BLOCKED report), R8.402 (Executor: A and D), then Lead review and the Lead's UI findings.
Re-scoped R8.401: the Executor reported the four items too large for one verified commit; items B (service split) and C (typed Master Data) moved to BACKLOG as their own work orders.
Status: READY
Priority: P2
Owner: Product Owner ("buat prompt untuk codex", 2026-10-07).
Last updated: 2026-10-07

Previous plan WO-PLAT-TOUR-01 is BUILT (R8.396–R8.399); its open browser walk is in BACKLOG.

## Outcome

The same screens and answers, for less work per click, and code that is easier
to change safely.

## Evidence (verified in code on 2026-10-07)

- `src/app/(platform)/layout.tsx` runs on every navigation in every app and calls
  `studioFlow.projects.getHomeStats` only to read `waitingOnYou` for the rail
  badge. `getHomeStats` loads every running project with all phases and latest
  iteration into memory (`projects/service.ts` ~L797). On `/studioflow` the page
  calls it a second time. The same layout also reads `user_preference` twice
  (`resolveDisplay` and `getShellState`).
- `phases/service.ts` is 1,210 lines and holds three separate jobs: the phase
  workflow commands and reads, phase-template administration (~L798–L1076), and
  deliverables (~L1077–end).
- Master Data services carry about 40 `any` (`tx as any`, `rows: any`), while
  StudioFlow and BQ carry none.
- `src/app/api/platform/assets/private/route.ts` answers every failure with 401
  (a missing file should be 404), derives the content type from the file
  extension instead of the stored type, and imports `fs/promises` without using
  it. `public/[...key]/route.ts` reads the whole file into memory.
- Checked and fine, do not change: phase commands run in serializable
  transactions with retry (`platform/core/db/transactions.ts`), so the
  read-then-write pattern is safe; polling is 60 s and pauses in hidden tabs.

## Locked Decisions

0. **This plan is items A and D only.** B and C wait in BACKLOG.
1. **Behaviour must not change.** Every item keeps the current results; the
   existing 936 tests are the safety net and new tests pin the new seams.
2. **Item A (page cost).** Add a narrow read for the rail badge, e.g.
   `studioFlow.projects.countWaitingOnYou({ grants, actorId })`, that returns
   exactly the same number as `getHomeStats({ filter: "mine" }).waitingOnYou`
   (same rule: iteration ANSWERED, project ACTIVE, caller can work, caller holds
   the seat or can override) using a counting query, not by loading every phase.
   Add a test that compares the two on the same data. The layout uses it and
   no longer calls `getHomeStats`. The layout reads `user_preference` once:
   fold the guide language into the existing display read (or make
   `getShellState` take what it needs) so the preference row is fetched one time.
2b. **Item D (asset routes).** Private route: 404 for a missing file (401/403
   stay for auth and signature failures), content type from the stored type
   where the caller can know it, otherwise the extension map kept in one shared
   helper; remove the unused import. Public route: stream the file instead of
   `readFile`. Same URLs, same signatures.
3. **Out of scope:** item B (split `phases/service.ts`) and item C (remove `any` from Master Data), now separate work orders in BACKLOG; and, for the Lead's next revision, shell polling firing twice on first
   load, hard-coded "five phases" copy, mixed `id-ID` date formatting,
   `/ui-engine` showcase being a public path, splitting the 1,248-line
   `studioflow/actions.ts` and the 1,533-line `schedule-board.tsx`.

## Boundaries and Non-goals

No schema or migration change; no change to who may see what; no new caching
layer; no change to the home page's own `getHomeStats` result; no push, tag, PR
or release.

## Acceptance Criteria

1. `countWaitingOnYou` equals `getHomeStats(...).waitingOnYou` for: no projects,
   answered phase held by the caller, held by someone else, caller with override,
   caller without phase-work permission, completed and archived projects.
2. The platform layout no longer calls `getHomeStats` and reads
   `user_preference` once per request.
3. Private asset route: unknown key with a valid signature gives 404; bad
   signature or expired gives 403; unauthenticated gives 401; a valid read
   returns the same bytes and `nosniff`.

## Verification

Executor, before commit: `tsc --noEmit`, `npm run lint -- --quiet`,
`check:boundaries`, `check:legacy-runtime`, `npm test` (full; report any
failed, skipped or cancelled; the known flaky workbook test in BACKLOG may need
one re-run, say so), `npm run build`. Verify the database target is
rebuild-only before any database command. Browser not required.

## Reviewer Acceptance

After commit, the Lead opens Home, a project and Master Data in the browser and
checks the rail badge number is unchanged, then reads the dev log for the
number of queries per navigation before and after.

## Regression Risks and Recovery

The badge number is the only user-visible value touched; the equality test
guards it. Item D changes only error codes and streaming; each item can be reverted on its own.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the entire READY
outcome (WO-PLAT-COST-01, items A and D only, target revision R8.402) and nothing
beyond it; items B and C are not part of this plan. Preserve unrelated owner work, run the
required checks, update `CHANGELOG.md`, and create the local revision commit.
Stop only for a material locked-decision conflict or unsafe boundary, using the
BLOCKED / CONFLICT report; otherwise report the commit, checks, limitations,
and remaining unrelated dirty files.
