# UI_ENGINE.md — Shared UI Architecture Contract

Status: **LOCKED — canonical minimalist shared UI architecture contract (PM/TL, revised by owner direction 2026-08-25)**
Consumers: StudioFlow, Master Data, BQ, future apps.

Authority: this is the single shared UI architecture contract and specializes `DESIGN.md`. App-specific UI policy remains owned by an owner-approved app contract; none is executable in the current foundation-only phase.

Legacy evidence provenance: existing UI capability ledgers preserve the exact
commit used when that evidence was recorded; they do not establish a current
checkout path or commit. Before new legacy access, ask the owner for the exact
path on the current computer and follow the strict read-only repository and
PostgreSQL isolation rules in `AGENTS.md`. A moving branch tip and prose-only
summary are never sufficient evidence.

## 1. Purpose

`ui_engine` is shared UI infrastructure, not only a token collection.

It owns:
- visual tokens;
- generic primitives;
- reusable composed components;
- layout patterns;
- application/page shells;
- shared interaction patterns.

Its purpose is to stop StudioFlow, Master Data, and BQ from independently recreating the same UI structures.

The engine optimizes for composability, low visual noise, concise copy, accessible behavior, and stable generic props. It does not optimize for the largest possible component catalog.

## 2. Dependency Rule

Allowed:
```text
Apps
  ↓
UI Engine
  ↓
approved base UI primitives / Tailwind / shared utilities
```

Forbidden:
```text
UI Engine → StudioFlow domain
UI Engine → Master Data domain
UI Engine → BQ domain
StudioFlow UI → BQ UI
BQ UI → StudioFlow UI
```

UI Engine may accept generic props/data shapes. It must not import domain services, Prisma models, business actions, or app-specific types.

## 3. Target Structure

```text
src/platform/ui_engine/
├── tokens/
├── primitives/
├── components/
├── layouts/
├── patterns/
└── index.ts
```

### tokens
Pure design constants, CSS variables, semantic utility mappings.

### primitives
Small generic building blocks, e.g. Heading, Badge, IconButton, Divider, Surface.

Do not wrap every base primitive merely to rename it.

### components
Reusable composed units, e.g. SectionCard, TableCard, EmptyState, ErrorState, LoadingState, Toolbar, ConfirmAction.

### layouts
Generic structure and reusable templates, e.g. PageHeader, PageSection, SplitPane, DetailLayout, AppShell, PageShell, SettingsShell, Directory/ListShell, and DetailShell.

### patterns
Shared interaction contracts, e.g. inline editing, row actions, filter/search toolbar, dialog form, drawer detail.

## 3.1 Three-tier composition model (R6.1)

Every UI capability in this engine belongs to exactly one tier:

| Tier | What it is | Examples |
|---|---|---|
| **Primitive** | Atomic building block — single responsibility, no composition assumed | `Button`, `Badge`, `Input`, `StatusMarker`, `IconButton` |
| **Pattern** | Reusable interaction contract combining primitives — still domain-agnostic | `DraftDialog`, `RowActionMenu`, `InlineEdit`, `DirectoryShell`, `Pagination` |
| **Application composition** | App-owned assembly of patterns + primitives with domain knowledge | `BrandDirectory`, `VendorDirectory`, `ProjectEditor` |

Rules:
- Patterns must not import domain types, services, Prisma models, or app-specific constants.
- A capability that requires domain vocabulary to be meaningful is Application composition — keep it in the app.
- When an Application composition is replicated across ≥2 apps, extract the domain-agnostic core as a Pattern.

## 3.2 Directory pattern (R6.1 addition)

The following shared directory pattern is canonicalized for all entity list pages:

```text
DirectoryShell
├── TableToolbar (search, filters, primary action button) — named DirectoryToolbar in R6.1 prose
├── DataTable
│   ├── EntityPrimaryCell (● StatusDot + Primary name + secondary metadata line)
│   └── RowActionMenu (⋯ ellipsis — all ordinary CRUD: edit, archive, restore, delete)
└── Pagination
```

**EntityPrimaryCell convention:**
- Status indicator = colored dot (● green = active, ● red = archived). No separate Status column.
- Primary = entity name, bold.
- Secondary = metadata line below: updated date, type tags, counts — whatever is contextually relevant.

**RowActionMenu convention:**
- All ordinary CRUD (Edit, Archive, Restore, Request Deletion) go behind ⋯.
- Icon actions (not ⋯) reserved only for: reorder handles, inline manipulation, highly contextual editor controls.

