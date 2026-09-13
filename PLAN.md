# Active Plan

Plan ID: PF-0-BASELINE-FREEZE-R8
Scope: Project Rebuild Foundation baseline pinning and StudioFlow continuation freeze
Status: READY
Priority: P1
Owner: Repository owner
Last updated: 2026-09-13

## Owner Intent

Prepare the first, smallest executable Foundation gate from the approved Project Rebuild Foundation Reference before any Foundation implementation or StudioFlow Recovery work begins. Do not change production code or redesign Master Data, BQ, or StudioFlow behavior.

## Problem

The roadmap correctly makes PF-0 through PF-8 a prerequisite for StudioFlow Recovery, but PF-0 is still open. The Foundation Reference pins an R8.12 rebuild baseline and a legacy evidence commit, while the current checkout also contains later documentation-only R8.13–R8.16 commits. There is no committed, single-purpose baseline/freeze record that an Executor can use to distinguish permitted Foundation work from frozen StudioFlow continuation.

## Current Evidence

- `docs/PROJECT-REBUILD-FOUNDATION-REFERENCE.md` §§30–31 orders PF-0 before PF-1 and freezes normal StudioFlow feature continuation until the Foundation freeze.
- `docs/roadmap.md` lists PF-0 as open and gives the Project Rebuild Foundation priority over StudioFlow Recovery; it separately lists the StudioFlow Recovery Freeze as open.
- The approved reference identifies R8.12 commit `45d74884c1ec268b30b1d5e6dc86a80da32cffe7` as the Foundation reference baseline. It is locally resolvable.
- Current HEAD is `edcd1b287de396440db1a36004b873e7c0410eee` (R8.16). The intervening R8.13–R8.16 commits are roadmap/harness documentation changes, not application behavior changes.
- The reference identifies legacy evidence as `nyo95/studioflow` commit `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`. That object is not in this rebuild repository, as expected for isolated legacy evidence. No legacy checkout path has been supplied or is needed for this documentation-only pin.
- Current source evidence confirms PF-1 remains next after PF-0: `src/platform/core/storage/index.ts` still contains MOM-specific policy, the Supabase adapter remains under Core, and `src/platform/core/settings/brand-mark.ts` writes to the local filesystem.
- `scripts/work-orders/FOUNDATION.md` is an obsolete R1-era work order that conflicts with the current R8 ledger and approved PF sequence; it is historical material, not executor authority.

## Decisions

- Execute PF-0 alone. It is a P1 critical-path prerequisite because every PF-1–PF-8 slice and all StudioFlow Recovery work depend on an unambiguous baseline and freeze.
- Preserve two distinct rebuild references in the durable PF-0 record: R8.12 as the approved behavior/reference baseline, and R8.16 as the current planning checkout with documentation-only overlay. Do not claim R8.16 is an independently verified behavioral baseline.
- Record the legacy repository identity and commit exactly as evidence metadata only. Do not locate, open, or otherwise access a legacy checkout in this slice.
- Freeze normal StudioFlow continuation: no StudioFlow feature, route, schema, service, UI, or behavior work is allowed before PF-8, except a security, data-integrity, or repository-breaking correction that is explicitly planned and approved as such. Foundation-owned boundary work may touch a StudioFlow consumer only where an approved Foundation slice requires deterministic compatibility, without changing StudioFlow business behavior.
- PF-0 is a documentation/ledger slice. It must not add runtime guards, code abstractions, dependencies, schemas, migrations, tests, or database activity.
- The untracked owner-supplied reference and recovery-reference files are evidence only and must not be staged, edited, or adopted by this slice.

## Open Questions

None for PF-0. A legacy checkout path becomes necessary only when a later authorized slice needs to inspect legacy code; then the Executor/Planner must request it under `AGENTS.md`.

## Requirements

Create one committed, durable Foundation baseline/freeze record that names: the two rebuild references and their relationship, the legacy evidence repository and commit, the frozen applications/behaviors, the permitted exception class, and the PF-8 release condition. Link it from the current roadmap and make the PF-0 completion state unambiguous. Keep existing roadmap ordering and all Master Data/BQ/StudioFlow contracts unchanged.

## Domain Model / Workflow

Approved Foundation reference (R8.12 behavior baseline) + current documentation overlay (R8.16)
→ committed PF-0 baseline/freeze record
→ PF-1 Core Purity and the remaining PF sequence
→ PF-8 repository verification and Foundation freeze
→ only then StudioFlow Recovery.

## Non-goals

