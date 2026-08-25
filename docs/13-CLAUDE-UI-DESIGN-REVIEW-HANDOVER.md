# 13 — Claude UI Design Review Handover

Status: **READY FOR INDEPENDENT CLAUDE DESIGN REVIEW**
Prepared: 2026-08-25
Prepared by: Codex PM / Technical Lead
Receiving role: Claude as independent senior product/UI design reviewer using the owner's chosen design skill
Required review ref: `ui-engine-design-review-ready`

## 1. Executive handover

`studioflow-rebuild` is a clean rebuild of the legacy StudioFlow product. It is not an incremental branch of the legacy repository and it is not a folder-by-folder port.

The shared Platform Core and minimum cross-app architecture are complete and locked. The Master Data MD-00 product/domain contract is also owner-approved and locked, but Master Data implementation is deliberately paused.

Before starting Master Data product screens, the owner requested a complete shared UI Engine product kit and one internal showcase. That bounded implementation is now complete in four commits, has passed PM/TL code and technical review, and is available at `/ui-engine`.

The remaining gate is an independent design review by Claude followed by owner visual approval. This review is about visual quality, usability, coherence, information density, responsive behavior, and design-contract compliance. It is not permission to reopen Platform Core, invent product behavior, implement Master Data, or redesign the architecture.

### Current verdict before Claude review

- Architecture/contracts: **LOCKED and technically converged**.
- UI Engine implementation: **COMPLETE and PM/TL-approved technically**.
- Automated acceptance: **PASS**.
- PM/TL responsive/interaction review: **PASS with narrow-layout corrections already applied**.
- Independent design review: **PENDING**.
- Owner visual approval: **PENDING**.
- Master Data implementation: **PAUSED**.

## 2. Repository identity and exact state

- Rebuild repository: `D:\Projects\studioflow-rebuild`
- Branch: `main`
- Reproducible rebuild baseline: `eb58f5ef7995aad22c4170d234ca84bc830eef08`
- UI product-kit start tag: `ui-engine-product-kit-start`
- UI product-kit start commit: `288c642f7f78b8f560ca19258e0d7439681d87a1`
- UI implementation head: `4354c4ff6b658d235d334868c119cf5c3c37a983`
- Manager status before this handover: `f0d6833709aaa90b6c12bb9093e27aa3073c77ab`
- Review-ready tag: `ui-engine-design-review-ready`

The tree at the review tag must be clean. Before reviewing:

```powershell
git switch main
git status --short
git rev-parse ui-engine-design-review-ready
git log --oneline ui-engine-product-kit-start..ui-engine-design-review-ready
```

Do not reset to the old reproducible baseline, either Master Data start tag, the quarantine branch, or any local legacy checkout.

### Canonical legacy evidence

The only canonical legacy evidence is:

`https://github.com/nyo95/studioflow/commit/548fbd6bd00ef9fd7d53df66a3561a32fbb56944`

The local `D:\Projects\studioflow` repository is not a source of truth. It may be used only as an optional cache after proving that the exact inspected commit and files match the immutable GitHub evidence snapshot.

Legacy code is evidence, never authority. Do not compare the rebuild against a moving branch tip and do not copy a legacy UI directory into the rebuild.

### Quarantined unapproved implementation

- Branch: `codex/quarantine-unapproved-20260823`
- Commit: `cb5998070ee7c8ffa1ff7ff5ecbe01a63998e07a`

The quarantine is comparison evidence only. It is not approved code and must not be merged wholesale or used as the design baseline.

## 3. Authority and mandatory reading order

Read these files completely before evaluating the UI:

1. `AGENTS.md`
2. this handover
3. `docs/00-SOFTWARE-SSOT.md`
4. `docs/06-DATA-OWNERSHIP.md`
5. `docs/07-ENGINEERING-CONVENTIONS.md`
6. `docs/02-UI-ENGINE-PRD.md`
7. `DESIGN.md`
8. `UI_ENGINE.md`
9. `scripts/work-orders/UI-01-UI-ENGINE-PRODUCT-KIT.md`
10. `docs/08-CURRENT-STATUS.md`
11. `docs/09-EXECUTION-PLAN.md`
12. `src/platform/ui_engine/**`
13. `src/app/ui-engine/**`, `src/app/globals.css`, and `src/app/page.tsx`

