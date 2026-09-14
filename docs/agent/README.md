# Planner/Reviewer and Executor Harness

Use this directory after `AGENTS.md` has established the operating lane and
location. The harness deliberately assumes modern coding agents are capable. It
locks consequential decisions, not every file edit.

## Context selection

1. Identify the assigned lane.
2. Identify the coherent outcome: a user-visible workflow, domain capability,
   architecture boundary, or complete correction pass.
3. Load the lane contract plus only the authorities named by that outcome.
4. Read current code/tests/migrations only when they evidence the selected behavior. Read legacy only when its exact evidence is necessary and allowed.

Do not reload broad documentation merely to prove diligence. Follow links only
when they govern the selected outcome or resolve a real conflict.

## Normal loop

```text
Owner intent/docs -> Planner/Reviewer -> PLAN.md -> Executor prompt
                  -> Executor -> implementation + checks + commit
                              -> Planner/Reviewer prompt
                  -> Planner/Reviewer -> diff + browser acceptance when needed
                                      -> PASS/correction + next PLAN.md
                                      -> Executor prompt
```

`PLAN.md` is the one temporary active contract, not history or a second
roadmap. Use only **DRAFT**, **READY**, or **BLOCKED**. READY means all material
decisions needed to begin are resolved; it does not mean every implementation
choice is prescribed. After PASS, replace it with the next active plan.

The Executor updates `CHANGELOG.md` and commits the coherent implementation.
The Planner/Reviewer may review that commit immediately; `review.md` is used
only when verification must actually be deferred. Add a `knownbug.md` entry
only for a reproduced defect intentionally left open, not for a finding that is
being returned immediately for correction. Update `roadmap.md` only when the
real backlog or completion state changes.

The prompt loop is the session interface. Each sending role includes enough
revision and evidence context for the receiving role to start, but points to
the repository contracts instead of pasting them. Credentials remain in the
selected ignored local configuration or current owner session and never travel
inside a handoff prompt.

Browser acceptance belongs at the end of this loop, after the Executor commit,
unless the active plan explicitly needs browser work to finish or diagnose the
implementation. This keeps execution moving while preserving an independent
user-facing gate before PASS.

## Scope reading matrix

| Lane | Always after bootstrap | Add only when relevant | Do not load automatically |
|---|---|---|---|
| Planner/Reviewer | `PLANNER.md`, `REVIEWER.md`, `PLAN.md` when present | targeted ledger/contract, current code/tests, allowed legacy evidence | all app internals/contracts |
| Executor | `EXECUTOR.md`, READY `PLAN.md` | named authority, affected code/tests/migrations, nearby consumers needed for safe completion | all roadmap/knownbug/legacy material |

## Priority

- **P0** — urgent security, data loss, or repository-breaking blocker.
- **P1** — main-objective critical path blocker.
- **P2** — important but non-blocking.
- **P3** — improvement or later optimization.
- **PARKED** — valid idea with no current execution authority.

Planner recommends and explains priority; owner decides. Priority follows real dependencies, never recency or enthusiasm.

## Work sizing

Default to one substantial, coherent end-to-end outcome per Executor run and
one implementation commit. Do not split work by file, layer, CRUD operation,
route, or arbitrary token estimate. Include the schema/service/UI/tests/docs
needed for the outcome when they belong together.

Split only when at least one condition is concrete:

- an owner decision or external dependency gates later work;
- an irreversible migration, security boundary, or rollback boundary deserves
  isolated verification;
- two outcomes are independently useful and should be accepted or reverted
  independently;
- repository evidence shows the work cannot fit safely in one agent context or
  available tool run.

When splitting, make each part vertically coherent and explain the reason. Do
not create preparatory placeholder slices. A tiny typo or obvious local repair
may go directly to Executor, but it still follows repository safety and review
proportionate to risk.

## Revision and commit protocol

The published baseline is `R<N>`. Each local change increments its ordinal as
`R<N>.<NN>` (for example `R8.15`); this is an ordinal, not a decimal. Never
reuse, renumber, or skip back to a lower suffix. Only an explicit owner request
to publish/push promotes a whole revision through a dedicated
`R<N> | release: <summary>` commit; the next local work then starts at `.01`.

Every local commit subject is exactly:

```text
R<N>.<NN> | <type>(<scope>): <imperative summary>
```

Before editing, record HEAD, branch, remote/published baseline, existing
revision entries, and every dirty file. After proportionate checks, add one
changelog entry naming scope, material behavior/contract changes,
migrations/dependencies, checks, and remaining limitations. Stage only owned
files, inspect `git diff --cached` and `git diff --cached --check`, then make
one local commit. Report revision, commit, checks, and unrelated dirty files;
never claim a clean tree when owner changes remain.

Roadmap work closes only after end-to-end verification. A known bug moves to
Closed only with its revision and changelog evidence. An implemented but
insufficiently verified item enters or stays in `review.md`. A blocked
incoherent outcome is not given a misleading completion commit. An immediate
PASS needs no temporary `review.md` round-trip; record review evidence in the
next planning/review revision only when repository documents actually change.
