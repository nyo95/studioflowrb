# 16 — Legacy Logic Migration Playbook

Status: ACTIVE
Purpose: move verified product behavior from the read-only StudioFlow reference into the rebuild without copying its architecture.

## Source policy

- Rebuild target: this repository.
- Read-only reference: `D:\Misc\ProjectsHUB\studioflow`.
- Record the reference commit, branch, and dirty state in each migration report.
- Uncommitted reference files are evidence only and must be named explicitly when used.
- Never create a runtime/build/test dependency on the reference checkout.
- Never copy a whole folder or bulk-copy source text.

## One capability at a time

Examples of a capability: “approve a client revision”, “add a supplier price”, “apply a BQ recipe”, or “save a personal checklist filter”. Do not migrate an entire app as one undifferentiated task.

### 1. Evidence scan

Trace all relevant legacy:

- routes and screens;
- server actions/use cases;
- domain services and pure calculations;
- schema models, enums, indexes, and migrations;
- readers and writers;
- permissions and audit calls;
- tests and fixtures;
- current canonical docs.

Record contradictory evidence instead of choosing silently.

### 2. Behavior contract

Write a short contract containing:

- user goal and actor;
- preconditions and permissions;
- valid state transitions;
- inputs, outputs, and visible errors;
- invariants and database constraints;
- transaction/audit boundary;
- cross-app reads/writes;
- snapshot/provenance behavior;
- UI states and accessibility expectations.

### 3. Classification

Classify every relevant behavior:

- `KEEP` — same product meaning;
- `MERGE` — shared mechanism moves to Core/UI Engine while policy stays local;
- `REWRITE` — product behavior remains but architecture/API changes;
- `PURGE` — explicitly obsolete or conflicting;
- `LEGACY` — historical evidence retained but not migrated;
- `OPEN` — owner decision required.

### 4. Destination design

Map the capability into:

```text
app/domain          pure invariants and calculations
app/application     use cases, orchestration, permissions
app/infrastructure  Prisma/external adapters
app/ui              domain screens and composition
app/public          minimal legal cross-app contract
platform/core       domain-independent infrastructure only
platform/ui_engine  reusable interaction/layout system only
```

If two apps use the same word but mean different things, keep separate implementations.

### 5. Regression-first proof

Before implementation, capture the approved behavior with the smallest useful tests:

- pure domain/calculation tests;
- permission and state-transition tests;
- schema/index/integration tests for PostgreSQL semantics;
- contract tests for public DTOs;
- UI interaction/accessibility tests where behavior is not purely presentational.

Do not preserve a legacy bug merely to make parity green. Mark it `PURGE` or `REWRITE` with evidence.

### 6. Vertical implementation

Implement one complete path: schema/migration if needed, domain, application, adapter, public boundary, UI, audit, and tests. Avoid horizontal “all models first” migrations that leave rules unenforced.

### 7. Verification

Run, as applicable:

- pure test suite;
- disposable PostgreSQL integration suite;
- typecheck and dependency-boundary checks;
- production build;
- targeted browser checks for critical workflows, responsive behavior, keyboard use, confirmations, unsaved changes, empty/error states, and user-facing English copy.

The report distinguishes what ran from what was only inspected.

### 8. Data rehearsal and cutover

For persisted legacy data:

1. inventory source counts and ambiguous rows;
2. define deterministic mappings and rejected-row handling;
3. run against a disposable target;
4. reconcile counts, relations, money precision, statuses, and audit/provenance;
5. produce a human-readable exception report;
6. repeat until deterministic;
7. cut over only under an explicit deployment/data plan.

## Capability report template

```text
Capability:
Owner app:
Reference commit/status:
Evidence files:
Decision/classification:
Behavior contract:
Destination files/layers:
Schema/data impact:
Permissions/audit:
Tests added/run:
UI verification:
Open questions:
Purged legacy behavior:
```

## Stop conditions

Stop and request a decision when:

- canonical sources disagree on product behavior;
- the change would move ownership across apps;
- data would be deleted, merged, or guessed;
- a snapshot/upstream-propagation rule is unclear;
- a production permission cannot be identified;
- passing the task requires weakening a database invariant or test isolation.
