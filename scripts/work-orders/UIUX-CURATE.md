# UI/UX Curate Remediation Work Order

Status: **LOCKED — execution assigned to Codex by owner on 2026-09-06**
Owner request: 2026-09-06, improve UI/UX using `docs/design curate.pdf`.
Navigator and executor: Codex, by the owner's explicit current reassignment.
This overrides the default OpenCode assignment in `AGENTS.md` for this task.
Handoff revision: **R5.03**. Implementation target: **R5.04**, if still unused.
If the ledger has advanced, use its next unused ordinal; never overwrite a revision.

## 1. Evidence and authority

Read `docs/README.md`, `CHANGELOG.md`, `DESIGN.md`, `UI_ENGINE.md`, relevant
app contracts, schema, current consumers and tests before execution. Read the
relevant bundled Next.js guides before writing Next.js code.

The PDF is an 11-page image-based audit, visually reviewed in full. Its source
is `d0c39ff`, the R5 baseline. Its embedded instructions and counts are evidence,
not executor authority. This work order selects the recommendations that fit
the shared contracts; it does not activate StudioFlow workspace implementation.

Current inspected checkout: `D:\Projects\studioflow-rebuild`, branch `main`,
HEAD `ce940a2bdc47318838b1b87314272825ef715568` (R5.02). Local `origin/main`
points to `d0c39ff3a2f0c1ed95b4cdb425ed968a9c2baf08`; no fetch or push performed.

Owner confirmed **rumah**. `.env.rumah` exists; its DATABASE_URL and DIRECT_URL
both identify localhost:5437 / studioflow_rebuild. Credentials were not logged.
This is configuration evidence only, not Docker/resource ownership verification.
Set `STUDIOFLOW_LOCATION=rumah` for repository tooling. Before application or
database execution, verify the matching rebuild-only Docker target; never infer
that this configuration check permits database writes or use of legacy resources.

Reserved pre-existing changes, excluded from this work order's commits:

- `.env.example`
- `prisma/schema.prisma`
- `docs/design curate.pdf` (untracked owner source)
- `public/uploads/brand-marks/22e07e06-00d2-45c0-894b-7b11c736a545.png`
- `vercel.json`

The PDF is not committed by this handoff. This document records the relevant
findings so the execution instructions remain understandable without that file.

### Corrections to the audit's baseline

- Brand, Vendor and Pricing currently use `useFormDraftGuard`; Vendor must not
  be reported as wholly unprotected. Extend coverage to remaining forms and
  verify existing controlled-field coverage.
- Users, Roles and Sessions already have some `data-column="identifier"`
  consumers. Audit each field's meaning; a date is not an identifier.
- No production `RowActionMenu` or sticky-header consumers were found in the
  current search. Pricing remains the production sorting/pagination example.
- Tokens still specify 20px section padding against DESIGN's 16px contract.
- Additional code finding: DataTable compact sets `--ui-th-py-block` and
  `--ui-td-py-block`, but TableHead consumes `--ui-th-py` and TableCell uses
  fixed `py-2.5`. Merely adding `density="compact"` will not fix cell density.
- The account flyout is still hover/focus CSS, without a dropdown trigger.
- R5.02 moved promotion approval to Master Data. Preserve that ownership.
- Vendor contract contains conflicting tab descriptions, while R4.78/R4.82
  record the accepted three-tab editor. This visual work does not add a fourth
  tab or modify BrandSupplier relations. Report that separate contract defect.

## 2. Locked product and architecture decisions

1. Preserve warm-neutral tokens, Lora H1/H2, Inter operational type, status
   markers, readable contrast, 8/6/4px radii and existing permission semantics.
   Keep one semantic serif H1 per directory. Remove repetitive eyebrows and
   descriptions rather than introducing a new heading hierarchy.
2. One bordered directory plane contains toolbar, data/state and pagination.
   Page header is outside it. No SectionCard -> bordered toolbar -> bordered
   table nesting. Standalone tables/toolbars retain their current default frame.
3. Reuse UI Engine controls. Extend generic presentation once in the engine;
   apps own columns, comparators, filtering, action callbacks and policy.
4. Keep Brand/Vendor create/edit as Dialog per their contracts. Use `size="lg"`
   for their substantial forms; the shared overlay body is the only vertical
   scroll owner. Do not add full-page CRUD routes or replace every dialog with
   Drawer simply because those primitives are unused.
