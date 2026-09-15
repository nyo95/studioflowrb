# Active Plan

Plan ID: BQ-HEALTH-PASS-R8.80
Scope: Reconcile BQ delivered status, decompose BQ monolith, add characterization tests, and split the BQ project editor/action surface
Status: READY
Priority: P1
Owner: Repository owner
Last updated: 2026-09-16

## Outcome

BQ F1-F5 and the calculator status are reconciled against current code, then
the main BQ implementation is made easier to continue by splitting the large
domain service and project editor surfaces without changing product behavior.

## Context and Evidence

- Authority: `docs/apps/bq/bq-contract.md`, especially §2 app boundaries, §6
  server-owned calculations, §8-§9 Library promotion, and §14 build order.
- Current evidence: `src/apps/bq/service.ts`, `src/apps/bq/lib/calc-expression.ts`,
  `src/apps/bq/service.integration.test.ts`, and BQ route files under
  `src/app/(platform)/bq`.
- Owner direction: exclude design decisions; keep Quotation PDF/T&C deferred;
  StudioFlow Wave 2 remains a later roadmap candidate after this BQ health pass.

## Locked Decisions

- No schema migration, dependency addition, product redesign, BQ quotation work,
  or StudioFlow feature work in this slice.
- Preserve the existing BQ public service facade so route actions, runtime
  composition, and Master Data coordination do not need behavior changes.
- Master Data remains the owner of canonical promotion approval. BQ may only
  expose and consume explicit public contracts.
- Source picker improvements may extend Master Data public read filters only in
  a backward-compatible way.

## Boundaries and Non-goals

Do not touch the legacy database or legacy code. Do not redesign BQ UI flows or
change calculator syntax, BQ formulas, rounding/truncation, lifecycle rules, or
promotion state transitions.

## Verification

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run check:boundaries`
- `npm run check:legacy-runtime`
- `npm run build`
- Staged and unstaged whitespace checks

## Reviewer Acceptance

This is a behavior-preserving code-health slice. Browser acceptance for BQ F1-F5
may be run after the commit if a live authenticated fixture is available; missing
browser evidence must be reported separately rather than blocking the Executor
commit.

## Risks and Recovery

- The service refactor is mostly mechanical but touches transaction/audit
  plumbing. Integration tests must cover representative writes and promotion.
- The BQ project editor split crosses a Next client/server boundary; typecheck
  and lint must catch import direction mistakes.
- Existing unrelated dirty files must remain unstaged.

## Executor Prompt

You are the Planner and Executor for `BQ-HEALTH-PASS-R8.80`. Location: rumah.
Read `AGENTS.md`, `docs/agent/PLANNER.md`, `docs/agent/REVIEWER.md`,
`docs/agent/EXECUTOR.md`, and this `PLAN.md`, then execute the whole outcome:
reconcile BQ docs with actual F1-F5/calculator status, decompose the BQ domain
service while preserving the facade, add characterization tests for promotion
and source lookup behavior, split the BQ project editor/action surface where it
is clearly safe, update `CHANGELOG.md`, run the required checks, inspect the
staged diff, commit locally as R8.80, and push the resulting commits to GitHub.
Stop only for a material behavior conflict, unsafe boundary, or unavailable
required local prerequisite.