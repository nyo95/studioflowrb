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
- **[BLOCKED]** — scope is reviewed and partly locked, but cannot start
  because one or more named questions below it are still the owner's to
  answer. **An agent must not guess an answer and proceed.** Read the named
  question(s) verbatim, ask the owner, and only then either convert the entry
  to `[PLANNED]` with the answer recorded, or write it up as a `PLAN.md`
  slice. Do not treat silence, a related-sounding prior decision, or "it
  seems obvious" as an answer.

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
- **`sf_phase_definition.allow_parallel` for Supervision: intentional.**
  Phases may run in parallel by design; `true` for the Supervision phase
  definition is acceptable product behavior, not a data-integrity defect.
  Removes the prior `[BUG][P3]` entry from the StudioFlow Open defects
  section below — no code or data change follows from this.

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

- [ ] [BLOCKED] **Private user-to-user messaging, cross-app (owner roadmap
  review, 2026-09-26).** Owner confirmed scope: "kayak live collab tapi
  lebih privat antar user diseluruh web (cross app)" — private 1:1, not a
  shared project feed, and platform-wide (any user to any user), not
  StudioFlow-scoped. This is a **new decision**, not an activation of the
  already-ratified `D-SF-05` (StudioFlow-global/general, *temporary*
  project collaboration) — D-SF-05 explicitly chose "temporary... not a
  permanent Project record"; this request is private and presumably
  persistent, the opposite framing. Legacy has no precedent for this
  (`extensions/live-collaboration` was a shared, 24-hour-window project
  `Comment` feed with client-only "unread," `setInterval` polling — not
  1:1 mail; read-only-verified in this session against
  `github.com/nyo95/studioflow` @ `c4b0c466...`). Placement: platform/Core,
  not app-owned — reuse the existing cross-app People Directory (already
  used for assignment pickers) as the recipient source; per `CORE.md` §14's
  placement test, a generic message store has no app-specific meaning.
  **Folds in the `CORE.md` §15 deferred "notification delivery" port as its
  first consumer** — but keep it minimal: an unread badge can be computed
  directly from the message table's own `readAt IS NULL`, so do **not**
  build a separate generic `Notification` entity/port in the same slice;
  only promote to a shared notification primitive once a second, unrelated
  event type (e.g. the Master Data sample-request item above) genuinely
  needs to share one inbox/bell with mail.
  **Questions the owner must answer before a `PLAN.md` can be written:**
  1. Delivery: client polling (legacy's own pattern, simplest) is enough,
     or does this need to feel closer to real-time?
  2. Can either side delete/hide a conversation on their end only, or are
     messages permanent for both parties forever?

## UI Engine and Shared Utilities

- [ ] [UNVERIFIED] Browser walk of Badge/FilterChip/Avatar/Switch/multi-select
  tags/empty-state panel/sidebar at desktop and 840 px (Round 3 design system
  pass, R8.83: sharper chip edges, `--ui-radius-pill` 3px, darker sidebar,
  circular avatars) — `tsc --noEmit` was clean, no browser evidence recorded.

## Master Data

**LOCKED (owner, 2026-09-24).** Audited this session: 35/35 masterdata
integration tests pass, 0 open `[BUG]` entries, no TODO/FIXME in source, and
the only apparent gap found (`vendor-contract.md` §14.4 "Brand permanent
delete... currently missing") turned out to already be implemented
(`brand.archived` audit action + deletion-request flow both exist) — that
table is stale historical migration checklist, not a live gap. Owner
decision: do not modify Master Data app code without an explicit new owner
request, even to "clean up" or "improve" something found in passing. The
`[PLANNED]`/`[CLEANUP]` items below remain legitimate future work, not an
invitation to start them unasked.

- [ ] [PLANNED] Define media/file behavior after shared storage exists.

- [ ] [BLOCKED] **Incoming Sample Requests screen (owner roadmap review,
  2026-09-26).** StudioFlow will add a public read port exposing pending
  physical-sample requests (`SfScheduleSampleRequest`, see mirrored entry
  under **StudioFlow** above for the full evidence trail). This entry is the
  Master Data side: a staff-facing queue to read those requests, record a
  vendor's quoted price, and create/update the real `Sku` + `PriceMaterial`
  rows — ported in spirit from legacy's `sample-request-actions.ts`
  (`VendorFollowUpInput.syncToMaterialPrice`), which is where the actual
  Master Data write always lived (never StudioFlow). This is real Master
  Data domain work, not a small add-on: StudioFlow's `requestedFrom` is
  free text today, not a `Vendor`/`Party` FK, and `Sku.base_unit_id` is a
  required FK — so "create pricing from a request" means resolving or
  creating real `Vendor`/`Unit` records too, not just copying two fields.
  **Do not start this from a general "clean up Master Data" pass** — the
  standing rule directly above (owner, 2026-09-24) requires an explicit new
  owner request, and the two questions on the StudioFlow-side mirror entry
  are still open.

**Fixed 2026-09-23 (R8.123):** Physical Samples workflow — from a Product
Schedule option, staff can request a physical sample from a vendor/supplier
(`SfScheduleSampleRequest`, free-text `requestedFrom`, no live Master Data
reference, same pattern as `brand_name`); when received, the designer sees a
`Badge` on the option card, not a notification bell (that stays a separate,
`DEFER`red Core-level capability per `CORE.md`). Receiving a sample never
writes to Master Data — its public contract is read-only by design — a
Master Data user adds the SKU/price themselves. See `CHANGELOG.md` R8.123,
`STUDIOFLOW-REWORK-CONTRACT.md` §11.11.
- [ ] [PLANNED] Workbook import/export. Owner-scoped 2026-09-23: bulk
  import/export of SKU + pricing via Excel/CSV, similar in spirit to the
  existing vendor-catalog import. Error-reporting policy (partial-failure
  behavior, per-row error surfacing) still needs to be designed — not started.
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

- [ ] [BUG] `nextSortOrder` (`project-tree.ts`) reads `MAX(sort_order)` and
  inserts in two separate, non-transactional calls on the plain `db` client
  (not `tx`) — used by `addSection`/`addSubsection`/`addItem`/`addSubObject`/
  `addLineItem`. Two near-simultaneous adds under the same parent (double
  submit, or two collaborators) can both read the same MAX and insert with
  the same `sort_order`; there is no unique constraint to catch it. Found and
  verified 2026-09-24 in a logic audit; not fixed in that pass because a
  correct fix means wrapping each of five call sites in a transaction (and
  deciding whether `requireEditableProject*` guards move inside it too) —
  broader surgery than warranted to rush. The narrower `count()`-vs-`MAX+1`
  sibling bugs in `assemblies.ts`/`templates.ts` were fixed in the same audit
  (R8.134) since those were single-line swaps; this one needs its own pass.
- [ ] [BUG] `addLineItemAction`'s MASTERDATA/material branch
  (`src/app/(platform)/bq/[id]/actions.ts:386`) calls
  `masterDataRead.listMaterialPriceOptions({ limit: 200 })` with no `search`
  term to re-validate a selected price, then `.find()`s it by id.
  `listMaterialPriceOptions` orders by `sku.name asc` and caps `take` at 200,
  so a valid price whose SKU sorts past position 200 falls outside the
  window and the action wrongly throws "no longer available" even though the
  source picker (which does pass `search`) just found it. Found and verified
  2026-09-24. Not fixed in that pass: the clean fix needs a by-id lookup in
  Master Data's public read port, and Master Data is locked (see its section
  above) — needs an explicit owner request to touch it, or a workaround
  entirely on the BQ side (e.g. carry the picked option's snapshot through
  the form instead of re-fetching by id).
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

**Fixed 2026-09-23 (R8.124):** StudioFlow Library — `/studioflow/library`,
read-only Brand discovery over Master Data's existing `listBrandLibraryReads`
public read port (no new Master Data code needed; it already returned
everything the page shows). See `CHANGELOG.md` R8.124,
`STUDIOFLOW-REWORK-CONTRACT.md` §7a.
**Fixed 2026-09-23 (R8.125, upgraded R8.127):** Project timeline / Gantt — a
`ProjectTimeline` bar on the project Overview page, spanning
`timelineStartDate` (`SfProject.timeline_start_date`, overridable, defaults
to `created_at`'s date) to `openingDate`, one segment per phase. R8.125
shipped it equal-width-by-sequence only (no per-phase dates existed yet).
R8.127 added owner-overridable `SfPhase.planned_start_date`/`planned_end_date`
(additive, unset by default) — a phase with both set now draws at its real
position/width against the span; a phase without them still uses the
original equal-width fallback, so nothing regresses for projects that never
set them. R8.127 also added `/studioflow/timeline`, a portfolio-wide Gantt
(one bar per project) with client/designer-drafter/status/date-range filters
and the planned-dates editor (click a segment). See `CHANGELOG.md` R8.125,
R8.127, `STUDIOFLOW-REWORK-CONTRACT.md` §8. Still not delivered: a
duration report derived from actual status-change history (these are
*planned*, owner-entered dates, not computed from phase transitions).
**Removed from the Overview page 2026-09-24 (R8.138):** the per-project bar
duplicated `/studioflow/timeline`'s per-project view with no added
information; `/studioflow/timeline` remains. See `CHANGELOG.md` R8.138.

### Owner roadmap review, 2026-09-26 — four items

Owner brought four ideas in one session; each was checked against locked
contracts, current code, and (for two of them) read-only legacy evidence
(`github.com/nyo95/studioflow` @ `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`,
the same commit already pinned in `D-SF-RECOVERY-DISCOVERY.md`) before being
recorded here. Terminology note settled the same session: this rebuild has no
"extension" tier — the hierarchy is Platform/Core → app (StudioFlow/Master
Data/BQ, peers) → feature module inside an app (MOM, Schedule, Presentation,
etc., all StudioFlow modules, no sub-tier between them).

- [ ] [PLANNED] **SF-PRESENTATION — Presentation Manager module.** READY plan
  in `PLAN.md` (copy-ready Executor prompt included) — not started. A
  project-scoped StudioFlow module: `Board` → many `Slide` (bulk-imported
  images) → many pinned `Annotation` per slide, each pin optionally linked to
  a Product Schedule entry (same-app, resolved live so labels can never
  drift), exportable via the shared UI Engine print view (third consumer,
  after MOM and Schedule). Ports legacy `RenderBoard`/`RenderAnnotation`
  (`studioflow-schedule-contract.md` §8: `RenderAnnotation on schedule
  entries | DEFER | Not contracted`), expanded from legacy's one-image-per-
  board to many-slides-per-board per owner request ("bulk import gambar").
  Confirmed no functional dependency on the deferred SketchUp integration
  (D-SF-06) — legacy's own action file is plain CRUD. Two defaults locked in
  `PLAN.md`: export is PDF via the existing print pattern (not real `.pptx`
  generation), bulk import is local multi-file upload only (not pulling from
  Deliverables/Schedule photos). Flag to the owner before Executor starts if
  either default is wrong.

- [ ] [BLOCKED] **Sample request → Master Data "incoming requests" queue.**
  Owner confirmed the shape: StudioFlow only requests; a Master Data staff
  member processes it manually (contacts vendor, gets a price, creates the
  SKU/price themselves) — same division of labor as legacy's
  `sample-request-actions.ts` (`subapps/master-data/`), which never let
  StudioFlow write into Master Data's schema even though it shared one DB.
  Confirmed against the locked boundary: `studioflow.md` §4 "StudioFlow
  reads only Brands through the Master Data public read port, read-only";
  Master Data's own `pricing-contract.md` §12 "read-only public contract".
  StudioFlow side: add a public read port (symmetric to Master Data's
  existing one) exposing pending `SfScheduleSampleRequest` rows — no schema
  change beyond that. Master Data side (the actual new work — see mirrored
  entry under **Master Data** below) is what's blocked.
  **Questions the owner must answer before a `PLAN.md` can be written:**
  1. New Master Data permission for the "Incoming Sample Requests" screen, or
     reuse an existing one?
  2. Does Master Data marking a request "priced" auto-flip StudioFlow's
     `SfScheduleSampleRequest.status` to `RECEIVED`, or do the two stay
     independent (Master Data's "we priced it" and StudioFlow's "the
     physical sample is in the designer's hands" are different moments)?
  3. `docs/BACKLOG.md`'s own standing rule: *"do not modify Master Data app
     code without an explicit new owner request, even to clean up or
     improve something found in passing."* This item **is** that explicit
     request once the owner answers 1–2, but do not start on Master Data
     code from this bullet alone — get the direct go-ahead in the same turn
     work begins.

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
**Fixed 2026-09-25 (R8.164):** Product Schedule print/export (R8.132) —
browser-verified via headless Chromium against a disposable local Postgres:
`/studioflow/print/projects/:id/schedule` had never actually worked — it
crashed with a server 500 (`printFormatFromSearchParams` was exported from a
`"use client"` file, so calling it from the Server Component page threw).
Fixed by moving the pure function into a non-client module. Re-verified: the
route now returns 200, cards match the on-screen board, and toggling
`?paper=&orientation=` reflects in both the preview and the injected `@page`
rule. See `CHANGELOG.md` R8.164.
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

**Fixed 2026-09-24 (R8.132):** Print / export the Product Schedule board as a
client-and-contractor catalogue sheet — deferred on 2026-09-23 in favour of
landing data/UI consistency first (R8.111), owner scoped it back in this
session. `/studioflow/print/projects/:id/schedule`, a second consumer of the
shared UI Engine print view (§10's MOM print route was the first), reusing
the board's own `effectiveCardFields`/`cardFieldValuesOf` logic (moved to
`domain/schedule.ts`) so the printed card can never drift from the on-screen
one. Paper size/orientation are user-selectable (`DocumentSheet.printFormat`
+ `PrintFormatPicker`, a new canonical UI Engine capability) — the concrete
gap the owner named in legacy's fixed-layout export. No true per-page running
header/page counter: browsers don't support it without a PDF-render pipeline,
which the owner declined to add; see `STUDIOFLOW-REWORK-CONTRACT.md` §11.11.

### Open defects

**Fixed 2026-09-23 (R8.110):** KB-031 — Users and Roles & Access (and Master
Data Settings) now render inside the shared `SettingsShell`/`SettingsNavigation`
sidebar alongside General Settings, instead of being flat pages reachable
only from a separate account-menu "Administration" submenu; that submenu was
slimmed to a single "Settings" entry per `GLOBAL-MENU-DESIGN-BRIEF.md`'s own
explored direction. No access-check changes. See `CHANGELOG.md` R8.110.

- [ ] [PLANNED] Purge STORED file assets on project archive —
  `archiveProject()` currently skips object deletion; owner decision is to
  purge on archive (see "Decision gates" above). Deferred until the storage
  layer (`PLATFORM-ASSET-STORAGE-ROADMAP.md`) is in place.
- [ ] [BUG] `ui-engine.test.ts` ("UI Engine foundation") has 2 pre-existing,
  unrelated failures found while running the full suite for R8.164 (out of
  scope for that change, left open per the proportionate-checks rule):
  (1) "locks token source, action radius, widths, and horizontal overflow"
  asserts `--ui-radius-action: 4px` but `tokens/tokens.css` now has `7px` —
  either the token drifted or the lock is stale, needs an owner call on which
  is correct; (2) "keeps app internals and domain vocabulary out of shared UI
  sources" — `tokens/tokens.css` has two comments naming the app "BQ"
  (`--ui-page-wide-max` and the "BQ compact density stamp" section header),
  violating UI Engine's app-neutral-source rule.

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