When instructions conflict, use this authority order:

1. explicit current owner instruction;
2. `docs/00-SOFTWARE-SSOT.md`;
3. `docs/06-DATA-OWNERSHIP.md`;
4. relevant app PRD;
5. `prisma/schema.prisma` for implemented persisted shape;
6. other locked manager contracts and work orders;
7. immutable legacy evidence.

For shared visual/UI questions, `DESIGN.md` and `UI_ENGINE.md` specialize the UI Engine PRD but do not override product ownership or cross-app architecture.

## 4. Project progress before the design review

### 4.1 Clean rebuild and execution safety

- Rebuild baseline established at `eb58f5e`.
- Unapproved early Codex implementation quarantined instead of destructively restored.
- External-executor context and deterministic work-order policy established.
- Dependency and legacy-runtime enforcement implemented and reviewed.
- Rebuild has no runtime dependency on local or remote legacy source.

### 4.2 Platform Core/Foundation completion

| Scope | Commit | Result |
|---|---:|---|
| WO-003 dependency + legacy runtime enforcement | `d55c62d` | Complete |
| WO-003A syntax-aware correction | `3ad33e6` | Complete |
| WO-005 DB/Prisma runtime | `4cbdf43` | Complete |
| WO-006 shared errors + validation | `efd17ac` | Complete |
| WO-007 date/decimal/money/unit utilities | `53b9ea6` | Complete |
| WO-008 auth boundary + pure RBAC | `e8c17ac` | Complete |
| WO-009 audit envelope + transactional writer | `d8a64c0` | Complete |
| Foundation convergence corrections | `10d3881` | Complete |
| WO-002 Category pure rules | `d72b72a` | Complete |
| WO-004 initial UI Engine foundation | `4ff3353` | Complete |
| Foundation phase lock | `2d8727e` | Complete |

Core is intentionally minimal and cross-app only: DB access convention, auth/session boundary, RBAC, audit envelope, errors, validation, and shared scalar/value conventions. Do not expand it during a design review.

### 4.3 Master Data contract status

- MD-00 domain contract: owner-approved and locked in `MASTER_DATA.md`.
- Seed inventory: locked in `docs/12-MASTER-DATA-SEED-INVENTORY.md`.
- Canonical legacy evidence provenance: GitHub commit `548fbd6...`.
- MD-01 through MD-09 implementation plan: deterministic and ready after the UI visual gate.
- All prior Master Data implementation start tags are superseded until the UI design gate closes.
- No Master Data schema/CRUD/product UI was introduced by UI-01.

### 4.4 UI Engine product-kit completion

| Checkpoint | Commit | Main delivery |
|---|---:|---|
| UI-A | `628a77c` | Tokens, typography, primitives, engine-owned styling |
| UI-B | `ad8d564` | Forms, tables/data, shared feedback/states |
| UI-C | `27becfa` | Overlays, application/page shells, reusable layouts |
| UI-D | `4354c4f` | Interaction patterns, document surface, `/ui-engine` showcase |
| Manager status review | `f0d6833` | Actual progress and pending owner gate recorded |

UI-01 was implemented directly by Codex under an explicit one-time owner takeover instruction. This exception does not change the normal policy: later deterministic Master Data implementation is performed by owner-operated external OpenCode executors using self-contained work orders.

## 5. Locked UI design and architecture contract

The normative detail remains in `DESIGN.md` and `UI_ENGINE.md`. The following is a review map, not a replacement contract.

### 5.1 Visual language

