# Active Plan

Plan ID: WO-HARNESS-EFFICIENCY-01
Scope: Agent harness and verification tooling
Module(s): none - development harness only
Target revision: R9.129
Risk: medium - runner/reporting and exact test selection; no production code or DB guard/lock changes
Status: READY
Priority: P2
Owner: Product Owner; temporary Lead + Executor explicitly authorized this session
Last updated: 2026-10-18

## Outcome

Progressive context, bounded sessions, risk-tier verification and reusable local
artifacts replace contradictory unconditional gates without weakening safety.

## Context and Evidence

See docs/agent/HARNESS-AUDIT.md for focused baseline findings. Read only changed
agent contracts, scripts/run-tests.mjs, test-selection.mjs, verify.mjs and their
tests. No business contracts or legacy evidence needed.

## Locked Decisions and Boundaries

Preserve owner/Claude/Codex/advisory authority, local-only commit rules, serial
checkout ownership, every module/permission/audit/legacy invariant and existing
DB guard/advisory-lock/concurrency behavior. No framework, dependencies, app
behavior, schema, migrations or remote actions. REUSE existing test runner and
boundary checkers; EXTEND harness reporting, no new business capability/module.
Escalate to high if isolation, locking or full discovery semantics change.

## Acceptance Criteria

- One canonical low/medium/high gate policy; role/browser conflicts resolved.
- READY template requires modules, risk, acceptance and explicit gate.
- Exact file selection fails closed; full default coverage stays intact.
- Sequential bounded runner saves complete logs, counts and exit/provenance
  summaries; failed/missing/timed-out work never appears as successful.
- Evidence reuse still requires independent diff review and relevant browser
  acceptance; checkpoint and before/after benchmark are documented.

## Verification

Location rumah. Run:
`node scripts/verify.mjs --tier medium --tests scripts/verify.test.mjs scripts/test-boundaries-checker.mjs scripts/test-legacy-runtime-checker.mjs`
Per-command budget 15 minutes. Targeted harness/selection tests plus both checker
fixture suites cover changed tooling and its consumers; full typecheck/lint,
boundary/legacy scans and whitespace are mandatory. No build/e2e: no production
compilation, routes, UI, bundling or DB behavior changed. No DB commands needed.
Negative subprocess tests cover nonzero exit, missing tools and timeout.

## Reviewer Acceptance

No browser acceptance applies: no user-facing behavior changed. Review policy
consistency, artifact provenance, gate test selection and script failure paths.
Temporary combined-lane review is disclosed; Claude may independently review the
local commit reusing valid artifacts. Existing browser backlog stays open.

## Execution Evidence

Medium gate passed, 5/5 tests, zero failed/skipped. Artifact:
`.verification/2026-10-17T17-02-50-012Z-31140/summary.json`.
After that run only this evidence note, CHANGELOG verification results and the
browser backlog's introductory wording changed. Reuse medium runtime results;
run the low gate for this documentation-only delta and staged whitespace before
commit. No runtime/tool/environment changes after the medium gate. Claude review
is pending; combined-lane checks do not claim independent acceptance.

## Executor Prompt

You are Backend Executor, rumah. Read AGENTS.md, docs/agent/EXECUTOR.md and this
READY PLAN.md. Complete the bounded harness outcome, verify the stated gate,
update CHANGELOG.md and create R9.129 locally. Preserve all safety invariants;
report commit, artifact summary, limitations and dirty files for independent review.
