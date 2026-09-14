# PF-8 Foundation Acceptance Candidate

Status: **CANDIDATE — automated gates passed; Reviewer browser acceptance
required**

Date: 2026-09-14
Candidate revision: R8.60
Active plan: `F-E-PF-8-FOUNDATION-ACCEPTANCE-AND-FREEZE`

This is an Executor receipt, not PF-8 acceptance. Reviewer PASS is required
before F-E is closed, the Foundation is released, or StudioFlow implementation
planning is activated.

## Foundation reference and accepted slices

- Frozen StudioFlow RB reference: R8.12,
  `45d74884c1ec268b30b1d5e6dc86a80da32cffe7`, as recorded in
  [`FOUNDATION-BASELINE-FREEZE.md`](FOUNDATION-BASELINE-FREEZE.md).
- F-A / PF-1 accepted in R8.34.
- F-B / PF-2+PF-3 accepted in R8.43.
- F-C / PF-4+PF-5 accepted in R8.56.
- F-D / PF-6+PF-7 accepted in R8.59.
- D-SF discovery and ratification are recorded in R8.51; the recovery
  implementation remains frozen until PF-8 closes.

No production behavior, schema, migration, dependency, permission, or route
was changed for this candidate.

## Automated verification

All commands were run from the kantor checkout with
`STUDIOFLOW_LOCATION=kantor`.

| Check | Result | Evidence |
|---|---|---|
| `npm test` | PASS | 353 tests, 82 suites; 353 passed, 0 failed/cancelled/skipped. |
| `npm run typecheck` | PASS | `tsc --noEmit` completed successfully. |
| `npm run lint` | PASS | ESLint completed successfully. |
| `npm run check:boundaries` | PASS | Architecture boundaries OK. |
| `npm run check:legacy-runtime` | PASS | No legacy runtime references OK. |
| `npm run build` | PASS | Prisma Client generated; Next production build compiled and optimized successfully. |
| `git diff --check` / staged whitespace | PASS | No whitespace errors. |

## Database scope

Database-backed tests used an ephemeral `PLATFORM_TEST_DATABASE_URL` derived
from the ignored kantor configuration, with the database name changed to the
approved disposable target `studioflow_rebuild_test`. The target was verified
before testing as container `studioflowrb-gateb-test-db`, image
`postgres:15-alpine`, running locally on published port 5433. The kantor
development database `studioflow_rebuild` was not used for the test suite.
Credentials are not recorded here.

## Frozen application entry verification

The full suite retained the application registry and shell coverage, including
permission registration, launcher access, route ownership, and the Master Data
and BQ service suites. This is automated evidence only; it is not a substitute
for the required browser smoke.

## Reviewer acceptance still required

Using the authorized kantor browser fixture, Reviewer must perform the plan's
desktop and 375 px smoke without creating or editing fixture data:

1. Open `/masterdata` and `/bq`, their primary navigation, and one existing
   read-only surface in each app.
2. Confirm correct app navigation, normal rendering, and no relevant console,
   hydration, or layout failure.
3. Sign out and confirm both app roots redirect to `/login`.

Until that evidence is recorded, PF-8 remains open in `docs/review.md`, F-E
remains open in `docs/roadmap.md`, and StudioFlow recovery implementation must
not begin.