- Light theme only for this phase.
- Quiet neutral slate canvas, surfaces, text, and borders.
- Semantic color only for neutral/success/warning/danger meaning.
- No ordinary per-app accent colors.
- Lora is limited to H1/H2 identity; Inter is used for operational headings, controls, tables, forms, and body copy.
- H1 32px, H2 24px, H3 18px, H4 16px, H5 14px, H6 12px.
- Base operational/control text is 14px.
- Page padding 20–24px; section padding/gap 16px; maximum page width approximately 1440px.
- Primary surfaces are border-led without shadow.
- Shadow is reserved for overlays or genuine elevation.
- Radius scale is card 8px, control 6px, action 4px, pill only for badges/chips.
- Motion remains subtle and respects `prefers-reduced-motion`.

### 5.2 Composition principles

- One clear H1 per page.
- Normally one visually dominant primary action per composition.
- Descriptions are optional and short; no marketing-style copy.
- Forms group fields by business meaning, not arbitrary nested cards.
- Tables remain readable and scroll horizontally instead of squeezing columns.
- Dialog is for short focused work; Drawer preserves context; full page is for substantial detail/history/navigation.
- Loading, empty, error, disabled, pending, invalid, selected, and destructive states must remain distinguishable.
- Narrow layouts may reflow/collapse but must not remove core information or actions.

### 5.3 Ownership boundary

UI Engine owns generic presentation and interaction. Apps own domain meaning, validation, fetching, persistence, calculations, permissions, routes, document content, and schema mapping.

The following must not enter shared UI Engine:

- Brand/SKU/BQ/Project-specific components or vocabulary;
- Prisma models, app services, public product use cases, or business actions;
- business-status inference from strings;
- feature-specific global tokens or table geometry;
- schema-driven form/table/report builders;
- PDF generation, export adapters, legal copy, or pagination algorithms;
- dark mode or a second visual system;
- speculative dependencies or a generated component dump.

## 6. Implemented public inventory

All exports are available through `src/platform/ui_engine/index.ts`.

### Tokens and primitives

- `Heading`, `Text`, `Button`, `IconButton`
- `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`
- `Divider`, `Badge`, `Spinner`, `Skeleton`, `Surface`
- `uiTokens`, `dialogWidths`

### Forms, data, and states