**Layout viewport-awareness:**
- DirectoryShell fills remaining viewport height (`flex: 1; min-height: 0`).
- DataTable body scrolls internally (`overflow-y: auto`).
- Sticky header and sticky action column are the table's responsibility.
- Do NOT use fixed or magic heights (`60vh`, `maxBodyHeight="..."`) — use flex layout.


## 3.5 Shared chrome and display atoms (R7.22)

These were added when StudioFlow's approved design was applied, and are shared
because each one either enforces a global rule or already existed as duplicated
inline markup in more than one app.

| Component | Tier | Why it is shared |
|---|---|---|
| `Breadcrumb` | Pattern | There is no global topbar, so the page itself must state where the record sits. One implementation keeps that line identical everywhere. |
| `FilterChip` / `filterChipClasses` | Primitive | Selection must reach assistive technology (`aria-pressed` on a button, `aria-current` on a link), not just fill. The class helper stays outside the client boundary so server components can render chips as links. |
| `Avatar` / `initialsOf` | Primitive | People columns appeared inline in three places with three different sizes. |
| `CountBadge` | Primitive | The monospace count beside a title and a tab label is one rule. |
| `MetaList` | Primitive | The dot-separated identity line under a page title. |
| `ProgressBar` | Primitive | A measure that always carries `role="progressbar"` and a label. |
| `SegmentBar` | Primitive | Compact ordered stage bar for a table cell; decorative, so `label` is required. |
| `GroupHeader` | Pattern | Worklist bucket head: uppercase label, count, rule to the end of the measure. |
| `PipelineStrip` | Pattern | Ordered stages as one hairline-separated band; the current stage is `aria-current="step"`, never colour alone. |

`Pagination` takes either `onPageChange` (client directories holding page state
locally) or `getHref` (server-rendered directories, where paging must survive a
reload and stay shareable). Given `total` and `pageSize` it reports the row
range — "26–50 of 96" — instead of the page number, because the operator is
looking for a record, not for a page. A boundary step renders as a disabled
control rather than disappearing, so the footer does not reflow on the first and
last page.

`SectionCard` now owns the framed-section header bar (`title`, `description`,
`count`, `action`, `padded`). Before R7.22 it accepted no `title`, so five call
sites were passing one and silently rendering a native tooltip instead of a
heading.

Form controls take `density="regular" | "compact"`, matching `DataTable`'s
`density`. `size` stays the native attribute it always was on `input` and
`select`, so multi-selects that set a row count keep working.

## 3.3 Dialog sizing convention (R6.1)

| Size | When to use |
|---|---|
| `sm` | Ordinary CRUD (create/edit a single entity with a few fields) |
| `md` | Moderately complex CRUD (entity with several sections, related items) |
| `lg` | Editor / workspace (BQ project editor, template editor) |

App-level code must not pass arbitrary `width` or `maxWidth` overrides. If an existing dialog needs a different size, fix the shared size tier.

`DraftDialog` remains the standard container for all CRUD dialogs with unsaved-draft protection.

## 3.4 Viewport-fill pattern API (R6.03)

Use `<DirectoryShell fill>` + `<DataTable fill>` to build viewport-tall tables without magic heights.

```tsx
// Page root must be a flex column that fills its parent
<DirectoryShell fill surface toolbar={<TableToolbar ... />}>
  <DataTable fill columns={cols} rows={rows} />
</DirectoryShell>
```

**Props added in R6.03:**

| Component | Prop | Effect |
|---|---|---|
| `DirectoryShell` | `fill?: boolean` | Adds `flex flex-col flex-1 min-h-0` to outer + inner containers |
| `DataTable` | `fill?: boolean` | Body scroll container grows with `flex-1 min-h-0`; `maxBodyHeight` ignored when fill is set |

**Rule:** Never pass both `fill` and `maxBodyHeight` on the same `DataTable`. `fill` wins.

**`EntityPrimaryCell`** formalises the ● + name + secondary composition that was previously written inline:

```tsx
import { EntityPrimaryCell } from "@/platform/ui_engine";
// Inside a DataTable column renderer:
<EntityPrimaryCell tone="positive" statusLabel="Active" name={row.name} secondary={row.code} />
```

Available tones mirror `StatusMarker`: `"positive" | "negative" | "warning" | "neutral" | "info"`.


## 4. What UI Engine Does Not Own

Keep domain UI inside the app:
- `BrandPicker`
- `SkuDetail`
- `BqBreakdownGrid`
- `ProjectPhaseCard`
- `MaterialPriceEditor`

Rule: if removing StudioFlow/Master Data/BQ vocabulary makes the component meaningless, it is probably domain UI.

## 5. Canonical Tokens

