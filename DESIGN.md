# DESIGN.md — StudioFlow Rebuild Design Contract

Status: **LOCKED — canonical minimalist shared visual contract (PM/TL, revised by owner direction 2026-08-25)**
Scope: Shared visual language for StudioFlow, Master Data, BQ, and future subapps.
Source basis: current owner direction plus the legacy UI engine, design tokens, shared shells/components, and proven app workflows. Every visual migration must record the exact legacy commit and distinguish committed evidence from working-tree-only evidence; no moving branch or prose summary is an implicit design authority.

Authority: this is the single shared visual contract. Product/domain policy remains owned by an owner-approved app contract; none is executable in the current foundation-only phase.

## 1. Design Intent

StudioFlow uses a quiet, restrained professional UI:
- warm-neutral palette with near-black ink;
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
| UI Meta | sans, `11px`, bold, uppercase, wide tracking |

H1–H2 provide restrained product identity. H3–H6, tables, controls, labels, menus, and data use sans-serif. Do not invent arbitrary sizes when an existing semantic role fits.

## 3. Color Semantics

Three tones, in a fixed relationship:

- **Near-white ground** `#fbfbfb` — the page. Nothing sits *on* it directly except spacing.
- **White planes** `#ffffff` — cards, tables, toolbars. Everything the
  operator actually reads or acts on.
- **Warm chrome** — the rail uses a controlled mix of Surface Muted and Surface;
  the sticky topbar remains a translucent white plane.
- **Near-black emphasis** `#1c1a18` — reserved for the primary action and compact
  identity marks, not repeated across every table.

The ground is what separates the white rail from the white content surfaces, but it
is deliberately shallow — 1.035:1 against white, close to the perceptual floor. It
reads as a hint, not as a plane. **The 1px border is therefore still the real edge**,
and any white plane that drops its border will disappear. Ink is a warm near-black
rather than a blue-black, which keeps the two warm semantic states (danger, warning)
reading as signal rather than fighting the ground.

Hierarchy still leans on the three type roles (serif display / sans operational /
mono data), on spacing, and on state. A screen that reads flat is usually missing
one of those, not missing more tint.

Base:
- Canvas (page ground): `#fbfbfb`
- Surface (rail, cards, tables, toolbars): `#ffffff`
- Surface muted (hover, selected, disabled): `#f5f4f2`
- Table header surface: `#f5f4f2` on `#55524d` label
- Primary text: `#1c1a18`
- Secondary text: `#55524d`
- Tertiary/meta: `#6e6a65`
- Default border: `#e0dfdc`
- Subtle border: `#eeedeb`
- Strong border: `#c2c0bc`
- Focus border: `#57534e`
- Primary action: `#1c1a18` / white
- Primary hover: `#332f2b`

Data face: `--ui-font-mono` is the platform monospace stack — no web font is
loaded for it. Use it for identifiers and reference codes so a reference reads as
a reference rather than as prose. Do not use it for running text.

Contrast floor: every text token must clear WCAG AA (4.5:1) against both Surface
and Canvas. Tertiary/meta text is held at `#6e6a65` for this reason — it carries
table headers, eyebrows, placeholders, and disabled labels, all of which are small.
Do not lighten it.

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

Elevation model — two physical planes plus restrained emphasis:

| Plane | What sits there | Treatment |
| --- | --- | --- |
| Ground | Page background behind everything | Near-white `#fbfbfb`, never bordered |
| Plane | Cards, tables, toolbars, topbar | White + 1px border, no shadow |
| Chrome | Rail | Warm muted surface + 1px border, no shadow |
| Emphasis | Primary action, compact identity mark | Near-black `#1c1a18` |

The rail is quiet application chrome, not another content card. Its warm-muted
surface separates navigation from work while the border retains the exact edge.
Every white content plane still carries its border — at 1.035:1 the ground alone
cannot define an edge.

Application chrome belongs to the ground plane, not the content plane. If the rail,
the page background, and the cards all render white, nothing has altitude and the
whole screen reads flat — the operator then has to re-scan the page from scratch on
every visit. Keep chrome on Canvas so content is the only thing that rises.

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
- warm-muted header surface with a strong lower rule;
- compact rows;
- metadata-style headings, quieter than the data they label;
- subtle row hover that reads as a scan line;
- numeric values right aligned;
- row actions consistently at the end;
- horizontal scroll when useful widths cannot fit.

