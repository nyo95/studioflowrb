# Active Plan

Plan ID: WO-PLAT-INTEGRATIONS-01c (follow-up to R8.459)
Scope: close two gaps in the integration route kit before any extension builds on it. Nothing else.
Target revision: R8.461 (one Executor commit). R8.460 is the Lead's review record.
Status: READY
Priority: P2
Owner: Product Owner. Lead verdict on R8.459 (`470b5e6`): PASS, with these two gaps.
Last updated: 2026-10-09

## Findings (both in `src/platform/core/integrations/index.ts`)

1. **A 4xx after partial writes keeps the partial writes.** A write handler runs
   inside the ledger transaction. If it writes and then throws a client error, the
   kit stores that 4xx as replayable and commits, so the earlier writes stay. Only
   5xx rolls back. Make a handler failure of any kind undo that handler's own
   writes: run the handler inside a savepoint (`SAVEPOINT` / `ROLLBACK TO SAVEPOINT`
   on the transaction), then for a 4xx still store the replayable error and write
   the audit row. For 5xx keep today's full rollback. A database error inside the
   handler must not leave the transaction aborted before the ledger update.
   Document the rule in `docs/apps/platform/INTEGRATIONS.md`.
2. **Concurrent same-key requests.** Two simultaneous requests with the same key
   can both pass the "no row yet" check; the loser hits a unique-constraint error
   (`P2002`) and returns 500. Map that to the retryable `CONFLICT`
   (`IDEMPOTENCY_IN_PROGRESS`), or retry once so the loser replays the winner's
   stored response. Pick the smaller change and say which in the changelog.

## Tests (disposable test DB)

- Handler writes a row then throws a 4xx: the row is absent, the response is the
  stored 4xx, replay returns it with `Idempotency-Replayed: true`, audit row exists.
- Handler writes then throws a 5xx: row absent, ledger row gone, key retryable (kept).
- Handler triggers a database error then throws a 4xx: still ends as a stored 4xx.
- Two concurrent POSTs with the same key and body: exactly one handler execution,
  no 500 from either request.

## Boundaries and Non-goals

No new endpoints, scopes, permissions, migration, dependency or UI. Keep every
locked decision of WO-PLAT-INTEGRATIONS-01 and 01b. Never stage `next-env.d.ts`.

## Verification

`npm run typecheck`, `npm run lint`, `npm run check:boundaries`, `npm test`,
`npm run check:legacy-runtime`, `npm run build`.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, `docs/agent/EXTENSIONS.md`, and this `PLAN.md`, then
implement it and nothing beyond it. Preserve unrelated owner work, run the required
checks, update `CHANGELOG.md`, and create the local commit R8.461. Stop only with a
BLOCKED / CONFLICT report for a locked-decision conflict or unsafe boundary.
