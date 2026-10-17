# Harness audit — 2026-10-17

Scope: agent instructions and verification tooling only. Owner explicitly assigned
temporary Lead + Executor, rumah. No application behavior or database operations.

## Baseline evidence

- Branch `main`, HEAD `7004496a14f679a8418bec84167701d341d4a98f` (R9.128).
- Cached published baseline `origin/main` = `45f956c` (R9.112); no fetch/push.
- Initial dirty-file list: empty. Next unused local revision: R9.129.

## Findings and bounded corrections

| Evidence | Inefficiency/conflict | Correction |
|---|---|---|
| EXECUTOR mandatory commit gate vs README/AGENTS proportionate checks | Full tests + build required even for documentation; inconsistent Lead/Executor cost | One risk/gate policy in VERIFICATION.md, referenced by both lanes |
| EXECUTOR browser section vs AGENTS/PLANNER | Says browser never blocks even when implementation requires it | Distinguish implementation diagnosis from independent Reviewer acceptance |
| run-tests.mjs | Always discovers/runs all tests; large inherited output | Exact validated file selection, unchanged full default and serialized DB suites; logged gate runner |
| REVIEWER evidence guidance | No validity criteria for reusing Executor results | Content/environment fingerprints, explicit invalidation and independent diff review |
| README work sizing | Coherent outcomes already supported; no checkpoint interface | Preserve vertical sizing; add bounded checkpoint/fresh-session discipline |
| PLAN-TEMPLATE | Modules/criteria exist, but no mandatory risk, gate selection or timeout | Require tier, rationale, commands, test/consumer coverage and acceptance owner |
| EXTENSIONS definition of done | Separate hard-coded test gate can drift | Reference canonical policy; retain route/security/idempotency coverage |
| AGENTS, role contracts, dated handoff | Progressive reading exists but references can lead to repeat exploration | Canonical context/evidence rules; dated handoffs remain navigation, not bootstrap |
| EXECUTOR unavailable-shell exception | Batch-commit language can imply partial completion | Mark checkpoint incomplete; revalidate complete change set before commit |

No business defect was audited or left unfixed by this harness slice. Existing
browser backlog entries and application contracts are unchanged. Safety rules in
AGENTS (module/public boundaries, permissions/audit, legacy ban, serial ownership,
database isolation, local-only commits) remain authoritative.

## Benchmark recommendation

Use three equivalent tasks on isolated disposable copies of the same baseline:
documentation correction, bounded service correction, high-risk shared change.
Run each before/after with the same models, environment, fixtures and acceptance
criteria. Record input/output tokens when available, files/bytes read, commands,
wall time, repeated checks, session count, gate coverage and defects found by
independent review. Repeat each pair at least three times; report medians and
ranges with limitations. Do not run old and new DB tests concurrently. No numeric
token-saving claim is made by this audit.
