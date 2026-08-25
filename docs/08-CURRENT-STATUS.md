# 08 — Current Rebuild Status

Status: FOUNDATION + MD-00 LOCKED — UI ENGINE IMPLEMENTED — OWNER VISUAL APPROVAL PENDING
Audit date: 2026-08-25
Owner: PM / Technical Lead

## Approved repository state

- The reproducible foundation baseline is commit `eb58f5ef7995aad22c4170d234ca84bc830eef08` (`chore: establish rebuild baseline`).
- The current PM/TL-approved Foundation/UI implementation head is commit `4354c4f` (`feat(ui-engine): add product kit showcase (UI-D)`).
- The rebuild is an independent Git repository on `main` with no configured runtime dependency on `../studioflow`.
- WO-001, WO-001A, WO-001B, WO-001C, and WO-001D are complete and PM/TL-approved.
- The baseline has a reproducible npm lockfile, Prisma 7 configuration/client generation, TypeScript test runner, typecheck, boundary check, and production build.
- WO-002 through WO-009, including WO-003A and the convergence correction `10d3881`, are complete and PM/TL-approved on `main`.
- Platform Core, shared utilities, dependency enforcement, Category pure rules, and the minimalist UI Engine Product Kit are implemented and PM/TL-approved. Owner visual approval of `/ui-engine` is the final UI gate before Master Data.
- Platform Core was revalidated on 2026-08-25 against the immutable GitHub legacy evidence commit `548fbd6bd00ef9fd7d53df66a3561a32fbb56944`; all Foundation acceptance checks remain green and no Core contract change is required.
- Canonical legacy evidence is now that GitHub commit. `D:\Projects\studioflow` is not a source of truth and may be used only as a verified optional cache.

## Quarantined unapproved work

Uncommitted Codex-generated implementation was preserved for comparison only:

- branch: `codex/quarantine-unapproved-20260823`
- commit: `cb5998070ee7c8ffa1ff7ff5ecbe01a63998e07a`

The quarantine is not an implementation source of truth, is not approved code, and must not be merged wholesale. During later PM review it may be consulted only as evidence or comparison against an externally executed work order.

## Locked manager contracts

- `CORE.md` — minimum shared Platform Core contract.
- `DESIGN.md` — canonical shared visual contract.
- `UI_ENGINE.md` — canonical shared UI architecture contract.
- `MASTER_DATA.md` — canonical MD-00 domain, lifecycle, pricing, permission, audit, discovery, public-read, and import/export contract.
- `docs/12-MASTER-DATA-SEED-INVENTORY.md` — canonical MVP Unit, PRODUCT/WORK Category, operational-role, and BusinessType seed/mapping inventory.
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
- COMPLETE: UI-A through UI-D commits `628a77c`, `ad8d564`, `27becfa`, and `4354c4f` implement the locked shared inventory and `/ui-engine` showcase.
- COMPLETE: 114 tests, typecheck, dependency/legacy checks, Prisma validate/generate, and production build pass.
- COMPLETE: PM/TL visual/accessibility review passed at 1440×900, 1024×768, 768×1024, and 390×844; page-wide overflow, mobile navigation, table overflow, dialogs, drawer, menus, focus visibility, and Enter/Escape behavior were verified.
- No additional Core/Foundation work is planned unless product implementation exposes a concrete blocker.

## Current execution policy

The two original Foundation lanes, PM/TL convergence gate, and UI-01 implementation/review are complete. Revised MD-00 and its seed inventory are owner-approved and LOCKED. The owner explicitly directed Codex to take over this one UI implementation; that exception does not change the external-executor policy for later deterministic product work. `MASTER-DATA-FULL-BUILD.md` remains PAUSED only until the owner approves the `/ui-engine` visual direction and PM/TL issues a new Master Data starting ref; all existing Master Data start tags remain superseded.

## Deferred owner / later-phase decisions

1. Persisted identity provider, user lifecycle/schema, canonical roles, and role-to-permission grants.
2. Production audit-retention policy beyond the MD-00 MVP default.
3. BQ calculation migration and regression contract.

Master Data lifecycle, uniqueness, relation, pricing, permission, audit-persistence, discovery, public-read, and import/export decisions are resolved in the MD-00 lock candidate; they are no longer architecture-discovery items.
