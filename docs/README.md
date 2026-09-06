# Active Documentation

## Current UI/UX remediation handoff — 2026-09-06

[`UIUX-CURATE`](../scripts/work-orders/UIUX-CURATE.md) is the locked navigator
work order for the owner's design-audit remediation request. It targets the
existing UI Engine, Master Data, BQ and platform UI. The owner explicitly assigned
Codex as executor for this task on 2026-09-06, overriding the default OpenCode role.
The handoff is R5.03; implementation is expected at the next unused revision,
R5.04. No implementation or browser acceptance is claimed by this handoff.
Its explicit scope takes precedence over the historical foundation-only phase
descriptions below; it does not activate new StudioFlow domain features.

This repository keeps only the shared contracts and active app contracts that
have been reviewed for the current rebuild. A contract is not an executable work
order unless it says so explicitly.

## Active contracts

| Contract | Owns |
|---|---|
| [`CORE.md`](../CORE.md) | staged foundation: database, real identity/login, persisted RBAC, General Settings, audit, errors, validation, shared utilities, capability registry, and public boundaries |
| [`DESIGN.md`](../DESIGN.md) | shared visual language and density |
| [`UI_ENGINE.md`](../UI_ENGINE.md) | reusable UI components, layouts, and interaction patterns |
| [`apps/masterdata.md`](apps/masterdata.md) | Master Data contract index, shared lifecycle/deletion rules, capability placement, and remaining deferred decisions |
| [`apps/brand-contract.md`](apps/brand-contract.md) | owner-approved Brand identity, relations, discovery, lifecycle, deletion, UI, and public boundary |
| [`apps/vendor-contract.md`](apps/vendor-contract.md) | owner-approved Vendor identity, types/capabilities, contacts/links, Brand relations, lifecycle, deletion, and UI |
| [`apps/pricing-contract.md`](apps/pricing-contract.md) | owner-approved three-table Pricing model, validation, lifecycle, permissions, UI, migration, and downstream reads |

Execution and continuity are governed by [`AGENTS.md`](../AGENTS.md) and
[`CHANGELOG.md`](../CHANGELOG.md). The completed
[`Foundation F0 work order`](../scripts/work-orders/FOUNDATION.md) is retained as
historical implementation evidence; there is currently no executable app work
order.

StudioFlow and BQ contracts are intentionally absent until those apps become
active. R1.06 removes every old/speculative application route, module, seed, and
active database schema. Brand, Vendor, and Pricing remain approved Master Data
logic contracts, but they do not authorize implementation until UI-F1, their
remaining dependencies, and an explicit work order are locked. Category, SKU,
Unit, media, Samples, import, and BQ snapshot details remain deferred as recorded
in the Master Data index. Deleted code is recoverable as Git evidence only; it
never authorizes implementation by itself.

## Authority order

When facts disagree, use this order:

1. the owner's latest explicit instruction;
2. `CORE.md`, `DESIGN.md`, and `UI_ENGINE.md` for their respective shared concerns;
3. an active app contract when the owner has activated one;
4. `prisma/schema.prisma` and migrations as evidence of the currently implemented database;
5. current code and tests as evidence of current behavior;
6. legacy code at an exact recorded commit as behavioral evidence only.

StudioFlow legacy checkout locations and local states differ between the owner's
home and office computers. When legacy evidence is needed, follow
`AGENTS.md`: ask the owner for the exact path on the current computer, record its
commit and dirty state, and use it as strictly read-only behavioral evidence.
Never touch its repository or PostgreSQL resources, copy it as an implementation
base, or make the rebuild depend on it. The rebuild starts from zero with isolated
code, migrations, configuration, and database resources.

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

1. preserve and verify the Foundation-only baseline;
2. audit UI Engine against `DESIGN.md`, `UI_ENGINE.md`, and the useful interaction
   quality proven by committed legacy StudioFlow screens;
3. implement and verify UI-F1 before any Master Data route or domain UI is built;
4. complete and approve the remaining Master Data domain contracts and exact
   migration/recovery plan without reopening the approved Brand, Vendor, and
   Pricing product decisions;
5. issue a deterministic Master Data implementation work order only after its
   dependencies and acceptance tests are locked; StudioFlow and BQ remain
   deferred.

Documented deferred capabilities are routing memory, not implementation scope. Do not create code, folders, dependencies, or placeholder exports until a stage/consumer activates them.