5. Keep explicit confirmations and the two-step deletion process. A request
   reason form is not equivalent to destructive approval. Preserve optional
   request reasons and required rejection reasons from each existing boundary.
6. Preserve current copy language outside the specifically named BQ list copy
   below. A product-wide language switch/message catalog is not authorized by
   an audit observation. Locale-aware formatting is independent of UI language.
7. No dependency/package-lock, schema, migration, business calculation, grants,
   service mutation, seed, cross-app write, or persisted default changes.
   Use installed React 19.2.4, Next 16.3.2, radix-ui, Lucide and existing utilities.
8. No bulk selection/export feature is activated. Existing selection behavior
   remains intact; do not add it to Brand merely to consume SelectionBar.

## 3. Implementation order and owned files

Complete steps A-D as one cohesive R5.04 implementation. On a material mismatch,
stop with the exact discrepancy and uncommitted file list; do not invent policy.
Navigator acceptance is separate from the executor's implementation commit.

### A. Shared presentation and interaction

Owned: `src/platform/ui_engine/`, `src/app/globals.css`,
`src/app/ui-engine/ui-engine-showcase.tsx`, and UI_ENGINE/DESIGN documentation
only for the explicit API refinements below.

- Restore section X/Y to 16px; page padding `clamp(20px, 2.5vw, 24px)` so it
  respects DESIGN's 20-24px range. Keep maximum width 1440px.
- Keep CSS custom properties as the value source. Complete `uiTokens` mappings
  for existing semantic tokens using `var(...)`, without new literal values,
  redundant size APIs, renaming existing exports, or a token-generation framework.
- Fix compact spacing: set and consume `--ui-th-py:6px` and
  `--ui-td-py:7px`; regular defaults remain 8px/10px. Header heights remain
  32px compact / 36px regular. Verify computed padding, not just class strings.
- Add `framed?: boolean` (default true) to DataTable and TableToolbar. False
  removes only their external border/radius; retain table overflow, background,
  sticky behavior and toolbar padding. No app-local CSS to strip their frame.
- Extend DirectoryShell with `surface?: boolean` (default false). True keeps
  `header` outside a single bordered white plane and groups toolbar, children,
  pagination inside, separated by single rules. Children use unframed table/
  toolbar variants. Preserve existing shell behavior for non-opted-in consumers.
  Empty/loading/error states have 16px inset inside the same plane. Add an
  optional header slot rather than making apps pass empty placeholder headers.
- Extend RowActionMenu with optional `pending`/`disabled` trigger props. Pending
  retains its accessible row-specific name, displays busy feedback and disables
  activation. Individual actions still retain their own disabled permission/state.
- Extend ConfirmDialog with an optional `error` slot rendered after its stable
  description, announced as error feedback. During pending, block dismissal and
  duplicate confirms. Close only after success; failure retains context and retry.
- Keep the existing subtle danger variant. Add explicit `danger-primary` for a
  destructive confirmation's final button using existing danger foreground as
  background and inverse text; no new red palette. Apply only to the final
  destructive confirmation, not every destructive menu item/request button.
- Correct the stale rail tone comment. Consolidate the repeated app-nav wrapper
  into an engine `NavGroup` with `label`/children, no app routes. Match existing
  desktop grouping and labeled horizontal navigation at <=840px. Administration
  remains NavSubmenu; active domain navigation remains a flat group. Their
  different interaction purposes do not require identical nesting.
- Update the showcase with populated, empty, compact, sticky, pending and error
  examples that exercise the new APIs. Do not create unused abstractions.

### B. Directory adoption and scanning

Owned route files/components: `src/app/(platform)/masterdata/` directory pages
and `*-directory.tsx`, access Users/Roles directories and pages,
`settings/general/masterdata/vendor-type-directory.tsx`, `account/sessions-table.tsx`.
Do not edit action/service persistence implementations.

- Convert Brand, Vendor, SKU, Unit, Category, Deletions, Pricing, Users, Roles
  and VendorType directories to the single DirectoryShell surface. Sessions
  adopts compact table/identifier conventions without unnecessary directory UI.
- Use compact tables with `stickyHeader` and `maxBodyHeight="60vh"`. Preserve
  horizontal scrolling and explicit app-local column widths; never hide columns
  at narrow widths. Keep tooltip/menu portals outside the clipping container.
