# DESIGN.md — StudioFlow Rebuild Design Contract

Status: **LOCKED — canonical minimalist shared visual contract (PM/TL, revised by owner direction 2026-08-25)**
Scope: Shared visual language for StudioFlow, Master Data, BQ, and future subapps.
Source basis: the UI engine, design tokens, shared shells/components, and Master Data UI/UX rules in the locked GitHub legacy snapshot `548fbd6bd00ef9fd7d53df66a3561a32fbb56944`.

Authority: this file specializes `docs/02-UI-ENGINE-PRD.md`. Product/domain ownership remains governed by the Software SSOT, Data Ownership contract, and app PRDs.

## 1. Design Intent

StudioFlow uses a quiet, restrained professional UI:
- neutral slate palette;
- white working surfaces over a light canvas;
- compact, information-dense layouts;
- serif typography for major page headings;
- sans-serif typography for controls, tables, forms, and operational UI;
- border-led surfaces with shadow reserved for overlays or true elevation;
- status color only when meaning is functional.

All apps must feel like one product. Do not create a separate visual language per app.

## 2. Canonical Typography

- Page and major-view headings: `Lora` / `font-serif`
- Operational UI/body: `Inter` / `font-sans`

| Role | Default |
|---|---|
| H1 | serif, 32px, semibold/bold, tight |
| H2 | serif, 24px, semibold/bold, tight |
| H3 | sans, 18px, semibold |
| H4 | sans, 16px, semibold |
| H5 | sans, 14px, semibold |
| H6 | sans, 12px, semibold |
| Body | sans, `text-sm`, normal |
| UI Meta | sans, `10px`, bold, uppercase, wide tracking |

H1–H2 provide restrained product identity. H3–H6, tables, controls, labels, menus, and data use sans-serif. Do not invent arbitrary sizes when an existing semantic role fits.

## 3. Color Semantics

Base:
- Canvas: `#f8fafc`
- Surface: white
- Primary text: slate-950
- Secondary text: slate-600
- Tertiary/meta: slate-400
- Default border: slate-200
- Subtle border: slate-100
- Primary action: slate-900 / white
- Primary hover: slate-800

Semantic state:
- danger/destructive: red foreground + subtle surface + border
- success: emerald foreground + subtle surface + border
- warning/pending: amber foreground + subtle surface + border

Before/after change previews use danger/success semantics only when that meaning is accurate. Domain statuses choose a semantic state in app code; UI Engine never infers business meaning from a status string.

Do not introduce app-specific accent colors for ordinary navigation, cards, or buttons without product-level approval.

## 4. Radius & Surface

- Card: 8px
- Control: 6px
- Action/button/input: 4px
- Pill: only for badges/chips where appropriate

Primary surfaces are white with a 1px subtle/default border and no shadow by default. Shadow is reserved for dialogs, drawers, menus, floating toolbars, or genuinely elevated content. Avoid deep elevation and card-inside-card layouts.

## 5. Spacing & Density

Canonical base:
- section padding X: 16px
- section padding Y: 16px
- section gap: 16px
- page padding: 20–24px
- max page width: ~1440px

This is an operational tool, not a marketing site. Optimize for scanning and repeated daily use. BQ may be denser because spreadsheet-like efficiency is a product requirement.

## 6. Page Structure

```text
AppShell
└── PageShell
    ├── PageHeader
    │   ├── Eyebrow/context?
    │   ├── Title
    │   ├── Description?
    │   ├── Meta?
    │   └── Primary action?
    └── PageContent
        ├── Toolbar/Filters?
        └── Sections/Table/Detail
```

Rules:
- one clear H1 per page;
- primary action belongs in PageHeader or main toolbar;
- descriptions and metadata are optional, never filler;
- reuse shared shells instead of creating custom page wrappers;
- apps may provide navigation configuration, not separate shell styling.

## 7. Tables

Tables are first-class UI in Master Data and BQ.

Default:
- white surface;
- subtle border;
- slate-50-ish header;
- compact rows;
- metadata-style headings;
- subtle row hover;
- numeric values right aligned;
- row actions consistently at the end;
- horizontal scroll when useful widths cannot fit.

Never squeeze columns until content overlaps.

BQ may add inline editing and greater density while keeping the same typography, colors, borders, focus states, and action language.

## 8. Forms

Forms are grouped by business meaning, not arbitrary cards.