Keep only shared semantic tokens:
```text
canvas
surface
surface-raised
surface-muted
border-subtle
border-default
border-strong
border-focus
text-primary
text-secondary
text-tertiary
text-inverse
action-primary
action-primary-hover
table-header-bg
table-header-fg
font-mono
state-danger-foreground
state-danger-surface
state-danger-border
state-success-foreground
state-success-surface
state-success-border
state-warning-foreground
state-warning-surface
state-warning-border
radius-card
radius-control
radius-action
radius-pill
section-padding-x
section-padding-y
section-gap
shadow-card
shadow-elevated
```

CSS custom properties are the single runtime source of token values. TypeScript exports may provide semantic class/property mappings, but must reference those variables and must not duplicate their literal values. Typography roles follow the same rule.

Foundation implementation baseline is Tailwind CSS 4 plus accessible primitives backed by the `radix-ui` package, matching the proven legacy stack. Selectively rewrite only the primitives required by the approved scope; do not copy the legacy component folder wholesale and do not treat generated shadcn source as a second design authority.

Feature-specific globals such as `--ui-brand-table-col-*`, `--ui-pricing-material-col-*`, `--ui-sku-directory-col-*`, and render-board geometry do not belong in global UI Engine. Keep them local to the owning feature if still needed.

## 6. Canonical Templates

### AppShell
Owns global navigation frame, content viewport, and responsive shell behavior. Apps provide navigation configuration.

The expanded rail is warm application chrome rather than a white content card.
The sticky topbar aligns to the page content and carries app-supplied context/status.
Platform shells may opt into `railPresentation="compact"` when the product uses
the legacy single-header concept: the full brand header remains at the wider
brand width while the desktop rail below is icon-only. The engine owns the
label hiding and tooltip behavior; apps only provide navigation data.
Active navigation uses a bordered white plane plus the retained leading ink rule;
hover remains a lighter transient state.

**Collapsible rail.** `collapsible` opts the rail into a 232px <-> 60px icon rail.
State is controlled (`collapsed` + `onCollapsedChange`) or uncontrolled
(`defaultCollapsed`). UI Engine owns the affordance, the widths, the transition,
and `aria-expanded`; it does not persist the choice — persistence is app state.

At `840px` and below, the effective presentation is always expanded and labeled.
The desktop preference is retained rather than overwritten, the collapse control
is not shown, and the stored state resumes only when the viewport widens.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `collapsible` | `boolean` | `false` | Off by default, so existing shells are unchanged |
| `railPresentation` | `"expanded" | "compact"` | `"expanded"` | Compact keeps the desktop rail icon-only while preserving the full header brand area |
| `collapsed` | `boolean` | — | Controlled state; omit to let the shell manage it |
| `defaultCollapsed` | `boolean` | `false` | Uncontrolled initial state |
| `onCollapsedChange` | `(collapsed: boolean) => void` | — | Fires on toggle in both modes |
| `collapsedBrand` | `ReactNode` | falls back to `brand` | Compact mark for the 60px rail |
| `expandLabel` / `collapseLabel` | `string` | "Expand/Collapse navigation" | Accessible name for the toggle |

The `brand` fallback is backward compatibility only. A product that enables
collapse must pass a mark that inherently fits the 60px rail. The rail clips its
own visual contents and must never create document-level horizontal overflow;
utility navigation stays mounted and reachable when collapsed.

Apps group entries by user workflow rather than mirroring entity tables. Secondary
governance destinations may be supplied in the persistent rail utility area, but
the engine does not hardcode any app's grouping or routes.

### NavItem

Nav entries are engine-owned, not app-owned. "Where am I" must look and announce
identically in StudioFlow, Master Data and BQ, and an active state re-implemented
three times will drift three ways.

```tsx
<NavItem href="/skus" icon={<Table2 />} active={pathname === "/skus"}>SKUs</NavItem>
```

| Prop | Type | Notes |
| --- | --- | --- |
| `active` | `boolean` | Marks the current location; sets `aria-current="page"` |
| `icon` | `ReactNode` | Required in practice — the collapsed rail shows only this |
| `href`, and any anchor attribute | — | Apps decide routing; the engine decides appearance |

The app decides *what* is current (route, pathname, scroll position). The engine
decides how current *looks and announces*.

Active is marked on **three channels at once** — an ink rule, a muted fill, and
heavier ink-coloured type. This is deliberate: hover already owns the muted fill,
so a fill-only active state is indistinguishable from "my cursor happens to be
here". Never reduce it to fill alone.