- Remove repetitive app eyebrow and description where navigation/title already
  communicate it. Retain genuinely useful warning/constraint copy. Keep primary
  create in the toolbar for both populated and empty states, permission-gated;
  remove duplicate empty-state primary actions. Preserve Pricing's New price menu.
- Use RowActionMenu for secondary row operations. Keep existing action order,
  availability and callbacks; separate destructive entries. A read-only row must
  not acquire an empty or unauthorized menu. Icon-only utilities use IconButton
  with a meaningful label and shared Tooltip; use `leadingIcon` for create buttons.
- Use `font-ui-mono` for reference strings. Dedicated code/slug cells and their
  headers use `data-column="identifier"`. Do not apply mono to dates or names.
- Category Kind uses neutral plain text (`Product` / `Work`); Status retains its
  semantic marker. VendorType tags and discovery hashtags remain categorical tags.
- Brand columns, in order: Brand, Status, Categories, Hashtags, Owner, Suppliers,
  Resources, SKUs, Updated, Actions. Name primary at most two lines + slug secondary.
  Categories show up to 3 labels; hashtags up to 2; each has a `+N` overflow label
  and accessible full text. Owner is a name; Suppliers/Resources/SKUs are counts.
  Move full links/supplier listings into the existing editor; Updated is a compact
  two-tier actor/date column preserving the accepted directory attribution.
  Keep the audit footer and audit-sourced data; no denormalized actor column.
- Brand widths in this local table: name 240px, status 110px, categories 180px,
  hashtags 160px, owner 180px, each count 90px, updated 180px, actions 64px.
  Other tables: selection 40px if already present, action 64px, status 110px,
  counts 90px, amounts 160px; primary prose >=240px and supporting prose >=160px.
  These are app-owned column choices, never global table geometry tokens.
- Vendor/Pricing likewise move attribution into an Updated column if needed to
  keep name cells to primary plus one metadata tier. Preserve every current field
  and detail access, eligibility filter, quick entry and pricing tab.

#### Directory sort/page rules

Use current authorized in-memory row arrays for this UI-only change. Filtering
precedes sorting, sorting precedes slicing; this does not solve server fetch size.
Never sort just the visible page. Reuse Utilities pagination for slicing math.
Do not put entity comparators into UI Engine or add an API/database paginator.

| Directory | Sortable columns | Initial order |
| --- | --- | --- |
| Brand | Name, Status, Suppliers, Resources, SKUs, Updated | Name ascending |
| Vendor | Name, Status, Brands | Name ascending |
| SKU | Existing name/code identity, Status | Identity ascending |
| Unit | Name, Code | Name ascending |
| Category | Name, Kind, Status | Name ascending |
| Deletions | Requested (`requested_at`), Record type, Requested by | Requested descending |
| Users | Name, Email, Status | Name ascending |
| Roles | Name, Code | Name ascending |
| VendorType | Name | Name ascending |
| Pricing | Preserve existing Name/Vendor/Price sorting | Preserve current default |

Missing named fields mean stop/report, not create a persisted field. Text uses
Intl.Collator with the display locale, sensitivity base and numeric true; counts
use numeric comparisons; timestamps use instants. Nulls last in both directions;
final ties use stable ID ascending. Monetary sorting stays decimal-safe.
Page size 25, except retain Pricing's current size. Changing query, filters or
sort resets page 1; data refresh clamps it. Show filtered count and current range,
with Pagination only when more than one page. Filters never silently clear on
mutation. Existing selection cannot cross an invisible filter boundary unnoticed;
retain current supported selection scope and make its count visible.

### C. Forms and shell usability

Owned: the preceding consumer files, their existing editor components,
`src/platform/authenticated-shell/`, app `nav.tsx`, and
`src/app/(platform)/bq/library/library-controls.tsx`.

- Account menu: replace hover/focus flyout with an intentional Radix dropdown
  client component in authenticated-shell, using existing engine button styling.
  Trigger has the person's name and expanded state; entries are Account (link)
  and Sign out (existing server action). Support Enter/Space, arrows, Escape,
  outside dismissal, focus return and touch. Do not change session/auth logic.
- Brand/Vendor substantial dialogs use lg and remove nested form max-height /
  overflow-y-auto. Keep the existing Vendor three editable tabs and mounted
  inactive panels; never add a relations write. Keep mobile footer reachable.
