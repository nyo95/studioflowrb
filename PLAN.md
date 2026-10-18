# Active Plan

Plan ID: WO-BQ-LOCK-FIXTURE-01
Scope: BQ Subsection-deletion integration fixture and full verification gate
Module(s): bq tests only; no runtime module change
Target revision: R9.135
Risk: low fixture correction; high verification checkpoint
Status: IMPLEMENTED — high gate PASS
Priority: P1 verification blocker
Owner: Product Owner
Last updated: 2026-10-18

## Outcome

The Subsection-deletion rollback regression reaches the locked-project and failing-audit behavior it claims to test instead of being stopped earlier by the valid empty-price lock policy. The full repository high gate completes.

## Locked Decisions

- Keep `bq.project.lock-empty-prices` unchanged; the production policy is correct and has its own passing regressions.
- Price the two setup Work Items used by this test before locking. Do not bypass, acknowledge, weaken or reorder the lock policy.
- Change only the faulty fixture, its plan/changelog evidence and the StudioFlow verification ledger after the final gate. No schema, migration, dependency or runtime behavior change.

## Verification

Use the same explicitly disposable `studioflow_rebuild_test` PostgreSQL target and `STUDIOFLOW_LOCATION=rumah`. Run the focused BQ integration file, then `node scripts/verify.mjs --tier high --timeout-minutes 15`. A complete pass requires all tests, typecheck/lint, boundary/legacy scans, Prisma generation, production build and whitespace checks.

## Acceptance and Recovery

- The named BQ test reaches its intended assertions and passes.
- Existing empty-price lock tests still pass unchanged.
- The high gate has no failed/skipped/cancelled/TODO checks.
- If the gate is green, update the R9.134 StudioFlow `[UNVERIFIED]` entry to leave only independent browser acceptance pending.
- Revert R9.135 to recover. No data conversion, push, publication or deployment.

## Execution

- Focused BQ integration passed 51/51, including the unchanged empty-price policy coverage.
- Full high gate passed all 1,235 tests with zero failed/skipped/cancelled/TODO, plus typecheck, full lint, boundary and legacy-runtime scans, Prisma generation, production build and whitespace.
- Evidence: `.verification/2026-10-18T15-47-03-301Z-5288/summary.json`.

## Executor Prompt

Correct only the stale BQ fixture, prove the focused BQ suite and full high gate against the disposable rebuild database, update exact ledger evidence, inspect the staged diff and create local R9.135. Do not change the production lock policy or push.
