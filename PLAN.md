# Active Plan

Plan ID: WO-PLAT-COST-02 (split the phase service; type the Master Data services — items B and C of the 2026-10-07 audit)
Scope: Two independent, behaviour-preserving refactors, each its own commit. No product change, no schema change, no new dependency.
Target revisions: not fixed in advance. The Lead and the Executor commit in parallel, so each takes the next unused revision from `CHANGELOG.md` at commit time (item B first, then item C).
Status: READY
Priority: P2
Owner: Product Owner ("paralel", 2026-10-07).
Last updated: 2026-10-07

Previous plan WO-PLAT-COST-01 (items A and D) is BUILT at R8.402.

## Outcome

Easier-to-change code with exactly the same behaviour: the 1,210-line phase
service is three files by job, and the Master Data services stop bypassing the
type checker.

## Parallel-work rule (owner override of serial work, 2026-10-07)

The Lead edits only these areas while the Executor runs: `src/platform/authenticated-shell`,
`src/platform/ui_engine`, `src/proxy.ts`, `src/app/(platform)/studioflow/**`
(screens), `src/app/(document)/**`, `src/app/(platform)/bq/**` (screens), and
docs. The Executor must not edit those. The Executor edits only
`src/apps/studioflow/phases/**` (item B) and `src/apps/masterdata/**` (item C).
Both stage only their own files and never run `git add -A`, `git stash`, `git
checkout`, or reformat files they do not own. If a check fails in a file the
other lane is editing, report it instead of fixing it.

## Locked Decisions

1. **Behaviour must not change.** The existing tests are the safety net.
2. **Item B.** Split `apps/studioflow/phases/service.ts` by job into
   three files: the phase workflow (commands and reads, incl. iterations,
   notes, images, outcomes, undo, completion), phase-template administration
   (templates and definitions, currently ~L798–L1076) and deliverables
   (currently ~L1077–end, incl. the expiry sweep). `createPhaseService` keeps its
   name, signature and the exact same members, composed from the three parts, so
   no caller outside `phases/` changes. A pure move: no logic edit, rename or
   reformat mixed in. Add a test that lists the members of `studioFlow.phases`
   and compares them with the list before the split (capture it first).
3. **Item C.** Remove `any` from the Master Data services by using the
   real Prisma transaction and row types. Files with `any` today: `service.ts`
   (2), `services/deletion.service.ts` (11), `services/pricing.service.ts` (20),
   `services/sku-price-workbook.service.ts` (3),
   `services/price-database-workbook.service.ts` (2), `services/vendor.service.ts`
   (1). Where a cast is truly unavoidable (for example giving a service a
   transaction as its client), keep one commented, typed helper in
   `services/shared.ts` instead of scattered casts.
4. **Stopping rule.** Each item is verified and committed on its own. If the
   run window ends after B, stop with B committed and report C as not started;
   that is a valid result, not a failure. Never commit a half-done item.

## Boundaries and Non-goals

No schema or migration change; no change to permissions or results; no new
abstraction beyond the single typed helper in item C; no work on the Lead's
areas above; no push, tag, PR or release.

## Acceptance Criteria

1. B: `studioFlow.phases` has the same members as before; `phases/service.ts`
   no longer contains template or deliverable code; every existing phase,
   template and deliverable test passes unchanged.
2. C: `grep -rnE ": any\b|as any\b" src/apps/masterdata --include=*.ts` returns
   no match outside tests, or only the one documented helper; Master Data tests
   pass unchanged.
3. `tsc --noEmit` reports no new error in either item.

## Verification

For each item, before its commit: `tsc --noEmit`, `npm run lint -- --quiet`,
`check:boundaries`, `check:legacy-runtime`, `npm test` (full; report any
failed, skipped or cancelled, and name the known flaky workbook test in BACKLOG
if it is the only failure and passes on one re-run), `npm run build`. Run
long checks as background jobs so the run window is not the limit. Verify the
database target is rebuild-only before any database command. Browser not
required.

## Reviewer Acceptance

Lead reads each commit as a diff (moves only for B; type-only for C) and
re-runs the full gates.

## Regression Risks and Recovery

B can break an import cycle or drop a member from the composed service: the
member-list test guards it. C can change inferred types in a way that hides a
real bug: if a typed version exposes an actual defect, record it as `[BUG]` in
BACKLOG and keep behaviour. Each item reverts as one commit.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and `PLAN.md`, then implement item B (target
revision: next unused) and then item C (next unused after B) of WO-PLAT-COST-02, each verified and
committed on its own, and nothing beyond them. The Lead is editing other areas
in parallel; follow the Parallel-work rule in `PLAN.md` exactly and stage only
your own files. Run the long checks (`npm test`, `npm run build`) as background
jobs. Update `CHANGELOG.md` for each revision. Stop only for a material
locked-decision conflict or unsafe boundary, using the BLOCKED / CONFLICT
report; otherwise report each commit, checks, limitations, and remaining
unrelated dirty files.