Collapsed behaviour is handled by the engine: the label is hidden *visually* —
never with `display: none`, which would strip it from the accessibility tree and
leave every item unnamed — and a `Tooltip` restores it on hover for sighted users.
Apps do not wire either of these.

### PageShell
Owns canvas, max width, page padding, responsive container behavior.

### PageHeader

```tsx
<PageHeader
  eyebrow?
  title
  description?
  meta?
  action?
  divider?
/>
```

Apps should prefer this over custom title/action markup.

### PageSection
Generic logical content grouping. Do not turn every empty space into a card.

### Directory/List Template

```text
PageShell
├── PageHeader
├── ListToolbar
│   ├── Search
│   ├── Filters
│   └── Secondary actions
└── Data Surface
    ├── Table/Grid
    ├── Empty
    ├── Loading
    └── Error
```

### Detail Template

```text
PageShell or Drawer
├── DetailHeader
├── Status/meta
├── Sections
└── Contextual actions
```

### SettingsShell
Keep the legacy two-column pattern concept, but make navigation generic/configurable instead of hardcoding StudioFlow settings tabs.

Compact-rail submenus open only through intentional click or keyboard activation.
Pointer movement and focus traversal alone must not open a portalled menu over the
current work surface.

## 7. DataTable Contract

UI Engine owns:
- table surface;
- header styling;
- cell spacing;
- alignment helpers;
- hover/focus;
- horizontal overflow;
- empty/loading/error presentation;
- generic row action slot;
- the sort **affordance** (see below);
- shared resize mechanism only if truly reused.

Apps own:
- columns;
- values;
- calculations;
- sort/filter **semantics** (see below);
- domain actions;
- minimum width and column widths.

Do not promote one screen's table geometry to global tokens.

### Sticky header and the scrolling body

`stickyHeader` is inert on its own: a sticky header needs an ancestor that
actually scrolls, and an unbounded table simply grows. Pass `maxBodyHeight`
(e.g. `"60vh"`) with it. The engine owns the bounded scroll container and the
sticky mechanics; the app decides how tall the body may be, because that is a
screen-layout decision, not a shared one.

### Sorting — where the line falls

Sorting is split, and the split is the whole point. The engine renders the control
and the state; it never compares two values.

| UI Engine | App |
| --- | --- |
| The header renders as a `<button>` | Which columns are sortable at all |
| Direction indicator (unsorted / asc / desc) | The comparator for each column |
| `aria-sort` on the `<th>` | Whether sorting is client-side or a server query |
| Keyboard activation and focus ring | Tie-breaking and default sort order |

```tsx
<TableHead
  sortable
  align="end"
  sortDirection={sort?.key === "amount" ? sort.direction : null}
  onSortChange={(direction) => setSort({ key: "amount", direction })}
  sortLabel={(d) => `Amount, sort ${d === "asc" ? "ascending" : "descending"}`}
>
  Amount
</TableHead>
```

`onSortChange` receives the direction to apply next; clicking toggles asc/desc.
The engine holds no sort state, so a server-sorted table and a client-sorted one
use the identical markup.

Why the comparator cannot live here: a date column sorts by its timestamp, not by
its printed label, and an amount sorts by its number, not by its formatted string.
Only the app knows which of a row's fields is the sortable one. A generic
comparator in the engine would silently sort `"12,880.00"` before `"18.00"`.

Focus note: the warm-neutral header uses the shared focus border. The header token
pair remains canonical so applications never restyle individual tables.

Selection note: selected rows retain their explicit selection control and add a
leading ink rule. Selection never replaces or recolors app-supplied status markers.

### Multi-line cell content

`TableCell` is single-line by default and accepts `wrap` when prose must flow.
`TableCellContent` provides the canonical two-tier treatment:

```tsx
<TableCell wrap>
  <TableCellContent
    primary="Long record name"
    secondary="Optional supporting context"
    primaryLines={2}
  />
</TableCell>
```

Primary content may be clamped to one or two lines; secondary context is tertiary
metadata. `align="end"` keeps numeric primary/secondary values aligned together.
Apps must not insert manual line breaks or invent table-local metadata typography.

Selection state may use `SelectionBar variant="inline"` inside `TableToolbar`
beside export/secondary actions. The default `bar` variant remains available when
a full-width batch-action region is genuinely required.

When inline toolbar width is constrained, secondary utilities (clear filters,
archive selection, clear selection, export) use `IconButton` with an explicit
accessible label and `Tooltip`. Current filter values remain textual, and the
selection count remains visible as a compact icon-plus-number indicator. Icon-only
presentation must never make state discoverable only by hovering.

## 8. Form Contract

