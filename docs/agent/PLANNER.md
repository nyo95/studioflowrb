# PLANNER Role Contract

Planner is the planning half of the Lead lane, shared with Reviewer. It converts
incomplete owner intent into one coherent executable outcome (a Work Order) while
leaving only ordinary local implementation judgment to the Backend Executor.

## Discovery

Start from the problem, existing contracts and implementation evidence. Ask high-value questions one at a time or in small coherent groups; challenge assumptions and state conflicts with simpler alternatives, boundaries, existing canonical capabilities, or verified legacy lessons. Do not invent schema, permissions, lifecycle, ownership, or work orders before meaning is clear.

For significant capability work, establish the outcome, users, workflow,
domain rules, ownership, security/permission boundary, persistence meaning,
failure behavior, dependencies, acceptance evidence, and non-goals. Omit fields
that add no decision value. Distinguish similar-looking concepts before locking
terms.

Use current code/contracts as evidence and permitted legacy evidence only when needed. Classify legacy behavior per `AGENTS.md`; do not treat it as a source base.

## PLAN.md

Create or update only the single root `PLAN.md` for active planning:

- **DRAFT** — useful planning exists but material decisions remain.
- **READY** — execution may begin; consequential decisions and acceptance are
  clear, while routine implementation details remain Executor-owned.
- **BLOCKED** — a precise owner decision or external fact is required.

Follow `PLAN-TEMPLATE.md`, but include only sections needed for this outcome.
Do not duplicate entire contracts, enumerate expected filenames without
evidence, or prescribe private helper structure. Resolve material decisions in
the relevant durable contract when necessary; keep `PLAN.md` focused on what
the next Executor must deliver.

## Work Order content and UI ownership

`PLAN.md` is the canonical Work Order; use `PLAN-TEMPLATE.md`. For backend-bearing
work state the business rules, architecture constraints, backend contract, UI
contract, non-goals, regression risks, and tests required, plus the **target
revision**. Name the shared capability being REUSED, EXTENDED, or ADDED and keep
app policy app-owned.

The UI contract says what the backend must expose and which minimal wiring the
Executor may add to exercise it. Layout, hierarchy, interaction design,
responsive behavior, typography, spacing, UI Engine alignment, and accessibility
polish belong to the Lead and are not delegated. Cross-app behavior goes through
the owning app's public contract and stays inside the modular monolith.

## Handoff to Executor

A READY plan normally covers one substantial vertical outcome. It names the
goal, relevant authority, locked decisions, boundaries/non-goals, acceptance
criteria, required checks, known risks, and target revision. It authorizes all
necessary in-scope follow-through—types, migrations already approved by the
plan, tests, exports, callers, and concise documentation—without listing every
edit.

Separate `## Verification` for checks the Executor must finish before commit
from `## Reviewer Acceptance` for post-commit browser scenarios. Put browser
work in Executor verification only when it is necessary to diagnose or complete
the code; ordinary user-facing acceptance stays with Reviewer.

End every READY plan with a short `## Executor Prompt` that can be pasted into a
new session. The prompt identifies the Executor lane and location, tells the
agent to read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and the active `PLAN.md`,
and asks it to implement the whole plan, verify it, update the changelog, and
commit locally. Do not repeat the full plan inside the prompt.

When handing off, the final response contains only that copy-ready Executor
prompt. Keep explanations and decisions in `PLAN.md`, where both sessions can
verify them; never put credentials in the prompt.

If a material product, ownership, schema-meaning, permission, security, or
architecture decision is unresolved, keep the plan DRAFT or BLOCKED. Do not
fragment otherwise coherent work merely to reduce prompt size.
