# External Executor Context — StudioFlow Rebuild

Status: MANDATORY CONTEXT FOR EVERY EXTERNAL WORK ORDER
Owner: PM / Technical Lead

## What this project is

`studioflow-rebuild` is a clean rebuild of the legacy `studioflow` repository. It is not an incremental feature branch and not a folder-by-folder port.

- Rebuild repository: `D:\Projects\studioflow-rebuild`
- Legacy evidence repository: `D:\Projects\studioflow`
- Reproducible implementation baseline: `eb58f5ef7995aad22c4170d234ca84bc830eef08`
- Required execution head: the exact work-order-specific starting commit/ref declared by PM/TL. Do not reset a later approved package back to the reproducible baseline.
- Unapproved Codex comparison only: branch `codex/quarantine-unapproved-20260823`

The rebuild establishes a clean architecture and then selectively extracts legacy capabilities that are still valid. Legacy code is evidence, never authority, and must never become a runtime dependency.

## Mandatory rebuild method

```text
clean new foundation
        ↓
identify legacy feature/logic that already works
        ↓
audit it against current owner decisions and contracts
        ↓
classify KEEP / MIGRATE / MERGE / REWRITE / PURGE / LEGACY
        ↓
place the approved capability in the correct new owner/layer
        ↓
prove behavior with focused tests and repository acceptance checks
```

Classification meanings:

- `KEEP`: the concept/behavior remains valid without a product change.
- `MIGRATE`: move proven behavior with only the adaptation explicitly approved by the work order.
- `MERGE`: consolidate duplicate legacy implementations into one approved canonical capability.
- `REWRITE`: preserve approved behavior but implement it against the rebuild architecture/contracts.
- `PURGE`: intentionally do not carry obsolete, conflicting, or ownership-violating behavior forward.
- `LEGACY`: leave it only in the legacy repository; it is not part of the rebuild.

An executor does not choose or change these classifications. Use the classification already recorded in the work order or migration inventory. If it is missing or conflicts with actual evidence, stop and escalate.

## Authority and boundaries

Read `AGENTS.md` and its mandatory documents in order. Authority is:

1. explicit current owner instruction;
2. Software SSOT;
3. Data Ownership contract;
4. relevant app PRD;
5. current Prisma schema for implemented persisted shape;
6. other manager contracts/docs;
7. legacy repository evidence.

Key boundaries:

- Master Data owns canonical shared commercial/reference data and all canonical pricing.
- StudioFlow owns design/project workflow and cannot implicitly mutate Master Data pricing.
- BQ owns estimator state and project snapshots, never writes to Master Data, and has no direct domain dependency on StudioFlow.
- Cross-app access is only through the owning app's `public` surface.
- Platform never imports an app.
- UI Engine remains domain-neutral and contains no feature-specific tokens or business-status inference.

## Workforce routing

### Codex PM/TL and its internal analysis subagents

They own manager work:

- legacy-versus-rebuild audits;
- KEEP/MIGRATE/MERGE/REWRITE/PURGE/LEGACY classification;
- domain ownership and cross-app decisions;
- architecture, schema, calculation, snapshot, permission, and migration-risk decisions;
- contract/SSOT/PRD/work-order creation;
- external executor diff review and correction decisions.

Internal subagents may assist with bounded read-only audits or independent analysis. They are not the default coding workforce and do not perform deterministic implementation hidden from the owner.

### External OpenCode executors

They own deterministic implementation only after the PM/TL has locked the decision:

- code/tests that follow an approved work order literally;
- mechanical migration/refactor/rename/removal;
- schema/migration implementation after shape and mapping are locked;
- UI implementation against final `DESIGN.md`, `UI_ENGINE.md`, and WO contracts;
- reproducible acceptance commands and an exact diff/commit report.

OpenCode is an executor, not a product or architecture decision-maker.

## Executor prohibitions

- Do not copy a legacy directory wholesale.
- Do not create runtime imports, filesystem reads, or fallbacks to `../studioflow`.
- Do not preserve legacy behavior merely because it exists.
- Do not redesign approved contracts, schema, UI language, or calculations.
- Do not add abstractions, fields, relations, dependencies, fallbacks, cleanup, or features outside the WO.
- Do not silently adapt when actual code differs from the WO.
- Do not use the quarantine branch as an implementation base or copy it wholesale.

## Stop and escalation rule

Stop before editing further and report the exact evidence when:

- legacy behavior conflicts with current owner decisions/contracts;
- required classification is missing or ambiguous;
- the current repository differs from the WO's assumed state;
- implementation would cross an app/platform ownership boundary;
- a requested change requires a new schema, product, calculation, permission, migration, or UI architecture decision;
- a forbidden or out-of-scope file must change for acceptance to pass.

## Required executor report

Return:

1. commit hash;
2. exact files changed;
3. mapping from every change to a WO item;
4. legacy evidence used and its locked classification;
5. all acceptance commands and results;
6. deviations, unresolved risks, and stop-condition review;
7. confirmation that no unrelated or legacy-runtime coupling was introduced.
