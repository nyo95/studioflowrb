# Documentation Hub

Status: reconciled through **R8.107** on 2026-09-22. Contracts under `docs/apps/`
were reorganized into one subfolder per application on 2026-09-10 at owner
request; content is unchanged except for corrected cross-links.

**2026-09-22 consolidation:** `roadmap.md`, `review.md`, and `knownbug.md`
were merged into one worklist, [`BACKLOG.md`](BACKLOG.md), at owner request —
the three-way "not built / not verified / confirmed defect" distinction now
lives as a `[PLANNED]`/`[UNVERIFIED]`/`[BUG]`/`[CLEANUP]` tag on each entry
inside that single file instead of three separate files. The originals are
preserved with their full historical/closed record in `archive/` (see table
below). Two ad-hoc audit documents from this same pass
(`CODEBASE_LOGIC_REVIEW.md`, `apps/studioflow/REVIEW-ALIGNMENT.md`) were also
archived after their real findings were fixed or folded into `BACKLOG.md`.

This directory contains active contracts, operational trackers, architecture
roadmaps, and retained historical evidence. Current owner instruction remains
the highest authority. `CHANGELOG.md` is the revision ledger; code, schema,
tests, and migrations prove implemented state.

## Operational documents

| Document | Purpose |
|---|---|
| ~~[`alignment.md`](archive/studioflow-rb/alignment.md)~~ | **Superseded** — R7.xx rebuild alignment artifact; moved to `archive/studioflow-rb/` in R8.75. The active StudioFlow authority is the rework contract. |
| [`UTILITY-INVENTORY.md`](UTILITY-INVENTORY.md) | Evidence-backed disposition ledger (REUSE/EXTEND/ADD/APP-OWNED/PURGE) for shared utilities and their duplicates; enforced by `scripts/check-boundaries.mjs` |
| [`BACKLOG.md`](BACKLOG.md) | Consolidated worklist — every open `[PLANNED]`/`[UNVERIFIED]`/`[BUG]`/`[CLEANUP]` item across every app, in one file. Replaces `roadmap.md`/`review.md`/`knownbug.md` (archived 2026-09-22). |
| ~~`roadmap.md`~~ / ~~`review.md`~~ / ~~`knownbug.md`~~ | **Superseded 2026-09-22** — merged into `BACKLOG.md`; full historical record at [`archive/roadmap-2026-09-22.md`](archive/roadmap-2026-09-22.md), [`archive/review-2026-09-22.md`](archive/review-2026-09-22.md), [`archive/knownbug-2026-09-22.md`](archive/knownbug-2026-09-22.md). |
| [`REVISION-LEDGER-NOTES.md`](REVISION-LEDGER-NOTES.md) | Historical missing/skipped revision labels and how to interpret them |
| [`SESSION-HANDOFF-PROMPT.md`](SESSION-HANDOFF-PROMPT.md) | Compact continuation prompts for Planner/Reviewer and Executor sessions |
| [`agent/README.md`](agent/README.md) | Two-lane AI harness: coherent work sizing, handoff loop, context, and revision rules |
| [`agent/PLANNER.md`](agent/PLANNER.md) | Planning half of the Planner/Reviewer Navigator lane |
| [`agent/EXECUTOR.md`](agent/EXECUTOR.md) | Autonomous implementation within a READY plan's locked boundaries |
| [`agent/REVIEWER.md`](agent/REVIEWER.md) | Risk-shaped verification and next-plan preparation |
| [`agent/BROWSER-ACCEPTANCE-BACKLOG.md`](agent/BROWSER-ACCEPTANCE-BACKLOG.md) | Reviewer-run browser acceptance queue, batched at phase gate close |

## Design inputs (not yet locked contracts)

