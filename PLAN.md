# Active Plan

Plan ID: WO-PLAT-INTEGRATIONS-01b (correction pass on R8.456)
Scope: finish WO-PLAT-INTEGRATIONS-01 — tests the first pass did not include, plus three defects found in review. Nothing new beyond this.
Target revision: R8.459 (one Executor commit). R8.457 is the Lead's review record.
Status: READY
Priority: P2
Owner: Product Owner. Lead verdict on R8.456 (`11f471a`): CORRECTION REQUIRED.
Last updated: 2026-10-09

## Outcome

The integration foundation from `PLAN` WO-PLAT-INTEGRATIONS-01 (see its
Locked Decisions in git history at `5521cbb`, and `docs/apps/platform/INTEGRATIONS.md`)
is proven by tests and safe to build extensions on. Keep every locked decision of
that plan; this pass only closes the gaps below.

## Findings to fix (all in `src/platform/core/integrations/` unless stated)

1. **Missing tests (blocking).** The commit added no test for the token service or
   the route kit; only boundary fixtures. Add integration tests (disposable test DB)
   covering every acceptance criterion of the first plan: missing / malformed /
   unknown / expired / revoked token → 401 safe payload; disabled user → 401; user
   who lost the grant → 403; scope missing → 403; scope present but grant missing →
   403; secret never in list output, audit rows or logs; create only allows scopes
   whose grant the creator holds; list/revoke own vs admin (admin cannot create for
   others or see secrets); `GET ping` happy path; `POST ping` idempotent replay
   (`Idempotency-Replayed: true`), same key with a different body → `CONFLICT`,
   in-progress key → `CONFLICT`, missing key → `VALIDATION`; 24 h expiry cleanup;
   migration seeds the three permissions to the `platform-owner` role only.
2. **Failed writes must not be cached.** Today a handler that throws is stored as a
   completed response, so a transient 5xx is replayed for 24 h and the client can
   never retry. Store the response only for success and for deterministic client
   errors (4xx); for a 5xx or unknown error delete the ledger row so the same key
   can be retried. Test it.
3. **Stuck in-progress key.** A crash between creating the row and finishing leaves
   `IN_PROGRESS` and blocks that key until cleanup. Treat an `IN_PROGRESS` row older
   than a short lease (e.g. 2 minutes) as abandoned and let the retry take it over.
   Test it with an injected clock.
4. **Handler cannot join the ledger transaction.** An extension write and its ledger
   row commit separately, so a crash can do the work without recording it. Give a
   write handler the open transaction client (and run the ledger completion in that
   same transaction) so the extension's writes and the replayable response commit or
   roll back together. Keep GET handlers transaction-free. Update
   `docs/apps/platform/INTEGRATIONS.md` recipe accordingly.
5. **Request body size.** `request.text()` reads an unbounded body. Reject bodies
   over a documented limit (default 1 MB, overridable per route for the later
   SketchUp snapshot) with `VALIDATION` before parsing.
6. **Repository hygiene.** R8.456 committed `next-env.d.ts` (an owner-preserved
   file that is never staged). The Lead reverted it in R8.457; do not stage it
   again. Stage only owned files.

## Boundaries and Non-goals

No new endpoints, scopes, permissions, UI, SketchUp or AI behaviour. Rate limiting
stays a BACKLOG item. Do not change the cookie-session auth path.

## Verification

`npm run typecheck`, `npm run lint`, `npm run check:boundaries`, `npm test`,
`npm run check:legacy-runtime`, `npm run build`. Migrate dev and test databases
only if a migration is added (none expected).

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, `docs/agent/EXTENSIONS.md`, and this `PLAN.md`, then
implement the whole correction pass and nothing beyond it. Before editing, pull
`origin/main`, run `npm install`, apply migrations to the dev and test databases
(`docs/agent/README.md`, "Local database sync"), and regenerate the Prisma client.
Preserve unrelated owner work, never stage `next-env.d.ts`, run the required checks,
update `CHANGELOG.md`, and create the local commit R8.459. Stop only with a
BLOCKED / CONFLICT report for a locked-decision conflict or unsafe boundary.
