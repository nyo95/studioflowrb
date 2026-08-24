# UI-01 — UI Engine Product Kit and Showcase

Owner: PM/TL
Executor: one external OpenCode coding session
Status: **READY FOR EXTERNAL EXECUTOR after PM/TL reports the resolved start-tag hash**
Required starting ref: `ui-engine-product-kit-start`
Execution shape: UI-A → UI-B → UI-C → UI-D as four sequential commits in one session

## Objective

Complete the bounded cross-app UI Engine product kit locked by `DESIGN.md` and `UI_ENGINE.md`, then expose one internal showcase route for owner visual review before Master Data product implementation begins.

The result must be restrained, compact, accessible, minimalist, low-copy, and reusable by StudioFlow, Master Data, and BQ. This is not permission to build a speculative component marketplace, schema-form framework, PDF engine, or app UI.

## Required start state

1. Checkout `main` at `ui-engine-product-kit-start`.
2. Record:

```powershell
git rev-parse ui-engine-product-kit-start
git status --short
```

3. The hash must equal the exact start commit reported by PM/TL and the tree must be clean.
4. Do not start from either Master Data start tag, the quarantine branch, or a legacy StudioFlow checkout.

## Mandatory reading

Read completely, in order:

1. `AGENTS.md`
2. `scripts/work-orders/00-EXTERNAL-EXECUTOR-CONTEXT.md`
3. this work order
4. `docs/00-SOFTWARE-SSOT.md`
5. `docs/06-DATA-OWNERSHIP.md`
6. `docs/07-ENGINEERING-CONVENTIONS.md`
7. `docs/02-UI-ENGINE-PRD.md`
8. `DESIGN.md`
9. `UI_ENGINE.md`
10. current `src/platform/ui_engine/**`, `src/app/globals.css`, and `src/app/page.tsx`
11. relevant Next.js 16.3 documentation in `node_modules/next/dist/docs/` before changing app routes or client boundaries.

Owner instructions and the two locked UI contracts are authority. Legacy GitHub commit `548fbd6bd00ef9fd7d53df66a3561a32fbb56944` is evidence only and need not be copied. The requested product kit is allowed to be simpler than legacy.

## Exact scope

Implement exactly the public inventory and behavioral boundaries in `UI_ENGINE.md §19`:

- UI-A: tokens and primitives;
- UI-B: forms, data, and shared states;
- UI-C: overlays, navigation, and layouts;
- UI-D: interaction/document patterns and the showcase.

Every listed export must be functional and demonstrable. Do not add another public component unless the executor stops and receives a PM/TL correction.

## Allowed files

- `src/platform/ui_engine/**`
- `src/app/globals.css`
- `src/app/ui-engine/**` for the internal showcase route
- `src/app/page.tsx` only to replace the boilerplate with a minimal link/entry to the UI Engine showcase
- focused UI Engine tests under `src/platform/ui_engine/**`

No dependency or package-lock change is allowed. Use the installed React, Tailwind CSS 4, Radix, Lucide, CVA, clsx, and tailwind-merge stack.

## Locked visual rules

- Light theme only for this phase. Do not invent dark-theme tokens.
- Neutral slate canvas/text/borders; semantic color only for neutral/success/warning/danger meaning.
- Lora only for H1/H2 identity; operational headings and UI use Inter.
- H1 32px, H2 24px, H3 18px, H4 16px, H5 14px, H6 12px.
- Base body/control text is 14px unless accessibility or a locked component role requires otherwise.
- Page padding 20–24px; section padding/gap 16px; max page width 1440px.
- Default surfaces use border without shadow. Shadow is for overlay/elevation only.
- Radius remains card 8px, control 6px, action 4px, pill only for badges/chips.
- One dominant primary action per composition. Secondary, ghost, and destructive variants stay visually subordinate.
- Descriptions are optional and short. Showcase copy demonstrates content economy and contains no marketing paragraphs.
- Use Lucide for icons. No emoji as interface icons.
- Focus-visible, disabled, pending, invalid, selected, and destructive states must be visually distinct.
- Motion is subtle and respects `prefers-reduced-motion`.

