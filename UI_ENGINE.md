# UI_ENGINE.md — Shared UI Architecture Contract

Status: **LOCKED — canonical minimalist shared UI architecture contract (PM/TL, revised by owner direction 2026-08-25)**
Consumers: StudioFlow, Master Data, BQ, future apps.

Authority: this file specializes `docs/02-UI-ENGINE-PRD.md` and `DESIGN.md`. It does not override domain ownership or app PRDs.

Legacy evidence provenance: all legacy UI references mean the immutable GitHub snapshot `nyo95/studioflow@548fbd6bd00ef9fd7d53df66a3561a32fbb56944`, never a local working tree or moving branch tip.

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
border-subtle
border-default
border-focus
text-primary
text-secondary
text-tertiary
text-inverse
action-primary
action-primary-hover
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
- shared resize mechanism only if truly reused.

Apps own:
- columns;
- values;
- calculations;
- sort/filter semantics;
- domain actions;
- minimum width and column widths.

Do not promote one screen's table geometry to global tokens.

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

Apps own:
- validation schema;
- domain field grouping;
- business conditionals;
- entity pickers.

## 9. Dialog & Drawer Contract

UI Engine owns:
- standard size variants sm/md/lg/xl/full;
- header/body/footer layout;
- scroll behavior;
- close/action placement;
- destructive confirmation convention.

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

## 16. Promotion Rule

Promote a UI pattern into UI Engine only when:
1. multiple apps clearly need it; or
2. it enforces a global design/interaction rule; or
3. it is a canonical page/app template; or
4. duplication already exists and the abstraction is obvious.

Do not promote something because it might be reusable someday.

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

## 19. Product Kit Implementation Scope

The pre-product UI kit is one bounded implementation program with four checkpoints. Public exports are limited to this approved inventory.

### UI-A — tokens and primitives

- `Heading`, `Text`, `Button`, `IconButton`;
- `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`;
- `Divider`, `Badge`, `Spinner`, `Skeleton`, `Surface`;
- semantic tokens and typography/print base styles.

### UI-B — forms, data, and state components

- `Field`, `FormSection`, `FormActions`;
- `SectionCard`, `PageSection`;
- `DataTable`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`;
- `TableToolbar`, `SearchField`, `Pagination`;
- `DescriptionList`, `DescriptionItem`;
- `StatusBadge`, `Notice`, `LoadingState`, `EmptyState`, `ErrorState`, `InlineError`.

### UI-C — overlays, navigation, and layouts

- `Dialog`, `Drawer`, `ConfirmDialog`, `Tooltip`;
- `AppShell`, `PageShell`, `PageHeader`;
- `DirectoryShell`, `DetailShell`, `SettingsShell`, `WorkspaceShell`, `SplitPane`;
- `Tabs`.

### UI-D — shared interaction/document patterns and showcase

- `RowActionMenu`, `FilterBar`, `SelectionBar`;
- `Combobox`, `InlineEdit`, `ReorderHandle`, `FileDropZone`;
- `DocumentSheet` and print helpers;
- one internal UI Engine showcase route demonstrating realistic compositions without app/domain imports.

### Behavioral boundaries

- Components accept generic values, slots, callbacks, and semantic variants; they never fetch or mutate domain data.
- DataTable owns table presentation/accessibility/overflow, not columns, sorting policy, query state, or calculations.
- Combobox owns generic selection/search interaction, not remote fetching, entity vocabulary, or authorization.
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
- the UI-A through UI-D public inventory is implemented without parallel/duplicate primitives;
- Master Data and BQ can build new screens without inventing page structure;
- dependency rules block UI Engine from importing app domains;
- the internal showcase covers actions, forms, data, states, overlays, layouts, responsive behavior, and document/print presentation;
- desktop and narrow viewport visual review passes with keyboard/focus/accessibility checks;
- component tests, repository checks, and production build pass;
- PM/TL and owner approve the showcase before Master Data implementation starts.
