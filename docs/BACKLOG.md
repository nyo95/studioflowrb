# Consolidated Backlog

Status: active, reconciled through **R8.106** on 2026-09-22. Replaces
`roadmap.md`, `review.md`, and `knownbug.md` (merged and archived to
`archive/roadmap-2026-09-22.md`, `archive/review-2026-09-22.md`,
`archive/knownbug-2026-09-22.md` on 2026-09-22 at owner request — full
historical/closed evidence lives there; this file carries forward only what is
still open). `CHANGELOG.md` remains the authoritative revision ledger for
everything already fixed or shipped; this file is a worklist, not a history.

Every item below carries a tag so the three prior trackers' distinction survives
inside one file:

- **[PLANNED]** — not built. No code exists for this yet.
- **[UNVERIFIED]** — code/schema/tests exist and are believed correct, but
  nobody has walked it through a real browser (or, for a pure backend item, run
  the specific integration evidence) since it landed. Treat as "should work,"
  not "works."
- **[BUG]** — an observed, reproducible defect against a contract or against
  correct business logic.
- **[CLEANUP]** — dead code, stale contract text, or doc/code drift. Not a
  behavioral defect on its own, but actively misleading to a future reader.

Rules carried over unchanged from the prior trackers:

- Do not create code, schema, dependencies, or placeholder routes merely
  because an item appears here.
- An item leaves this file only after real end-to-end verification (or, for
  [PLANNED] work, after it ships) — record the evidence in `CHANGELOG.md` and
  delete the entry here, don't just mark it done in place.
- A newly discovered defect is fixed immediately when safe, scoped, and
  verifiable in the same pass; otherwise it goes here as [BUG] with what was
  observed.
- Shared/platform capabilities require one canonical implementation, a public
  export, named consumers, and boundary evidence before being marked done.

---

## Decision gates — resolved 2026-09-23

- **StudioFlow `STORED`-asset retention policy: purge on project archive.**
  When a project is archived, its files are deleted rather than kept
  indefinitely or purged on a fixed timer. No automatic cleanup runs today;
  this still needs implementing against `PLATFORM-ASSET-STORAGE-ROADMAP.md`.
- **Google Drive activation: deferred.** StudioFlow file storage stays on the
  existing local/bounded storage root; do not scope Drive account
  ownership/egress until there's a clear need.

---

## Platform Foundation

- [ ] [PLANNED] Execute `apps/platform/PLATFORM-ASSET-STORAGE-ROADMAP.md`:
  storage port/test seam, provider adapter, Brand mark migration, then
  approved future consumers.
- [ ] [PLANNED] Redesign the top-header/sidebar boundary. Design input already
  captured in `apps/platform/GLOBAL-MENU-DESIGN-BRIEF.md` (owner feedback,
  2026-09-16). Preserve the approved semantic colors. **Partially executed
  2026-09-23 (R8.110):** logo shrunk, account menu slimmed to
  `Account / Settings / Sign out` (brief line 138-140), and the "one settings
  sidebar" direction (brief line 133) is now fully built (closes KB-031, see
  StudioFlow section). **App switcher — Option B built 2026-09-23 (R8.121):**
  turned out to already be ~90% built since R8.107 (a single Popover-based
  control showing the current app name, opening a menu to switch apps — not
  per-app text links as the brief's "Observed UI" section describes, which
  predates that commit); the only real gap was placement (`ml-auto` pushed it
  to the far right instead of next to the brand/logo) — fixed in
  `authenticated-shell/navigation.tsx`/`index.tsx`. Mobile/narrow-viewport
  treatment beyond generic truncation, and per-app icons, remain undecided —
  not blocking, no icon field exists in the apps registry yet.
- [ ] [BUG][P3] KB-020 — Office rebuild migration history contains an
  untracked migration (`20260904153201_add_updated_by_label_vendor_brand`, no
  matching file in repository history). Pre-existing environment/history gap,
  not a routing failure. Do not reset the office database or fabricate the
  missing SQL/checksum; recover the original migration and reconcile
  provenance before using `migrate dev` against this database.

## UI Engine and Shared Utilities

- [ ] [UNVERIFIED] Browser walk of Badge/FilterChip/Avatar/Switch/multi-select
  tags/empty-state panel/sidebar at desktop and 840 px (Round 3 design system
  pass, R8.83: sharper chip edges, `--ui-radius-pill` 3px, darker sidebar,
  circular avatars) — `tsc --noEmit` was clean, no browser evidence recorded.