Never squeeze columns until content overlaps.

Operational values stay on one line by default. When a value genuinely needs
more context, use the shared two-tier cell treatment: primary content may wrap to
at most two lines and optional secondary metadata sits below in tertiary type.
Do not insert ad-hoc `<br>` elements, shrink the column until every row wraps, or
mix two unrelated values without hierarchy. Numeric two-tier cells remain
right-aligned as one unit.

Figures — non-negotiable in a table:
- `font-variant-numeric: tabular-nums` applies to the whole table, not only to
  right-aligned cells. Identifiers, dates, counts, and amounts all contain digits,
  and columns of digits that do not line up force the eye to re-measure every row.
- Right-align anything that is compared down a column (counts, amounts, durations).
- Left-align anything that is read (names, labels, descriptions).
- Identifier columns carry `data-column="identifier"` so a reference reads as a
  reference rather than as prose.

Navigation always answers "where am I". Every rail marks its current entry, and
marks it on more than one channel — a fill alone collides with hover and reads as
nothing. The mark survives the collapsed rail, where it is the only orientation
cue left once labels are gone.

Application navigation is grouped by operator workflow, not by tables or schema
inventory. Master Data's primary groups are Brand & Catalog, Vendor & Supplier,
Pricing, and Samples; governance tools such as controlled dictionaries, import /
export, and audit live under General Settings as a persistent utility destination.
An unavailable cross-app workflow remains visibly disabled with a clear reason;
it must not acquire placeholder persistence merely to make the menu look complete.

Row selection also uses more than hover fill: the selection control remains
checked and the row receives a restrained ink rule at its leading edge. Status
meaning remains independent, so an ACTIVE selected row keeps its semantic marker
without turning the whole row green.

In a constrained directory toolbar, secondary utility actions use icon buttons
with explicit accessible names and visible-on-hover/focus tooltips. This applies
to reset filters, archive selection, clear selection, and export. Keep the active
filter value itself visible as text, and keep the selection count visible as a
compact icon-plus-number indicator; neither may be hidden entirely in a tooltip.

Sortable columns carry their control in the header itself: the label becomes the
button, with an unsorted / ascending / descending indicator beside it. Do not add a
separate sort icon column, and do not make the whole header row a single control —
each column is sorted on its own. Non-data columns (selection, row actions) are
never sortable.

Status is a marker, not a pill. `StatusBadge` renders a 7px semantic marker plus
a plain-ink label; `Badge` (filled pill) is for chips, tags and counts. A pill per
row turns a status column into colour noise and drops the label to the tone's own
contrast; the marker lets the eye scan the column by colour while the label stays
at full ink contrast. The text always carries the meaning, so colour is never the
only channel.

The header is a quiet structural surface, not a second primary action.
`--ui-table-header-bg` / `--ui-table-header-fg` carry the warm-neutral pair, while
the strong lower rule defines the transition into data. Sort focus uses the shared
focus border so it remains visible without turning the whole header into a dark band.

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

The collapsible icon rail is a desktop behavior. At `840px` and below, navigation
always returns to labeled horizontal form even when the stored desktop preference
is collapsed. The preference is preserved and may resume when the viewport widens;
UI Engine does not persist it.

Every collapsible app supplies a genuinely compact `collapsedBrand`; the full
brand is not a safe 60px fallback. Rail content is clipped to the rail plane,
never creates page-level horizontal overflow, and its utility navigation remains
reachable in both expanded and collapsed desktop presentations.

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

All paths below are committed code evidence from `D:\Projects\studioflow` at commit `6377ac0971e7a7cc0fd8fb58a8360c069675f9a5`; legacy Markdown and dirty working-tree styling are not authority.

- `src/ui_engine/design-system.config.ts`
- `src/ui_engine/tokens/**`
- `src/styles/designTokens.css`
- `src/ui_engine/layout/page-header.tsx`
- `src/ui_engine/layout/shells/dashboard-page-shell.tsx`
- `src/ui_engine/layout/shells/settings-shell.tsx`
- `src/ui_engine/components/section-card.tsx`
- `src/ui_engine/components/table-card.tsx`
- committed Master Data screens at the exact legacy commit recorded by the active app contract

This contract preserves the proven visual DNA while deliberately excluding feature-specific legacy tokens from the global design system.
