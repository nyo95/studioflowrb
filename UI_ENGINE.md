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
- a future creatable tag input — create/select multiple values, only when a real multi-value consumer is approved.

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
- `Combobox`, `CreatableSearch`;
- `useDebouncedValue`, `useOptionOverlay`, `useConfirm`, `useUnsavedChangesGuard`, their accessible prompts, and generic pending/action feedback;
- one internal UI Engine showcase route demonstrating realistic compositions without app/domain imports.

### Deferred candidates

| Pattern | Activation trigger |
|---|---|
| `WorkspaceShell`, `SplitPane` | first approved StudioFlow/BQ workspace requiring the layout |
| `InlineEdit` | a locked app workflow proves inline editing is preferable to form/dialog editing |
| `ReorderHandle` | first persisted manual-order workflow with keyboard requirements |
| `FileDropZone` | approved file/media storage flow and its security contract |
| `DocumentSheet` and print helpers | first approved document/print workflow |

Deferred patterns may remain in design prose as routing memory. They are not required for the active closure gate and should not remain public implementation without a real approved consumer.

### Behavioral boundaries

- Components accept generic values, slots, callbacks, and semantic variants; they never fetch or mutate domain data.
- DataTable owns table presentation/accessibility/overflow and the sort affordance, not columns, sort comparators, query state, or calculations.
- Combobox owns generic selection/search interaction, including ArrowUp/ArrowDown
  movement across enabled options, Home/End movement within the option list,
  Enter selection, Escape close/focus return, and visible keyboard focus. It does
  not own remote fetching, entity vocabulary, authorization, or business ranking.
- CreatableSearch builds on the same navigation/accessibility contract and adds only explicit clear/create interaction. Persistence, authorization, validation, reuse semantics, role assignment, audit, and app option shaping remain app-owned.
- InlineEdit owns editing states and keyboard behavior, not validation/business saving rules.
- FileDropZone owns input/drop interaction and file-list presentation, not storage/upload policy.
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
