# Verification policy

This is the canonical gate policy for every editing lane. PLAN.md locks the tier,
reason, exact test files, dependent consumers and acceptance criteria before
execution. Escalate when evidence reveals a higher risk; never downgrade a gate
to avoid an unavailable resource or failure. Existing regression tests stay in
the full suite. New/changed behavior requires regression coverage appropriate to
its risk, even when an existing suite is not selected for an ordinary commit.

## Tiers

| Tier | Use | Mandatory Executor gate |
|---|---|---|
| low | Documentation/copy or isolated mechanical change with no runtime behavior, security, schema or shared contract impact | Boundary + legacy-runtime scans, staged/unstaged whitespace; focused tests if executable tooling changed |
| medium | Bounded behavior in one module with understood consumers and no high-risk trigger | Low gate + full typecheck/lint + explicit affected tests and consumer regression tests; build when compilation, routes, server/client boundary or bundling is affected |
| high | Migrations/data meaning, auth/RBAC/audit, transactions/concurrency, cross-module/public/shared runtime contracts, DB/test guards, dependencies, broad refactors; integration/release checkpoints | Full npm test, typecheck/lint, boundary + legacy-runtime scans, production build, whitespace |

Harness runner/reporting changes are medium when DB isolation, lock semantics,
full test discovery and production code remain unchanged; test the runner and
selection failure paths explicitly. If those safeguards change, use high.
UI shell/layout/token changes additionally require `npm run test:e2e`; relevant
independent browser acceptance remains a Reviewer gate. Extension route coverage
and other stricter applicable contracts remain mandatory at any tier.

Medium must name nonempty exact test files and explain consumer coverage (or a
Lead-approved evidence-based reason for no runtime tests on a static change).
The runner deliberately requires tests for medium; use targeted tooling tests
for a harness change. A green targeted run does not claim full-suite coverage.
Full verification at integration/release is required before acceptance of that
checkpoint; this grants no authority to deploy, publish or push.

## Deterministic commands and artifacts

Set `STUDIOFLOW_LOCATION=rumah|kantor` in the shell first. Examples:

```
node scripts/verify.mjs --tier low
node scripts/verify.mjs --tier medium --tests scripts/verify.test.mjs scripts/test-boundaries-checker.mjs scripts/test-legacy-runtime-checker.mjs
node scripts/verify.mjs --tier medium --build --tests src/path/affected.test.ts
node scripts/verify.mjs --tier high --e2e
```

`--e2e` is conditional on the affected surface; high without it is correct for
server-only changes. Optional `--timeout-minutes N` sets a positive per-command
budget (default 15). Runner commands execute sequentially, stop on failure and
record remaining commands as NOT_RUN. It never installs packages, migrates,
seeds or changes database targets. Before any DB-backed test/build behavior,
verify the selected local target is explicitly rebuild-only per AGENTS; the
runner is not a substitute for that prerequisite. Existing disposable-DB guards,
advisory locks and Node `--test-concurrency=1` remain in force. Never overlap
gate runs, e2e, database tests or fixture resets against the same test database.

Each run saves complete stdout/stderr locally under ignored `.verification/`.
Only `summary.json` is printed: commands, exit codes, duration, TAP test/pass/
fail/skip counts where available, failure reasons and log paths. Non-test counts
are null. Inspect the failing log section rather than pasting entire logs.
Logs may contain sensitive local output; never commit/share them without review.
Skipped/TODO tests remain visible and prevent a passing automated test gate.
Missing required coverage, nonzero exits, timeout, cancellation, unavailable
tools or NOT_RUN checks mean the gate is incomplete/failed, never PASS. Required
failures cannot be waived by relabeling them as unrelated; documented unrelated
failures can be assessed under AGENTS only with explicit isolation evidence.

## Evidence reuse

Artifacts record base HEAD, a hash of tracked/nonignored source file contents,
Node/platform/location and a private environment fingerprint (local env files,
dependency lock and installed package versions; no credential values printed).
Generate final evidence after source edits. The precommit base HEAD is not the
result commit: handoff binds the final commit to the unchanged content hash.
Reviewer independently recomputes metadata with `node scripts/verify.mjs
--fingerprint`, compares to the artifact and inspects the actual diff, selection
and complete exit/count results. These local artifacts are evidence, not signed
attestations or substitutes for code review.

Reuse passing checks only when tested content, tool/dependency versions, config,
location and relevant fixture/service state are unchanged. Hashes cannot prove
external DB state; handoff records target identity without credentials, migration
state and fixture assumptions for DB runs. Missing logs or uncertain provenance
requires rerunning the affected gate. Documentation/ledger-only follow-up may
reuse runtime results after explicit diff review; record that exception instead
of claiming matching hashes. Changed code, tests, environment, failures or
uncovered regression risks require the affected checks again; rerun the full
gate if shared/high-risk impact cannot be bounded. UI/browser acceptance stays
independent. Do not repeat an unchanged accepted audit merely for a new session.