## Master Data

- [ ] [PLANNED] Define media/file behavior after shared storage exists.
- [ ] [PLANNED] **Physical Samples workflow**, scoped by the owner 2026-09-23:
  from a Product Schedule entry, staff can request a physical sample from a
  vendor/supplier; when the sample is received, the designer sees a badge/
  indicator (on Product Schedule or Today — not a global notification bell;
  that's a separate, much larger Core-level capability, currently `DEFER`ed
  per `CORE.md`, and out of scope here). A received sample does **not**
  auto-create a SKU/price row in Master Data — Master Data's public contract
  is read-only by design (`pricing-contract.md` §12) and StudioFlow has no
  sanctioned write path into it. Instead, StudioFlow records a request that a
  Master Data user reviews and enters themselves. Also needs a genuine SKU
  concept inside Product Schedule (there isn't one today — `sku_text` was
  purged in R8.111 and folded into `product_name`), kept as its own
  StudioFlow-owned data, not a live reference into Master Data's `Sku` table
  (matches how `brand_id` already works: copied at pick-time, no FK, so a
  later Master Data edit/delete never touches a Schedule option).
- [ ] [PLANNED] Define workbook import/export policy and error reporting.
- [ ] [CLEANUP][P2] KB-025 — `src/apps/masterdata/services/index.ts` exports
  many internal-implementation helpers with no external consumer found. Not a
  current coupling problem; narrow the barrel when consumers and the public
  boundary are reviewed together.

**Fixed this session (2026-09-22, R8.107):** the deletion-request workflow
allowed duplicate/stuck `PENDING` requests, contradicting
`masterdata.md` §4.2 ("at most one pending request may exist for the same
target"). `createDeletionRequest` (`services/shared.ts`) inserted
unconditionally with no check for an existing pending row for the same
`(targetType, targetId)`, and the direct-hard-delete path
(`hardDeleteArchived` → `directDeleteOrNull`, `deletion.service.ts`) never
resolved or cancelled any pending request already open on that target before
deleting it — so a later `approveDeletion` on that orphaned request threw
P2025 (target already gone), rolled back, and left the request permanently
`PENDING` with no way to close it except `rejectDeletion` (which then
incorrectly records the target as "rejected" when it was actually already
deleted through the other path). Fixed by making `createDeletionRequest`
reuse an existing pending row instead of duplicating it, and making
`directDeleteOrNull` auto-resolve (`APPROVED`) any pending request for the
same target in the same transaction as the hard delete. Regression tests:
`service.integration.test.ts` "reuses an existing pending deletion request…"
and "direct hard-delete resolves a pre-existing pending request…".

## BQ

- [ ] [PLANNED] Add Quotation PDF output and Terms & Conditions.
- [ ] [PLANNED] Add price modes TBC and By Owner. Owner-confirmed, 2026-09-23:
  both modes mean the price is left blank/not counted toward the total — a
  marker line, not a computed value.
- [ ] [PLANNED] Add Rate Library after sufficient project-line evidence exists.
- [ ] [PLANNED] Add revision/version comparison between BQ snapshots.
- [ ] [PLANNED] Define formal StudioFlow linking through a stable external
  reference.
- [ ] [PLANNED] Add reorder for Sections/L1/L2/L3 inside a project.
- [ ] [PLANNED] Add a unit-conversion helper for `purchase_to_base_factor`.
- [ ] [UNVERIFIED] Full browser walkthrough of BQ-F1..F5 (inline editing at
  every level, all three L3 sources, live server-recomputed totals, one
  unpriced item not blanking the document, calculator input from inline
  numeric cells, promotion status/review controls in BQ Library/Master Data).
  No `InlineEdit` browser interaction evidence recorded yet.
**Fixed 2026-09-23 (R8.119):** `markupL1Pct` was engine-active but
UI-invisible for a standalone (childless) Work Item — `calculation-engine.ts`
applies `markupL1Pct` for every L1 regardless of children, but
`project-editor.tsx`'s single "Koef." column only shows `koefisien` once a
Work Item is childless, hiding a nonzero leftover `markupL1Pct` that kept
silently multiplying the total. Owner decision: zero `markupL1Pct` the moment
a Work Item's last sub-object/line item is deleted (`zeroMarkupIfChildless`,
`project-tree.ts`), rather than surfacing both fields in the cramped column.
Regression test: `service.integration.test.ts` "zeroes a Work Item's markup
once it has no more children, but not while a child remains". See
`CHANGELOG.md` R8.119.

