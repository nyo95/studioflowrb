# DESIGN.md — StudioFlow Rebuild Design Contract (v2)

Status: **LOCKED — v2, owner-approved 2026-10-06 (R8.357)**, after review of the
interactive mockup. Replaces v1 (R8.202 foundations, R8.148 headings).
Scope: shared visual language for StudioFlow, Master Data, BQ, and future apps.

**Built (R8.357–R8.361):** tokens (§3–§5), the rail and thin top bar
(§10.1–§10.2), the pill tab bar and context capsule (§10.3; StudioFlow project
pages, Product Schedule and Home), stat cards (§6.1; StudioFlow Home, Master Data
home) and the counts on rail items. **In progress:** the Playwright size checks
(§12). Master Data and BQ still use `Tabs` for their in-page views.

## 0. What changed from v1

Owner direction (2026-10-06): an **Apple / Linear** feel — quiet, minimal, more
air around things, hairline borders, soft depth — taken from three reference
screenshots for their **structure only** (no red accent, no dark glass, no green,
no 3D art). Owner decisions recorded with it:

| # | Decision | Effect on this contract |
|---|---|---|
| 1 | Account, Settings and Log out move into the rail; search, notifications and messages stay in a thin top bar | §10.1, §10.2; reverses R8.110's "Settings in the account menu"; loosens R8.329 (the top bar keeps the mark cell, app chip and search, loses the account menu) |
| 2 | The rounded pill bar is for in-page tabs and context only, not main navigation | §10.3 |
| 3 | Chrome and the space between sections get airier; tables and the schedule keep their density | §1, §5 |
| 4 | The active rail item is a full-width white block | §10.1 |
| 5 | Playwright guards screen sizes (375, ~640, 839/840/841 px) | §12 |

| Area | v1 | v2 |
|---|---|---|
| Intent | "compact, information-dense; an operational tool, not a marketing site" | calm chrome, dense data: air around pages and sections, unchanged density inside tables |
| Ground | `#F0F0F0`, 1.13:1 under white | lighter `#F5F5F4`; planes separate by a hairline, not by contrast |
| Planes | shadow-carried hairline (`--ui-shadow-plane`) | 1px hairline border `--ui-border-subtle`; shadow only on things that float |
| Rail | recessed, darker than the ground | white plane on the left edge with one hairline; groups, round icon chips, counts |
| Card radius | 14px | 16px (controls 10px, actions 8px, pills 999px) |
| Section padding / gap | 16 / 16px | 20 / 24px (tables unchanged) |
| Page padding | 20–24px | 24–32px (16px on a phone) |
| Page head | breadcrumb in a separate sticky strip | context capsule above the title; large title; one line of context |
| New patterns | — | pill tab bar (§10.3), stat card (§6.1) |
| Unchanged | fonts and type scale, ink, semantic colours, phase marks, motion, tables, forms, dialogs, print, governance | — |

## 1. Design Intent

StudioFlow looks and behaves like a calm professional tool in the Apple / Linear
manner:
- one light neutral ground with warm near-black ink;
- white working planes edged by a single hairline, with generous space between them;
- **calm chrome, dense data**: page heads, cards and the gaps between sections are
  airy; inside a table, schedule or list the rows stay as compact as v1, because
  the operator scans them all day;
- one sans family for everything, with weight and size carrying the hierarchy;
- depth only for what floats (menus, dialogs, the pill bar, drawers);
- status colour only when meaning is functional;
- every screen answers "where am I" and "what needs me" before anything else.

All apps must feel like one product. Do not create a separate visual language per app.

## 2. Canonical Typography

Three web fonts, each with a single job.

| Font | Variable | Role |
|---|---|---|
| **Schibsted Grotesk** | `--font-sans` / `--ui-font-sans` | Everything on screen — H1/H2 at black weight (900), H3–H6, body, chrome, controls, tables |
| **Instrument Serif** | `--font-serif` / `--ui-font-serif` | Loaded and tokenized, with no current consumer. H1/H2 left it in R8.148 because the face ships at 400 only and a synthesized bold read thin. Use it again only by owner decision, at its real weight. |
| **JetBrains Mono** | `--font-mono` / `--ui-font-mono` | Labels (`text-label`), identifiers, reference codes, data cells with codes |

Type scale — five sizes, no others:

| Name | Size | Line height | Use |
|---|---|---|---|
| micro | 11px (`text-micro`) | 16px | Labels (`text-label`), eyebrows, meta in tight spaces |
| meta | 13.5px (`text-meta`) | 20px | Chrome: nav items, tabs, badges, meta lines, table chrome |
| base | 16px (`text-base`) | 24px | Body copy, table cell values, form values |
| title | 21px (`text-title`) | 25px | Section headings, H3 in sans |
| display | 30px (`text-display`) | 34.5px | H1/H2, Schibsted Grotesk black |

