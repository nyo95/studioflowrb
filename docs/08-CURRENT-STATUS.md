# 08 — Current Rebuild Status

Status: FOUNDATION LOCKED — MD-00 CONTRACT UNDER OWNER REVIEW
Audit date: 2026-08-23
Owner: PM / Technical Lead

## Approved repository state

- The reproducible foundation baseline is commit `eb58f5ef7995aad22c4170d234ca84bc830eef08` (`chore: establish rebuild baseline`).
- The current PM/TL-approved Foundation implementation head is commit `4ff3353` (`feat: implement UI Engine foundation (WO-004)`).
- The rebuild is an independent Git repository on `main` with no configured runtime dependency on `../studioflow`.
- WO-001, WO-001A, WO-001B, WO-001C, and WO-001D are complete and PM/TL-approved.
- The baseline has a reproducible npm lockfile, Prisma 7 configuration/client generation, TypeScript test runner, typecheck, boundary check, and production build.
- WO-002 through WO-009, including WO-003A and the convergence correction `10d3881`, are complete and PM/TL-approved on `main`.
- Platform Core, shared utilities, dependency enforcement, Category pure rules, and UI Engine Foundation are locked for the product phase.

## Quarantined unapproved work

Uncommitted Codex-generated implementation was preserved for comparison only:

- branch: `codex/quarantine-unapproved-20260823`
- commit: `cb5998070ee7c8ffa1ff7ff5ecbe01a63998e07a`

The quarantine is not an implementation source of truth, is not approved code, and must not be merged wholesale. During later PM review it may be consulted only as evidence or comparison against an externally executed work order.

## Locked manager contracts

- `CORE.md` — minimum shared Platform Core contract.
- `DESIGN.md` — canonical shared visual contract.
- `UI_ENGINE.md` — canonical shared UI architecture contract.
- `docs/00-SOFTWARE-SSOT.md` — platform ownership and dependency constitution, subject to explicit current owner instructions.
- `docs/06-DATA-OWNERSHIP.md` — domain/data ownership and Category contract.
- `docs/03-MASTERDATA-PRD.md`, `docs/04-STUDIOFLOW-PRD.md`, and `docs/05-BQ-PRD.md` — current app intent.
- `docs/10-UI-CONTRACT-AUDIT.md` and `docs/11-CORE-CONTRACT-AUDIT.md` — manager audit records.

## Locked domain decisions relevant to current work

- Master Data owns canonical Party/Supplier/Vendor, Brand, Category, SKU/Material, and all canonical pricing.
- StudioFlow never implicitly creates or updates Master Data pricing.
- StudioFlow Project and BqProject remain separate identities and lifecycles.
- BQ may use Master Data or project-local inputs, stores immutable project snapshots, refreshes explicitly, and never writes to Master Data.
- PRODUCT Category is flat for MVP; WORK Category may be hierarchical.
- `BrandCategory` remains explicit discovery metadata; `Sku.category_id` is the direct nullable primary-category relation.
- Only `categorySlug`, `buildCategoryPath`, and `splitCategoryInput` survive the legacy Category pure-rule extraction.

## Foundation convergence

- COMPLETE: no retired PRODUCT hierarchy symbols, app imports, generated Prisma imports, or feature-specific tokens exist in shared UI Engine.
- COMPLETE: shared date validation is single-sourced; error transport is fail-closed and DB-runtime-free; auth preserves infrastructure failures.
- COMPLETE: 110 tests, typecheck, dependency/legacy checks, Prisma validate/generate, and production build pass.
- No additional Core/Foundation work is planned unless product implementation exposes a concrete blocker.

## Current execution policy

The two Foundation lanes and PM/TL convergence gate are complete. MD-00 manager audit is complete in `MASTER_DATA.md` as a lock candidate awaiting owner approval. No Master Data schema, migration, CRUD, UI, import/export, discovery, or public-contract implementation is authorized before that approval and separate deterministic work orders.

## Deferred owner / later-phase decisions

1. Persisted identity provider, user lifecycle/schema, canonical roles, and role-to-permission grants.
2. Initial curated unit/category/business seed data and any production audit-retention policy beyond the MD-00 MVP default.
3. BQ calculation migration and regression contract.

Master Data lifecycle, uniqueness, relation, pricing, permission, audit-persistence, discovery, public-read, and import/export decisions are resolved in the MD-00 lock candidate; they are no longer architecture-discovery items.
