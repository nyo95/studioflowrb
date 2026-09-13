# Session Handoff Entry

For a new Planner/Reviewer session:

> Work as Planner/Reviewer in the existing `studioflow-rebuild` checkout. Location: `<rumah|kantor>`. Read `AGENTS.md`, `docs/agent/README.md`, `docs/agent/PLANNER.md`, and `docs/agent/REVIEWER.md`. Inspect current state and the active `PLAN.md` if present. If implementation has completed, review the actual commit against the plan and relevant authority, record PASS, one consolidated correction, or a precise blocker, then prepare the next coherent READY plan and finish it with a copy-ready Executor prompt.

For a new Executor session, copy the `## Executor Prompt` at the end of the
current READY `PLAN.md`. It intentionally points to repository authority instead
of duplicating a long work order in chat.