- No PF-1 storage, Core, provider, or brand-mark implementation.
- No application registration, routing, settings, appearance, UI Engine, shared-utility, or boundary-check implementation.
- No Master Data or BQ behavior change.
- No StudioFlow redesign, recovery extraction, or ordinary feature continuation.
- No legacy checkout/database access, remote operation, tag, release, or migration.
- No revival or execution of `scripts/work-orders/FOUNDATION.md`.

## Dependencies

- `AGENTS.md` and `docs/agent/README.md` ledger/revision rules.
- `docs/PROJECT-REBUILD-FOUNDATION-REFERENCE.md` §§29–31 and §34.
- `docs/roadmap.md` Project Rebuild Foundation and StudioFlow Recovery sections.
- Locally resolvable R8.12 and R8.16 commits. Legacy object availability is not a PF-0 requirement because this repository must remain isolated from legacy.

## Architecture / Ownership

The baseline/freeze record is project-level governance documentation, not a platform or app contract. Platform/application ownership remains unchanged. Planner has locked the scope and terminology; Executor may make only the deterministic documentation/ledger changes below. Reviewer verifies the record against the cited commits and authorities, including that no owner-reserved or production files were changed.

## Acceptance Criteria

1. A committed documentation record states R8.12 (`45d74884c1ec268b30b1d5e6dc86a80da32cffe7`) as the approved behavior/reference baseline and R8.16 (`edcd1b287de396440db1a36004b873e7c0410eee`) as its documentation-only planning overlay.
2. The record states the exact legacy evidence identity `nyo95/studioflow` at `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`, and explicitly prohibits legacy checkout/database access in PF-0.
3. The record names Master Data and BQ as behaviorally frozen for Foundation work and states the StudioFlow continuation freeze plus its narrow exception class.
4. The record says PF-8—not PF-0—releases the Foundation/StudioFlow Recovery gate.
5. `docs/roadmap.md` links to the record and marks PF-0 complete without changing the order or wording of PF-1–PF-8, Master Data, BQ, or StudioFlow work.
6. No production source, schema, migration, dependency manifest, test, app contract, or untracked owner-supplied reference is edited or staged.
7. The change has a compliant R8.18 changelog entry and one local commit after `git diff --cached --check` passes.

## Proposed Work Slices

### READY — PF-0: Baseline pin and continuation freeze

**Target revision:** R8.18

**Exact authority:** `AGENTS.md`; `docs/agent/README.md#revision-and-commit-protocol`; `docs/PROJECT-REBUILD-FOUNDATION-REFERENCE.md` §§29–31, §34; and the Project Rebuild Foundation / StudioFlow Recovery sections of `docs/roadmap.md`.

**Allowed changes:** add one new durable documentation record under `docs/`; edit only the PF-0 row/link in `docs/roadmap.md`; add one scoped PF-0 review entry in `docs/review.md`; add the R8.18 entry in `CHANGELOG.md`; replace `PLAN.md` only if the Executor's role protocol requires recording completion. Preserve all pre-existing dirty files and do not touch either untracked reference document.

**Forbidden changes:** all production code, schema/migrations, dependencies, tests, app contracts, other roadmap items, `scripts/work-orders/FOUNDATION.md`, legacy files/databases, remotes, tags, and releases.

**Required evidence/checks:** record `git status --short`, HEAD, branch, remote/published baseline, and next revision before edits; verify both local commits with `git show -s`; inspect staged stat/diff; run `git diff --cached --check`; commit exactly `R8.18 | docs(foundation): pin rebuild baseline and continuation freeze`. No browser, database, typecheck, lint, or build run is required because this is documentation-only and must not alter runtime behavior.

**Regression risks:** mislabeling the documentation overlay as behavior verification could allow false parity claims; an overly broad freeze could block required Foundation compatibility work; an overly weak freeze could restart StudioFlow feature work before PF-8; touching the untracked reference could capture owner changes. Mitigate by using the exact terms and IDs above, preserving the stated exception, and staging only owned files.

## Regression Risks

PF-0 does not alter runtime behavior. Its material risk is governance drift: an incorrect pin or ambiguous freeze can cause later Foundation or StudioFlow work to use the wrong authority. The READY acceptance criteria and independent review focus on that risk.

## Roadmap Impact

On acceptance, only PF-0 is completed. PF-1 is the next recommended P1 critical-path slice: its existing storage/Core leaks are evidenced but must be planned separately because it changes provider composition, file persistence, and consumer policy boundaries. PF-2 through PF-8 and all StudioFlow Recovery items remain open.
