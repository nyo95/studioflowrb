# Agent Entry Point

## Mandatory reading order

1. `docs/README.md`
2. `CHANGELOG.md` for the published baseline, current local revision, and next revision
3. The shared contract relevant to the task: `CORE.md`, `DESIGN.md`, and/or `UI_ENGINE.md`
4. The active work order, when one exists. There is currently no executable app
   work order. `docs/apps/masterdata.md` indexes approved logic contracts only.
5. `prisma/schema.prisma` for the implemented persisted shape
6. The relevant current code, tests, and migrations

## Authority order

1. Explicit current owner instruction
2. `CORE.md`, `DESIGN.md`, or `UI_ENGINE.md` within its shared concern
3. An active app contract when one has been approved
4. Schema/migrations as implemented-state evidence
5. Current code/tests as behavior evidence
6. Legacy code at an exact commit as evidence only

The local `../studioflow` checkout is known to be behind the owner's office version. Before using it, record the resolved commit and dirty state. Read committed evidence with `git show`; name working-tree-only evidence separately. Never make the rebuild depend on the legacy repository.

## Legacy evidence workflow

For every legacy feature, inspect the end-to-end implementation where it exists:

1. route and navigation;
2. component state and interaction;
3. server action/API;
4. service/domain rules;
5. query, transaction, and persisted relations;
6. permission, audit, import/export, and downstream reads;
7. tests, migrations, error handling, and comments that explain defects.

Classify each observed behavior as **KEEP**, **FIX**, **MERGE**, or **PURGE** and record exact paths/symbols plus the rebuild destination. Prose, screenshots, and schema alone never replace reading the implementation.

## Foundation-first rule

Every feature identifies the capabilities it needs before app implementation:

- **REUSE** an existing shared contract;
- **EXTEND** a shared contract whose purpose already fits;
- **ADD** a missing domain-neutral capability;
- keep business policy **APP-OWNED**;
- **PURGE** unsafe or contradicted behavior.

Core, Utilities, and UI Engine must stay reusable by Master Data, StudioFlow, BQ, and future apps. A missing generic mechanism is added to the shared layer and tested there; an app does not create a private substitute. Core may own platform identity, UserRole assignments, and grant persistence, but shared layers never contain app-entity roles, contextual business authorization, app persistence policy, or business defaults.

A documented deferred capability is not permission to implement it. Activate it only when a locked stage or approved consumer proves the need. Do not create empty modules, speculative dependencies, or broad generic helpers merely to reserve a name.

## UI quality gate

Component reuse alone is not completion. Verify the running workflow for information hierarchy, search, filters, sorting, pagination, selection, quick entry, detail/edit flow, destructive confirmation, unsaved input, loading/empty/error/disabled/archived/permission states, long content, desktop, collapsed rail, and narrow viewport.

Raw legacy `ui-*` classes may not bypass an available UI Engine component. If the shared component is weak, improve it once at the engine level and then consume it from the app.

## Manager-first execution

The active manager/navigator is PM/TL for architecture, domain, ownership, schema/calculation decisions, legacy classification, contracts, work orders, and review. Until the owner changes the assignment, Codex is the navigator and the owner-operated OpenCode session is the coding executor. Deterministic CRUD, tests, mechanical refactors, and UI implementation against a locked contract are executed through an explicit work order. An executor makes no product or architecture decisions; on ambiguity or code/contract mismatch it stops and reports the discrepancy.

Direct PM/TL code changes are limited to genuinely ambiguous architecture/domain work, risky migration, cross-app boundaries, or critical bugs that cannot yet be reduced to deterministic instructions.

The navigator must:

- lock every material architecture, security, ownership, schema, and dependency choice before execution;
- issue a deterministic work order and target revision;
- review the executor commit, code paths, migration, tests, and real browser behavior;
- record acceptance, required correction, or a precise blocker;
- issue any correction as the next local revision rather than silently rewriting the executor commit.

The executor must:

- implement only the locked work order and named dependency versions;
- inspect current code before replacing it and preserve unrelated owner changes;
- stop instead of inventing product policy, a schema meaning, a permission, a fallback, or an unapproved dependency;
- update the changelog and make the required local commit after its implementation and checks complete;
- never push, publish, open a PR, or alter remote state.

Any future AI starts as navigator unless the owner explicitly gives it a locked executor work order. Model or tool choice never changes these authority boundaries.

## Revision, changelog, and local-commit protocol

`CHANGELOG.md` is the revision ledger. A task is not reported as finished until its cohesive changes are documented there, validated, and committed locally.

### Revision format

- `R<N>` is the most recent owner-authorized GitHub/published baseline. The initial recorded baseline is `R1` at commit `c8e473702801510aa314bbed45242a71b600f733`.
- Local-only work increments a two-or-more digit ordinal under that baseline: `R1.01`, `R1.02`, `R1.03`, …, `R1.99`, `R1.100`.
- A local commit subject is exactly `R<N>.<NN> | <type>(<scope>): <imperative summary>`.
- Example: `R1.02 | feat(foundation): implement identity access and settings`.
- A local revision is an ordinal label, not a decimal number. Never reuse, renumber, or skip to a lower suffix.
- Only an explicit owner instruction to publish/push promotes the next whole revision (`R2`, then `R3`, and so on). Promotion uses a dedicated `R<N> | release: <summary>` commit and changelog entry; existing local commit subjects are not rewritten.
- After a whole revision is actually published, the next local change starts at that baseline's `.01`.

### Required sequence for every completed change set

1. Record `git rev-parse HEAD`, branch, remote/published baseline, existing revision entries, and the complete dirty-file list before editing.
2. Determine the next unused revision from `CHANGELOG.md`; never guess from memory.
3. Edit only the files owned by the approved request/work order. Do not reset, stash, clean, overwrite, or stage unrelated dirty files.
4. Run the proportionate required checks. A cancelled, skipped, or unavailable mandatory check is not a pass and must be named in the changelog/report.
5. Add one changelog entry containing scope, important behavior/contract changes, migrations/dependencies, checks run, and remaining limitations.
6. Stage only owned files, inspect `git diff --cached` and `git diff --cached --check`, then create exactly one local commit with the required revision subject.
7. Report the revision, commit hash, checks, and any still-uncommitted unrelated files. Never claim a clean tree when reserved owner changes remain.

Review corrections use the next revision and a new commit; do not amend or squash unless the owner explicitly orders it. If work is genuinely blocked before it is coherent and verifiable, do not create a misleading completion commit: preserve the diff, report the blocker and exact uncommitted files, and wait for a manager decision.

### Remote safety

A request to change, build, commit, or finish authorizes local commits only. It never authorizes `git push`, remote tag creation, pull-request creation/merge, deployment, or release publication. Those actions require a separate explicit owner instruction. Fetching/read-only remote inspection is allowed only when required by the task; it does not change the revision baseline.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
