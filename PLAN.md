# Active Plan

Plan ID: WO-MD-CRUD-UX-01
Scope: Master Data directory filters, record detail and price draft safety
Module(s): masterdata; UI Engine interaction pattern
Target revision: R9.132 (R9.131 is a pre-existing uncommitted StudioFlow candidate entry)
Risk: high - shared UI interaction; existing permissions and server writes unchanged
Status: IMPLEMENTED — scoped combined-lane review PASS; full high gate INCOMPLETE
Priority: P2
Owner: Product Owner; temporary Lead + Executor authorized in this session
Last updated: 2026-10-18

## Outcome

Staff can filter Brand, Supplier, SKU and Pricing directories without a wall of dropdowns; inspect complete records without opening Edit; create missing references in context and understand when they are saved; and close or leave a price draft without silently discarding their work.

## Locked Decisions and Reuse

REUSE UI Engine Drawer, Combobox, FilterChip, Dialog, Field and draft guards.
EXTEND UI Engine with a generic live TableFilters composition whose options,
defaults and data filtering remain consumer-owned. No domain policy in shared UI.
Brand/Supplier/SKU remain Master Data features, not new installable capabilities.
Keep all current creation permissions, identity and validation rules, partial-save
semantics, archive/deletion approval and source ownership. No dependencies,
schema, migrations or new server data exposure. Detail panels use facts already
authorized and supplied to the directory.

## Implementation and UI Contract

- Search and status remain inline; secondary searchable filters live in a drawer,
  apply immediately, and appear as removable labelled chips.
- Brand, Supplier and SKU names open read-only detail panels; Edit is explicit.
- Owner steering: Brand/Supplier creation uses one tabbed dialog, never an optional-profile disclosure or a second completion step. All fields remain available, required identity stays visible, and switching tabs preserves the draft. Create-from-Pricing remains available for both Brand and Supplier, with existing permissions/validation and return to the price draft.
- Price editing shows its SKU/Supplier identity; leaving for SKU editing uses the
  existing discard guard. SKU identity and supplier identity remain immutable here.
- Clearly show the Brand of a new SKU rather than deriving an invisible value
  from a search filter. Reference quick-create selects the intended price row.
- Multi-supplier matrix uses the same close/discard protection as other forms.
- Preserve compact tables, clear result counts, keyboard focus, mobile internal
  scrolling, and existing business meaning of sample and dictionary workflows.

## Verification

Location rumah. Verify rebuild-only test target from the selected env before DB
tests. High gate: node scripts/verify.mjs --tier high, per command 15 minutes.
Then run npm run test:e2e -- e2e/masterdata-ux.spec.ts e2e/masterdata-acceptance.spec.ts e2e/masterdata-archive-samples.spec.ts e2e/screen-size.spec.ts. Use installed Chrome through PLAYWRIGHT_CHANNEL=chrome when bundled Chromium is absent.
Shared UI, Master Data action/amount/findability and affected browser flows cover
filtering, draft safety, readable detail, quick-create and price identity. Existing
BQ test failure from the StudioFlow attempt must be independently isolated against
unchanged baseline before any gate exception is assessed. No skipped check is PASS.
Browser checks: Brands, Suppliers, SKUs, Material and work Pricing at desktop and
375px; filter apply/remove/reset, details then Edit, matrix cancel/discard,
price-to-SKU navigation, new-SKU Brand selection, quick Supplier returning to row.
Do not mutate the owner's real local data for browser fixtures.

## Acceptance and Recovery

Review actual staged diff and evidence; disclose combined-lane rather than
independent Claude acceptance. No publishing/push. Revert the UI revision to undo;
no persisted change or data conversion is necessary.

## Execution and Scoped Review

- Boundary, legacy-runtime, staged/unstaged whitespace, typecheck and lint passed.
- Full high suite: 1,234 tests, 1,233 passed, one failed; zero skipped, cancelled or
  TODO. The gate is INCOMPLETE. The only failure is the pre-existing BQ subsection
  fixture calling lockProject with unpriced items before its audit-rollback test.
  BQ sources, DB helpers and test runner are unchanged from HEAD; the service test
  imports no changed UI code. It cannot conceal a regression in this UI slice.
- Prisma generation and production build separately passed after the failed gate.
- Final 38-case Master Data browser run passed. All 80 screen-size cases passed
  in the preceding run; only CRUD assertions/locators changed afterwards and all
  were rerun in the green 38-case run. Runtime source remained unchanged.
- Owner-facing flows cover retained tab drafts, automatic hidden-error reveal,
  Price-to-SKU discard confirmation, matrix close/cancel protection, per-row new
  SKU Brand, Brand/Supplier creation from Pricing, correct Supplier row return,
  filters, details, partial save, archive/restore and sample shelf workflows.
- Existing shell hydration issue captured at /account, 840px after Units settings
  remains a separate BUG. Combined Lead/Executor scoped review is not independent
  Claude acceptance. No full-app/release PASS or remote publication is claimed.
- Evidence: .verification/2026-10-17T18-02-09-612Z-28904/summary.json;
  masterdata-uiux-e2e-accepted.log (38/38), masterdata-uiux-e2e.log (80/80 size
  cases, four corrected CRUD assertion failures), masterdata-uiux-generate.log,
  masterdata-uiux-build.log. Following checks, only docs/ledgers were updated;
  generated next-env.d.ts returned to HEAD during build.

## Checkpoint: prior StudioFlow work

Uncommitted StudioFlow access implementation from WO-SF-WORKSPACE-ACCESS-01 is
preserved, along with its R9.131 candidate ledger/backlog changes. Its high gate was
incomplete (1233/1234 tests; BQ lock-price fixture failure); browser review and
commit remain pending. Stage only the Master Data/UI files and the R9.132 ledger
entry. Do not mix or claim completion of that prior security change.
Once R9.132 is committed, finishing the prior candidate must use the next unused
revision; the preserved draft entry is not permission to commit an older suffix.

## Executor Prompt

Act as temporary Lead + Backend Executor, rumah. Read AGENTS.md and this READY
plan. Finish the bounded Master Data UI/UX outcome, verify the explicit gate and
browser scenarios, inspect the staged diff, update its changelog entry and create
R9.132 locally. Preserve the unrelated StudioFlow dirty work and draft R9.131
ledger entry; report actual evidence, limitations and remaining dirty files.