- Adopt draft guards for Category, SKU, Unit, VendorType, User/Role editors,
  deletion/rejection reason forms and BQ Library item/template/assembly forms.
  Include controlled selections, contact/link drafts and pending quick-create
  inputs. Escape, outside click, X and Cancel share the same guard. Clean open
  does not prompt; save failure preserves draft; successful save closes cleanly.
- Replace Category's plain deactivation Dialog with ConfirmDialog. Preserve
  merge confirmation, impact wording and irreversible typed confirmation rules.
- Use Button `pending` without replacing its text with Spinner. During a submit,
  prevent duplicate actions and overlay dismissal. General errors use InlineError
  in a fixed form position, field errors stay by fields, warnings remain Notice.
  Do not replace explanatory ConfirmDialog copy with an error string.
- Consolidate repeated Master Data request-reason forms in an app-owned component
  because their permission and deletion policy belong to Master Data. It may
  compose Dialog/Field/FormActions/draft guard; UI Engine never calls deletion
  services. Rejection remains explicitly distinct and validates required text.
- BQ Assembly lines editor remains one lg dialog with a selected line editor
  rendered inline in that dialog, instead of opening another edit dialog on top.
  Save/cancel ends that inline edit; switching lines or closing must guard dirty
  input. A destructive confirmation or discard alert may temporarily overlay it.
  Preserve assembly snapshot/source rules and existing commands. No service edits.
- Notes use SimpleTextEditor only for existing multiline note fields. Plain
  addresses and short reason text keep their appropriate inputs. This is not a
  rich-text storage migration.

### D. Overview, BQ list and settings formatting

Owned: `src/app/(platform)/masterdata/page.tsx`, `bq/page.tsx`, `bq/library/page.tsx`,
the authenticated shell, display-only consumer props, and existing Utilities
date/money formatting boundaries. Business price calculation remains untouched.

- Replace the eight overview cards with one compact table: Area / Count / Open.
  Keep all existing summary counts; combine the two Pricing destinations into one
  area showing separately labeled Material and Work counts. No new metrics.
  Counts are Text with tabular numerals, not Heading. Links keep visible focus.
- BQ Projects always shows its permission-gated New project action in PageHeader,
  even with zero projects. Use Plus icon + label; remove duplicate empty CTA.
  Use consistent English within this list: Title, Client, Status, Estimator,
  Grand total, Created; `No projects yet` / `Create your first BQ project.`
  This local copy correction does not translate the BQ editor or stored values.
- BQ access denied uses ErrorState with permission wording, never EmptyState.
  Distinguish failure, no access, no records and no search matches everywhere
  touched. Apply compact single table plane to BQ list/library tables too.
- Supply current `settings.locale` and `settings.timezone` via a small platform
  display context created in authenticated-shell
  from its existing settings prop. No Prisma/settings import in UI Engine or
  Utilities. Pass explicit settings to server-only formatters.
- Replace hardcoded locale/timezone in touched date/count/money displays with
  those values using existing utilities. Dates sort by raw instants. Keep date-only
  values distinct. Money uses its own persisted currency and exact decimal amount;
  defaultCurrency is never a conversion or relabeling instruction. Preserve BQ's
  explicit currency policy. Week start has no new calendar consumer in this scope.

## 4. PDF finding disposition

This covers each actionable numbered finding without treating usage counts as
requirements to instantiate every unused engine primitive.

| PDF findings | Decision / destination |
| --- | --- |
| 1.1, 1.2, 1.3 | FIX section spacing, mapping coverage, stale comment in A |
| 1.4 | FIX BQ list mixture in D; product-wide translation deferred |
| 1.5, 1.6, 1.7 | FIX identifier font, neutral Kind, named icon actions in B |
| 1.8 | EXTEND explicit destructive confirmation emphasis in A |
| 1.9 | FIX count semantics in D |
| 1.10 | FIX display settings plumbing in D; preserve stored currency |
| 1.11 | MERGE creation presentation in B/D; keep grouped Pricing creation |
| 2.1, 7.2 | MERGE directory chrome into one plane in A/B |
| 2.2, 7.4 | FIX repeated context in B; KEEP shared serif H1 |
| 2.3, 7.5 | MERGE overview summaries in D |
| 2.4, 7.3 | FIX Brand cell hierarchy in B; retain Updated column |
| 3.1, 3.2 | REUSE sort/pagination/sticky controls in B; no server paging claim |
| 3.3, 3.4, 3.5, 3.6 | FIX columns, order, identifiers and local widths in B |
| 4.1 | KEEP purpose-specific confirmation; MERGE rendering mechanics in C |
| 4.2 | FIX size/scroll in C; KEEP contract-mandated dialogs |
| 4.3 | MERGE app-owned request form in C; KEEP two-step deletion |
| 4.4 | FIX alertdialog semantics in C |
| 4.5 | FIX stacked assembly editing in C |
| 5.1, 5.2, 5.3, 5.4 | REUSE menus/pending/errors/guards in A-C |
| 5.5 | FIX intentional accessible account menu in C |
| 5.6 | MERGE app-nav wrapper in A/C; KEEP authorized contextual destinations |
| 5.7 | FIX stable create placement in D |
| 6 | Consolidate only proven consumers in A-D; no generic entity framework |
| 7.1 | FIX actual compact CSS before adoption in A/B |
| 8, 9 | KEEP existing strengths; usage totals are evidence, not acceptance |
| 10 | DEFER StudioFlow projects/phases/tasks/deliverables; no active consumer |

