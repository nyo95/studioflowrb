# Active Plan Template

Copy this structure into root `PLAN.md`; keep one active plan. Delete optional
sections that do not help the Executor.

```markdown
# Active Plan

Plan ID: <stable identifier>
Scope: <bounded product/technical area>
Status: DRAFT | READY | BLOCKED
Priority: P0 | P1 | P2 | P3 | PARKED
Owner: <owner or decision authority>
Last updated: YYYY-MM-DD

## Outcome

<What must be true for the user/system when this plan is complete.>

## Context and Evidence

<Only the contracts, code, and observed facts needed for this outcome.>

## Locked Decisions

<Product/domain/ownership/schema/security/dependency decisions the Executor
must preserve.>

## Boundaries and Non-goals

## Acceptance Criteria

<Observable behavior and evidence, not a file-by-file recipe.>

## Verification

<Focused checks plus full checks proportionate to risk.>

## Risks and Recovery

## Executor Prompt

You are the Executor. Location: <rumah|kantor>. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the entire READY
outcome. Inspect current repository evidence, preserve unrelated owner work,
make sound in-scope implementation decisions, run the required checks, update
`CHANGELOG.md`, and create the target local revision commit. Stop only for a
material locked-decision conflict or unsafe boundary; otherwise finish the
coherent outcome and report the commit, checks, limitations, and remaining
unrelated dirty files.
```

Do not use PLAN.md as permanent architecture history, a work-order archive, a changelog, or a duplicate roadmap. Replace its contents when the next active plan begins; durable approved decisions belong in the relevant contract.
