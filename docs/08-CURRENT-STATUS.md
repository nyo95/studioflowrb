# 08 — Current Rebuild Status

Status: ACTIVE
Audit date: 2026-08-23
Owner: PM / Technical Lead

## Approved repository state

- The approved implementation baseline is commit `eb58f5ef7995aad22c4170d234ca84bc830eef08` (`chore: establish rebuild baseline`).
- The rebuild is an independent Git repository on `main` with no configured runtime dependency on `../studioflow`.
- WO-001, WO-001A, WO-001B, WO-001C, and WO-001D are complete and PM/TL-approved.
- The baseline has a reproducible npm lockfile, Prisma 7 configuration/client generation, TypeScript test runner, typecheck, boundary check, and production build.
- No implementation from WO-002 through WO-009 is approved on `main` yet.

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

## READY FOR EXTERNAL EXECUTOR

- WO-002 — Category Pure Rules.
- WO-005 — Core DB / Prisma Runtime.

External implementation is performed by owner-operated OpenCode executors. Codex remains PM/TL and does not spawn or act as a deterministic executor.

## Blocked work

- WO-004 becomes ready only after external WO-002 output passes PM/TL review.
- WO-006 becomes ready only after external WO-005 output passes PM/TL review.
- WO-007 becomes ready only after external WO-006 output passes PM/TL review.
- WO-008 becomes ready only after external WO-006 output passes PM/TL review.
- WO-009 becomes ready only after external WO-005 and WO-006 outputs pass PM/TL review.
- Full Master Data schema/CRUD/UI implementation remains blocked until the two active lanes pass convergence review.

## Current execution policy

Use two small external executor lanes:

1. Lane A — Infrastructure/Core: WO-003/WO-003A complete → WO-005 → WO-006.
2. Lane B — Domain/UI foundation: WO-002 → WO-004.

After both lanes complete, stop for PM/TL convergence review. Do not unlock WO-007 through WO-009 or full Master Data implementation early.

## Deferred manager decisions

These do not block WO-002 through WO-006:

1. Persisted identity provider, user lifecycle/schema, canonical roles, and grants.
2. Audit persistence schema, retention, and read/query policy.
3. Complete Master Data lifecycle, uniqueness, permission, audit, and import/export contracts.
4. BQ calculation migration and regression contract.
