# Active Plan

Plan ID: KB-024-MASTERDATA-PROMOTION-TYPING
Scope: Non-design cleanup for Master Data promotion reference mapping.
Status: READY (implemented locally in R8.85; automated verification pending)
Priority: P2
Owner: Repository owner
Last updated: 2026-09-16
Lane: Planner + Executor (owner-combined), rumah

## Evidence

- `docs/knownbug.md` KB-024 records avoidable `(p: any)` parameters in
  `src/apps/masterdata/service.ts` promotion mapping.
- The behavior is already covered by Master Data service integration tests that
  list promotion references and validate material/labor type mismatches.

## Locked decisions

- Preserve all promotion reference behavior and labels.
- Do not change schema, permissions, public API shape, dependencies, or UI.
- Use generated Prisma payload types scoped to the queried relations.

## Non-goals

KB-025 services barrel cleanup, Settings IA, Master Data home, browser
acceptance, and any promotion workflow change.

## Verification

Executor: `npm test`, `npm run typecheck`, `npm run lint`,
`npm run check:boundaries`, `npm run check:legacy-runtime`, `npm run build`,
and `git diff --cached --check`.

## Executor Prompt

Executor lane, rumah. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this
`PLAN.md`. Finish KB-024 by removing the avoidable `any` types from Master
Data promotion reference mapping without behavior changes, run the required
checks, update ledgers, commit locally, and do not push.
