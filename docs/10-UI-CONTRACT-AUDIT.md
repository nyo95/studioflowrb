# 10 — UI Contract Lock Audit

Status: COMPLETE
Decision date: 2026-08-23
Owner: PM / Technical Lead

## Decision

`DESIGN.md` and `UI_ENGINE.md` are locked as the canonical shared visual and UI architecture contracts. No product conflict was found. Corrections were limited to repository architecture, single-source token enforcement, semantic state completeness, interaction defaults, and the proven implementation baseline.

## Evidence reviewed

### Rebuild authority and state

- `docs/00-SOFTWARE-SSOT.md`
- `docs/02-UI-ENGINE-PRD.md`
- `docs/06-DATA-OWNERSHIP.md`
- `docs/07-ENGINEERING-CONVENTIONS.md`
- current `src/platform/ui_engine/**` scaffold
- current package and TypeScript alias configuration

### Legacy implementation evidence

- `../studioflow/src/styles/designTokens.css`
- `../studioflow/src/ui_engine/design-system.config.ts`
- `../studioflow/src/ui_engine/tokens/**`
- `../studioflow/src/ui_engine/components/heading.tsx`
- `../studioflow/src/ui_engine/layout/page-header.tsx`
- `../studioflow/src/ui_engine/layout/shells/**`
- `../studioflow/src/ui_engine/components/section-card.tsx`
- `../studioflow/src/ui_engine/components/table-card.tsx`
- `../studioflow/src/ui_engine/components/status-badge.tsx`
- `../studioflow/src/ui_engine/components/phase-reading.tsx`
- `../studioflow/src/ui_engine/components/ProjectLiveProvider.tsx`
- relevant Radix-backed primitives under `../studioflow/src/components/ui/**`
- representative Master Data navigation, table, detail, loading, error, dialog, and drawer components

### Legacy UI/UX documentation

- `../studioflow/docs/MASTERDATA_UIUX_REVISION.md`
- `../studioflow/docs/PLAN-MASTERDATA-UX-2026-08-12.md`
- `../studioflow/docs/archive/REVIEWUIUX.md`
- `../studioflow/docs/archive/AUDIT-UX-2026-08-10.md`

Legacy documentation was treated as evidence, not authority. Domain-specific or superseded Master Data rules were not promoted into the shared UI contract.

## Confirmed without correction

- Lora for major headings and Inter for operational UI.
- Slate canvas/surface/text/action visual language.
- The compact 8px/6px/4px radius scale and 20px section spacing are present in the latest legacy token source; they are deliberate reductions from earlier larger values.
- Shared page header, page shell, section/card, table surface, dialog sizing, and horizontal overflow patterns.
- Loading, empty, and error states must be distinct.
- App navigation config belongs to apps while the common shell/frame belongs to UI Engine.
- Feature table geometry, render-board values, project/phase presentation, live providers, and status meaning do not belong in shared UI Engine.
- Master Data evidence supports detail pages/drawers, view-first editing, consistent state surfaces, and wide-table protection, but entity-specific composition remains app-owned.

## Justified corrections

1. **Canonical location:** changed legacy-style `src/ui_engine` references to the rebuild-owned `src/platform/ui_engine` and stable `@platform/ui_engine` public surface.
2. **Folder contract:** aligned the contract with the existing `layouts/` platform layer instead of creating competing `layout/` and `shells/` roots.
3. **Single token source:** made CSS custom properties authoritative at runtime; TypeScript may map semantic references but may not repeat literal token values.
4. **Semantic state completeness:** retained foreground/surface/border triplets proven in legacy so shared error, warning, success, badge, and confirmation surfaces do not hardcode feature colors.
5. **Status ownership:** explicitly prohibited UI Engine from inferring semantic colors from business-status strings, correcting the legacy `StatusBadge` leakage.
6. **Interaction default:** locked Enter=commit, Escape=cancel, and blur=opt-in for shared inline editing.
7. **Implementation baseline:** approved Tailwind CSS 4 and selective accessible Radix-backed primitives, matching legacy evidence; rejected wholesale copying and generated-source authority.
8. **Foundation scope:** added the domain-neutral AppShell frame because it is required by the UI Engine PRD and needed by both Master Data and BQ.

## Excluded from the lock

- Language choice for app copy; legacy evidence identifies inconsistency but no current owner decision establishes a platform language contract.
- Domain status-to-color mappings.
- Master Data field grouping, quick-entry business rules, and view-first policy as universal engine behavior.
- BQ calculation, persistence, snapshot, rollback, and editable-field semantics.
- Feature-specific column widths, navigation entries, routes, filters, and action registries.

## Execution consequence

WO-004 is deterministic after WO-001 passes and the Core contract is locked. It may then execute in parallel with deterministic Core work because its target files and business authority are separate. PM/TL review is required at the convergence gate before Master Data UI implementation starts.