UI Engine may own:
- Field
- FieldLabel
- FieldDescription
- FieldError
- FormSection
- FormActions
- common input/dialog spacing

Use approved base primitives directly where sufficient. Do not create redundant wrappers without a real shared rule.

Field descriptions are for short, essential guidance only. Longer contextual
explanations, examples, and semantic distinctions use the shared `Tooltip`
pattern beside the field label with a compact `(?)` affordance and an accessible
label. Apps own the tooltip copy; the UI Engine owns the interaction, placement,
focus behavior, and accessible relationship.

The help affordance sits **beside** the label element, never inside it: a button
nested in a `<label>` forwards its click to the labelled control, so asking for
help would toggle the very checkbox or switch being explained.

A required field sets `aria-required` on its control. The asterisk is decorative
and hidden, so it is not on its own a signal anyone using assistive technology
can receive.

`Tooltip` suppresses a native `title` on the element it wraps. `IconButton`
carries `title` as the fallback for an icon button nobody wrapped; when the
shared tooltip is present it supersedes that fallback instead of racing it.

Apps own:
- validation schema;
- domain field grouping;
- business conditionals;
- entity pickers.

### Search, select, and create

The engine distinguishes three interaction shapes instead of overloading one ambiguous control:

- `Combobox` — search and select one existing option;
- `CreatableSearch` — search/select one option plus an explicit create intent and optional explicit clear intent;
- `CreatableMultiSelect` — search/select or explicitly create multiple values as removable tokens.

Both controls put the combobox semantics on the **search field**, which owns the
query and the listbox, not on the trigger button. A trigger carrying
`role="combobox"` with no text input of its own announces an editable control
that never accepts text. The trigger is a button with `aria-haspopup="listbox"`.

Enter from the search field follows one rule in both controls, so a habit learned
in one does not misfire in the other: an exact label match commits, otherwise a
single remaining result commits, otherwise nothing. The engine never guesses
among several matches. `CreatableSearch` additionally commits an explicit create
when the query matches nothing.

`CreatableSearch` owns generic interaction only:

- flat or grouped options, descriptions/keywords, disabled rows, and app-supplied badges;
- query filtering and controlled remote-query callbacks;
- external value reset without leaving stale search text;
- explicit clear row/button with app-supplied copy;
- exact-match suppression and an app-supplied create label;
- ArrowUp/ArrowDown/Home/End navigation, Enter select/create, Escape close with focus return;
- busy, disabled, empty, and creation-error presentation — the app owns the
  create command, the engine owns the in-flight state around it: a second
  activation is refused while one is running, a rejection is caught and shown
  rather than escaping as an unhandled rejection, and `creatingLabel` /
  `createErrorLabel` supply the wording;
- accessible combobox/listbox relationships and active-option announcement.

It does not create entities, call server actions, choose permissions, reuse records, assign roles, guess defaults, write audit events, or own optimistic server data. Apps provide the command and may use a generic option-overlay helper only if that helper remains persistence- and domain-neutral.

`CreatableMultiSelect` follows the same boundary for an ordered controlled value
array. It filters unselected options, renders selected values as removable tokens,
and supports exact-match/single-result Enter selection, explicit create, Escape,
and Backspace removal only when the query is empty. It never normalizes a value,
persists a token, or decides whether creation is authorized; the consuming app
supplies those policies and the optional create command.

The legacy component is behavior evidence, not source to copy: its clear/create/reset/group behavior is retained, while incomplete keyboard navigation, hardcoded visual values, overloaded free-text ID semantics, and untested async behavior are fixed or split.

### Shared interaction hooks

The engine also owns the React-specific mechanics repeatedly needed by forms across apps:

- `useDebouncedValue(value, delay)` — cancels stale timers and exposes no search/business policy;
- `useOptionOverlay(serverOptions)` — merges newly returned options by stable ID until the server refresh includes them; server data wins conflicts;
- `useConfirm()` plus one accessible `ConfirmDialog` renderer — a superseded
  request is settled `false` before the new one replaces it, so no caller is left
  awaiting a promise that can never resolve; unmount settles the same way;
  `requireTypedConfirmation` gates the confirm control on exact typed text and is
  reserved for the irreversible, since a sentence to type is a stronger guard
  than a sentence to read;
- `useUnsavedChangesGuard()` plus prompt — guards close/navigation only after
  real edits, supports an explicit custom dirty comparator, and closes without
  prompting after a successful save. The comparator governs the baseline reset as
  well as the dirty check: reference identity would move the baseline on every
  render of a form that rebuilds its initial object, and the guard would never
  fire;
