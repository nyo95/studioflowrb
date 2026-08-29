# Active Documentation

This repository keeps only contracts that affect the current foundation scope and the short intake for its first consumer.

## Active contracts

| Contract | Owns |
|---|---|
| [`CORE.md`](../CORE.md) | staged foundation: database, real identity/login, persisted RBAC, General Settings, audit, errors, validation, shared utilities, capability registry, and public boundaries |
| [`DESIGN.md`](../DESIGN.md) | shared visual language and density |
| [`UI_ENGINE.md`](../UI_ENGINE.md) | reusable UI components, layouts, and interaction patterns |
| [`apps/masterdata.md`](apps/masterdata.md) | deferred first-app intake and already approved owner direction; not an executable app contract yet |

Execution and continuity are governed by [`AGENTS.md`](../AGENTS.md), [`CHANGELOG.md`](../CHANGELOG.md), and the locked [`Foundation F0 work order`](../scripts/work-orders/FOUNDATION.md).

StudioFlow and BQ contracts are intentionally absent until those apps become active. Master Data is the first consumer, but its full code-derived contract is also deferred until Foundation F0 and UI-F1 pass. Legacy code may be inspected as evidence; it never authorizes implementation by itself.

## Authority order

When facts disagree, use this order:

1. the owner's latest explicit instruction;
2. `CORE.md`, `DESIGN.md`, and `UI_ENGINE.md` for their respective shared concerns;
3. an active app contract when the owner has activated one;
4. `prisma/schema.prisma` and migrations as evidence of the currently implemented database;
5. current code and tests as evidence of current behavior;
6. legacy code at an exact recorded commit as behavioral evidence only.

The local `../studioflow` checkout is known to be behind the owner's office version. Never treat its branch tip, dirty working tree, Markdown, or schema alone as current product truth. Record the exact commit and inspect the relevant committed code end to end.

## Minimum product bar

The rebuild must preserve at least the useful workflow level proven by StudioFlow while applying current owner corrections. A feature is not complete because a table exists or a shared component was imported. Its route, interaction, server boundary, domain rules, transaction, persistence, permissions, audit, import/export, downstream reads, error states, and real browser behavior must work together.

For every legacy capability, classify the observed behavior:

- **KEEP** — preserve the behavior;
- **FIX** — preserve the intent and correct the defect;
- **MERGE** — replace duplicate implementations with one canonical implementation;
- **PURGE** — remove obsolete, unsafe, misleading, or contradicted behavior.

When a feature needs a domain-neutral capability that is missing, add it to Core, Utilities, or UI Engine first and consume it from the app. App-owned business policy must not leak into the shared layer.

## Dependency law

Allowed: `app -> platform` and `app -> other-app/public`.

Forbidden: `platform -> app`, cross-app internal imports, implicit cross-app writes, and database foreign keys across app ownership boundaries. Consumers snapshot business facts when later upstream changes must not rewrite historical meaning.

## Active sequence

1. OpenCode implements the locked `CORE.md` Stage F0 plus `UI_ENGINE.md` UI-F0 in the assigned local revision;
2. the Codex navigator reviews the implementation commit and real running workflows, issuing a new correction revision if required;
3. activate and verify UI-F1 immediately before Master Data;
4. replace the Master Data intake with a complete code-derived contract and obtain owner approval;
5. only then issue Master Data implementation work; StudioFlow and BQ remain deferred.

Documented deferred capabilities are routing memory, not implementation scope. Do not create code, folders, dependencies, or placeholder exports until a stage/consumer activates them.