| Document | Purpose |
|---|---|
| [`apps/platform/GLOBAL-MENU-DESIGN-BRIEF.md`](apps/platform/GLOBAL-MENU-DESIGN-BRIEF.md) | Owner feedback (2026-09-16) on the global app menu/settings entry points; informs the still-open "redesign top-header/sidebar boundary" item in `BACKLOG.md`, not itself a locked decision |


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
| [`apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md`](apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md) | **active StudioFlow authority (R8.70):** legacy behavior on the Foundation — disposition matrix, permissions, Project/Phase/Revision/Task/Today, MOM, Schedule, centralization map, UI/UX direction. Read alongside the V2 contract. |
| [`apps/studioflow/STUDIOFLOW-PHASE-ENGINE-V2-CONTRACT.md`](apps/studioflow/STUDIOFLOW-PHASE-ENGINE-V2-CONTRACT.md) | **co-equal authority (R8.87–R8.105, active, fully implemented):** supersedes listed clauses of the rework contract — phase state machine, Todo SSOT (SfChecklistItem), phase definition schema (SfPhaseTemplate/SfPhaseDefinition), SfRequirement, SfDeliverable, Overview as main workspace. §4.3's migration bridge (`SfPhaseKey`) was removed in R8.105 (V2-E) — `definition_id` is now the sole runtime identity. |
| [`apps/studioflow/PHASE-ENGINE-V2-BASELINE-AUDIT.md`](apps/studioflow/PHASE-ENGINE-V2-BASELINE-AUDIT.md) | Planner evidence: baseline audit of V2 draft vs codebase at R8.86 — confirms V2 contract does not conflict with stored state |
| [`apps/studioflow/D-SF-RECOVERY-DISCOVERY.md`](apps/studioflow/D-SF-RECOVERY-DISCOVERY.md) | R8.48 pinned legacy evidence; D-SF decisions apply except where the rework contract §9 or V2 contract overrides them |
| [`archive/studioflow-rb/`](archive/studioflow-rb/) | **superseded** rebuild StudioFlow contracts and R7 work orders (moved in R8.71); history only |

Execution and continuity are governed by [`AGENTS.md`](../AGENTS.md) and
[`CHANGELOG.md`](../CHANGELOG.md). The completed
[`Foundation F0 work order`](../scripts/work-orders/FOUNDATION.md) is retained as
historical implementation evidence. The executable app work order is the one
marked active in the table above.

Master Data, BQ, and the implemented StudioFlow project workflow are active
applications. Their current contracts, schema, migrations, services, public
boundaries, tests, and browser behavior are implementation evidence. Remaining
features, defects, and implemented-but-unverified work are listed only in
`BACKLOG.md`, tagged `[PLANNED]`, `[BUG]`, or `[UNVERIFIED]` respectively.

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

Status: **Phase Engine v2 (R8.87–R8.105) fully implemented.** Foundation
sequence (1–5 below) is complete. StudioFlow wave-1 rework is complete. Phase
Engine v2 (V2-A through V2-E) is implemented — V2-E (R8.105) removed the
`SfPhaseKey` migration bridge entirely; `SfPhase.definition_id` is now the sole
runtime phase identity. Wave 2 features not covered by V2 remain in
`BACKLOG.md`.

1. **Platform Foundation — routing first.** ✓ Accepted R8.34–R8.61.
2. **UI Engine and Shared Utilities.** ✓ Accepted R8.56–R8.59.
3. **BQ.** Implemented; browser acceptance tracked as `[UNVERIFIED]` in `BACKLOG.md`.
4. **AI file-organization exploration is parked**, not pursued for now.
5. **StudioFlow wave-1 rework (SF-R1–SF-RF).** ✓ Accepted R8.71–R8.75.
6. **StudioFlow Phase Engine v2 (V2-A–V2-E).** Implemented R8.87–R8.105; V2-E (full enum-to-definition migration) browser-verified in R8.105. V2-A–V2-D's remaining Deliverables/Schedule-P0 browser acceptance is tracked as `[UNVERIFIED]` in `BACKLOG.md` (the Requirements-panel checklist item was removed — that panel no longer exists, merged into the phase checklist in R8.106).

Documented deferred capabilities are routing memory, not implementation scope. Do not create code, folders, dependencies, or placeholder exports until a stage/consumer activates them.
