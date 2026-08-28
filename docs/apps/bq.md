# BQ — Product, Data, Calculation, and UI Contract

Status: ACTIVE PRODUCT CONTRACT
Evidence basis: final reference `PRD-BQ.md`, `designbq.md`, reference schema/actions/tests, and current owner direction through 2026-08-28.

## Purpose and ownership

BQ is a focused estimating worksheet that replaces the current spreadsheet workflow. It owns independent BQ projects, grouping structure, priced Works, Sub-Works coefficients, project-local lines, immutable source snapshots, manual overrides, calculation rules, and reusable recipes.

BQ never owns or mutates canonical Master Data.

## Canonical hierarchy

```text
L0 Section
  -> optional L1 Sub Section
       -> L2 Works (the only Qty × Unit Price layer)
            -> L3 Sub-Works / material and service lines
```

Rules:

- A Section contains Sub Sections and/or Works.
- A Sub Section contains Works only.
- Group nesting is at most two levels for new writes.
- Existing malformed/deeper/orphan/cyclic data stays visible through tolerant read models so users can repair it.
- `BqSubObject` is retired as a new domain concept; legacy data may require an explicit compatibility migration, not new features on that model.

## Calculation contract

- Works total = Works quantity × Works unit price.
- A Sub-Work line contributes coefficient × frozen source price.
- Material and service calculation functions are pure and centralized in BQ `lib/calc.ts` or its rebuild equivalent.
- Section rollups are pure and post-order so nested grouping subtotals are correct.
- UI components, actions, and repositories do not independently reduce or recalculate commercial totals.
- Blank price is unavailable, never zero. Explicit zero remains zero.
- MVP excludes waste engines, unit-conversion inference, purchase rounding, markup, overhead, profit, tax, and discount unless a later owner decision adds them.

## Snapshot and provenance law

When a user selects a Master Data material/service:

1. Search through `masterdata/public`.
2. For a SKU, display every eligible supplier-specific `prices[]` option.
3. The estimator explicitly selects one price.
4. BQ freezes source ID, source price ID, name/description, category display/path, supplier/vendor display, amount, currency, unit, and source update time needed for provenance.
5. The existing line never refreshes from upstream.

There is no refresh-all, refresh-selected, stale-price synchronization, drift replacement, or automatic upstream propagation. To use a newer price, the user creates/reselects a new acquisition deliberately; the previous estimate remains historical evidence.

Manual override changes only the BQ snapshot and records `is_manual_override` plus audit/provenance. It never writes back.

## Conceptual schema

```text
BqProject
  |--< BqSection (parent_id nullable; write depth <= 2)
  |--< BqWork
         |--< BqMaterialLine
         +--< BqServiceLine

BqLibraryRecipe
  |--< recipe work/sub-work structure
  +--< source references + coefficients (no frozen project price)
```

The final Prisma names may differ, but the hierarchy and ownership may not. StudioFlow Project and BqProject remain separate identities.

Material/service lines need source kind (`MASTER_DATA` or `PROJECT_LOCAL`), optional source IDs, immutable snapshot fields, coefficient/quantity inputs, manual-override marker, ordering, and audit metadata. Locked Works must block every child and self mutation server-side.

## Main workflows

### Create estimate

1. Create an independent BQ project.
2. Add Section/Sub Section structure using context menu or quick add.
3. Add Works and enter Works quantity.
4. Add material/service Sub-Works from Master Data or as project-local lines.
5. Select an explicit supplier price when a material has multiple options.
6. Calculate through pure shared BQ functions and roll up post-order.
7. Lock completed Works when needed.

### Edit and override

- Structural and coefficient changes are application use cases with server permission and lock checks.
- Snapshot commercial fields do not mutate because Master Data changed.
- A deliberate manual override is visibly labelled, audited, and reversible only through another explicit edit.

### Recipe library

- The library stores reusable structure, source references, and coefficients.
- It never stores an old project snapshot as canonical price.
- Applying a recipe resolves currently eligible sources, asks for required supplier selection, and creates fresh snapshots in the target BQ project.
- Missing/ambiguous sources fail visibly; no cheapest/latest fallback chooses silently.

## Public boundary

BQ consumes Master Data only through `masterdata/public`. It receives DTOs, not Prisma models. It has no Master Data write use case or database privilege.

If a later StudioFlow link is introduced, it is an explicit reference between separate project records. BQ calculations and lifecycle stay BQ-owned.

## UI/UX contract

BQ should feel like a compact, powerful worksheet rather than an ERP setup screen.

- Reuse UI Engine shell, dense table, toolbar, menu, combobox, inline edit, dialog, feedback, confirmation, and token layers.
- The primary canvas is keyboard-friendly and spreadsheet-dense.
- Closed Works show a client-facing summary; expanded Works show estimator detail and coefficients.
- Use context menus and quick-add rows. Drag/drop is not an MVP requirement.
- Section hierarchy is visually clear without deep decorative nesting.
- Source pickers show category, identity, unit, source/provenance, and all supplier prices; selection is never hidden behind a derived “best” value.
- Manual overrides and locked Works are immediately legible.
- Empty, unavailable-price, deleted-source, validation, and permission states remain actionable.
- User-facing copy is English.

App-specific worksheet composition stays in BQ. Base table interaction, focus, selection, overlays, form controls, and visual tokens remain in UI Engine.

## Permissions

Minimum canonical gates:

- `BQ_ACCESS`
- `BQ_PROJECT_MANAGE`
- `BQ_BREAKDOWN_EDIT`
- `BQ_SETTINGS_MANAGE`

The server enforces them. Object lock is an additional invariant, not a substitute for permission.

## Rebuild state and migration gaps

- `IMPLEMENTED`: only empty BQ architecture folders exist in the rebuild; no BQ product slice is complete.
- `BLOCKING CONFLICT`: current Master Data public contract returns singular `price`; BQ requires supplier-specific `prices[]` and explicit selection.
- `DECIDED`: snapshots never refresh.
- `REWRITE`: legacy actions/services/components into the rebuild app layers and UI Engine composition.
- `PURGE`: new `BqSubObject` features, refresh/drift replacement, automatic supplier choice, duplicated calculations, deep write nesting, drag/drop dependency, and automatic costing extras.
