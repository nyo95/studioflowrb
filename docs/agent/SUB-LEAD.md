# Sub-Lead lane (Codex)

Status: ACTIVE (owner, 2026-10-24). Read after `AGENTS.md`, `EXECUTOR.md` and `VERIFICATION.md`.

The owner raised Codex to **Sub-Lead under the Lead (Claude)** so that small work does not queue behind the Lead.
The Sub-Lead plans, builds and verifies **low- and medium-tier** work on its own and reports it; the Lead reviews it
afterwards from the changelog and the diff, and runs the heavy gate at integration. Complex work still goes
through the Lead. When the owner gives Codex a READY `PLAN.md`, Codex is the Backend Executor for that plan, as
before; this file adds a lane, it removes none.

## What the Sub-Lead may own

A task is the Sub-Lead's only when **every** line below holds. Anything else is escalated (next section).

- Its tier in `VERIFICATION.md` is **low or medium**: one module, understood consumers, no high-risk trigger.
- It changes no product behaviour the owner has not already decided, or the owner asked for it directly and the
  ask is unambiguous.
- Typical: a reproducible bug inside one module; copy and labels; a `[CLEANUP]` backlog item; a missing or weak
  test; doc drift; a small server action or read inside one module; executing a READY plan (as Executor).
- **UI/UX:** allowed when it follows `DESIGN.md`, `UI_ENGINE.md` and an approved mockup with existing UI Engine
  components only: wiring, states (empty, loading, error, disabled), spacing or alignment fixes that use existing
  tokens, accessibility fixes, a screen that an approved mockup already shows. Not allowed: a new layout direction,
  a new shared pattern or token, a change to `DESIGN.md` or `UI_ENGINE.md`, or the shell/rail/top bar.

## Escalate to the Lead (never do alone)

Stop and hand to the Lead with a short note (what, why it is not small, proposal) when the work touches any of:

1. auth, RBAC, permissions, project access, book privacy, audit, or who may see what;
2. a migration, or what stored data means (an additive column is still a migration);
3. a cross-module or public contract (`public/` doors, integration/MCP routes, the SketchUp contract), or a new module;
4. money, quantities or calculations (BQ, schedule codes and allocation rules);
5. deletion or anything irreversible on data, files or history;
6. a new dependency, a broad refactor, or a change to shared runtime, test guards or the harness itself;
7. `DESIGN.md`, `UI_ENGINE.md`, a new shared UI pattern, or layout direction;
8. an open product question: the Lead turns it into a yes/no or pick-one for the owner.

When in doubt, it is not small. The Sub-Lead never changes a locked decision, never merges or pushes to `main`,
and never deploys.

## How the Sub-Lead works

- **Branch:** never `main`. Work on the branch the owner names, or `sublead/<topic>` cut from it. One task per
  branch when the Lead may be working on the same base at the same time (the serial rule in `AGENTS.md` still
  holds for one branch).
- **Plan:** for anything beyond a one-file fix, write a short Work Order first (`docs/agent/queued-plans/` or
  `PLAN.md` when the branch is free): goal, module, tier and why, decisions, tests. The owner does not approve
  small plans; the Lead sees them in review.
- **Tests:** run the tier's gate from `VERIFICATION.md`. Medium always names its exact test files. Heavy checks the
  Sub-Lead judges unnecessary for the slice (full suite, build, browser) may be deferred, but only by listing them
  under "Lead check" in the changelog; a deferred check is never reported as a pass.
- **Changelog:** every commit has its entry, marked `(Sub-Lead)`, with the usual fields plus one line:
  `**Lead check:** <the logic to read in the diff, the risk if it is wrong, checks run with numbers, checks deferred>`.
- **Revision numbers:** on a branch shared with the Lead, take the next number as usual. On a `sublead/<topic>`
  branch, head the entry `## S-<yyyymmdd>-<n> | …`; the Lead gives it the real revision number when it integrates
  the branch.
- **Owner language:** plain Indonesian, recommendation first, as `AGENTS.md` requires.

## How the Lead reviews it

- In batches, not per commit: read each `(Sub-Lead)` changelog entry and its diff; judge the logic, the tier the
  Sub-Lead chose, and whether anything should have been escalated.
- Record the verdict in the next Lead revision: `PASS`, `CORRECTION REQUIRED` (one consolidated correction for the
  Sub-Lead) or `BLOCKED`. A task that should have been escalated is a finding even when the code is right.
- Run the deferred checks at integration: full `npm test`, build, `npm run test:e2e` for shell/layout work, and the
  browser walk for user-facing changes, before any merge the owner asks for.
- If a pattern of misjudged tiers appears, narrow this lane here and tell the owner.
