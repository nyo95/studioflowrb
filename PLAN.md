# Active Plan

Plan ID: F-B-APP-OWNERSHIP-NAVIGATION-ACCEPTANCE
Scope: F-B/PF-2+PF-3 acceptance verification in the kantor environment
Status: BLOCKED
Priority: P1
Owner: Repository owner
Last updated: 2026-09-14

## Outcome

Accept F-B/PF-2+PF-3 only after the existing implementation is verified with a
disposable rebuild-only integration database and an authenticated browser
smoke. Permission ownership, route helpers, navigation definitions, and the
application boot correction are implemented in R8.36, R8.38, and R8.40.

## Context and Evidence

- R8.38 created app-owned public route and navigation definitions while
  preserving existing routes and client/server boundaries.
- R8.40 removed BQ's duplicate registration of
  `masterdata.promotion.approve`, added a complete-app registry regression
  test, and proved dev boot plus unauthenticated redirects for all three app
  roots.
- Existing checks passed: focused registry tests, Prisma generation, typecheck,
  lint, boundary, legacy-runtime, and production build.
- `docs/review.md` records the remaining evidence gap. KB-030 is a separate
  Windows private-storage defect and is outside this plan.

## Locked Decisions

- No permission, role, route, navigation, schema, dependency, or security
  behavior may change merely to obtain acceptance evidence.
- Tests may use only a disposable database explicitly identified as
  `studioflow-rebuild`; production and legacy databases are forbidden.
- Browser smoke uses only an owner-supplied test account. Its credentials must
  not be printed, committed, or substituted with a production account.

## Boundaries and Non-goals

- This is verification, not a new Foundation implementation slice.
- Do not start D-SF, UI Engine curation, a storage repair, or StudioFlow feature
  work while F-B remains blocked.

## Acceptance Criteria

1. `npm run test` passes with `PLATFORM_TEST_DATABASE_URL` configured for a
   disposable `studioflow-rebuild` database.
2. The application starts without registry or initialization errors.
3. A supplied test account can sign in and sees launcher/sidebar entries only
   for its granted applications.
4. For Master Data, BQ, and StudioFlow, browser smoke proves one authorized
   route succeeds and one unauthorized route is denied or redirected according
   to the existing behavior.
5. The browser workflow records the route, grants used, expected result, and
   observed result without exposing credentials.
6. Reviewer independently verifies the evidence and records PASS before F-B is
   removed from `docs/review.md`.

## Verification

### Required preflight — currently blocked

1. Set `STUDIOFLOW_LOCATION=kantor`.
2. Supply `PLATFORM_TEST_DATABASE_URL` for a disposable database whose explicit
   target is only `studioflow-rebuild`.
3. Supply an approved non-production browser test account and its allowed
   grants through local-only configuration.
4. Confirm the configured browser/test runner can access the local app.

### Recipe after preflight passes

1. Run `npm run test`.
2. Start the production-equivalent application and confirm it has no
   instrumentation or initialization error.
3. Sign in with the configured test account; verify launcher and sidebar
   visibility against its grants.
4. Exercise and record one authorized and one unauthorized route for each of
   `/masterdata`, `/bq`, and `/studioflow`.
5. Add the evidence to `docs/review.md` and submit it for independent reviewer
   acceptance.

## Risks and recovery

The main risk is treating unavailable environment prerequisites as a product
failure, or using a non-disposable database to overcome them. Stop rather than
substituting credentials, changing permissions, or using an ambiguous database.

## Executor Prompt

You are the Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this `PLAN.md`. First perform the mandatory
acceptance preflight. If every prerequisite exists, run the entire acceptance
recipe without changing F-B behavior, record the evidence, and submit it for
review. If a prerequisite is missing, run every safe available check, update
`docs/review.md` with the exact blocker, and report `BLOCKED: ACCEPTANCE
ENVIRONMENT REQUIRED`. Do not use production or legacy databases/accounts, and
do not start unrelated work.