- `useFormDraftGuard()` — browser-only draft protection for a native
  Dialog/Drawer form. It snapshots opening values (including caller-declared
  controlled values), detects later edits, and exposes a discard request. It
  never submits a form or calls a server action; callers use it for outside
  click, Escape, close, and Cancel, while save remains an explicit submit.
- pending-submit and action-feedback presentation that accepts state as props and owns no server action, permission, redirect, or revalidation policy.

These hooks must not contain entity names, toast copy, default roles, persistence calls, cache paths, or app imports. Browser unload protection is allowed only while dirty and must be removed on cleanup. In-app navigation/overlay close behavior is covered by focused interaction tests.

## 9. Dialog & Drawer Contract

UI Engine owns:
- standard size variants sm/md/lg/xl/full — the size token applies to `Drawer` at
  every viewport, not only the narrow one;
- header/body/footer layout;
- scroll behavior;
- close/action placement;
- destructive confirmation convention;
- `dismissible` — refusing Escape, outside-click, and the close control. The
  engine owns the refusal; the app decides when to refuse, typically while a
  submit is in flight. It must never be left false with no visible way out.

Apps choose Dialog vs Drawer according to `DESIGN.md`.

## 10. Shared State Components

Foundation should include:
- `LoadingState`
- `EmptyState`
- `ErrorState`
- `InlineError`
- generic semantic StatusBadge only if truly shared.

These must be config/content-driven and domain-neutral.

## 11. Action/Menu Pattern

- page primary action: PageHeader/main toolbar;
- row secondary actions: shared action menu;
- destructive action: isolated + confirmed;
- domain-specific entries remain in app code.

Do not build domain action registries into UI Engine.

## 12. Inline Editing Pattern

BQ requires spreadsheet-like editing. UI Engine may own the visual/interaction shell, while BQ owns business behavior.

Engine may own:
- edit/focus state;
- save/pending/error visuals;
- keyboard convention;
- generic editable-cell shell.

BQ owns:
- calculations;
- persistence;
- editable fields;
- snapshot rules;
- rollback data.

Canonical default:
- Enter commits;
- Escape cancels;
- blur commits only where explicitly enabled;
- failed save restores prior value and displays error.

**Activated (R4.56)** by the first locked workflow that needs cell-level entry.
`InlineEdit` is the generic editable-cell shell:

| Prop | Notes |
| --- | --- |
| `value`, `onCommit` | The caller owns the value; the control never mutates it. Reject or throw from `onCommit` to refuse an edit |
| `label` | Accessible name. A table header is not announced per cell |
| `commitOnBlur` | Off by default — a click elsewhere is not a decision |
| `display` | Read-mode presentation, e.g. a formatted amount. Editing always shows raw text |
| `errorLabel` | Failure wording. The engine owns *when* a failure shows, the caller owns *what it says* |
| `align`, `inputMode`, `placeholder`, `disabled` | Presentation and input affordance only |

Tabbing onto a cell opens it, so keyboard entry never requires a pointer. A
refused commit restores the previous value rather than leaving refused text on
screen looking saved. The engine owns no validation and no persistence: what a
value means, whether it is allowed, and where it is written stay with the app.

## 13. Document & Print Pattern

UI Engine may own:
- `DocumentSheet` preview frame and print-safe surface;
- generic document header/body/footer slots;
- neutral document table/section styling;
- print visibility helpers and base `@media print` rules.

Apps own:
- document/PDF content and vocabulary;
- schema-to-view mapping;
- calculations, totals, numbering, signatures, legal copy, page breaks, and export adapters;
- PDF renderer/library selection when a product slice actually needs one.

UI Engine must not become a generic report builder, schema-form generator, or PDF engine.

## 14. Legacy Migration Classification

### KEEP / MIGRATE
- semantic token approach;
- Lora + Inter hierarchy;
- canvas/surface/border/text/action palette;
- PageHeader concept;
- DashboardPageShell concept;
- SectionCard concept;
- TableCard concept;
- dialog size tokens;
- horizontal-scroll protection for wide tables.

### MERGE / CLEAN
- duplicate `UI_ENGINE_*` token aliases → one canonical semantic API;
- CSS variable + TS config duplication → one canonical token source;
- scattered page/shell spacing → centralized convention.

### REWRITE
- SettingsShell → generic/configurable;
- table wrappers with inconsistent native/shadcn markup;
- components whose generic names hide StudioFlow-specific assumptions.

### PURGE FROM GLOBAL ENGINE
- feature-specific table width/column variables;
- render-board geometry/settings;
- project/phase-specific components;
- business-status behavior;
- aliases retained solely for legacy compatibility.