- `Field`, `FormSection`, `FormActions`
- `SectionCard`, `PageSection`
- `DataTable`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`
- `TableToolbar`, `SearchField`, `Pagination`
- `DescriptionList`, `DescriptionItem`
- `StatusBadge`, `Notice`, `LoadingState`, `EmptyState`, `ErrorState`, `InlineError`

### Overlays and layouts

- `Dialog`, `Drawer`, `ConfirmDialog`, `Tooltip`
- `AppShell`, `PageShell`, `PageHeader`
- `DirectoryShell`, `DetailShell`, `SettingsShell`, `WorkspaceShell`, `SplitPane`
- `Tabs`

### Interaction and document patterns

- `RowActionMenu`, `FilterBar`, `SelectionBar`
- `Combobox`, `InlineEdit`, `ReorderHandle`, `FileDropZone`
- `DocumentSheet`, `printOnlyClassName`, `screenOnlyClassName`

No app/domain component was added to this public surface.

## 7. Implementation map

| Area | Files |
|---|---|
| Public entry | `src/platform/ui_engine/index.ts` |
| Semantic token source | `src/platform/ui_engine/tokens/tokens.css` |
| Token TypeScript references | `src/platform/ui_engine/tokens/index.ts` |
| Primitives | `src/platform/ui_engine/primitives/**` |
| Forms/data/states/sections | `src/platform/ui_engine/components/**` |
| Overlays/shells/templates | `src/platform/ui_engine/layouts/**` |
| Shared interaction/document patterns | `src/platform/ui_engine/patterns/**` |
| Shared runtime component CSS | `src/platform/ui_engine/styles/engine.css` |
| Print rules | `src/platform/ui_engine/styles/print.css` |
| Global import/reset entry | `src/app/globals.css` |
| Internal showcase | `src/app/ui-engine/page.tsx`, `ui-engine-showcase.tsx`, `showcase.module.css` |
| Minimal landing entry | `src/app/page.tsx` |
| Focused contract tests | `src/platform/ui_engine/ui-engine.test.ts` |

No package or lockfile change was made. The implementation uses the already installed React 19, Next.js 16.3, Tailwind CSS 4, Radix, Lucide, clsx, CVA, and tailwind-merge stack.

## 8. Showcase scope

Route: `/ui-engine`

The route is an internal style lab, not a product module and not app navigation. It contains only local demonstration state and imports no Prisma, Core DB, auth, app module, server action, or legacy code.

It demonstrates:

1. typography, surfaces, tokens, spacing, and semantic tones;
2. button/action variants plus disabled and pending states;
3. required, optional, invalid, disabled, textarea, checkbox, switch, and radio form composition;
4. directory header, search, filters, selection, table, row menu, pagination, and loading/empty/error/skeleton states;
5. detail, settings, workspace, split-pane, and tab layouts;
6. Dialog, Drawer, ConfirmDialog, Tooltip, Combobox, and InlineEdit;
7. generic reorder handles and file drop/list presentation without persistence/upload;
8. an A4-like `DocumentSheet` screen preview and print hooks.

The showcase intentionally uses generic words such as Record, Item, Option, Directory, and Workspace. It is not a proposed Master Data or BQ screen.

## 9. Acceptance evidence already collected

The following passed at implementation head `4354c4f`:

```powershell
npm test
npm run check
npx prisma validate
npx prisma generate
npm run test:boundaries
npm run test:legacy-runtime
npm run build
git diff --check ui-engine-product-kit-start..HEAD
```

Observed result:

- 114 tests passed; zero failed.
- TypeScript passed with no emit.
- Architecture boundary checker passed.
- Legacy runtime reference checker passed.
- Prisma schema validate/generate passed.
- Next.js production build passed.
- `/` and `/ui-engine` were statically generated.
- No console warnings/errors were observed during browser review.
- No new dependency, schema change, Core change, Master Data implementation, or legacy runtime coupling was introduced.

Focused tests prove:

- the deliberate public inventory exists;
- Field label/description/error relations are linked;
- loading/error/empty semantics remain distinct;
- Dialog/Drawer/ConfirmDialog use distinct Radix semantics;
- action radius, dialog widths, and table overflow remain locked;
- InlineEdit Enter/Escape mapping, pending state, and error state exist;
- DocumentSheet and print helpers exist without a PDF dependency;
- shared UI source has no app/Core DB/Prisma/legacy import or Master Data/BQ/SKU vocabulary.

## 10. PM/TL visual and interaction review already performed

Reviewed viewports:

- 1440×900
- 1024×768
- 768×1024
- 390×844

Verified manually:

- desktop sidebar and responsive top navigation;
- absence of page-wide horizontal overflow;
- table-only horizontal overflow on narrow viewports;
- form grid reflow and reachable actions;
- selected, invalid, disabled, pending, loading, empty, and error distinctions;
- row menu behavior;
- Dialog focus management, Escape close, body scroll lock, and mobile dimensions;
- full-height mobile Drawer dimensions;
- destructive AlertDialog semantics;
- Combobox controlled selection and ARIA connection to its listbox;
- InlineEdit Enter commit and Escape cancel behavior;
- visible `:focus-visible` outline;
- A4-like document screen surface;
- no browser console warning/error during the reviewed scenarios.

### Corrections made during PM/TL review

1. Added `min-width: 0` protection to the application rail/navigation so narrow content cannot widen the full page.
2. Aligned showcase navigation and composition collapse to the shared 840px shell breakpoint.
3. Converted narrow navigation into horizontally scrollable navigation without a page-level scrollbar.
4. Collapsed the showcase form composition before fields became unreadably narrow.
5. Added explicit Combobox role, `aria-expanded`, `aria-controls`, and listbox connection.
6. Removed an unnecessary wrapper around row menu items so Radix menu semantics remain direct.
7. Preserved generated `next-env.d.ts` as an unrelated generated file; it is not part of the UI commits.

### Existing screenshot evidence

Screenshots are intentionally not committed. On the preparing workstation they are in:

`C:\Users\berka\AppData\Local\Temp\studioflow-ui-engine-review`

- `desktop-overview.png`
- `mobile-overview.png`
- `data-directory.png`
- `mobile-dialog.png`
- `document-preview.png`

Regenerate screenshots from the live route instead of treating temporary images as authority.

## 11. Items deliberately not claimed as complete

The following require Claude/owner review or a later product slice:

1. Actual browser 200% zoom has not been independently verified. Narrow viewports were verified, but this is not a substitute for a real zoom check.
2. Native/system print preview has not been captured. The screen document surface and `@media print` structure passed review/tests, but Claude should inspect real print preview if the design skill/browser supports it.
3. No automated axe-style accessibility audit or full browser E2E suite exists. Semantics, keyboard paths, focus, and responsive behavior received focused tests/manual review.
4. FileDropZone did not transmit/upload a file; upload is intentionally out of scope. Review its presentation and native picker/drop affordance only.
5. ReorderHandle does not implement or persist sorting. It supplies the accessible generic handle only; apps own reorder behavior.
6. DataTable does not fetch, sort, query, calculate, or own columns. Those remain app responsibilities.
7. DocumentSheet does not generate PDF, choose page breaks, or know product schema/content.
8. The showcase is not a complete application screen and should not be judged as a finished Master Data/BQ workflow.

These are scope boundaries, not permission to fill them speculatively during design review.

## 12. Claude design-review objective

Use the owner's designated design skill and perform an independent review of the live `/ui-engine` implementation against the locked contracts.

Answer these questions with concrete evidence:

1. Does the shared visual language feel quiet, professional, coherent, and suitable for long daily operational use?
2. Is the Lora/Inter hierarchy restrained and readable, or does it create hierarchy/weight problems?
3. Are spacing and density suitable for shared Master Data directories/forms and the future spreadsheet-like BQ workspace?
4. Are action hierarchy, destructive affordance, and semantic states clear without excessive color/noise?
5. Are tables, forms, states, shells, tabs, overlays, and interaction patterns visually consistent?
6. Does the responsive strategy preserve information/actions at the four required viewport sizes?
7. Is the horizontal mobile navigation acceptable for this shared shell phase, or is a contract-level navigation decision needed?
8. Are Dialog, Drawer, ConfirmDialog, menus, Tooltip, Combobox, and InlineEdit visually and behaviorally clear?
9. Does DocumentSheet provide a credible neutral base for later app-owned documents and PDFs without becoming a report engine?
10. Does the showcase use concise copy and avoid nested-card/bloat-text problems?
11. Does real 200% zoom keep actions/content reachable?
12. Does native print preview isolate and render the document surface correctly?
13. Is anything visually attractive in the showcase but unsuitable as a shared cross-app contract?

Review the system as shared infrastructure. Do not ask it to imitate the legacy UI exactly and do not redesign it merely because this is a rebuild.

## 13. Reviewable versus locked

| Area | Review treatment |
|---|---|
| Visual execution against existing tokens | Review freely; report corrections |
| Hierarchy, alignment, density, responsive composition | Review freely; report corrections |
| Accessibility, focus, keyboard clarity, contrast | Review freely; report corrections |
| Showcase composition/copy quality | Review freely; report corrections |
| Existing public component behavior | Report concrete defects; do not silently redesign API |
| Token values, typography hierarchy, radius/spacing scale | Locked; contract-change recommendation requires explicit owner decision |
| Public inventory and cross-app ownership | Locked; change requires PM/TL/owner decision |
| New dependency, dark mode, animation/chart/form/data-grid framework | Forbidden in this review |
| App/domain-specific UI or feature tokens | Forbidden in shared UI Engine |
| Prisma/schema/Core/auth/RBAC/audit/Master Data changes | Out of scope |
| PDF generation/report builder/schema-driven UI | Out of scope |

If a strong design finding cannot be solved without changing a locked contract, label it **OWNER DECISION REQUIRED** and stop at the smallest decision. Do not implement the contract change during review.

## 14. Required review procedure

1. Use the design skill before making design judgments.
2. Read all mandatory documents and inspect the exact review tag.
3. Start the local app with `npm run dev` and open `/ui-engine`.
4. Review 1440×900, 1024×768, 768×1024, and 390×844.
5. Perform real 200% browser zoom.
6. Navigate only by keyboard and confirm visible focus/reachable actions.
7. Inspect all showcase sections and open every overlay/pattern.
8. Inspect actual print preview for DocumentSheet when possible.
9. Check console output and run the acceptance commands if any issue could be implementation rather than design.
10. Produce a review report before editing code.

This first pass is read-only. Do not implement changes, edit contracts, create a new design system, or begin Master Data unless the owner explicitly requests a correction implementation after seeing the findings.

## 15. Required Claude output

Return one self-contained report with:

### A. Verdict

Choose exactly one:

- `APPROVE FOR OWNER VISUAL SIGN-OFF`
- `APPROVE WITH BOUNDED CORRECTIONS`
- `BLOCK — CONTRACT OR USABILITY CONFLICT`

### B. Findings

For every finding include:

- severity: P0/P1/P2/P3;
- viewport and exact component/section;
- screenshot or precise visible evidence;
- violated `DESIGN.md`/`UI_ENGINE.md` clause, or state that it is a design-quality recommendation rather than a contract violation;
- user/cross-app impact;
- smallest justified correction;
- whether it stays inside locked contracts or requires an owner decision.

Do not report personal-preference changes without explaining the operational benefit.

### C. Contract assessment

- Any conflict between `DESIGN.md`, `UI_ENGINE.md`, and implementation.
- Any public pattern that accidentally contains domain assumptions.
- Any proposed token/API change that must be owner-gated.

### D. Verification summary

- viewports reviewed;
- keyboard/focus result;
- 200% zoom result;
- print-preview result;
- console/runtime result;
- commands run and their exact pass/fail result.

### E. Next action

State one of:

- no correction work required;
- one bounded correction work order is required;
- owner decision is required before a work order can be written.

Do not implement the next action in the review turn.

## 16. Stop and escalation conditions

Stop and report exact evidence if:

- the review tag does not resolve or the working tree is dirty before review;
- current source differs materially from this handover;
- a required correction needs a new package/dependency;
- the proposed solution needs an app/domain noun or feature token in shared UI Engine;
- accessibility requires changing the locked public architecture rather than correcting implementation;
- a design recommendation would introduce dark mode, a second visual language, a schema UI framework, a PDF engine, or an app screen;
- acceptance would require changing Core, Prisma, auth, RBAC, audit, Master Data, BQ, or StudioFlow product code;
- legacy evidence conflicts with current owner decisions.

Do not silently broaden scope. Separate a visual implementation defect from a contract/product decision.

## 17. Sequence after Claude review

1. Claude returns the independent design report only.
2. Codex PM/TL reconciles findings against locked contracts.
3. Owner approves the current visual direction, approves bounded corrections, or makes a required contract decision.
4. If corrections are approved, PM/TL issues one self-contained correction work order and reviews its result.
5. After visual approval, PM/TL creates a new clean Master Data start tag/ref.
6. Owner-operated external OpenCode executors implement MD-01 through MD-09 under the locked Master Data package.
7. No further Core/Foundation work is added unless product implementation exposes a concrete blocker.

Master Data must remain paused until steps 1–4 are closed.

## 18. Short prompt for Claude

Use this after attaching or pointing Claude to this repository:

> Act as the independent senior product/UI design reviewer for `studioflow-rebuild`. Use your design skill. Read `AGENTS.md` and `docs/13-CLAUDE-UI-DESIGN-REVIEW-HANDOVER.md` completely, then follow its mandatory reading order and review procedure. Review the exact `ui-engine-design-review-ready` ref and the live `/ui-engine` route. This first pass is read-only: do not edit code/contracts or start Master Data. Return exactly the verdict, evidence-backed findings, contract assessment, verification summary, and next action required by the handover. Treat the immutable GitHub commit `548fbd6bd00ef9fd7d53df66a3561a32fbb56944` as legacy evidence only; never use local `../studioflow` as authority.