## 5. Required verification and acceptance

Executor must record its new HEAD/dirty state before editing and preserve reserved
files. Use only explicitly verified rebuild infrastructure; no migrations or seeds
are needed. Never use real owner records for destructive QA. Mutating browser
scenarios use disposable rebuild-only test fixtures/environment.

Required automated checks:

- `npm run typecheck`, `npm run lint`, `npm run check:boundaries`,
  `npm run check:legacy-runtime`, and `git diff --check`.
- `node --test --import tsx src/platform/ui_engine/ui-engine.test.ts` plus
  focused behavioral tests for new menu/confirm/draft and pagination behavior.
- Existing Utilities date, money and pagination suites if formatting/pagination
  code changes. Test locale/timezone boundaries and exact decimal formatting.
- `npm run build` only after explicit environment target verification (the script
  runs Prisma generation). Do not fix unrelated schema drift to make it pass.
- No whole database test suite is represented as passed unless actually run on
  the verified disposable target. Broaden tests if a behavioral regression appears.

Required real browser evidence, before and after at the same viewport:

- Brand, Vendor, all Pricing tabs, Category, SKU, Unit, Deletions, Users, Roles,
  VendorType, overview, BQ Projects/Library and account menu.
- Desktop 1440x900, compact/collapsible rail presentation as supported by the
  shared showcase, and 390x844 narrow viewport. No document-level horizontal
  overflow; wide tables scroll inside their plane. Menus remain reachable.
- Computed compact header/cell padding matches A; one directory outer border;
  no nested editor vertical scroll; serif H1 and contrast retained.
- More than 25 fixtures: sort across page boundaries, filter on a later page,
  empty-filter reset, page clamp after mutation, retained query and correct count.
- Keyboard-only account/row menus, focus return, visible disabled state, semantic
  destructive confirmation, failure/retry and prevention of duplicate submits.
- Dirty and clean close paths including controlled fields/tab switches, failed
  saves, successful saves, long labels/URLs, archived and read-only permissions.
- Loading, empty, error, denied and pending states; no console/hydration errors.

Keep screenshots and check results in the executor report. Missing authentication,
runtime, mandatory checks or safe fixtures are explicit acceptance blockers,
not permission to mark browser verification passed. The navigator reviews the
commit and actual browser behavior before recording acceptance. Any correction
uses the next local revision rather than amending the executor's commit.

## 6. Executor completion and handoff

Update CHANGELOG with scope, API changes, no migrations/dependencies, exact checks
and remaining limitations. Stage only owned files; inspect the entire staged diff
and `git diff --cached --check`. Create exactly one local commit:

`R5.04 | fix(ui): align directories and interactions with the design audit`

Use the ledger's next ordinal if R5.04 was consumed. No push, release, remote
change, amended commit, or PDF/owner-file staging is authorized. Report revision,
hash, check results, screenshots, blockers and all remaining unrelated dirty files.

Copy-ready executor instruction:

> Codex: implement `scripts/work-orders/UIUX-CURATE.md` steps A-D in order. Location is
> rumah for this session. Read AGENTS and required contracts first, preserve all
> existing unrelated changes, verify rebuild-only runtime targets, and stop on
> policy/contract mismatches. Use the next unused local revision (expected R5.04),
> complete the named tests and browser checks, update the changelog and commit
> locally. Return the commit and evidence for navigator review; do not push.