## Locked component behavior

### Primitives

- Native-compatible controls forward refs and ordinary HTML attributes where applicable.
- `Button` variants: `primary | secondary | ghost | danger`; sizes: `sm | md`; optional leading/trailing icon and pending state.
- `IconButton` requires an accessible label and uses Tooltip for non-obvious actions.
- `Heading` renders the requested semantic heading level without app vocabulary.
- Inputs share height, border, focus, disabled, and invalid treatment.
- Checkbox/RadioGroup/Switch must preserve native/Radix keyboard semantics.
- Badge/StatusBadge tones are explicit `neutral | success | warning | danger`; no status-string inference.
- Skeleton is visual-only and hidden appropriately from assistive output; Spinner uses an accessible label when it is the only status indicator.

### Forms and data

- `Field` links label, description, and error with stable accessible ids; omitted description consumes no space.
- `FormSection` and `FormActions` compose forms but never submit or validate business data.
- DataTable is presentational: responsive horizontal overflow, regular/compact density, numeric alignment, empty/loading/error slots, sticky header option, and generic selection/action slots.
- Sorting indicators and callbacks may be generic; query construction, remote fetching, and sort policy remain app-owned.
- SearchField owns input presentation and clear action only.
- Pagination accepts explicit page/count/callback values and owns no URL or query state.
- DescriptionList supports compact responsive label/value presentation without card nesting.

### Overlays and layouts

- Dialog/Drawer use the locked size scale, focus management, accessible title, scrollable body, stable header/footer, Escape/close semantics, and mobile-safe dimensions.
- ConfirmDialog receives generic title/body/confirm labels and never contains domain policy.
- AppShell accepts app-provided brand/navigation/utility slots. It contains no hardcoded app routes.
- DirectoryShell, DetailShell, SettingsShell, WorkspaceShell, and SplitPane are layout composition only.
- Narrow viewports must remain operable; tables may scroll and navigation may collapse without hiding core actions.

### Patterns

- RowActionMenu, FilterBar, and SelectionBar accept app-provided actions/content.
- Combobox accepts generic option ids/labels/optional descriptions and controlled selection/search callbacks. It performs no network request.
- InlineEdit owns view/edit/pending/error visual states and Enter/Escape behavior; save/validation/rollback data are supplied by the app.
- ReorderHandle provides accessible handle semantics and visual state; it does not choose or persist order.
- FileDropZone uses native file input/drop events and generic constraints supplied as props; it uploads nothing.
- DocumentSheet provides screen preview, A4-like default proportion, generic header/body/footer slots, print-safe styles, and print visibility helpers. It performs no PDF generation and knows no app schema.

## Showcase contract

Route: `/ui-engine`.

It is an internal style lab, not a product module and not part of app navigation. It must demonstrate realistic generic compositions with concise copy:

1. foundations: typography, spacing, surfaces, semantic tones;
2. actions and controls: all variants/states;
3. form composition including required, optional, invalid, disabled, and compact examples;
4. data directory with toolbar, filters, selection, table, pagination, row menu, and all state variants;
5. detail/settings/workspace/split layouts;
6. Dialog, Drawer, ConfirmDialog, Tooltip, Combobox, and InlineEdit interaction;
7. file drop/reorder examples without upload or persistence;
8. DocumentSheet screen and print preview.

The showcase may hold local demo state only. It must not import Prisma, Core DB, auth, app modules, server actions, or legacy code. Labels such as “Item”, “Record”, and “Workspace” are preferred over Brand/SKU/BQ/Project vocabulary.

## Checkpoints and commits

### UI-A — Tokens and primitives

Implement token/style organization and all UI-A exports. Move UI Engine-specific CSS out of the compressed global stylesheet into coherent engine-owned style files; `globals.css` remains the import/reset entry point.

Commit: `feat(ui-engine): complete tokens and primitives (UI-A)`

### UI-B — Forms, data, and shared states

Implement all UI-B exports and focused tests.

Commit: `feat(ui-engine): complete forms data and states (UI-B)`