## 15. Public API Rule

Apps should import from deliberate stable entry points:

```ts
import {
  PageShell,
  PageHeader,
  SectionCard,
  DataTable,
  EmptyState,
} from "@platform/ui_engine";
```

Avoid arbitrary deep imports. Keep the public export surface small.

## 16. Promotion and gap-completion rule

Promote a UI pattern into UI Engine only when:
1. multiple apps clearly need it; or
2. it enforces a global design/interaction rule; or
3. it is a canonical page/app template; or
4. duplication already exists and the abstraction is obvious; or
5. exact legacy code evidence plus the approved app roadmap proves the interaction is a reusable platform capability.

Do not promote something because it might be reusable someday.

Conversely, do not implement a known generic interaction privately inside an app because the current engine catalog lacks it. The PM/TL must classify the gap, define the domain-neutral API, add it to the same vertical work order, and require the app to consume the shared implementation.

## 17. Executor Agent Contract

Before UI work, executor agents must read:
1. `DESIGN.md`
2. `UI_ENGINE.md`
3. manager work order

They must reuse engine components, follow locked tokens, keep domain UI local, and implement only approved patterns.

They must not:
- invent global tokens;
- invent page shells;
- create duplicate primitive libraries;
- change typography/radius/spacing globally;
- promote domain UI into UI Engine;
- redesign beyond the work order.

If a required shared pattern is missing: STOP and report to PM/TL.

## 18. PM/TL Responsibility

Claude/Codex owns:
- deciding whether a pattern belongs in UI Engine;
- approving shared components;
- changing global design tokens;
- changing shells/templates;
- resolving legacy-vs-contract conflicts.

Mechanical implementation should be delegated after decisions are deterministic.

## 19. Staged Foundation Scope

The UI contract is broader than the code required today. Public code is added by stage; documented deferred candidates must not become empty or speculative exports.

### UI-F0 — required for login, access, and General Settings

- `Heading`, `Text`, `Button`, `IconButton`;
- `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`;
- `Divider`, `Badge`, `Spinner`, `Skeleton`, `Surface`;
- semantic tokens and typography/print base styles.

- `Field`, `FormSection`, `FormActions`;
- `SectionCard`, `PageSection`;
- `DataTable`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `TableCellContent`;
- `TableToolbar`, `SearchField`, `Pagination`;
- `DescriptionList`, `DescriptionItem`;
- `StatusBadge`, `Notice`, `LoadingState`, `EmptyState`, `ErrorState`, `InlineError`.

- `Dialog`, `Drawer`, `ConfirmDialog`, `Tooltip`;
- `AppShell`, `PageShell`, `PageHeader`;
- `DirectoryShell`, `DetailShell`, `SettingsShell`;
- `Tabs`.

This stage includes a real login page, authenticated app launcher, user directory/editor, role/grant directory/editor, and General Settings form. Those workflows prove the shared components; the `/ui-engine` showcase alone is not acceptance.

### UI-F1 — activate immediately before Master Data resumes

- `RowActionMenu`, `FilterBar`, `SelectionBar`;
- `Combobox`, `CreatableSearch`, `CreatableMultiSelect`;
- `InlineEdit` — activated in R4.56 by an approved cell-entry workflow;
- `FileDropZone` — activated in R7.43 by the approved phase deliverable
  intake consumer. It carries interaction only: the metadata-only intake
  flow needs no storage or upload contract, and none is implied here;
- `useDebouncedValue`, `useOptionOverlay`, `useConfirm`, `useUnsavedChangesGuard`, their accessible prompts, and generic pending/action feedback;
- one internal UI Engine showcase route demonstrating realistic compositions without app/domain imports.

### Deferred candidates

| Pattern | Activation trigger |
|---|---|
| `WorkspaceShell`, `SplitPane` | first approved StudioFlow/BQ workspace requiring the layout |
| `ReorderHandle` | first persisted manual-order workflow with keyboard requirements |
| `DocumentSheet` and print helpers | first approved document/print workflow |

Deferred patterns may remain in design prose as routing memory. They are not required for the active closure gate and should not remain public implementation without a real approved consumer.

### Behavioral boundaries

