# Documentation Hub

Status: reconciled through **R8.24** on 2026-09-13. Contracts under `docs/apps/`
were reorganized into one subfolder per application on 2026-09-10 at owner
request; content is unchanged except for corrected cross-links.

This directory contains active contracts, operational trackers, architecture
roadmaps, and retained historical evidence. Current owner instruction remains
the highest authority. `CHANGELOG.md` is the revision ledger; code, schema,
tests, and migrations prove implemented state.

## Operational documents

| Document | Purpose |
|---|---|
| [`alignment.md`](alignment.md) | Owner explanation of how the StudioFlow rebuild preserves legacy outcomes while simplifying the workflow |
| [`UTILITY-INVENTORY.md`](UTILITY-INVENTORY.md) | Evidence-backed disposition ledger (REUSE/EXTEND/ADD/APP-OWNED/PURGE) for shared utilities and their duplicates; enforced by `scripts/check-boundaries.mjs` |
| [`roadmap.md`](roadmap.md) | Remaining planned work, grouped by Platform, UI Engine, Master Data, BQ, and StudioFlow |
| [`knownbug.md`](knownbug.md) | Open and closed defects grouped by application |
| [`review.md`](review.md) | Implemented-but-unverified work, grouped by application — distinct from `roadmap.md` (not built) and `knownbug.md` (confirmed defect) |
| [`REVISION-LEDGER-NOTES.md`](REVISION-LEDGER-NOTES.md) | Historical missing/skipped revision labels and how to interpret them |
| [`SESSION-HANDOFF-PROMPT.md`](SESSION-HANDOFF-PROMPT.md) | Compact continuation prompts for Planner/Reviewer and Executor sessions |
| [`agent/README.md`](agent/README.md) | Two-lane AI harness: coherent work sizing, handoff loop, context, and revision rules |
| [`agent/PLANNER.md`](agent/PLANNER.md) | Planning half of the Planner/Reviewer Navigator lane |
| [`agent/EXECUTOR.md`](agent/EXECUTOR.md) | Autonomous implementation within a READY plan's locked boundaries |
| [`agent/REVIEWER.md`](agent/REVIEWER.md) | Risk-shaped verification and next-plan preparation |
| [`StudioFlow workflow closure draft`](../scripts/work-orders/STUDIOFLOW-R7.56-WORKFLOW-CLOSURE.md) | **paused** by the owner priority below; assign the next unused revision when reactivated, not the historical filename's R7.56 |
| [`StudioFlow R7.48 work order`](../scripts/work-orders/STUDIOFLOW-R7.48-PHASE-DELIVERABLE.md) | implemented in R7.48; retained as history |
| [`StudioFlow R7.49 work order`](../scripts/work-orders/STUDIOFLOW-R7.49-COHERENT-WORK-SURFACE.md) | implemented in R7.50; retained as history |
| [`StudioFlow R7.52 MOM work order`](../scripts/work-orders/STUDIOFLOW-R7.52-MOM.md) | implemented in R7.52; retained as history |


A work order marked *implemented* above is evidence of what was built, never an
instruction to rebuild it. New execution authority lives in the root READY
`PLAN.md`; historical work orders are not automatically active.

Earlier [`UIUX-CURATE`](../scripts/work-orders/UIUX-CURATE.md) and
[`BQ-MASTERDATA-HARDENING`](../scripts/work-orders/BQ-MASTERDATA-HARDENING.md)
orders remain implementation history. Where historical documents conflict with
current owner instructions, current contracts, or the implemented evidence recorded in `CHANGELOG.md`,
the newer authority wins.

This repository keeps only the shared contracts and active app contracts that
have been reviewed for the current rebuild. A contract is not an executable work
order unless it says so explicitly.

## Contracts and active evidence

Documents are grouped by the application they belong to. Each row identifies
whether it is current authority or historical implementation evidence. Shared
contracts sit outside any app folder because every app depends on them.

### Shared platform (governs every app)

| Contract | Owns |
|---|---|
| [`CORE.md`](../CORE.md) | staged foundation: database, real identity/login, persisted RBAC, General Settings, audit, errors, validation, shared utilities, capability registry, and public boundaries |
| [`DESIGN.md`](../DESIGN.md) | shared visual language and density |
| [`UI_ENGINE.md`](../UI_ENGINE.md) | reusable UI components, layouts, and interaction patterns |

### Platform Foundation

| Contract | Owns |
|---|---|
| [`apps/platform/PLATFORM-ASSET-STORAGE-ROADMAP.md`](apps/platform/PLATFORM-ASSET-STORAGE-ROADMAP.md) | locked storage/Brand mark decisions activated by the current PF-1 `PLAN.md` |

### UI Engine

| Contract | Owns |
|---|---|
| [`apps/ui-engine/date-time-lookup-audit-2026-09-10.md`](apps/ui-engine/date-time-lookup-audit-2026-09-10.md) | audit of canonical date/time and project/client lookup controls across Master Data, BQ, and StudioFlow; recommends a consolidation, not yet executed |

