# StudioFlow Rebuild

Architecture-first rebuild of StudioFlow.

By owner direction dated 2026-08-28, the current StudioFlow project at `D:\Misc\ProjectsHUB\studioflow` is the read-only behavioral reference. It is evidence, not product authority. Rebuild code, builds, tests, generated artifacts, and runtime behavior must never depend on the local reference or remote legacy repository.

## Goal

Build a modular monolith with one shared platform and three explicit business apps:

- StudioFlow — main project-management app
- Master Data — global business-data SSOT
- BQ — estimating/costing app

## Core rule

Master Data owns global business master data. StudioFlow and BQ consume it through public contracts. Project-specific mutable data is snapshotted explicitly when domain rules require independence from future master-data changes.

## Start here

1. Read `docs/README.md` and follow its authority order.
2. Read `docs/00-SOFTWARE-SSOT.md` and `docs/06-DATA-OWNERSHIP.md`.
3. Read the PRD and detailed dossier of the app you are changing.
4. Read `docs/15-RULE-AUDIT.md` for known implementation conflicts.
5. Use `docs/16-LEGACY-MIGRATION-PLAYBOOK.md` for every reference capability.
6. Record every migrated capability in `scripts/migration-inventory.md` as KEEP / MERGE / REWRITE / PURGE / LEGACY / OPEN.

## Non-goals

- Do not reproduce legacy folder structure by default.
- Do not migrate features simply because they exist.
- Do not create app-to-app internal imports.
- Do not make `shared/` a dumping ground.