**Body vs chrome.** Body is what the operator came to read — cell values, record names, form values. Chrome frames it: nav items, tabs, badges, meta lines, mono identifiers. Chrome sits one step down (`text-meta`) so it recedes behind the content it surrounds. Content never drops to meta size to win space — cut the column, not the type.

**Mono identifiers.** `text-label` uses JetBrains Mono — not sans. Labels, eyebrows, group headings, and reference codes read as structured data rather than prose. This is the visual grammar of `NavItem`, `StatusBadge`, and table identifier cells.

**Instrument Serif is not Instrument Sans.** Instrument Sans does not exist in this product. The serif never appears in operational chrome or data tables.

**Loading.** Schibsted Grotesk and JetBrains Mono load via `next/font/google`. Instrument Serif loads via `localFont` from `src/app/fonts/` (woff2 files committed to the repo) because Google Fonts does not serve it as a variable font.

## 3. Color Semantics

Three planes in a fixed depth order: **ground → content → emphasis**.

**Ground** (`--ui-canvas`, `#F5F5F4`): the page behind everything — lighter than
v1 so the page reads as open space. Nothing sits on it directly except spacing.
There is **one** ground.

**Planes** (`--ui-surface`, `#FFFFFF`): cards, tables, toolbars, the rail, the top
bar. A plane is edged by **one 1px hairline** (`--ui-border-subtle`), not by a
shadow; at this ground contrast a hairline is what separates white from the page.
Shadows are reserved for planes that float above others (§4).

**Rail** (`--ui-surface` with a hairline on its inner edge): v1 recessed the rail
below the ground to say "this is the machine". v2 makes it a quiet white column
like the reference layouts, and lets its structure (groups, chips, the active
block) say "navigation". The record workspace rail, where one exists, uses the
same treatment.

**Emphasis** (`--ui-action-primary`, `#231F1C`): constant graphite. "The dark
button is the one that commits" stays true everywhere. A selected chip or the
active item of a pill bar may also use the graphite fill (it already does for
filter chips); a navigation item never does — the active rail item is white (§10.1).

**Phase marks** — five steps of **one** hue family, shapes only:

| Phase | Token | Light | L\* | Dark | L\* |
|---|---|---|---|---|---|
| Moodboard | `--ph-mood` | `#888177` | 54.3 | `#827B72` | 52.0 |
| Layout Plan | `--ph-layout` | `#746E66` | 46.7 | `#9B9287` | 61.0 |
| 3D Design | `--ph-3d` | `#615B55` | 39.0 | `#B4AA9D` | 70.1 |
| Construction Doc | `--ph-cd` | `#4E4A44` | 31.7 | `#CDC2B4` | 79.0 |
| Supervision | `--ph-sup` | `#3C3934` | 24.1 | `#E8DBCB` | 88.0 |

Lightness is the channel, not hue. Five hues at one lightness — the previous set
spanned only 14 L\* — are one palette to a reader who separates hues easily and
one flat smear to a reader who does not, and a 7px dot on a Gantt row gives
colour no help from a label. These steps are ~7.6 L\* apart in light and ~9 in
dark, and every one clears 3:1 against surface, canvas and rail in both themes.
`design-contract.test.ts` asserts both properties; do not add a sixth phase
without re-spacing the ramp.

The ramp also carries meaning the old hues could not: it runs from the ground
outward, so Moodboard sits closest to the page and Supervision furthest from it.
A Gantt row reads as sequence with no legend.

Marks appear as filled bars, dots, rings, meter fills, and Gantt segments.
**Never as text colour, never on a button.** A phase *label* is ordinary ink —
that is why there is no deep ramp. `--ui-mark` holds the active phase mark and is
set by JS on phase entry.

**Ink:** warm near-black (`#1A1714`), not blue-black. Secondary `#57504A`, tertiary `#6A635C`. Every text token clears WCAG AA (4.5:1) against both surface and canvas. Do not lighten tertiary — it carries table headers, eyebrows, placeholders, and disabled labels, all at small sizes.

**Semantic state:** danger/destructive red `#A63A2E`, success emerald `#3F7150`, warning amber `#956113` — each with a matching surface wash and border. Do not introduce app-specific accent colours for ordinary navigation, cards, or buttons without product-level approval.

## 4. Radius & Surface

Concentric radii — inner controls are tighter than their outer containers:

| Element | Radius | Token |
|---|---|---|
| Cards, sections, modals, drawers | 16px | `--ui-radius-card` |
| Controls, toolbars, dropdowns | 10px | `--ui-radius-control` |
| Inputs, action buttons, rail items | 8px | `--ui-radius-action` |
| Badges, chips, pill bar, context capsule, icon chips | 999px | `--ui-radius-pill` |

Elevation model — a hairline edges what rests; a shadow lifts only what floats:

| Plane | Treatment | Token |
|---|---|---|
| Ground | `--ui-canvas`, no edge | — |
| Content plane (resting) | `--ui-surface` + 1px `--ui-border-subtle` | — |
| Content plane (hover/focus, when interactive) | + `--ui-border-default` | — |
| Rail, top bar | `--ui-surface` + one structural hairline | — |
| Pill bar, context capsule | `--ui-surface` + hairline + soft shadow | `--ui-shadow-float` (new) |
| Dialog / menu / drawer | `--ui-surface` + full elevation | `--ui-shadow-over` |
| Emphasis | `--ui-action-primary` | — |

Do not stack cards inside cards. One elevation depth per screen section.

## 4.1 Iconography

Four sizes, no others. Icons are line icons at a consistent stroke; they label an
action, they are not decoration.

| Name | Size | Token | Use |
|---|---|---|---|
| xs | 12px | `--ui-icon-xs` | Inline marks inside a text line — breadcrumb and rail chevrons, separators |
| sm | 14px | `--ui-icon-sm` | Inside controls, table rows, menu items, trailing affordances |
| md | 16px | `--ui-icon-md` | The default — nav entries (inside their round chip), toolbar buttons, section heads |
| lg | 20px | `--ui-icon-lg` | Empty states and page-level marks |

Before R8.202 the product used nine sizes between 10px and 20px, each chosen at
the moment of writing. The cost is not one icon looking wrong; it is a row of
icons that should align and does not. Pick the nearest size on the scale rather
than introducing a tenth.

An icon-only control still needs an accessible name and a tooltip (§14).

## 5. Spacing & Density

Two densities, one rule: **air belongs to the frame, density belongs to the data.**

Frame (page, page head, cards, gaps between sections):

| Token | v2 value |
|---|---|
| `--ui-page-padding` | 24–32px (clamped); 16px below 560px |
| `--ui-section-px` | 20px |
| `--ui-section-py` | 20px |
| `--ui-section-gap` | 24px |
| `--ui-page-max` | 1440px |

Data (tables, schedule, lists, directory rows) — unchanged from v1:

| Token | Value |
|---|---|
| `--ui-row-y` | 9px |
| `--ui-control-height-md` | 36px |
| `--ui-control-height-sm` | 32px |
| table header / cell padding | 6px / 7px (compact directories) |

**BQ compact density.** `data-density="compact"` on `<html>` for BQ only, as in
v1 (rows 6px, controls 28/24px, section padding 12/10px).

**Page measure variants.** `PageShell` accepts a `measure` prop:
- default (1100px): general content
- narrow (720px): forms, settings
- wide (1440px): StudioFlow Home, project workspace, Schedule board, Timeline

## 6. Page Structure

```text
AppShell (rail + thin top bar)
└── PageShell
    ├── PageHeader
    │   ├── Context capsule?   (app · section · record — §10.3)
    │   ├── Title + status badge?
    │   ├── One line of context?
    │   └── Actions (view toggle, primary action)
    ├── Stat cards?             (§6.1)
    └── PageContent
        ├── Pill tab bar?       (§10.3)
        ├── Toolbar/Filters?
        └── Sections / Table / Canvas + detail panel
```

Rules:
- one clear H1 per page;
- primary action belongs in PageHeader or the main toolbar;
- descriptions and metadata are optional, never filler;
- reuse shared shells instead of creating custom page wrappers;
- apps may provide navigation configuration, not separate shell styling;
- a canvas with a selection (a board, a plan, a schedule) may pair with a
  **detail panel** on the right: a white plane of label-left / value-right spec
  rows, using `Drawer` or `DetailShell`.

## 6.1 Stat cards

A row of up to four cards, each: small label (optional icon in a round chip), one
large figure in `MetricValue`, one quiet caption. Use them only where the numbers
drive a decision on that page (e.g. "3 of 12 final", "2 samples waiting"); never
as decoration, never repeating a count the page already shows. They stack two-up,
then one-up, on narrow screens.

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

## 10.1 The rail (owner decisions 1 and 4)

Collapsed by default: icons only, in a slim column. It expands **when pressed**
(the collapse/expand control), never on hover, and pushes the content rather than
covering it. Expanded, top to bottom:

1. **Account block** — avatar, name, a chevron that opens Account (profile,
   switch account where available). Collapsed: the avatar alone.
2. **Groups** — a small uppercase, letter-spaced label (`text-label`) and a hairline
   divider between groups. Apps supply groups through `NavGroup` headings.
3. **Items** — each icon sits in a small round chip; the label follows; a count, if
   any, is a right-aligned pill (`badge`), hidden when collapsed (a dot remains).
   The **active item is a full-width white block** with a hairline, semibold label
   and an ink icon chip, so "where am I" reads on three channels.
4. **General** at the foot — **Settings** and **Log out**, then the collapse control.

A count is shown only when it asks for action (e.g. items waiting on me); it is
supplied by the owning app, never computed in the UI Engine.

## 10.2 The top bar (owner decision 1)

One thin line (`--ui-topbar-height`): the mark in a cell exactly as wide as the
rail (R8.329's boundary is kept), the app chip beside it (R8.121 kept), the search
field, then notifications and messages pinned right. The account menu leaves the
top bar for the rail. On a phone (below 840px) the account avatar returns to the
top bar's right end, because the rail becomes a strip there (§12).

## 10.3 Pill tab bar and context capsule (owner decision 2)

- **Pill tab bar** — for sibling views inside a page only (e.g. Phases / MOM /
  Schedule / Presentation / History; Material / Fixture; Board / List). A rounded,
  floating `--ui-surface` bar with a hairline and `--ui-shadow-float`. Items are
  icon + label; on narrow widths inactive items may drop to icon-only while the
  **active item always shows icon + label** in the graphite fill. It scrolls inside
  itself when it cannot fit. It never replaces the rail or the top bar.
- **Context capsule** — a small rounded capsule above the page title: app · section
  · record (e.g. "StudioFlow · Projects · 2026-536 Sociolla …"), each part a link
  back. It replaces the separate sticky breadcrumb strip.

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
- tables scroll horizontally inside their own surface;
- form grids collapse progressively;
- dialogs respect viewport height; drawers go full width on a phone;
- actions remain reachable.

Do not improve mobile by removing core information.

**Fixed frame, scrolling content.** The shell is one viewport high: the top bar
and the navigation strip stay put; only the content scrolls. **The content never
scrolls sideways.** Anything wider than the screen — a phase strip, a pill tab bar,
a table — scrolls inside its own container, and every container between it and the
page must be allowed to shrink (`min-w-0` on grid and flex items).

The collapsible rail is a desktop behavior. Below `840px` it becomes a labeled
horizontal strip under the top bar, even when the desktop preference is collapsed;
the preference is preserved and resumes when the viewport widens; UI Engine does
not persist it.

**Guarded sizes.** Playwright checks run at 375px, around 640px, and at 839 / 840 /
841px (rail collapsed, expanded, and with long content): no page-level horizontal
overflow, the mark cell and the rail share one width, and the rail expands only on
press.

## 13. Interaction Contract

- subtle predictable hover;
- visible focus;
- standardized inline-edit save behavior;
- optimistic UI only when failure can safely revert;
- Enter commits and Escape cancels inline editing by default;
- blur commits only when the owning pattern explicitly enables it;
- drag/reorder shows source/target clearly;
- no hidden automatic mutation across domain boundaries.

## 13.1 Motion

Three durations and two easings. Everything else is a one-off waiting to spread.

| Token | Value | Use |
|---|---|---|
| `--ui-motion-fast` | 120ms | Colour and opacity under the pointer — hover, focus, press |
| `--ui-motion-base` | 160ms | Size and position — rail collapse, disclosure, reorder |
| `--ui-motion-slow` | 240ms | An overlay arriving — dialog, drawer, menu |
| `--ui-ease-standard` | `cubic-bezier(.2, 0, 0, 1)` | Anything entering or settling |
| `--ui-ease-exit` | `cubic-bezier(.4, 0, 1, 1)` | Anything leaving |

Nothing animates longer than `slow`. This is an operational tool used all day;
motion confirms that something happened, it does not perform. Durations are
applied as `duration-[var(--ui-motion-fast)]`, because Tailwind has no duration
namespace to register these against — the bare `duration-(--token)` form is not
guaranteed to emit a rule, and a motion token that silently emits nothing is
worse than a hard-coded value.

`@media (prefers-reduced-motion: reduce)` collapses all of it in the engine base
layer; no component repeats that rule.

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

(v2 note) The owner's approval of this draft is the PM/TL approval required above for a new visual language and spacing/radius values.

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