- Components accept generic values, slots, callbacks, and semantic variants; they never fetch or mutate domain data.
- DataTable owns table presentation/accessibility/overflow and the sort affordance, not columns, sort comparators, query state, or calculations.
- `DataTable` and `TableToolbar` can opt out of their outer frame when a `DirectoryShell` owns the single directory surface. `DirectoryShell surface` groups toolbar, content, and pagination while leaving the page header outside.
- `usePagination` owns client-side page bounds and offset math only. Apps retain filtering, sorting, page size, and domain comparators.
- `DraftDialog` applies the shared unsaved-change prompt to native fields plus an explicit controlled-state snapshot. Apps close it after successful persistence and provide pending state while saving.
- `ConfirmDialog` keeps its description stable, can display retryable error feedback, blocks duplicate confirmation while pending, and uses `danger-primary` only for the final destructive action.
- `NavGroup` supplies reusable labeled navigation structure without owning routes.
- Combobox owns generic selection/search interaction, including ArrowUp/ArrowDown
  movement across enabled options, Home/End movement within the option list,
  Enter selection, Escape close/focus return, and visible keyboard focus. It does
  not own remote fetching, entity vocabulary, authorization, or business ranking.
- CreatableSearch builds on the same navigation/accessibility contract and adds only explicit clear/create interaction. CreatableMultiSelect applies the same contract to removable multiple values. Persistence, authorization, validation, normalization, reuse semantics, role assignment, audit, and app option shaping remain app-owned.
- InlineEdit owns editing states and keyboard behavior, not validation/business saving rules.
- FileDropZone owns the drag/drop gesture, its active-target presentation, the
  native `accept` filter, and a keyboard-reachable picker, because dragging is
  a pointer-only gesture. It reports a dropped file's name, size, and media
  type, and owns no storage, upload, transport, validation, or retention
  policy. Its picker carries no `name`, so no byte is serialized by a
  surrounding form; a consumer that needs bytes on a server sends them
  through its own approved boundary. Apps must consume this export rather
  than reimplement drop handlers locally.
- StatusBadge receives an explicit semantic tone and never infers meaning from a domain status string.
- Layouts accept app-provided navigation/content and never hardcode Master Data, BQ, or StudioFlow routes.
- No component reads Prisma/Zod schemas to generate UI.
- No additional dependency is allowed unless PM/TL issues a correction decision.

## 20. Definition of Done

UI Engine foundation implementation is complete when:
- `DESIGN.md` is approved;
- global tokens have one clear source;
- feature-specific tokens are absent from global UI Engine;
- every component in the activated UI stage is implemented without parallel/duplicate primitives;
- UI-F0 login/settings/access workflows can ship without inventing page structure or interaction mechanics;
- before Master Data resumes, UI-F1 passes and Master Data can build its first approved slice without a private generic substitute;
- dependency rules block UI Engine from importing app domains;
- the internal showcase covers the activated patterns and states; deferred document/file/workspace patterns are not faked;
- desktop and narrow viewport visual review passes with keyboard/focus/accessibility checks;
- component tests, repository checks, and production build pass;
- one authenticated platform Settings workflow consumes UI-F0 successfully in the real browser; UI-F1 later requires one approved Master Data workflow;
- no active page uses obsolete raw `ui-*` classes when a shared component or token exists.

## 21. Code-derived legacy evidence

All paths refer to historical committed legacy evidence recorded at commit
`6377ac0971e7a7cc0fd8fb58a8360c069675f9a5`. This ledger does not establish a
current checkout path or commit; new access follows `AGENTS.md`.

| Exact code evidence | Decision | Shared intent |
|---|---|---|
| `src/ui_engine/design-system.config.ts`, `tokens/**`, `src/styles/designTokens.css` | **MERGE + FIX** | Keep semantic design DNA; use one canonical token source and purge feature-specific global tokens. |
| `src/ui_engine/layout/page-header.tsx`, `layout/shells/dashboard-page-shell.tsx`, `settings-shell.tsx` | **KEEP + FIX** | Preserve useful hierarchy/shell composition; remove StudioFlow route/vocabulary assumptions. |
| `src/ui_engine/components/section-card.tsx`, `table-card.tsx` | **MERGE + FIX** | Preserve shared surfaces/table containment and standardize density/overflow/accessibility. |
| `src/components/ui/creatable-search.tsx#CreatableSearch` | **KEEP + FIX (UI-F1)** | Preserve grouped search, create/clear, reset, filter, exact-match suppression, and Enter. Fix full keyboard navigation, focus return, async/error state, free-text ID overloading, and hardcoded styling. |
| `src/hooks/use-debounce.ts#useDebounce`, `use-app-confirm.tsx#useAppConfirm`, `use-unsaved-changes-guard.tsx#useUnsavedChangesGuard` | **MERGE + FIX (UI-F1)** | Preserve timer cleanup, awaited confirm, safe supersede/unmount, pristine baseline, custom dirty comparator, and close-after-save; remove app copy/persistence. |
