# 08 — Current Rebuild Status

Status: FOUNDATION + UI ENGINE + MD-00 LOCKED — MASTER DATA READY FOR EXECUTION
Audit date: 2026-08-25
Owner: PM / Technical Lead

## Approved repository state

- The reproducible foundation baseline is commit `eb58f5ef7995aad22c4170d234ca84bc830eef08` (`chore: establish rebuild baseline`).
- The current PM/TL-approved UI implementation head is commit `41903e3` (`refactor(ui-engine): compact directory utility actions`), following application-chrome/table refinement `160d2f6`.
- The approved Master Data execution ref is `masterdata-full-build-start-ui-approved-v3`; it supersedes both earlier UI-approved tags and includes the final manager records layered over the approved UI implementation.
- The rebuild is an independent Git repository on `main` with no configured runtime dependency on `../studioflow`.
- WO-001, WO-001A, WO-001B, WO-001C, and WO-001D are complete and PM/TL-approved.
- The baseline has a reproducible npm lockfile, Prisma 7 configuration/client generation, TypeScript test runner, typecheck, boundary check, and production build.
- WO-002 through WO-009, including WO-003A and the convergence correction `10d3881`, are complete and PM/TL-approved on `main`.
- Platform Core, shared utilities, dependency enforcement, Category pure rules, and the minimalist UI Engine Product Kit are implemented and PM/TL-approved. The owner approved the current warm-neutral, Programa-influenced visual direction over the superseded initial `DESIGN.md` interpretation.
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
- `docs/13-CLAUDE-UI-DESIGN-REVIEW-HANDOVER.md` — self-contained independent design-review context, procedure, evidence, and stop conditions.
- `docs/14-UI-ENGINE-DESIGN-PASS-HANDOVER.md` — independent design-pass record plus PM/TL ratification and convergence corrections.

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
- COMPLETE: Claude's design pass `1ab1a82` introduced the warm-neutral palette, dark data-table band, explicit navigation current state, collapsible rail, generic sortable headers, and refined status treatment; PM/TL ratified those changes with the bounded corrections in `8f1ca0b`.
- COMPLETE: selected rows now retain a checked control plus a restrained ink leading rule while semantic status remains independent; all seven showcase data columns are sortable and selection/action columns remain intentionally non-sortable.
- COMPLETE: narrow navigation always retains labels while preserving the desktop collapse preference; Combobox Arrow/Home/End/Enter/Escape behavior skips disabled options and returns focus correctly.
- COMPLETE: owner feedback moved selection state/actions inline beside Export, replaced the repeated dark table band with a warm-neutral header surface, redesigned rail/topbar hierarchy, and added canonical one/two-line `TableCellContent` treatment; commit `160d2f6`.
- COMPLETE: constrained-toolbar utilities now use symbol-only actions with accessible names and tooltips; active filter value and compact selection count remain visible; commit `41903e3`.
- COMPLETE: 117 tests, typecheck, dependency/legacy checks, Prisma validate/generate, boundary/legacy fixtures, production build, and diff checks pass.
- COMPLETE: PM/TL visual/accessibility review passed at 1440×900, 1024×768, 768×1024, 390×844, and the 720×450 effective viewport corresponding to 1440×900 at 200% layout scale. Page-wide overflow, isolated mobile-nav/table overflow, sorting, selection/status coexistence, focus return, dialogs, drawer, menus, and keyboard behavior were verified; browser console errors/warnings were zero.
- COMPLETE: DocumentSheet retains its A4 screen ratio and the loaded stylesheet contains the isolated `@media print` contract. Native OS print-preview automation was unavailable; source/test/CSSOM evidence is accepted for this gate.
- No additional Core/Foundation work is planned unless product implementation exposes a concrete blocker.

## Current execution policy

The Foundation lanes, convergence gate, UI-01 implementation, independent design pass, owner feedback refinements, and PM/TL ratification are complete. Revised MD-00 and its seed inventory remain owner-approved and LOCKED. The owner's direct UI takeover instruction does not change the external-executor policy for deterministic Master Data work. `scripts/work-orders/MASTER-DATA-FULL-BUILD.md` is ACTIVE from `masterdata-full-build-start-ui-approved-v3`; every older Master Data start tag remains superseded.

## Deferred owner / later-phase decisions

1. Persisted identity provider, user lifecycle/schema, canonical roles, and role-to-permission grants.
2. Production audit-retention policy beyond the MD-00 MVP default.
3. BQ calculation migration and regression contract.

Master Data lifecycle, uniqueness, relation, pricing, permission, audit-persistence, discovery, public-read, and import/export decisions are resolved in the MD-00 lock candidate; they are no longer architecture-discovery items.
