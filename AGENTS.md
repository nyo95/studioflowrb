# Agent Entry Point

This is the bootstrap and invariant contract for every AI session in this checkout. Identify role and scope first, then load only the authority needed for that work.

## Session handshake and role router

At the start of a new computer/session, ask one compact setup question, omitting facts already known from the active session/environment:

> Agent apa yang sedang bekerja (Codex / Claude / OpenCode / other), role-nya Planner / Executor / Reviewer, dan ini kerja di rumah atau kantor?

Roles are explicit session assignments, not model/tool identities. When no role is assigned, work as **PLANNER** until the owner assigns another role.

- **PLANNER** — read `docs/agent/PLANNER.md`; turns incomplete owner intent into a ratified, executable plan.
- **EXECUTOR** — read `docs/agent/EXECUTOR.md`; implements only a READY plan slice or active deterministic work order.
- **REVIEWER** — read `docs/agent/REVIEWER.md`; independently verifies intended behavior before judging the implementation.

Read `docs/agent/README.md` to select scoped context. Never load every app contract, roadmap section, or legacy artifact merely because it exists.

## Manager-first execution

The role model refines manager-first execution: **Planner** is the PM/TL
product-and-architecture navigator, **Executor** is the deterministic
implementation worker, and **Reviewer** is the independent verification
navigator. Tool or model name never grants a role. Planner locks material
architecture, domain, ownership, schema, calculation, security, and dependency
decisions before execution; Executor must stop for an unresolved decision;
Reviewer records PASS, required correction, or a precise blocker. Corrections
are always the next local revision, never a silent rewrite of an accepted commit.

## Global authority and communication

1. Explicit current owner instruction.
2. `CORE.md`, `DESIGN.md`, or `UI_ENGINE.md` within its shared concern.
3. An approved active app contract.
4. Schema/migrations as implemented-state evidence.
5. Current code/tests as behavior evidence.
6. Legacy code at an exact recorded commit as evidence only.

Explain plans, findings, status, trade-offs, and problems to the owner in plain everyday language. Contracts, code, and commit messages retain technical precision.

## Location, rebuild database, and legacy isolation

The current checkout identifies the rebuild repository. Do not ask for its path. The home/office answer selects local-only configuration:

- `rumah`: load `.env.rumah`;
- `kantor`: load `.env.kantor`.

Never commit or copy either file. Set `STUDIOFLOW_LOCATION` to the selected value before Prisma or other repository tooling. Both locations use isolated rebuild-only PostgreSQL; verify the explicit target is `studioflow-rebuild` before *any* database command, and stop if the target is absent or ambiguous.

Legacy is separate, read-only evidence. When needed, ask the owner for its exact path on this computer, then record path, commit, branch, and dirty state before reading it. Do not scan drives or assume a path. Never edit, format, generate into, install in, run, test, migrate, seed, reset, stash, clean, switch, merge, rebase, pull, push, or otherwise alter legacy. Inspect committed evidence with read-only Git commands and name any working-tree-only evidence separately. Never copy legacy code, schema, migrations, database, or configuration as an implementation base.

StudioFlow legacy PostgreSQL is completely forbidden. Never connect to, query, inspect, dump, restore, migrate, seed, reset, truncate, or otherwise touch any legacy database, server, schema, role, connection string, container, volume, backup, or service. Never run a database command whose target could be legacy.

For activated legacy work, inspect end-to-end route/navigation, UI state, server boundary, domain rules, persistence/transaction, permissions/audit, downstream reads, tests/migrations/errors. Classify behavior as **KEEP**, **FIX**, **MERGE**, or **PURGE**, with exact paths/symbols and rebuild destination. Prose, screenshots, and schema alone are not sufficient evidence.

## Foundation and ownership invariants

Every feature must classify its needed capability: **REUSE** an existing shared contract, **EXTEND** one whose purpose fits, **ADD** a proven missing domain-neutral capability, keep policy **APP-OWNED**, or **PURGE** contradicted behavior. Deferred documentation is not permission to create placeholders, dependencies, helpers, or modules.

Core, Utilities, and UI Engine are reusable by every app. A generic capability has one canonical implementation, public export, consumer matrix, and boundary evidence; an app may not create a private substitute. Improve an insufficient canonical API once in the shared layer and update affected consumers together. Shared layers never own app roles, contextual business authorization, persistence policy, or business defaults.

Allowed dependencies are `app -> platform` and `app -> other-app/public`. Forbidden dependencies are `platform -> app`, cross-app internal imports, implicit cross-app writes, and cross-app database foreign keys. Consumers must snapshot facts when later upstream changes must not rewrite historical meaning.

No raw legacy `ui-*` class may bypass an available UI Engine component. A real exception must name the canonical component, explain its domain difference, and have a regression test against accidental convergence drift.

## Evidence, ledgers, revision, and remote safety

`PLAN.md` is temporary planning workspace; `docs/roadmap.md` is approved work not yet built; `docs/review.md` is built work awaiting sufficient verification; `docs/knownbug.md` is a reproducible verified defect; `CHANGELOG.md` is the accepted revision ledger. Detailed transition rules are in `docs/agent/README.md`.

Before editing, record HEAD, branch, remote/published baseline, existing revision entries, and the complete dirty-file list. Determine the next unused revision from `CHANGELOG.md`; never infer it from memory. Preserve unrelated owner changes, stage only owned files, inspect staged diff and whitespace, and make exactly one local revision commit for each cohesive completed change set. Run proportionate checks; a skipped, unavailable, or cancelled mandatory check is not a pass and must be reported. Do not call work complete without the required changelog, validation, and local commit.

When an audit proves a defect not fixed in its scoped change, record it in `docs/knownbug.md`; do not discard it. Remove/strike roadmap work only after actual end-to-end verification. Review corrections always use the next local revision; never silently amend an accepted commit.

A request to change, build, commit, or finish authorizes local commits only. It never authorizes push, remote tag, pull request, merge, deployment, publication, or release. Those require separate explicit owner instruction.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