### Master Data

| Contract | Owns |
|---|---|
| [`apps/masterdata/masterdata.md`](apps/masterdata/masterdata.md) | Master Data contract index, shared lifecycle/deletion rules, capability placement, and remaining deferred decisions |
| [`apps/masterdata/brand-contract.md`](apps/masterdata/brand-contract.md) | owner-approved Brand identity, relations, discovery, lifecycle, deletion, UI, and public boundary |
| [`apps/masterdata/vendor-contract.md`](apps/masterdata/vendor-contract.md) | owner-approved Vendor identity, types/capabilities, contacts/links, Brand relations, lifecycle, deletion, and UI |
| [`apps/masterdata/pricing-contract.md`](apps/masterdata/pricing-contract.md) | owner-approved three-table Pricing model, validation, lifecycle, permissions, UI, migration, and downstream reads |

### BQ

| Contract | Owns |
|---|---|
| [`apps/bq/bq-contract.md`](apps/bq/bq-contract.md) | owner-approved BQ logic contract: inline editing at every level, all three L3 sources, server-owned calculation and rounding policy |
| [`apps/bq/bq-implementation-plan.md`](apps/bq/bq-implementation-plan.md) | phase-by-phase execution plan against the BQ contract |
| [`apps/bq/bq-ux-spec.md`](apps/bq/bq-ux-spec.md) | BQ surface and UI component reference |

### StudioFlow

| Contract | Owns |
|---|---|
| [`apps/studioflow/studioflow.md`](apps/studioflow/studioflow.md) | frozen RB contract index and implemented ownership evidence; recovery authority comes from the Recovery Reference and active roadmap |
| [`apps/studioflow/D-SF-RECOVERY-DISCOVERY.md`](apps/studioflow/D-SF-RECOVERY-DISCOVERY.md) | R8.48 pinned legacy evidence and R8.51 owner-ratified classification/decision register; informs F-C/F-D before later StudioFlow implementation |
| [`apps/studioflow/studioflow-project-contract.md`](apps/studioflow/studioflow-project-contract.md) | frozen RB Client/Project/workflow contract and implementation evidence; parity differences require D-SF classification |
| [`apps/studioflow/studioflow-ux-spec.md`](apps/studioflow/studioflow-ux-spec.md) | StudioFlow surface reference; partially implemented and subordinate to current owner alignment |
| [`apps/studioflow/studioflow-implementation-plan.md`](apps/studioflow/studioflow-implementation-plan.md) | historical R7 execution plan; superseded for recovery scope and sequencing |
| [`apps/studioflow/studioflow-schedule-contract.md`](apps/studioflow/studioflow-schedule-contract.md) | ratified project-owned catalogue/Schedule direction; global R7 premise is historical and Schedule remains unactivated |
| [`apps/studioflow/studioflow-mom-contract.md`](apps/studioflow/studioflow-mom-contract.md) | ratified canonical MOM lifecycle/content floor; remaining module recovery is later roadmap work |
| [`apps/studioflow/studioflow-work-orders.md`](apps/studioflow/studioflow-work-orders.md) | historical decision/work-order ledger; use `roadmap.md` for current remaining work |
| [`apps/studioflow/STUDIOFLOW-LEGACY-AUDIT-ROADMAP.md`](apps/studioflow/STUDIOFLOW-LEGACY-AUDIT-ROADMAP.md) | historical read-only audit and staged roadmap; implemented phases and remaining work are reconciled in `roadmap.md` |

Execution and continuity are governed by [`AGENTS.md`](../AGENTS.md) and
[`CHANGELOG.md`](../CHANGELOG.md). The completed
[`Foundation F0 work order`](../scripts/work-orders/FOUNDATION.md) is retained as
historical implementation evidence. The executable app work order is the one
marked active in the table above.

Master Data, BQ, and the implemented StudioFlow project workflow are active
applications. Their current contracts, schema, migrations, services, public
boundaries, tests, and browser behavior are implementation evidence. Remaining
features and defects are listed only in `roadmap.md` and `knownbug.md`;
implemented-but-unverified work is listed in `review.md`.

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

Status: **superseded 2026-09-10 by explicit owner instruction.** The order
below replaces the previous Master-Data-first sequence; it is the current
execution priority, not a change to what `roadmap.md` lists as remaining.

1. **Platform Foundation — routing first.** Main-route/routing settings are the
   core app boundary everything else sits behind.
2. **UI Engine and Shared Utilities.**
3. **BQ.** The simplest remaining app; keep its reusable utilities in the
   shared platform layer, not app-local — see `apps/bq/`.
4. **AI file-organization exploration is parked**, not pursued for now (see
   `roadmap.md`, Discovery and automation).
5. **Everything else waits** — Master Data closure, StudioFlow's
   client-answer/archive/phase-admin work (KB-013…KB-017), cross-app hardening,
   and validation all hold until 1–3 above land.

Documented deferred capabilities are routing memory, not implementation scope. Do not create code, folders, dependencies, or placeholder exports until a stage/consumer activates them.
