# StudioFlow Rebuild

Architecture-first rebuild of StudioFlow.

Canonical legacy evidence is the immutable GitHub snapshot:

`https://github.com/nyo95/studioflow/commit/548fbd6bd00ef9fd7d53df66a3561a32fbb56944`

The local sibling `../studioflow` is not a migration authority. It is only an optional cache when independently proven identical to that commit. Rebuild code, builds, tests, generated artifacts, and runtime behavior must never depend on either a local legacy checkout or the remote repository.

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
4. Resolve legacy evidence from the locked GitHub commit. `npm run check:legacy` only reports whether an optional sibling cache exists; it does not validate or establish evidence authority.
5. Record every migrated capability in `scripts/migration-inventory.md` as KEEP / MERGE / REWRITE / PURGE / LEGACY.

## Non-goals

- Do not reproduce legacy folder structure by default.
- Do not migrate features simply because they exist.
- Do not create app-to-app internal imports.
- Do not make `shared/` a dumping ground.