### UI-C — Overlays, navigation, and layouts

Implement all UI-C exports and focused tests.

Commit: `feat(ui-engine): complete overlays and layouts (UI-C)`

### UI-D — Patterns, document surface, and showcase

Implement all UI-D exports, `/ui-engine`, print styles, integration tests, and minimal home entry.

Commit: `feat(ui-engine): add product kit showcase (UI-D)`

Do not squash these commits. Continue through all checkpoints in one external session unless a stop condition occurs.

## Forbidden changes

- No Master Data, BQ, or StudioFlow app/domain/application/infrastructure implementation.
- No schema, migration, seed, Core, RBAC, audit, auth, or public-contract changes.
- No app-specific token, route, noun, status vocabulary, table columns, calculations, or form schema in UI Engine.
- No copied legacy component directory or generated shadcn component dump.
- No schema-driven form/table/report builder.
- No PDF dependency, PDF generation, export adapter, or app-specific document template.
- No dark mode, animation library, chart library, data-grid dependency, form framework, state manager, or new package.
- No speculative compatibility aliases or duplicate old/new component APIs.
- No visual redesign outside the locked minimalist contract.
- Do not commit generated `.next/**` output or unrelated regenerated files.

## Tests and acceptance

Focused tests must prove:

- every `UI_ENGINE.md §19` public export exists;
- UI Engine has no app/Prisma/Core DB/legacy import;
- controls expose required accessible names/roles/relations;
- Field label/description/error relationships are correct;
- Dialog/Drawer/ConfirmDialog semantics remain distinct and accessible;
- DataTable horizontal overflow and density states work;
- semantic tones are explicit and no domain status inference exists;
- InlineEdit Enter/Escape behavior and pending/error rendering work;
- DocumentSheet contains print surface/hooks without a PDF dependency;
- no feature-specific token or domain vocabulary enters public UI Engine sources.

Run after each checkpoint:

```powershell
npm test
npm run check
git diff --check
git status --short
```

Run at final gate:

```powershell
git status --short
git log --oneline ui-engine-product-kit-start..HEAD
git diff --check ui-engine-product-kit-start..HEAD
npm test
npm run check
npx prisma validate
npx prisma generate
npm run test:boundaries
npm run test:legacy-runtime
npm run build
```

Manual visual checks at `/ui-engine`:

- 1440×900, 1024×768, 768×1024, and 390×844;
- keyboard-only navigation and visible focus;
- 200% zoom without unreachable actions;
- loading/empty/error/disabled/invalid/pending states are distinguishable;
- print preview contains only the document surface where expected;
- no clipped dialog/drawer, overlapping text, forced unreadable table columns, excessive paragraphs, or nested-card clutter.

Do not commit screenshots. Attach representative desktop, mobile, overlay, data-table, and print-preview screenshots to the executor report for PM/TL and owner review.

## Stop and escalation conditions

STOP and report exact evidence if:

- a required export needs app/domain vocabulary or business policy;
- a new dependency or global token appears necessary;
- Next.js 16/Radix behavior conflicts with a locked accessibility or rendering requirement;
- current repository state differs materially from this work order;
- a public component API remains ambiguous after reading the locked behavior above;
- acceptance requires changing a forbidden file;
- DocumentSheet would require choosing a PDF library, pagination algorithm, app schema, or legal/document rule;
- unrelated dirty changes cannot be isolated.

Do not invent a workaround or silently reduce scope. Report the affected checkpoint, file/API evidence, locked rule, smallest required manager decision, and last valid commit.

## Required executor report

Return:

1. start hash and four checkpoint commit hashes;
2. exact files changed per checkpoint;
3. final public export inventory;
4. mapping from changes to UI-A/B/C/D;
5. all test/build command results;
6. visual-review results and attached screenshots;
7. accessibility review notes;
8. deviations, stop-condition review, and residual risks;
9. confirmation that no domain implementation, new dependency, feature token, schema/PDF engine, or unrelated change was introduced.

Stop after the report. Master Data remains paused until PM/TL and owner approve the UI Engine showcase and issue a new Master Data starting ref.
