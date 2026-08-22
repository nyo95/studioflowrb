# WO-004 — UI Engine Foundation

Owner: PM/TL
Executor type: deterministic coding executor
Status: READY FOR EXTERNAL EXECUTOR — WO-001 complete and Core/UI contracts locked

## Scope

Implement the minimum shared UI foundation required by upcoming Master Data and BQ screens, exactly following the locked `DESIGN.md` and `UI_ENGINE.md` contracts.

## Required reading

1. `DESIGN.md`
2. `UI_ENGINE.md`
3. `docs/02-UI-ENGINE-PRD.md`
4. this work order

## Source evidence

- `../studioflow/src/styles/designTokens.css`
- `../studioflow/src/ui_engine/design-system.config.ts`
- `../studioflow/src/ui_engine/components/heading.tsx`
- `../studioflow/src/ui_engine/layout/page-header.tsx`
- `../studioflow/src/ui_engine/layout/shells/dashboard-page-shell.tsx`
- `../studioflow/src/ui_engine/layout/shells/settings-shell.tsx`
- `../studioflow/src/ui_engine/components/section-card.tsx`
- `../studioflow/src/ui_engine/components/table-card.tsx`
- required base primitives under `../studioflow/src/components/ui/`

Legacy files are evidence only. Do not copy directories wholesale.

## Target files

- `src/platform/ui_engine/tokens/**`
- `src/platform/ui_engine/primitives/**`
- `src/platform/ui_engine/components/**`
- `src/platform/ui_engine/layouts/**`
- `src/platform/ui_engine/patterns/**` only for the approved row-action and state contracts
- `src/platform/ui_engine/index.ts`
- the single global stylesheet and root font/style wiring required by the foundation
- focused UI Engine tests

## Exact allowed changes

1. Establish one CSS-custom-property token source using the exact locked typography, color, radius, spacing, dialog-width, and shadow values.
   - Inputs and buttons use the locked `radius-action` value (4px); do not substitute `radius-control` (6px) for inputs.
2. Make TypeScript token exports semantic references to CSS variables; remove duplicate literal token values.
3. Configure Lora and Inter once at the root and expose the locked semantic typography roles.
4. Implement only:
   - `Heading`/text semantics;
   - accessible base Button, Field states, Dialog, Drawer, and action-menu primitives required by this work order;
   - configurable, domain-neutral `AppShell` frame;
   - `PageShell` and `PageHeader`;
   - `PageSection` and `SectionCard`;
   - DataTable presentation shell with alignment helpers, horizontal overflow, and state slots;
   - `FormSection` and common label/description/error states;
   - Dialog/Drawer size and layout variants;
   - `LoadingState`, `EmptyState`, `ErrorState`, and `InlineError`;
   - generic row-action menu presentation.
5. Export the deliberate stable public surface from `@platform/ui_engine`.
6. Keep navigation items, route semantics, columns, calculations, validation, persistence, and domain actions in consumer apps.
   - At narrow widths, shell navigation/utility content may reflow or collapse through an accessible app-controlled mechanism, but must not be hidden or made unreachable by the shared CSS.
7. Add focused tests for public exports, token-source uniqueness, accessibility-critical labels/roles, dialog sizes, table overflow, and state separation.

## Forbidden changes

- No StudioFlow, Master Data, BQ, Prisma, auth, RBAC, service, action, or domain imports.
- No Project/Phase components, live providers, render-board tokens, Master Data table geometry, or BQ calculation/editing behavior.
- No automatic mapping from business-status strings to semantic colors.
- No feature-specific global token.
- No copy of the legacy `src/ui_engine` or `src/components/ui` directory.
- No app pages or domain screens.
- No additional visual language, token values, component library, or abstraction.
- No opportunistic responsive redesign beyond the locked contracts.

## Acceptance criteria

- Master Data and BQ can import the approved foundation only from `@platform/ui_engine`.
- CSS custom properties are the only literal global token values.
- UI Engine has zero imports from `src/apps/**` or generated Prisma code.
- Wide tables scroll instead of squeezing below their app-provided minimum width.
- Loading, empty, and error are visually and semantically distinct.
- Input/button radius resolves to the locked 4px action radius.
- Narrow-layout shell utility/actions remain visible or otherwise accessibly reachable; shared CSS does not remove them.
- Dialog/Drawer variants match the locked widths and viewport-height rule.
- `npm test`, `npm run typecheck`, `npm run check:boundaries`, and the production build succeed.

## Stop conditions

- The Core contract requires a different root/provider boundary that affects AppShell or global style wiring.
- A required primitive cannot meet accessibility requirements with the locked dependency baseline.
- Actual rebuild structure conflicts with the paths or public import surface in this order.
- A requested component requires domain vocabulary or behavior.
