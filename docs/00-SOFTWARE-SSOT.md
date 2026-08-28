# 00 — Software SSOT / Constitution

Status: ACTIVE — owner designated this rebuild as the future implementation home on 2026-08-28.

## Product shape

StudioFlow is one modular software platform with three business apps sharing one Platform Core.

```text
Platform Core
├── shared infrastructure
├── utilities
├── contracts
├── dictionary
└── UI Engine

Apps
├── StudioFlow     — main project-management app
├── Master Data    — global master-data SSOT
└── BQ             — estimating / costing app
```

## Architectural principles

1. One concept has one owner.
2. Global reusable business data belongs to Master Data unless explicitly assigned elsewhere.
3. Cross-app access occurs through public contracts, never internal folders.
4. Project snapshots are explicit copies, not hidden synchronization.
5. Shared technical behavior belongs in Platform Core or Utilities.
6. UI primitives and layouts belong to UI Engine before app-local duplication is allowed.
7. MVP means minimum number of concepts, not minimum code quality.
8. Legacy behavior is migrated only when it still serves the approved product.
9. Dead code and obsolete documents are removed or archived deliberately.
10. Every feature must identify domain owner, data owner, permission owner, and lifecycle.
11. An implemented schema is evidence of current code, not authority to override a newer product decision.
12. Product migration preserves verified behavior and invariants, not legacy source structure.

## App boundaries

### StudioFlow
Owns projects, project workflow, project activity, deliverables, schedules and project-oriented extensions.

### Master Data
Owns canonical Brand, SKU/Product, Supplier/Party, categories, material/service definitions and official price sources.

### BQ
Owns BQ projects, object/sub-object breakdown, estimator working state, project price snapshots and reusable BQ recipes.

## Cross-app intent

- StudioFlow -> Master Data: Brand Catalog / product-library use cases only through Master Data public API.
- BQ -> Master Data: material, labor and material+labor pricing/candidate use cases only through Master Data public API.
- Master Data must not contain project workflow logic from StudioFlow or estimator workspace logic from BQ.

## Legacy migration rule

The current StudioFlow project is a read-only behavioral reference. Every migrated capability is classified as KEEP / MERGE / REWRITE / PURGE / LEGACY / OPEN before implementation. Source files are inspected; business behavior is reimplemented in the rebuild layers. Whole folders and source text are not copied.

See `README.md`, `15-RULE-AUDIT.md`, and `16-LEGACY-MIGRATION-PLAYBOOK.md`.
