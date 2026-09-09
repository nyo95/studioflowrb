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

## Legacy isolation and location rule

StudioFlow legacy has different checkout locations and may have different local
states on the owner's home and office computers. Never assume `../studioflow`, a
drive letter, a saved path, or that a previously observed checkout is the one the
owner intends to use.

### Required owner verification before continuation

This project is worked on from both the owner's home and office computers. At
the start of a new computer/session, or whenever the environment has changed,
ask one short question: **"Ini kerja di mana: rumah atau kantor?"**

Use the current checkout location as the identity of the rebuild repository. Do
not ask the owner to restate its path when the agent is already running in this
checkout. The home/office answer selects the matching local environment file:

- `rumah`: load `.env.rumah`;
- `kantor`: load `.env.kantor`.

These files are local-only configuration and must not be committed or copied
between computers. If the selected file is missing or its target is ambiguous,
stop and ask only for the missing local setup detail.

For Prisma and other repository tooling, set `STUDIOFLOW_LOCATION` to `rumah` or
`kantor` before running the command so it selects the corresponding file.

Both locations use a new rebuild-only PostgreSQL instance through Docker. The
database name, schema, and application contract are intentionally identical at
home and office; only connection details such as host, port, or Docker service
may differ. Select the target through the location-specific environment file,
and verify that it is rebuild-only before any database command. Do not require
the owner to provide the database name or full Docker target on every session.

Legacy evidence remains a separate exception: when it is actually required,
stop and ask the owner for the exact StudioFlow legacy repository path on the
current computer. Do not discover it by broadly scanning drives or sibling
folders.

After the owner supplies the path, resolve and record that exact path, commit,
branch, and dirty state before reading evidence. A path supplied for one
computer/session is not a portable default for another computer.

The legacy repository is strictly read-only evidence:

- never edit, format, generate into, stage, commit, stash, reset, clean, switch,
  merge, rebase, pull, push, install dependencies in, or otherwise alter it;
- never run its application, scripts, seeds, migrations, tests, or commands that
  may write files, caches, dependencies, generated output, or external state;
- inspect committed evidence with read-only Git operations such as `git show`;
  name working-tree-only evidence separately and never modify it;
- never copy its code, schema, migrations, database, or configuration into the
  rebuild as an implementation starting point; legacy informs behavior only;
- never make the rebuild depend on the presence, path, branch, or availability
  of the legacy repository.

StudioFlow legacy PostgreSQL is completely out of scope. Never connect to,
query, inspect, dump, restore, migrate, seed, reset, truncate, or otherwise touch
any database, server, schema, role, connection string, container, volume, backup,
or service used by or capable of affecting StudioFlow legacy. Do not run a
command when its database target is absent, ambiguous, inherited from the legacy
environment, or not proven to be rebuild-only.

The rebuild starts from zero and owns isolated code, migrations, configuration,
and PostgreSQL resources. Before any database command that can write or apply a
migration, verify that its explicit target belongs only to
`studioflow-rebuild`; otherwise stop and ask the owner. No legacy data migration
or compatibility dependency is implied unless the owner later approves a
separate, explicit, safely isolated work order.

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

Core, Utilities, and UI Engine must stay reusable by Master Data, StudioFlow, BQ, and future apps. A missing generic mechanism is added to the shared layer and tested there; an app does not create a private substitute. Every shared capability has one canonical implementation, one public export, and an explicit consumer matrix. A capability is not considered shared merely because its contract says so: each consumer must import the canonical export, and boundary checks/tests must prove that no duplicate app-local implementation exists. If the canonical API is insufficient, improve it once at the shared layer and update all affected consumers in the same change set. Core may own platform identity, UserRole assignments, and grant persistence, but shared layers never contain app-entity roles, contextual business authorization, app persistence policy, or business defaults.

A documented deferred capability is not permission to implement it. Activate it only when a locked stage or approved consumer proves the need. Do not create empty modules, speculative dependencies, or broad generic helpers merely to reserve a name.

## UI quality gate

Component reuse alone is not completion. Verify the running workflow for information hierarchy, search, filters, sorting, pagination, selection, quick entry, detail/edit flow, destructive confirmation, unsaved input, loading/empty/error/disabled/archived/permission states, long content, desktop, collapsed rail, and narrow viewport. For every shared capability used by more than one app, the acceptance evidence must name the canonical export and exercise each listed consumer for both behavior and visual consistency. A passing single-app smoke test is not evidence of shared reuse.

Raw legacy `ui-*` classes may not bypass an available UI Engine component. If the shared component is weak, improve it once at the engine level and then consume it from the app. Private copies or app-local wrappers that reproduce an existing shared capability are prohibited unless the contract explicitly documents a genuinely different domain behavior; such an exception must name the canonical component, explain the difference, and add a regression test preventing accidental convergence drift.

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

## Imported Claude Cowork project instructions

disini kamu kerja bareng dengan codex,  kamu akan banyak handoff dan takeover kerjaan bersama dengan codex nantinya
