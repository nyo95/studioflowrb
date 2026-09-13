# Active Plan

Plan ID: HARNESS-R8.14
Scope: Repository documentation-only refactor to introduce the role-based AI harness.
Status: DONE
Priority: P1
Owner: Repository owner
Last updated: 2026-09-13

## Owner Intent

Make the repository explain itself efficiently to AI agents through explicit Planner, Executor, and Reviewer roles without building an orchestration platform.

## Problem

The prior entry point and handoff duplicated role guidance and forced broad context loading before scope was known.

## Current Evidence

`AGENTS.md`, `docs/SESSION-HANDOFF-PROMPT.md`, and the operational ledgers were audited before this plan was ratified.

## Decisions

- `AGENTS.md` is bootstrap, invariants, and role router.
- Role behavior lives in `docs/agent/`.
- `SESSION-HANDOFF-PROMPT.md` is a thin router with no snapshots.
- Browser verification is conditional on task type and acceptance criteria.
- A future context resolver is documented but not implemented.

## Open Questions

None for this documentation slice.

## Requirements

Preserve existing safety invariants, owner authority, ledgers, revision protocol, and current Next.js rule block. Do not change production behavior, schema, migrations, business contracts, or substantive roadmap priority.

## Domain Model / Workflow

New session -> handshake -> role -> scoped context -> plan/execute/review.

## Non-goals

No MCP, plugin, AI framework, orchestration server, production-code change, or automatic context resolver.

## Dependencies

Existing contracts and ledgers remain canonical.

## Architecture / Ownership

Planner owns discovery and ratification; Executor owns deterministic approved implementation; Reviewer owns independent verification.

## Acceptance Criteria

- Three role contracts exist and are routed from `AGENTS.md`.
- PLAN has ID and Scope and is explicitly temporary.
- Thin handoff contains no revision or priority snapshot.
- Browser-review conditionality is explicit.
- Global safety invariants remain in `AGENTS.md`.

## Proposed Work Slices

Completed in this documentation revision.

## Regression Risks

Role documents must not weaken global invariants; cross-links must remain clear.

## Roadmap Impact

None. This change does not alter product priorities or business contracts.
