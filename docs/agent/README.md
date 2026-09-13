# Role-Based AI Harness

Use this directory after `AGENTS.md` has established the session role and location. It routes context; it does not replace product contracts.

## Context selection

1. Identify the assigned role.
2. Identify the smallest scope: document, app, feature, defect, shared layer, or named plan/work-order slice.
3. Load the role contract plus only the authorities named by that scope.
4. Read current code/tests/migrations only when they evidence the selected behavior. Read legacy only when its exact evidence is necessary and allowed.

`scripts/agent-context.mjs` is intentionally deferred. If later activated, it may print deterministic required/optional/unnecessary document hints from an explicit role and scope. It must not infer product intent, select a priority, modify files, call services, or become an MCP/orchestration system.

## Ledger relationship

```text
PLAN.md (DRAFT -> RATIFIED -> READY)
  -> roadmap.md (approved, not built)
  -> Executor
  -> review.md (built, awaiting sufficient verification)
  -> Reviewer PASS -> CHANGELOG.md and close review item
  -> Reviewer defect -> knownbug.md and next correction slice
```

`PLAN.md` is one temporary active workspace, not history or a second roadmap. `roadmap.md` remains planned work, `review.md` remains unverified implementation, `knownbug.md` remains verified defects, and `CHANGELOG.md` remains accepted revision history. Update only the ledger justified by actual evidence.

## Scope reading matrix

| Role | Always after bootstrap | Add only when relevant | Do not load automatically |
|---|---|---|---|
| Planner | `PLANNER.md`, `PLAN.md` | targeted ledger sections, contract, code/tests, allowed legacy evidence | all app internals/contracts |
| Executor | `EXECUTOR.md`, READY slice/work order | named contract sections, affected code/tests/migration | all roadmap/knownbug/legacy material |
| Reviewer | `REVIEWER.md`, ratified intent and acceptance | contract, diff, affected code/tests/browser evidence | executor's conclusions as authority |

## Priority

- **P0** — urgent security, data loss, or repository-breaking blocker.
- **P1** — main-objective critical path blocker.
- **P2** — important but non-blocking.
- **P3** — improvement or later optimization.
- **PARKED** — valid idea with no current execution authority.

Planner recommends and explains priority; owner decides. Priority follows real dependencies, never recency or enthusiasm.

## Small-task bypass

| Task shape | Required path |
|---|---|
| Documentation typo with no semantic change | Executor only |
| Small deterministic bug; no domain, schema, permission, ownership, or shared-boundary decision | Executor -> lightweight Reviewer |
| Feature or change to domain, workflow, architecture, lifecycle, schema, permission | Planner -> Executor -> Reviewer |
| Core, UI Engine, cross-app, migration, shared utility, or boundary enforcement | Planner -> Executor -> full Reviewer |

If a supposedly small task exposes an unresolved decision, stop the bypass and return it to Planner.
