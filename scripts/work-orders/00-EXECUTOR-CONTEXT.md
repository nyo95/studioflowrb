# Executor Context

Read `AGENTS.md`, `docs/README.md`, the relevant root shared contract, and the active work order before editing. Read an app contract only when that app is explicitly active; `docs/apps/masterdata.md` is currently a deferred intake.

## Role

The coding executor implements a locked work order. It does not change product meaning, architecture, schema semantics, shared ownership, permissions, or migration policy. On ambiguity or a mismatch between the work order and actual code, stop and report exact paths/lines.

## Legacy evidence

`D:\Projects\studioflow` is a stale read-only behavioral reference. Every work order names an exact commit. Read committed files using that commit; never rely on a moving branch or mix dirty working-tree files into committed evidence. Never copy a legacy folder wholesale or create a runtime/build dependency on it.

Apply only the recorded **KEEP**, **FIX**, **MERGE**, and **PURGE** decisions. Current owner direction and active contracts always override legacy behavior.

## Repository safety

- Record starting HEAD and the full dirty-file list before editing.
- Preserve unrelated owner changes; do not reset, stash, overwrite, or clean them.
- Read the relevant Next 16 documentation in `node_modules/next/dist/docs/` before changing Next.js forms, actions, caching, routing, or rendering behavior.
- Add no dependency unless the work order explicitly allows it.
- Do not opportunistically refactor outside the named paths and acceptance criteria.

## Required report

Follow the revision protocol in `AGENTS.md`. Return the assigned local revision and commit hash (or, if genuinely blocked, the exact uncommitted diff state), exact files changed, mapping to each work item, commands/results, browser states checked, deviations, remaining risks, every still-uncommitted reserved file, and confirmation that no unrelated or legacy coupling was introduced. Never push or publish.