Prefer:
```text
Section title
Short supporting text if needed
[ related fields in a logical grid ]
```

Rules:
- labels remain visible when meaning is not obvious;
- required state is explicit;
- validation stays near the field;
- destructive actions are separated;
- advanced/rare fields may collapse;
- do not mix different domain ownership merely for UI convenience.

Master Data examples:
- Brand form = Brand/profile/discovery data.
- SKU form = SKU classification/specification.
- Pricing = pricing workflow, not hidden inside Brand editing.

## 9. Dialogs, Drawers & Detail Views

Use Dialog for short focused create/edit.
Use Drawer when preserving list context matters.
Use full page for substantial detail/history/navigation.

Canonical widths:
- SM 420px
- MD 560px
- LG 760px
- XL 980px
- Full 1180px
- Max height 90vh

Do not invent arbitrary modal widths per feature.

## 10. Navigation & Actions

- one dominant primary action when possible;
- secondary actions neutral;
- destructive actions explicit and separated;
- row-level secondary actions normally use consistent `•••`;
- one shared back-navigation pattern;
- tabs are for sibling views of one domain.

## 11. Loading, Empty, Error & Disabled States

Every reusable data surface supports:
- loading;
- empty;
- error;
- disabled/read-only where applicable.

Error must not look like empty data. Do not silently hide unresolved or invalid Master Data/BQ state.

## 12. Responsive Behavior

Desktop operational use is primary, but narrower layouts must remain functional:
- navigation can collapse/reflow;
- tables scroll horizontally;
- form grids collapse progressively;
- dialogs respect viewport height;
- actions remain reachable.

Do not improve mobile by removing core information.

## 13. Interaction Contract

- subtle predictable hover;
- visible focus;
- standardized inline-edit save behavior;
- optimistic UI only when failure can safely revert;
- Enter commits and Escape cancels inline editing by default;
- blur commits only when the owning pattern explicitly enables it;
- drag/reorder shows source/target clearly;
- no hidden automatic mutation across domain boundaries.

## 14. Content Economy

- Prefer a clear label over a label plus explanatory paragraph.
- PageHeader descriptions are optional and normally one short sentence.
- Field help appears only when the input is ambiguous, risky, or constrained in a non-obvious way.
- Empty, loading, and error states use a short title and at most one actionable sentence; no decorative prose or oversized illustration is required.
- Buttons use concise verb-first labels. Icon-only actions require an accessible label and tooltip.
- Do not repeat the same instruction in PageHeader, section description, field help, and empty state.
- Progressive disclosure is preferred for rare metadata and advanced settings.

## 15. Document & Print Presentation

UI Engine may provide a generic `DocumentSheet`/print surface with A4-like preview proportions, print-safe typography, neutral tables, header/footer slots, and `@media print` behavior.

Apps own document meaning, data mapping, calculations, legal copy, page-break decisions, numbering, signatures, export adapters, and PDF generation. UI Engine must not import a PDF library, Prisma model, or app schema, and must not infer a form or document directly from Prisma/Zod metadata.

The on-screen document preview and exported document should share visual primitives where practical, while remaining independently testable.

## 16. Design Governance

Before UI implementation:
1. read this file;
2. read `UI_ENGINE.md`;
3. reuse existing engine templates/components;
4. keep domain-specific composition inside the owning app.

Forbidden without PM/TL approval:
- new global visual language;
- new spacing/radius scale;
- new font hierarchy;
- feature-specific global tokens;
- duplicate shared primitives;
- one-off page shells;
- changing shared tokens to solve one screen.
- schema-driven UI frameworks or app-specific PDF templates inside UI Engine.

If a shared pattern is missing, report it rather than creating a parallel design system.

## 17. Legacy Evidence Used

- `src/ui_engine/design-system.config.ts`
- `src/ui_engine/tokens/**`
- `src/styles/designTokens.css`
- `src/ui_engine/layout/page-header.tsx`
- `src/ui_engine/layout/shells/dashboard-page-shell.tsx`
- `src/ui_engine/layout/shells/settings-shell.tsx`
- `src/ui_engine/components/section-card.tsx`
- `src/ui_engine/components/table-card.tsx`
- `docs/MASTERDATA_UIUX_REVISION.md`

This contract preserves the proven visual DNA while deliberately excluding feature-specific legacy tokens from the global design system.
