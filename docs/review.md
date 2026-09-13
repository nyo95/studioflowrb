# Ready for Review

Status: active verification ledger, reconciled through R7.56 on 2026-09-10.
New file, split out of `roadmap.md`/`knownbug.md` on 2026-09-10 at owner
request, so status is visible at a glance:

- [`roadmap.md`](roadmap.md) — **not built yet.** Planned features and decision
  gates.
- **This file** — **built, not yet checked.** Code, schema, and/or tests exist
  and are believed to satisfy the contract, but nobody has walked it through a
  real browser and no integration test has run against it. Treat anything
  listed here as "should work", not "works".
- [`knownbug.md`](knownbug.md) — **checked, and it's wrong.** An observed,
  reproducible defect against the contract.

An item leaves this file one of two ways: verification confirms it behaves —
delete the entry and note the evidence in `CHANGELOG.md`; or verification finds
a real defect — move it to `knownbug.md` with what was actually observed.

## Platform Foundation

### PF-0 — Foundation baseline pin and continuation freeze

- **Observed:** R8.18 adds the canonical
  [`FOUNDATION-BASELINE-FREEZE.md`](FOUNDATION-BASELINE-FREEZE.md) governance
  record. It pins R8.12 (`45d74884c1ec268b30b1d5e6dc86a80da32cffe7`) as the
  approved rebuild behavior/reference baseline and R8.16
  (`edcd1b287de396440db1a36004b873e7c0410eee`) as its documentation-only
  planning overlay; it also records legacy evidence metadata
  `nyo95/studioflow` at `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27` without
  authorizing legacy checkout or database access.
- **Needs:** Independently verify both rebuild commits resolve locally; verify
  the record keeps Master Data and BQ behaviorally frozen, applies the
  StudioFlow continuation freeze only until PF-8 with the narrow approved
  exception, and does not misrepresent R8.16 as a behavior baseline. Verify
  the R8.18 diff is limited to the PF-0 governance and ledger files, with no
  owner-supplied untracked reference staged.
- **Status:** Ready for review, not yet verified.

### Configurable main-route settings

- **Observed:** Implemented 2026-09-10 per `roadmap.md`'s "Add configurable
  main-route settings" item. Adds `mainAppId`/`landingAppId` (nullable,
  shape-validated, not registry-validated — Core stays domain-neutral) to
  `PlatformGeneralSettings` and its schema/migration, a pure
  `resolveMainRoute()` in `src/app/(platform)/main-route.ts` (with a colocated
  unit test) that the launcher's `page.tsx` now calls instead of its old
  hardcoded "masterdata first" default, and two new selects in
  General Settings (Main application / Landing page for other users) wired
  through `actions.ts`.
- **Accepted R7.56:** Check, lint, Prisma validation/generation, 314 tests, and
  production build pass. All migrations deploy to a fresh isolated rebuild
  browser-test database; the new two-column migration also deploys to kantor.
  Browser evidence covers main BQ/StudioFlow redirects, inaccessible-main
  landing, null-main Master Data priority, stale-id preservation/fallback,
  read-only settings, and successful saves at desktop and 375px width.
  Fixed the post-save stale selection, registry path validation, default-main
  precedence, and authorization before brand-mark upload. This entry is retained
  as a short handoff receipt; it is no longer pending review.
  Pre-existing office migration-history drift is tracked separately as KB-020.

## UI Engine and Shared Utilities

No item currently ready for review.

## Master Data

### Supplier Category dictionary and vendor assignment

- **Observed:** Implemented in R8.08. Adds a **Supplier Category** dictionary
  distinct from Supplier Type: Supplier Type remains the capability dimension
  (Material/Labor eligibility and pricing guard), while Supplier Category is a
  plain classification label (e.g. fabric supplier, hardware supplier) with no
  capability or pricing consequence. A supplier may carry more than one
  category (owner-confirmed many-to-many).
- **Scope:** new `SupplierCategory` + `VendorSupplierCategory` join model and
  additive migration `20260911150000_add_supplier_category` (deployed to the
  rebuild-only kantor database via `prisma migrate deploy`); service CRUD with
  the same duplicate/soft-delete rename, reference, audit, and shared
  deletion-request/direct-delete behavior as Supplier Type; vendor create/edit
  `supplierCategoryIds` passthrough with atomic join maintenance; a
  **Supplier categories** tab in Settings → Master Data; and the Supplier
  directory gaining a creatable category multi-picker (type a name and it is
  created inline when the actor holds `masterdata.dictionary.manage`), table
  badges, and a category filter.
- **Needs:** A real browser walkthrough of Settings → Master Data →
  Supplier categories (create, render, edit, archive, restore, request
  deletion, and `masterdata.deletion.approve` direct delete), plus the
  Supplier directory flow (assign categories on create and edit — including
  typing a new name and confirming it is created inline and added — save,
  badges in the table, category filter, fallback read for non-managers) and
  the duplicate-code guard on create.
- **Status:** Ready for review, not yet verified.

## BQ

### BQ-F1 through BQ-F5 — inline editing, all three L3 sources, live totals

- **Observed:** Implemented as of R4.56 (`eadd693`) per the owner decisions
  locked 2026-09-03 in [`apps/bq/bq-contract.md`](apps/bq/bq-contract.md):
  inline editing for every value at every level (this is what activated
  `InlineEdit` in the UI Engine out of its deferred registry), and all three L3
  sources including Master Data import (BQ-F4). Totals stay live without
  client-side arithmetic — every mutation returns the server-recomputed
  `BqProjectDetail` and the client swaps state; each L1 is computed
  independently so one unpriced item does not blank the document.
- **Needs:** A real browser walkthrough (add/edit/import at every level,
  confirm totals recompute correctly, confirm one unpriced item doesn't blank
  the document) and at least one integration test. No `InlineEdit` interaction
  test exists yet — only markup and source-contract assertions.
- **Not blocking review, already tracked in `roadmap.md`:** no reorder for
  Sections/L1/L2/L3 inside a project; import picker filters client-side and
  caps at 80 rows with no paging; no unit-conversion helper for
  `purchase_to_base_factor`.
- **Status:** Ready for review, not yet verified.

## StudioFlow

No item currently ready for review beyond what the R7.55 audit already
reconciled — that audit read code against
[`apps/studioflow/studioflow-project-contract.md`](apps/studioflow/studioflow-project-contract.md)
and either fixed what it found immediately or opened it as a dated defect in
`knownbug.md` (KB-012…KB-019). Nothing from that pass is sitting in an
unverified middle state.

## Rules

- An item belongs here only when code, schema, and/or tests actually exist for
  it — a roadmap idea with no implementation stays in `roadmap.md`.
- Don't claim something "works" because a table exists or a component was
  imported — see the minimum product bar in this directory's `README.md`.
- Closing an item here requires the same evidence closing a roadmap item does:
  end-to-end verification, not a code read.
