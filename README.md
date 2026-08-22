# StudioFlow Rebuild

Architecture-first rebuild of StudioFlow.

Legacy repository is expected as a sibling directory:

```text
Projects/
├── studioflow/          # legacy/current source repo
└── studioflow-rebuild/  # this repo
```

Therefore migration work may inspect `../studioflow`, but code must never depend on it at runtime.

## Goal

Build a modular monolith with one shared platform and three explicit business apps:

- StudioFlow — main project-management app
- Master Data — global business-data SSOT
- BQ — estimating/costing app

## Core rule

Master Data owns global business master data. StudioFlow and BQ consume it through public contracts. Project-specific mutable data is snapshotted explicitly when domain rules require independence from future master-data changes.

## Start here

1. Read `docs/00-SOFTWARE-SSOT.md`.
2. Read `docs/06-DATA-OWNERSHIP.md`.
3. Read the PRD of the app you are changing.
4. Run `npm run check:legacy` if migrating from `../studioflow`.
5. Record every migrated capability in `scripts/migration-inventory.md` as KEEP / MERGE / REWRITE / PURGE / LEGACY.

## Non-goals

- Do not reproduce legacy folder structure by default.
- Do not migrate features simply because they exist.
- Do not create app-to-app internal imports.
- Do not make `shared/` a dumping ground.
