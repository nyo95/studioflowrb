# Active Plan

Plan ID: WO-MD-BRAND-FORM-GROUPING-01
Scope: Master Data Brand form section grouping
Module(s): masterdata; UI Engine interaction pattern
Target revision: R9.133 (R9.131 remains a pre-existing uncommitted StudioFlow candidate entry)
Risk: medium - retained form layout and its validation focus behavior; server writes unchanged
Status: IMPLEMENTED — scoped combined-lane review PASS
Priority: P2
Owner: Product Owner; temporary Lead + Executor authorized in this session
Last updated: 2026-10-18

## Outcome

Staff creating or editing a Brand see two meaningful sections instead of four: Profile groups the Brand's own catalog information and external links; Suppliers & contacts groups the suppliers with the people who work for them.

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

- Owner decision: Brand has exactly two retained tabs: **Profile** and
  **Suppliers & contacts**. The standalone Contacts and Catalogs & links tabs
  are removed in both Create and Edit.
- Profile contains hashtags, product categories, notes and external catalog/site
  links. Suppliers & contacts contains owner supplier, supplying organizations
  and the contact editor. The editor remains disabled until an owner or supplier
  exists; no permission, ownership, validation or write contract changes.
- Keep Brand identity outside tabs. Switching tabs retains all values and an
  invalid field still reveals its hidden tab.

## Verification

Location rumah. Verify rebuild-only test target from the selected env before DB
tests. High gate: node scripts/verify.mjs --tier high, per command 15 minutes.
Run typecheck, lint and the affected Brand acceptance/browser scenarios. Use
installed Chrome through PLAYWRIGHT_CHANNEL=chrome when bundled Chromium is absent.
The browser checks cover retained profile links, supplier-contact relationship,
contact addition remains unavailable without a supplier, and existing Brand-price
relationship acceptance. No live owner data is used.
Do not mutate the owner's real local data for browser fixtures.

## Acceptance and Recovery

Review actual staged diff and evidence; disclose combined-lane rather than
independent Claude acceptance. No publishing/push. Revert the UI revision to undo;
no persisted change or data conversion is necessary.

## Execution and Scoped Review

- Typecheck and the changed-file lint pass.
- 28 affected Master Data browser scenarios pass, including Brand create/edit,
  a Profile link retained through tab switches, disabled contact addition before
  supplier selection, existing Brand-price relationship behavior and narrow layout.
- This is a small retained-form layout refinement after the R9.132 build and
  full Master Data browser evidence. No server, data or shared component source
  changed. Scoped combined-lane review is not independent Claude acceptance;
  no full-app/release claim or remote publication is made.
- Evidence: `.verification/masterdata-brand-grouping-e2e.log` (28/28).

## Checkpoint: prior StudioFlow work

Uncommitted StudioFlow access implementation from WO-SF-WORKSPACE-ACCESS-01 is
preserved, along with its R9.131 candidate ledger/backlog changes. Its high gate was
incomplete (1233/1234 tests; BQ lock-price fixture failure); browser review and
commit remain pending. Stage only the Master Data/UI files and the R9.133 ledger
entry. Do not mix or claim completion of that prior security change.
Once R9.133 is committed, finishing the prior candidate must use the next unused
revision; the preserved draft entry is not permission to commit an older suffix.

## Executor Prompt

Act as temporary Lead + Backend Executor, rumah. Read AGENTS.md and this READY
plan. Finish the bounded Brand form grouping outcome, verify the explicit checks,
inspect the staged diff, update its changelog entry and create R9.133 locally.
Preserve the unrelated StudioFlow dirty work and draft R9.131 ledger entry;
report actual evidence, limitations and remaining dirty files.