**Fixed 2026-09-23 (R8.109):** sibling `sort_order` collisions on plain
insert (`addSection`/`addSubsection`/`addItem`/`addSubObject`/`addLineItem`
in `project-tree.ts` now compute `max(sibling sort_order) + 1` when the
caller omits one) and the `lockProject`/`unlockProject`/`archiveProject`/
`restoreProject`/`approveProjectDeletion`/`rejectProjectDeletion`
check-then-act races in `projects.ts` (now guarded with the same
`updateMany`-with-status-guard pattern as `transitionPromotionStatus`). See
`CHANGELOG.md` R8.109.

**Fixed this session (2026-09-22, R8.107):**
- Assembly-applied Cost Components never carried a `source_price_snapshot`
  forward. `applyAssemblyTemplate` (`services/assemblies.ts`) copied
  `harga_snapshot`/`source_type`/`source_ref_id` from `BqAssemblyLine` into
  the new `BqLineItem` rows but never set `source_price_snapshot`, so the
  "Harga diubah" override badge could never appear and `revertLineItemPrice`
  always threw `bq.line-item.no-snapshot` for any assembly-applied item — a
  silent one-path-skips-the-snapshot-step gap versus the canonical
  `addLineItem` path (`project-tree.ts:387`), which always sets
  `source_price_snapshot: sourceType === "CUSTOM" ? null : hargaSnapshot`.
  Fixed by applying the identical rule at assembly-apply time. Note: today the
  only write path for assembly lines (`addAssemblyCustomLine`) always sets
  `source_type: "CUSTOM"`, so this fix is currently dormant in production
  (CUSTOM correctly gets `null` either way) but guards the schema's full
  `source_type` range for whenever a non-CUSTOM assembly-line entry point is
  added. Regression test: `service.integration.test.ts` "carries a non-CUSTOM
  assembly line's source price forward…".
- Promotion approve/reject was a check-then-act race with no row lock or
  conditional update (`services/promotions.ts`): `loadPromotable` read with a
  plain `findUnique`, `setPromotionStatus` wrote with a plain `update`. Two
  concurrent Master Data admins approving the same `REQUESTED` Library item
  with different `masterdataRefId`s could both pass validation and both
  write, with the loser's approval silently overwritten even though its audit
  event was already recorded. Fixed by replacing the plain update with a
  `transitionPromotionStatus` helper that guards the write itself with
  `updateMany({ where: { id, promotion_status: { in: expected } } })` and
  throws `bq.promotion.invalid-status` when the guarded update matches zero
  rows (i.e. someone else already transitioned it) — the check and the act
  are now one atomic statement. Regression test: `service.integration.test.ts`
  "guards concurrent promotion approvals against a lost-update race".

## StudioFlow

**Fixed this session (2026-09-22, R8.107):** SF-02 (`deletePhaseDefinition`
orphan-delete guard) and SF-05 (`upsertClientByName` race leaking a raw write
error) — see the top-level session note at the end of this file for details
and `CHANGELOG.md`. Also fixed in passing while chasing a clean `npm run
lint`: `header-search.tsx`'s debounced search effect called `setState`
synchronously (`react-hooks/set-state-in-effect`) — refactored `loading` from
a state variable set by the effect into a value derived at render time
(`trimmed !== searchedQuery`), verified in the browser (empty/loading/
results/no-match states all correct). While there, found **KB-034 (`Date.now()`
in `page.tsx` render body) is already resolved** in the current tree — no
`Date.now()` call remains in that file; removed from this backlog rather than
re-investigated.

### Planned (owner-confirmed scope, 2026-09-23 — none built yet)

**Fixed 2026-09-23 (R8.120):** Projects directory — administrative fields
(name, client, contact, designer/drafter, opening date, type, area, address,
priority, status) moved off the project detail page and onto a row-action
"Edit details" modal on `/studioflow/projects`, alongside Archive/Restore and
"Apply checklist templates" as separate row-menu items. The project's own
pages now show client/designer/drafter/status/priority as read-only header
text only — no edit affordance. See `CHANGELOG.md` R8.120.

