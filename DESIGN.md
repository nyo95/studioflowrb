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

Three web fonts, each with a single job.

| Font | Variable | Role |
|---|---|---|
| **Schibsted Grotesk** | `--font-sans` / `--ui-font-sans` | All operational UI — headings H3–H6, body, chrome, controls, tables |
| **Instrument Serif** | `--font-serif` / `--ui-font-serif` | Display: H1, H2, document titles, MOM surface. Identity without decoration. |
| **JetBrains Mono** | `--font-mono` / `--ui-font-mono` | Labels (`text-label`), identifiers, reference codes, data cells with codes |

Type scale — five sizes, no others:

| Name | Size | Line height | Use |
|---|---|---|---|
| micro | 11px (`text-micro`) | 16px | Labels (`text-label`), eyebrows, meta in tight spaces |
| meta | 13.5px (`text-meta`) | 20px | Chrome: nav items, tabs, badges, meta lines, table chrome |
| base | 16px (`text-base`) | 24px | Body copy, table cell values, form values |
| title | 21px (`text-title`) | 25px | Section headings, H3 in sans |
| display | 30px (`text-display`) | 34.5px | H1/H2 in serif only |

**Body vs chrome.** Body is what the operator came to read — cell values, record names, form values. Chrome frames it: nav items, tabs, badges, meta lines, mono identifiers. Chrome sits one step down (`text-meta`) so it recedes behind the content it surrounds. Content never drops to meta size to win space — cut the column, not the type.

**Mono identifiers.** `text-label` uses JetBrains Mono — not sans. Labels, eyebrows, group headings, and reference codes read as structured data rather than prose. This is the visual grammar of `NavItem`, `StatusBadge`, and table identifier cells.

**Instrument Serif is not Instrument Sans.** Instrument Sans does not exist in this product. The serif earns its place on large display moments and the MOM document surface; it does not appear in operational chrome or data tables.

**Loading.** Schibsted Grotesk and JetBrains Mono load via `next/font/google`. Instrument Serif loads via `localFont` from `src/app/fonts/` (woff2 files committed to the repo) because Google Fonts does not serve it as a variable font.

## 3. Color Semantics

Three planes in a fixed depth order: **ground → content → emphasis**.

**Ground** (`--ui-canvas`, `#F1EEE9`): the page behind everything. At 1.13:1 under white it is a real plane — visible, not a hint. Nothing sits on it directly except spacing. Switch between the three ground ramps via `[data-ground]` on `<html>`: `gray` (default), `clay`, `ivory`.

**Planes** (`--ui-surface`, `#FFFFFF`): cards, tables, toolbars, topbar — everything the operator reads or acts on. Shadow-carried hairlines define the edge (`--ui-shadow-plane`). The ground is deep enough that shadow alone separates white planes from it; drawn borders are retained only where a shadow would be invisible (structural rail dividers, focus rings).

**Rail** (`--ui-rail`, `#E8E3DB`): recesses below the ground — it reads as application chrome, not a content card. The rail being darker than the ground is deliberate: it says "this is the machine, not the work."

**Emphasis** (`--ui-action-primary`, `#231F1C`): constant graphite. It never changes per screen. "The dark button is the one that commits" is true everywhere.

**Phase hues** — five identity marks, shapes only:
- Moodboard `--ph-mood` `#6F7D45`
- Layout Plan `--ph-layout` `#B6782F`
- 3D Design `--ph-3d` `#9B5F55`
- Construction Doc `--ph-cd` `#466F88`
- Supervision `--ph-sup` `#695B8A`

Phase hues appear as filled bars, dots, rings, meter fills, and Gantt segments. **Never as text colour, never on a button.** `--ui-mark` holds the active phase hue and is set by JS on phase entry. A deep ramp (`--ph-*-deep`) is available for phase labels that must sit on ground or surface at 4.5:1+.

**Ink:** warm near-black (`#1A1714`), not blue-black. Secondary `#57504A`, tertiary `#6A635C`. Every text token clears WCAG AA (4.5:1) against both surface and canvas. Do not lighten tertiary — it carries table headers, eyebrows, placeholders, and disabled labels, all at small sizes.

**Semantic state:** danger/destructive red `#A63A2E`, success emerald `#3F7150`, warning amber `#956113` — each with a matching surface wash and border. Do not introduce app-specific accent colours for ordinary navigation, cards, or buttons without product-level approval.

## 4. Radius & Surface

Concentric radii — inner controls are tighter than their outer containers:

| Element | Radius | Token |
|---|---|---|
| Cards, sections, modals | 14px | `--ui-radius-card` |
| Controls, toolbars, dropdowns | 10px | `--ui-radius-control` |
| Inputs, action buttons | 7px | `--ui-radius-action` |
| Badges, chips | 999px | `--ui-radius-pill` |

Elevation model — shadow-carried hairlines replace drawn borders on content planes:

| Plane | Treatment | Shadow token |
|---|---|---|
| Ground | `--ui-canvas` `#F1EEE9`, no shadow | — |
| Content plane (resting) | `--ui-surface` + shadow hairline | `--ui-shadow-plane` |
| Content plane (hover/focus) | `--ui-surface` + raised shadow | `--ui-shadow-raise` |
| Rail / chrome | `--ui-rail` `#E8E3DB`, structural border | — |
| Dialog / menu / drawer | `--ui-surface` + full elevation | `--ui-shadow-over` |
| Emphasis | `--ui-action-primary` `#231F1C` | — |

`--ui-shadow-plane`: a 0.5px hairline ring + 1px micro shadow. This replaces the `1px border` on cards and tables. Structural dividers (sidebar separator, header bottom) keep a drawn border because a shadow would be invisible against an adjacent surface.

Do not stack cards inside cards. One elevation depth per screen section.

## 5. Spacing & Density

Canonical base:

| Token | Value |
|---|---|
| `--ui-section-px` | 16px |
| `--ui-section-py` | 16px |
| `--ui-section-gap` | 16px |
| `--ui-page-padding` | 20–24px (clamped) |
| `--ui-page-max` | 1440px |
| `--ui-row-y` | 9px (comfortable row padding) |
| `--ui-control-height-md` | 36px |
| `--ui-control-height-sm` | 32px |

This is an operational tool, not a marketing site. Optimize for scanning and repeated daily use.

**BQ compact density.** Apply `data-density="compact"` on `<html>` for BQ only. This stamp tightens row padding to 6px, controls to 28px/24px, and section padding to 12/10px. It is a single attribute change — no component-level overrides.

**Page measure variants.** `PageShell` accepts a `measure` prop:
- default (1100px): Today, Overview, phase canvas
- narrow (720px): Forms, settings
- wide (1440px): Schedule board, Timeline

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
- Dense directories use one shared surface around their toolbar, scrollable compact table, and pagination. Pagination is part of the surface at any row count — it stays visible and inert when there is only one page, so the footer never appears or disappears under the operator. It is not required for card or tab layouts that are not dense tables. Compact headers use 6px vertical padding and cells use 7px; wide tables scroll inside that surface.
- Secondary row operations live in an intentional action menu whose accessible name identifies the record. Destructive confirmation uses the emphasized danger action only at the final confirmation step.
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

All paths below are historical committed-code evidence recorded at commit
`6377ac0971e7a7cc0fd8fb58a8360c069675f9a5`; they do not establish a current
checkout path or commit. Any new legacy access follows `AGENTS.md`. Legacy
Markdown and dirty working-tree styling are not authority.

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