- [ ] [PLANNED] **StudioFlow Library.** Rebuild of the legacy read-only
  Library page: search/discover Master Data's Brand catalog from inside
  StudioFlow (owner: *"rebuild dari studioflow 'library' dengan kemampuan
  search dari masterdata utk brand"*). This is the "wave 2+" Library the
  contract already named (`STUDIOFLOW-REWORK-CONTRACT.md` §0 RW-04, §14) —
  scope is now owner-confirmed, but explicitly deprioritized behind the two
  items above (owner: *"boleh di cicil setelah ini"*). No route/service exists
  yet; distinct from the unrelated BQ app's own "BQ Library" feature.
- [ ] [PLANNED] **Project timeline / Gantt chart.** Per-project Gantt with an
  "opening" end date and a start date (default: when the project is added,
  overridable) and a breakdown per phase. No schema exists for this today —
  `SfPhase` has no start/end date field (only `order_index` and the
  retrospective `status_changed_at`); `SfProject.opening_date` is the only
  related field and covers just one end of the range. Was an explicit non-goal
  for wave 1 (`STUDIOFLOW-REWORK-CONTRACT.md` §14); scope now owner-confirmed
  but deprioritized behind the two items above (owner: *"boleh di kerjakan
  setelah ini"*).

### Verification backlog (code done, needs a browser walk to close)

- [ ] [UNVERIFIED] Deliverables panel (phase workspace) — upload PDF/image
  ≤ 25 MB, download link works, delete removes file; MISSING/CURRENT/OUTDATED
  status shown; does not block approval. Desktop + 375 px.
- [ ] [UNVERIFIED] Schedule P0 split-view — desktop split-view layout, stat bar
  counts, chip nav scrolls to option, Set final button on card face. Desktop +
  375 px.
- [ ] [UNVERIFIED] Full 375 px pass across StudioFlow (V2-A–V2-D scope):
  Overview (hero, stat cards, pipeline strip, phase cards with inline
  actions), Today, History.
- [ ] [UNVERIFIED] KB-032/KB-033 Product Schedule settings + add-option photo
  flow — settings dictionaries rebuilt as tables with inline add rows/row
  actions (R8.81); `Add option`/`Edit option` dialogs gained the 4:5 image
  workspace and existing option cards show visible `Change photo` actions
  (R8.86). Needs a browser walk of both: settings tables (create/edit/reorder)
  and the option photo upload/crop/save round trip. Close both KB numbers
  together once verified — same feature area.
**Fixed 2026-09-23 (R8.111–R8.112):** Product Schedule spec model — migration
`20260923000000_sf_schedule_spec_model` applied to both `studioflow_rebuild`
and `studioflow_rebuild_test` and browser-verified: Type label everywhere,
extra spec lines appearing as card rows and as their own checkboxes, a row
whose only option is not final still showing its product, "From past project"
no longer returning reserved rows, and (R8.112) the merged Item-details/card-
fields checklist ticking and saving correctly at both desktop and 375px. See
`CHANGELOG.md` R8.111/R8.112.

- [ ] [UNVERIFIED] SF-R4 phase accent palette (R8.84) — browser walk of
  project overview, project rail, and Today at desktop and 840 px: phase
  colors visible but restrained, status still readable without relying on
  color alone.

### Parity gaps (legacy behavior the rebuild does not have yet)

- [ ] [PARITY][P2] **Print / export the Product Schedule board as a
  client-and-contractor catalogue sheet.** Legacy's `CatalogBoard` *is* the
  printable deliverable — `@media print` rules, a running header carrying
  project name, year and page number, and `no-print` on every editing
  affordance. That is also the reason per-card "card fields" exists at all:
  the choice is "what gets printed for the client", which is why legacy's
  default was a lean Type + Brand rather than every populated field. The
  rebuild board has no print path, so the card-field feature currently only
  affects the on-screen board. Deferred by the owner on 2026-09-23 in favour
  of landing the data/UI consistency first (R8.111); see
  `STUDIOFLOW-REWORK-CONTRACT.md` §11.8.

### Open defects

**Fixed 2026-09-23 (R8.110):** KB-031 — Users and Roles & Access (and Master
Data Settings) now render inside the shared `SettingsShell`/`SettingsNavigation`
sidebar alongside General Settings, instead of being flat pages reachable
only from a separate account-menu "Administration" submenu; that submenu was
slimmed to a single "Settings" entry per `GLOBAL-MENU-DESIGN-BRIEF.md`'s own
explored direction. No access-check changes. See `CHANGELOG.md` R8.110.

- [ ] [BUG][P3] `sf_phase_definition.allow_parallel` for the dev database's
  migrated Supervision definition was observed `true` (expected `false` from
  the original seed) during V2-E browser verification (R8.105). Predates
  V2-E — the migration only re-keys `id`, never touched `allow_parallel` — and
  was not investigated further. Flagged for the owner; check the dev seed data
  directly (`UPDATE sf_phase_definition SET allow_parallel = false WHERE ...`)
  if confirmed wrong, no code change implicated.

### Cleanup / dead code (confirmed unreachable, not a behavioral defect)

**Fixed 2026-09-23 (R8.109):** purged dead `mom-images.ts` and the archived
`_legacy_project_id` route tree (+ its guard test), retargeted
`mom.contract.test.ts` at the live 3 MB policy, and resynced the contract
vocabulary drift across `STUDIOFLOW-REWORK-CONTRACT.md`,
`STUDIOFLOW-PHASE-ENGINE-V2-CONTRACT.md`, and
`PHASE-ENGINE-V2-BASELINE-AUDIT.md`. See `CHANGELOG.md` R8.109.

*(SF-06 `overrideRevision` hard-delete-with-audit-snapshot design and the
StudioFlow UI Engine adoption gaps — phase rail, project directory table, MOM
editor, schedule board, settings pages all using custom components instead of
UI Engine composites — are recorded as accepted architecture debt, not logic
defects; see `docs/apps/studioflow/PHASE-ENGINE-V2-BASELINE-AUDIT.md` and the
2026-09-22 logic-bug-fix session in `CHANGELOG.md` R8.107 for the reasoning.)*

---

## Note on this file's origin (2026-09-22)

This consolidation was produced by re-verifying every item in the three prior
trackers plus two ad-hoc audit documents (`CODEBASE_LOGIC_REVIEW.md` and
`apps/studioflow/REVIEW-ALIGNMENT.md`, both now archived) against current
source — not by copying their claims. Two things fell out of that
re-verification that are worth recording here so they aren't rediscovered from
scratch:

1. Every StudioFlow finding in `REVIEW-ALIGNMENT.md` tagged B1–B5/C1–C2/D1 was
   already fixed in R8.98 (2026-09-21), one day before that document's own
   date — confirmed by re-reading the exact functions it cited. Only its A1–A4
   (contract text drift) and D2 (archived branch) findings were still open;
   those are folded into the Cleanup section above.
2. `CODEBASE_LOGIC_REVIEW.md`'s findings were almost entirely stale or
   mischaracterized by the time they were read (e.g. it flagged the
   `studioflow → masterdata/public` import as a boundary violation, but
   AGENTS.md explicitly allows `app -> other-app/public`). Two real bugs
   survived verification (an orphan-delete guard gap and a client-name race
   producing a raw Prisma error) and were fixed in R8.107 with regression
   tests — see `CHANGELOG.md`.

**Lesson for whoever picks this file up next:** don't trust a prior audit
doc's line numbers, severity, or even its core claim at face value — the
codebase moves faster than these documents get regenerated. Re-verify against
current source before acting.

A fresh logic audit of Master Data and BQ backend services + their UI/UX flow
(same rigor as the StudioFlow pass above) was also run in this session. It
surfaced one real Master Data bug (duplicate/stuck deletion requests) and two
real BQ bugs (assembly-applied items losing their price-revert baseline, and
a promotion-approval lost-update race), all fixed with regression tests — see
the "Fixed this session" notes inline in the Master Data and BQ sections
above and `CHANGELOG.md` R8.107. It also surfaced three lower-priority BQ
items (an engine-active-but-UI-invisible markup field, insert-order sort-key
collisions, and the same lost-update race pattern in other BQ services) that
are recorded above as open [BUG] items rather than fixed immediately, since
each needs either a UI design decision or is low-likelihood/low-impact enough
not to justify a rushed, unverified change.
