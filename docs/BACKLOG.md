# Consolidated Backlog

Status: active (only `[PLANNED]` and `[BLOCKED]` items remain as of R8.208; pending browser checks live in `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md`), reconciled through **R8.106** on 2026-09-22, plus a full-repo
logic + UI/UX audit at `ee9e09e` on 2026-09-26 (see "Full-repo logic + UI/UX
audit" below; that pass found 1 P0, 3 P1, 13 P2, 15 P3, and 2 currently-failing
guard tests). R8.165 closed that P0 and those three P1s; the two residuals of the
KB-037 checker work are still open below as KB-037a and KB-037b. Replaces
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
- **Archived-project files are kept for 90 days, not deleted at once (owner, 2026-09-28).**
  Supersedes "purge on archive" above. The number is provisional and adjustable in settings;
  restoring the project inside the window keeps everything; only after it are the project's own
  files removed. The client logo is never part of a project purge.
- **Master Data workbook import/export: approved approach (owner, 2026-09-28).** Edit in Excel and
  re-import, with a preview before anything is saved, all-or-nothing apply, a per-row error report,
  and unknown vendors/units/categories rejected instead of created. A spreadsheet library is
  approved as a new dependency.
- **Sample requests and notifications: Lead defaults (owner delegated, 2026-09-29: "kamu langsung take over").**
  The open questions on the two BLOCKED sample-request entries were answered by the Lead's recommendations, recorded in
  `PLAN.md` (WO-SR-01) and open to the owner's veto: a new permission `masterdata.sample-request.manage`; Master Data's
  "priced" never flips StudioFlow's `RECEIVED`; version one records the quote and links ids but does not create the SKU
  or price; staff are notified of new requests and the requester of priced or declined ones; delivery is polling. The
  private user-to-user messaging item stays BLOCKED and is not part of this.
- **SF-PRESENTATION defaults confirmed (owner, 2026-09-28):** export is PDF through the print view
  (not a real PowerPoint file), and images are uploaded from the device only.

---

## Platform Foundation

- [x] [BUG][P2] **Fixed 2026-09-29 (R8.185). `npm test` hung indefinitely on at least one Windows dev machine.** The 11
  disposable-DB test files (`src/platform/core/db/test-support.ts`'s `createTestDb`/`requireDisposableTestDatabaseUrl`)
  share one Postgres advisory lock key to serialize their `TRUNCATE`s. Node's default test-file concurrency here is
  `os.availableParallelism()` (32 on this machine), so up to 7 of those files started at once and raced for the lock; the
  first holder (`platform/core/notifications/notifications.integration.test.ts`) went idle mid-suite and never released
  it, blocking the rest for 18+ minutes until the connection was killed from outside (`pg_stat_activity`: several backends
  stuck on `wait_event advisory`, the holder `idle`/`ClientRead`). Reproduced twice, then confirmed by running the same
  files with `--test-concurrency=1`: 623/623 pass in 53s, no hang. **Fix:** `scripts/run-tests.mjs` now passes
  `--test-concurrency=1`. `R8.184`'s changelog reports "full npm test 618/618" from wherever that was run, so this may
  have been Windows/wide-core-count-specific rather than universal; the fix costs a slower `npm test` (files run one at a
  time) in exchange for it actually finishing.
- [ ] [PLANNED] Execute `apps/platform/PLATFORM-ASSET-STORAGE-ROADMAP.md`:
  storage port/test seam, provider adapter, Brand mark migration, then
  approved future consumers.
- [ ] [PLANNED] **Notifications (platform) — bell and inbox built in R8.185.** In-app inbox only (`core/notifications`, table
  `platform.Notification`, actions in `(platform)/notifications/actions.ts`, popover in `authenticated-shell/notification-bell.tsx`
  in the top bar for every signed-in user); first workflow is sample requests (staff told of a new request, the requester told
  when it is priced or declined). Delivery is polling (60s and on route change), no real-time channel. Email, push, preferences,
  and digests stay deferred; old read notifications are not cleaned up yet (no retention rule was requested); no browser
  acceptance recorded yet (owner tests UI changes themselves). Private user-to-user messaging below is separate and still
  blocked.
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

## UI Engine and Shared Utilities

No open items. (The pill-radius note from R8.83 was stale: `--ui-radius-pill` has always been 999px in this repository; badges are fully round.)

## Master Data

**LOCK LIFTED (owner, 2026-09-28; was LOCKED 2026-09-24).** Audited on 2026-09-24: 35/35 masterdata
integration tests pass, 0 open `[BUG]` entries, no TODO/FIXME in source, and
the only apparent gap found (`vendor-contract.md` §14.4 "Brand permanent
delete... currently missing") turned out to already be implemented
(`brand.archived` audit action + deletion-request flow both exist) — that
table is stale historical migration checklist, not a live gap. Owner
decision of 2026-09-24: do not modify Master Data app code without an explicit new owner
request, even to "clean up" or "improve" something found in passing.
**Lifted 2026-09-28:** the owner asked to unlock Master Data and start with KB-025. Master Data
work is allowed again when it is a requested item or an approved Work Order; it is still not an
invitation to make unrequested drive-by changes.

- [ ] [PLANNED] Define media/file behavior after shared storage exists.

- [ ] [PLANNED] **Screen built in R8.185 (queue, Take/Record quote/Mark priced/Decline); vendor/SKU/`PriceMaterial` linking on
  the quote is still to build.** **Incoming Sample Requests screen (owner roadmap review, 2026-09-26).** StudioFlow's public
  read port exposes pending physical-sample requests (`SfScheduleSampleRequest`, see mirrored entry under **StudioFlow** above
  for the full evidence trail). The Master Data side is a staff-facing queue (`(platform)/masterdata/sample-requests`) to read
  those requests and record a vendor's quoted price. **Still open:** creating/updating the real `Sku` + `PriceMaterial` rows from
  a request — ported in spirit from legacy's `sample-request-actions.ts` (`VendorFollowUpInput.syncToMaterialPrice`), which is
  where the actual Master Data write always lived (never StudioFlow). This is real Master Data domain work, not a small add-on:
  StudioFlow's `requestedFrom` is free text today, not a `Vendor`/`Party` FK, and `Sku.base_unit_id` is a required FK — so
  "create pricing from a request" means resolving or creating real `Vendor`/`Unit` records too, not just copying two fields.
  The service (`recordSampleQuote`) already accepts `vendorId`/`skuId`/`priceMaterialId` by id — only the picker UI is missing,
  and "must state a price" is already satisfied by amount + currency alone, so this is additive, not blocking.
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
- [ ] [PLANNED] **Workbook import/export (SKU + material pricing) - approved approach, READY as `WO-MD-IMPORT-01` in `PLAN.md`.**
  Edit in Excel and re-import with a preview first, all-or-nothing apply, per-row error report, unknown vendors/units/categories rejected
  (Decision gates, 2026-09-28). Backend first (Codex, R8.212); the import/export screens follow as a Lead UI revision.
- [ ] [PLANNED] **Harness: catch "server code calls a function that lives in a `"use client"` module".** R8.210 shipped exactly this
  (`/bq` crashed) and neither `npm test` nor `next build` failed. Add a `check-boundaries` rule (or a route smoke test that renders every
  server page once) so this class fails before review. Same failure as R8.164.
- [x] [CLEANUP][P2] KB-025 — `src/apps/masterdata/services/index.ts` exports
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

- [x] [BUG] `nextSortOrder` (`project-tree.ts`) reads `MAX(sort_order)` and
  inserts in two separate, non-transactional calls on the plain `db` client
  (not `tx`) — used by `addSection`/`addSubsection`/`addItem`/`addSubObject`/
  `addLineItem`. Two near-simultaneous adds under the same parent (double
  submit, or two collaborators) can both read the same MAX and insert with
  the same `sort_order`; there is no unique constraint to catch it. Found and
  verified 2026-09-24 in a logic audit.
  **Partially mitigated, not closed, R8.203.** All five call sites (plus two
  undocumented sibling instances found in the same pass — `addAssemblyCustomLine`
  and `applyAssemblyTemplate` in `assemblies.ts`, and `addTemplateSection`/
  `addTemplateRecommendation` in `templates.ts`) are now wrapped in
  `runTransaction` (Serializable isolation + retry-on-P2034, the same
  machinery proven correct for the promotion/archive/deletion lost-update
  races elsewhere in this codebase). This closes a real secondary atomicity
  gap in `applyAssemblyTemplate` (a `createMany` failure after a bare
  `subObject.create()` could previously strand an empty sub-object) but a
  purpose-built regression test (10 concurrent inserts under one parent,
  removed after confirming the result rather than kept flaky) still produced
  duplicate `sort_order` values — PostgreSQL's predicate locking does not
  reliably treat a `MAX()`-aggregate-then-`INSERT` as a detectable conflict
  even under `Serializable`. **A full fix needs a DB-level unique constraint**
  (partial indexes, since the sort scope is nullable/dual-parent across the
  five affected tables) with retry-on-conflict — a schema-level decision out
  of scope for this pass.

  **Fixed 2026-09-29 (R8.205).** Additive unique indexes now enforce one
  sibling position for every BQ tree/template/assembly scope (including
  nullable dual-parent scopes). Automatic appends retry a unique collision and
  recompute the next position; explicit positions remain strict. Template
  reordering uses a temporary range before assigning the final sequence, so a
  valid swap does not collide mid-update. Both rebuild databases had zero
  pre-existing duplicate groups before the migration, and concurrency plus
  reorder regression tests cover the failure mode.
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

### Owner roadmap review, 2026-09-26/27

Owner brought several ideas over two sessions; each was checked against locked
contracts, current code, and (for two of them) read-only legacy evidence
(`github.com/nyo95/studioflow` @ `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`,
the same commit already pinned in `D-SF-RECOVERY-DISCOVERY.md`) before being
recorded here. Terminology note settled the same session: this rebuild has no
"extension" tier — the hierarchy is Platform/Core → app (StudioFlow/Master
Data/BQ, peers) → feature module inside an app (MOM, Schedule, Presentation,
etc., all StudioFlow modules, no sub-tier between them).

- [ ] [PLANNED] **UNBLOCKED 2026-09-29 (see Decision gates); the read port is built in R8.183.** **Sample request → Master Data "incoming requests" queue.**
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

- [ ] [BLOCKED][P3] **AI conversational file filing (owner review,
  2026-09-27) — explicitly deprioritized: "AI ini bagian paling ga priority,
  studioflow sudah solid dan usable dulu."** Do not pick this up before the
  core product is solid, and do not resume planning it without the owner
  raising it again. What was resolved this session, so a future pass does
  not re-derive it from scratch:
  - Primary driver is **not** free-form Q&A — it's checklist automation:
    `SfChecklistItem` rows are still ticked by hand today after a human
    manually checks whether a required input (e.g. a fit-out spec sheet, a
    batch of existing-site photos) has landed. The AI's real job is
    detecting that arrival and *proposing* the tick — the human confirms,
    same as every other AI-touches-a-mutation path in this idea (it calls
    the existing checklist toggle path, never a new one). Ad hoc "what's
    the bulkhead height on Project A" question-answering is a secondary,
    smaller want, not the driver.
  - The `/IN`/`/DATA`/`References` folder names the owner used are a real,
    existing office convention — but **StudioFlow-native folders on the
    machine that hosts StudioFlow**, built fresh, not a NAS integration.
    (An archived, do-not-implement rebuild-era doc, `docs/archive/studioflow-rb/studioflow-project-contract.md`
    §8.2, happens to use these exact three folder names for unrelated
    historical reasons — interesting confirmation the owner's instinct
    matches old thinking, not evidence to build from.)
  - Hardware is **unprovisioned and tentative** — StudioFlow currently runs
    on the owner's own PC; no dedicated self-host machine has been bought.
    Any "local model" sizing/capability call is unanswerable until that
    changes — this is an infrastructure blocker, not just a software one.
  - Reviewed a full owner PRD for this (conversational filing, non-goals,
    tool layer, confirmation-before-mutation) against current code and
    found it materially sound in philosophy (no direct Prisma, ask-before-
    assume, respects every locked cross-app boundary) but built on two
    wrong assumptions about the current schema: (a) it imagines a numbered
    "D1/D2/D3" deliverable slot the file explicitly targets — the real
    model tags an uploaded deliverable to whatever `SfRevision`
    (phase-wide `v{major}.{minor}`) is currently ACTIVE, computed
    MISSING/CURRENT/OUTDATED, with no "create a new slot" operation; (b)
    it assumes `.skp`/`.dwg` can already be uploaded as deliverables —
    today's allow-list is `pdf`/`png`/`jpeg`/`webp`/`zip` only, 25 MB cap
    (`phases/service.ts`, `DELIVERABLE_ALLOWED_TYPES`/`DELIVERABLE_MAX_BYTES`).
  - Owner's own fix for the working-file-size problem: **do** upload the
    real bytes (rejected the archived doc's "metadata only, file stays on
    the studio's machine" idea — reasonable, since the host machine already
    is the studio's machine now), but add a **retention policy**: keep only
    the last N revisions' worth of deliverable per file type per phase
    (example given: SketchUp — D2+D3 kept, D4 arrives, D2 is deleted).
    Neither the allow-list expansion nor this pruning logic exists in
    `uploadDeliverable`/`deleteDeliverable` today; uploads currently
    accumulate forever.
  - No LLM/AI SDK dependency exists in `package.json` today — first such
    integration for this codebase whenever it is picked up.
  **Before a `PLAN.md` can be written (whenever this is revisited):** confirm
  the retention count N and what "same type" means (extension? revision
  slot?); confirm the folder-watching mechanism (server-side fs watch on
  the host machine, vs. a manual "file arrived" trigger from the UI);
  confirm hardware once it exists.

### Verified work (recorded here so the fixes stay traceable)

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

- [x] [BUG] `ui-engine.test.ts` ("UI Engine foundation") has 2 pre-existing,
  unrelated failures found while running the full suite for R8.164 (out of
  scope for that change, left open per the proportionate-checks rule):
  (1) "locks token source, action radius, widths, and horizontal overflow"
  asserts `--ui-radius-action: 4px` but `tokens/tokens.css` now has `7px` —
  either the token drifted or the lock is stale, needs an owner call on which
  is correct; (2) "keeps app internals and domain vocabulary out of shared UI
  sources" — `tokens/tokens.css` has two comments naming the app "BQ"
  (`--ui-page-wide-max` and the "BQ compact density stamp" section header),
  violating UI Engine's app-neutral-source rule.

  **Fixed 2026-09-28 (R8.170):** owner chose 7px; see KB-045 and KB-046. Both
  assertions pass (`ui-engine.test.ts` 42/42).

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

## Full-repo logic + UI/UX audit (2026-09-26, post-R8.163)

Run against `main` @ `ee9e09e` after fast-forwarding R8.145-R8.163. Read-only
audit: backend domain logic, platform core (errors/db/rbac/audit), UI/UX flows,
and structural/boundary debt. Every item below was verified by reading the
cited lines; the P0/P1 items were independently re-confirmed a second time.
`npm run typecheck`, `check:boundaries`, and `check:legacy-runtime` all PASS -
several items below exist precisely *because* a passing check does not cover
them.

**Baseline: `npm test` is RED - 519/521 pass, 2 fail.** Both failures are in
`src/platform/ui_engine/ui-engine.test.ts` and both are guard regressions, not
product bugs: the token-lock test (KB-045) and the domain-vocabulary guard
(KB-046). A guard that always fails is a guard nobody runs, so both are P3
only in blast radius but should be triaged early.

### P0 - must fix

_None. The audit's single P0 (KB-035, the access-administrator lockout guard)
was fixed in R8.165._

### P1 - fix next

- [x] [BUG] **KB-037a - `src/app/promotion-runtime.ts` reaches into two apps'
  `runtime` layer, and the boundary checker still cannot see it.**
  `src/app/promotion-runtime.ts:2-3` imports `bqPublicCommands` from
  `@/apps/bq/runtime` and `masterDataPublicCommands` from
  `@/apps/masterdata/runtime`. Both are cross-app and neither is a `public`
  layer, so by the same rule as KB-037 they are violations - but the file sits at
  the `src/app` root beside `app-registrations.ts`, not under the route lane, so
  `routeLaneApp` still classifies it as `{ kind: "other" }` and no rule reads it.
  R8.165 fixed the `settings/general/masterdata` half of KB-037 and left this
  alone deliberately. The obvious repair is blocked: both symbols are named
  "public commands" but live in `runtime.ts`, and re-exporting them from
  `*/public/index.ts` would drag the Prisma-bound runtime into the client bundle
  that `promotion-review.tsx` already imports types from. Moving the command
  surface into each app's `public` layer is a real boundary change and needs an
  owner decision on where the promotion command surface lives. Do not fix this by
  adding a runtime re-export.

  **Partly addressed 2026-09-28 (R8.168):** the *checker-blindness* half is
  closed. `RULE_SHELL_TO_APP_INTERNAL` now reads every file under `src/app` and
  `src/application` that no app owns and allows only an app's `public`, `runtime`,
  and route lane. That codifies today's wiring (`promotion-runtime.ts` -> `runtime`)
  without moving anything. Whether the command surface should live in `public`
  remains the open owner decision above; nothing was re-exported.

- [x] [BUG] **KB-037b - 30 platform-lane files still classify as
  `{ kind: "other" }` and are skipped by every boundary rule.**
  R8.165 added `PLATFORM_ROUTE_OWNERS` for app-owned route groups, so the six
  live cross-app imports are now visible. The remaining 30 files under
  `src/app/(platform)` have no declared owner and are still skipped: the lane
  root (`layout.tsx`, `main-route.ts`, `error.tsx`, `loading.tsx`,
  `page.tsx`, `logout-action.ts`), all of `settings/access/**`, the platform part
  of `settings/general/**`, and all of `account/**`. Defaulting them to
  `platform` is not a safe one-liner, which is why R8.165 stopped short:
  `src/app/(platform)/layout.tsx:11-13,28-35` imports each app's lane nav
  directly (`./bq/nav`, `./masterdata/nav`, `./studioflow/nav`), so classifying
  the lane root as platform immediately fails `RULE_PLATFORM_TO_APP` on six
  imports. Fixing this means deciding where per-app navigation enters the
  platform shell - the composition root already passes `domainNavigation` and
  `domainUtilityNavigation` slots, so the likely shape is for the layout to stop
  importing app lane modules and receive them the way it already receives
  `contextSlot`. That is an architecture decision, not a checker fix. Verified
  safe to reclassify: none of the 34 files construct `Intl.DateTimeFormat`, so
  `collectDuplicatePrimitiveViolations` loses no coverage by narrowing.

  **Partly addressed 2026-09-28 (R8.168):** these files are no longer skipped by the
  import rules - `RULE_SHELL_TO_APP_INTERNAL` covers them and `(document)/<app>`
  route groups are now owned by their app. The lane-root layout's per-app nav
  imports are allowed as layer `route`. Reclassifying the lane root as `platform`
  for `RULE_PLATFORM_TO_APP`, and the nav-slot decision above, are still open.

- [x] [CLEANUP] **`CHANGELOG.md` has no entry for R8.163 (`ee9e09e`).**
  The "Revision state" block still read R8.162 as current after that commit
  landed. R8.165 corrects the block to R8.165/R8.166 and backfills R8.164, but
  R8.163 is not backfilled because it is not this line of work's commit to
  describe. Someone who knows that change should write its entry.

### P2 - fix in the next few passes

- [x] [BUG] **SF-08 - Editing a project name can silently change the project
  number, desynchronising `name` from `project_code`.**
  `src/apps/studioflow/projects/service.ts:483-491`. `looksFormatted`
  (`domain/naming.ts:7-9`) only tests the shape `^\d{4}-\d+ .+`, so a manager who
  types `"2027-412 Foo"` passes the guard, and only `data.name` is written -
  `project_code` is never compared. The dialog invites exactly this: the field is
  pre-filled with the readable name only (`edit-project-dialog.tsx:35`) and
  carries the hint "The number 2025-429 stays fixed." (`:75`). Consequences: the
  directory shows two numbers for one project (`project_code` at
  `projects/service.ts:346`, the name carries the typed one); the auto-numbering
  safety net is blind to it because the sequence scan reads `project_code` only
  (`projects/service.ts:157`); and the hint itself is computed by slicing the
  name string (`edit-project-dialog.tsx:49`), so it will assert "2027-412 stays
  fixed" while the stored code is `2025-429`. Because MOM and printed documents
  carry the name, the drift can reach client-facing output. Fix: reject a typed
  code that differs from `project.project_code`, and derive the hint from
  `project.code` instead of slicing the name.

- [x] [BUG] **SF-09 - Blocker counts are fetched one phase at a time - 3 SQL
  statements per phase, serially, on every project page.** `readBlockerCounts`
  (`src/apps/studioflow/phases/blocker-query.ts:5-15`) takes a single `phaseId`
  and issues 3 statements. `listProjectPhases` calls it in a serial `for` loop
  (`src/apps/studioflow/phases/service.ts:568-570`); `listNavPhases` and
  `listPhaseAttention` (`today/service.ts:146-170`) do the same per phase. With
  the contract's 5 phases per project, the project overview issues 17 statements
  as 12 sequential round trips before its own `Promise.all` can resolve - and
  `listNavPhases` adds `1 + P` more on EVERY project sub-page. The Today page is
  `11 + 3P`, where P is every in-flight phase in the studio (the filter at
  `today/service.ts:129-132` is not scoped to the user's projects), against a
  pool capped at `DB_POOL_MAX` default 10 (`src/platform/core/db/pool-settings.ts:8-11`).
  Fix: one `findMany` over `phase_id in ids` plus two `groupBy` calls, joined in
  memory - 3 statements per page instead of `2 + 3P`.

- [x] [BUG] **SF-10 - Header quick-search fetches every match with full
  relations, then displays six.** `src/app/(platform)/studioflow/actions.ts:966-979`
  calls `listProjects` and `listClients` and applies `.slice(0, 6)` afterwards.
  Neither service bounds the result: `listProjects` (`projects/service.ts:334-343`)
  has no `take` and pulls `client`, every phase of every match, and two filtered
  `_count`s, then resolves the whole designer/drafter directory;
  `listClients` (`:211-221`) has no `take` either. The action fires on every
  250 ms debounced keystroke from the standing header field on every
  `/studioflow` page (`header-search.tsx:33,55-64`), so a two-letter term drags
  the whole matching table plus every matching client's project list across the
  wire to show 12 rows. Fix: `take: 6` on the search path with a narrow
  projection, leaving the full directory query for the Projects page.

- [x] [BUG] **KB-041 - No checker reads `prisma/schema.prisma`, so the
  cross-app-foreign-key rule is entirely unenforced.** `check-boundaries.mjs:397,533`
  and `check-legacy-runtime.mjs:120-123` walk `srcDir` and root config files
  only. `AGENTS.md` names cross-app database foreign keys as forbidden. The
  current schema IS clean (verified: no cross-app `@relation`;
  `DeletionRequest` and `BqProjectDeletionRequest` deliberately store scalar
  `requester_user_id`/`requester_label` snapshots, matching `CORE.md:209`), but
  that compliance is unprotected - one `@relation` between the `bq` and
  `master_data` schemas would pass both checks and `tsc` silently. Fix: parse
  the schema and fail when a relation's target model lives in another app schema;
  add a deliberate-violation fixture.

  **Fixed 2026-09-28 (R8.168):** `collectDatabaseOwnershipViolations` parses the
  schema and fails on any `@relation` between models of different schemas (fixture
  included). The same parse now also fails foreign Prisma model/type access and
  foreign-schema raw SQL. Its first run found two real violations, both fixed:
  StudioFlow's project History read and MasterData's latest-actor query queried the
  platform `AuditEvent` table directly; both now use `listAuditEvents` /
  `latestAuditActorLabels` in `@platform/core/audit/persistence`.

- [x] [BUG] **KB-042 - Argon2id hashing runs inside the serializable
  transaction, pinning a pooled connection for ~40 ms of CPU per call.**
  `src/platform/core/rbac/services.ts:412` and `:485`,
  `src/platform/core/auth/account.ts:87`, `auth/bootstrap.ts:87` all await
  `hashPassword()` (m=19456, t=2) inside the `runTransaction` callback opened at
  `Serializable` (`src/platform/runtime.ts:20-21`). The work is pure CPU and
  needs no transaction, yet it holds a checked-out connection (pool default 10)
  for the full hash, and a `P2034` conflict re-runs the hash on retry. Not a
  correctness bug - the write is rolled back first - but it converts CPU time
  into connection-hold time and delays the last-access-administrator invariant
  checks (KB-035, fixed in R8.165) relative to commit. Fix: hoist
  `const passwordHash = await hashPassword(...)` above the
  `runTransaction(...)` call; the value is transaction-independent.

- [x] [BUG] **KB-044 - `runTransaction` has no dedicated test.**
  `src/platform/core/db/transactions.ts` has no `transactions.test.ts`, though
  `db/` has five sibling suites. `CORE.md:58` makes the transaction boundary a
  contract-level guarantee, yet the commit/rollback/isolation/retry behaviour of
  the primitive every app depends on is exercised only indirectly by whichever
  integration tests happen to use it. Fix: direct tests for commit, rollback on
  throw, and reuse/nesting rejection. Related: project numbering's row-lock
  guarantee (`projects/service.ts:149-165`) has only sequential coverage
  (`service.integration.test.ts:121-157`) - no test drives two concurrent
  creates and asserts distinct codes.

### P3 - record and batch

- [x] [BUG] **KB-045 - The design-token lock test is stale, so token values are
  effectively unlocked (CURRENTLY FAILING).**
  `src/platform/ui_engine/ui-engine.test.ts:217` asserts
  `--ui-radius-action: 4px`; the token is `7px` (`tokens.css:99`), and
  `CHANGELOG.md:110` confirms 7px was the intended prototype value
  ("`--ui-radius-action` is already exactly 7px"). The token is live - consumed
  by `globals.css:80` and `tokens/index.ts:35` - so only the test is wrong. The
  same test also locks dialog widths. Fix: update the assertion to 7px.

  **Fixed 2026-09-28 (R8.170):** assertion now `--ui-radius-action: 7px`, on the
  owner's decision that 7px is correct. No token value changed.

- [x] [CLEANUP] **KB-046 - App vocabulary inside the shared token file (CURRENTLY
  FAILING).** `ui-engine.test.ts:646-654` exists to keep app internals and domain
  vocabulary out of shared UI sources and currently fails on two comments in
  `src/platform/ui_engine/tokens/tokens.css`: line 110 `/* full-bleed (BQ, print) */`
  and the line 172 `/* -- BQ compact density stamp -- */` banner. No behavioural
  coupling - the `[data-density="compact"]` block itself is a generic mechanism
  - but a shared file naming a specific app is exactly the ownership break the
  guard exists to prevent, and it leaves the guard red. Fix: reword to a neutral
  description and keep the selector.

  **Fixed 2026-09-28 (R8.170):** the two comments are reworded ("dense
  workspaces", "Compact density stamp (opt in with data-density=\"compact\")");
  the `[data-density="compact"]` selector and every value are untouched.

- [x] [BUG] **KB-047 - `listAssignableRoles` exposes the full role-to-permission
  matrix under the weaker `platform.user.read` grant.**
  `src/platform/core/rbac/services.ts:371-377` requires only
  `platform.user.read` but returns each role's `code`, `name`, and full
  `permissionIds`, while every other role-reading surface requires
  `platform.role.read` (`:272`, `:340`). Reachable from
  `settings/access/users/page.tsx:36`. Pinned by an existing test
  (`platform-access.integration.test.ts:292`), so it may be intentional -
  confirm with the owner rather than assume.

- [x] [BUG] **KB-048 - `archiveRoleAction` forwards a raw unvalidated id.**
  `src/app/(platform)/settings/access/roles/actions.ts:92` is the only sibling
  action that does not `z.string().uuid()`-parse its identifier before calling
  the service. No privilege bypass today (`archiveRole` re-reads and throws
  `NOT_FOUND`), but it violates the validate-at-the-boundary convention in
  `validation/index.ts:10-12`, and a garbage id surfaces as a DB lookup error
  rather than a clean `VALIDATION` payload.

- [x] [BUG] **KB-049 - Argon2 verification can throw instead of returning the
  generic login failure.** `src/platform/core/auth/login.ts:78` and
  `auth/account.ts:83` call `verify()` unwrapped; `@node-rs/argon2` throws on a
  hash string that is not valid PHC, and `password_hash` is free-form (the repo's
  own fixtures write `password_hash: "x"` at
  `platform-access.integration.test.ts:79,323`). A corrupt value escapes
  `performLogin` as a raw error that `runSafeAction` collapses to
  `{ kind: "INTERNAL" }` instead of `LOGIN_FAILED` - a narrow enumeration oracle,
  and a misleading UX state where "your current password is incorrect" is
  expected. Fix: wrap `verify` and treat a throw as `verified = false`.

- [x] [BUG] **SF-15 - Project overview ships a phase's entire revision history,
  with every activity of every closed revision, on every render.**
  `src/apps/studioflow/phases/service.ts:638-644` selects all revisions with no
  `take` and none on nested `activities`, then projects every non-active
  revision's full activity list to the client (`:689-695`). Rendered inside
  collapsed `<details>` (`revision-history.tsx:23-41`) on a `force-dynamic` page.
  Unbounded in both dimensions and growing for the life of the phase. The visible
  summary needs only label, timestamps, and an activity count. Fix: return
  `_count` and load activities on demand.

- [x] [BUG] **SF-16 - Every project sub-page except the overview hung on
  "Memuat halaman" forever for a deleted/nonexistent project instead of
  showing a 404, and even the overview's `notFound()` had nowhere to render.**
  Found and fixed 2026-09-29 (R8.203) during a Codex-work verification pass.
  Two compounding causes: (1) `src/app/(platform)/studioflow/projects/[projectId]/{mom,schedule,presentation,presentation/[boardId],history}/page.tsx`
  each fetched `getProject` (and, for the board page, `getBoard`) with no
  `.catch()` converting `AppError({kind:"NOT_FOUND"})` into `notFound()` — the
  established pattern already used correctly by `layout.tsx`'s two Suspense
  sub-components (`ProjectRailMeta`, `ProjectContextBar`) and by `page.tsx`
  itself. An unconverted `NOT_FOUND` just rejected the page's data promise,
  which Next surfaces as the nearest `error.tsx`/an infinite loading state
  under `force-dynamic`, not a 404. (2) Even where `notFound()` WAS already
  being called correctly (layout.tsx, and `page.tsx` once fixed), no
  `not-found.tsx` existed anywhere in the app — `src/app/(platform)/` had
  none — so a correct `notFound()` call had no boundary to render into.
  Fixed: added `src/app/(platform)/not-found.tsx` (mirrors the existing
  `error.tsx`'s branded `ErrorState` styling) and applied the
  `.catch((error) => { if (error instanceof AppError && error.kind ===
  "NOT_FOUND") notFound(); throw error; })` conversion to all five remaining
  sibling pages. Verified live for all six routes (overview, mom, schedule,
  presentation, presentation/[boardId], history) via browser screenshot
  against a nonexistent project id — each now renders the branded "Halaman
  tidak ditemukan" page instead of hanging. (Note for future verification of
  this route family: `get_page_text`/`read_page` returned stale/incorrect DOM
  state for this exact bug in this session — screenshots were the only
  reliable check.)

- [x] [BUG] **KB-056 - Archive-retention purge never touched Presentation
  slides, so the owner-approved "files removed after 90 days" promise
  (Decision gates, 2026-09-28) was false for one asset type.** Found and fixed
  2026-09-29 (R8.203). `src/apps/studioflow/projects/asset-retention.ts`'s
  `purgeExpiredArchivedAssets` deleted/cleared `sfDeliverable`, `sfMomImage`,
  `sfScheduleOption.image_key`, and MOM snapshot image references, but never
  queried or deleted `sfPresentationSlide` rows (added later, R8.194, and the
  purge was never updated to match). Consequence: a slide's `image_key`
  (`String @unique`, not nullable) stayed referenced in the DB forever, so
  `removeUnreferenced`'s shared-key safety check correctly refused to ever
  delete the underlying blob either - a silent, permanent storage leak that
  contradicted the UI/owner-facing claim that an archived project's files are
  gone. Fixed: the purge transaction now also collects slide `image_key`s
  into the same candidate-blob set and `deleteMany`s the project's
  `sfPresentationSlide` rows (their `SfPresentationAnnotation` children cascade
  at the DB level); boards themselves are kept, matching the existing
  pattern where MOM's `document`/`item` rows and Schedule's `option` rows
  survive their images being cleared. New `presentationSlides` field added to
  the purge summary/audit metadata. Regression test added:
  "purges presentation slides and their images too, deleting the row not just
  the key" (`service.integration.test.ts`).

- [x] [BUG] **KB-057 - Master Data's sample-request queue computes the
  cross-app reconciliation signal but never shows it to staff.** Found and
  fixed 2026-09-29 (R8.203). `sample-request-coordinator.ts` has always
  computed `sourceStatus` (StudioFlow's live status for the source request:
  `"REQUESTED" | "RECEIVED" | null`) alongside Master Data's own `state`, and
  it is exercised by `sample-request-coordinator.test.ts` (the "gone"/"arrived"
  cases: `state: "IN_PROGRESS"`, `sourceStatus: "RECEIVED"`), but
  `sample-request-directory.tsx` never read the field. Consequence: when a
  designer marks a sample received directly in StudioFlow (or the source
  request otherwise moves on) while Master Data staff are still mid-quote on
  it, staff had no signal and could keep pricing a sample that is already
  resolved. Fixed: added an `alreadyReceived(row)` helper
  (`state === "IN_PROGRESS" && sourceStatus === "RECEIVED"`) that renders a
  second "Already received" `StatusBadge` next to the row's normal status in
  the table, and a warning line in the row detail dialog. No change to the
  coordinator or its data contract - UI-only, reading a field that was already
  correct and already tested.

- [x] [BUG] **KB-058 - No visual signal when continuing a private-messenger
  conversation with a deactivated user.** Found and fixed 2026-09-29 (R8.203).
  `MessengerConversationSummary.otherUser.active` has always been computed
  (`platform/core/messenger/index.ts:197`, `other?.status === "ACTIVE"`) but
  neither `messenger-client.tsx` (full `/messenger` page) nor
  `quick-messenger.tsx` (topbar popup, added R8.198-201) rendered it -
  `sendMessage` itself does not check the recipient's status for an existing
  conversation either, so staff could keep writing to someone who can no
  longer sign in with no indication. Fixed (UI-only, both surfaces): the full
  messenger's conversation list and open-conversation header now show a
  neutral "Deactivated" `StatusBadge`; the compact popup (tighter width, chip
  list) shows a small dot marker plus a native tooltip on the conversation
  chip and "(Deactivated)" text in the panel header. Sending itself is left
  unchanged - whether an existing conversation should still allow new
  messages to a deactivated account is a product decision, not part of this
  fix.

- [x] [CLEANUP] **KB-059 - `cleanupExpiredAttachments` (messenger) has zero
  callers outside its own test.** Found 2026-09-29 (R8.203), not fixed.
  `platform/core/messenger/index.ts:286` is only ever invoked by
  `messenger.integration.test.ts:83`. Not a correctness bug -
  `resolveAttachment` and `buildMessageView` both independently gate on
  `expires_at`/`purged_at`, so an unpurged expired attachment is already
  correctly treated as unavailable everywhere it is read - but the underlying
  30-minute-TTL storage blob is never actually deleted, a slow leak.
  `PLAN.md:79` (WO-PLATFORM-MESSENGER-02, locked) is explicit: "Do not add
  background job infrastructure. Cleanup is exposed as a bounded
  service/action and may be run manually or opportunistically" - so wiring it
  into the existing `startAssetSweep`-style timer (`instrumentation.ts`) would
  cross that decision, not honor it. Left undecided rather than invented:
  needs an owner/Lead call on the actual opportunistic trigger (e.g. called
  from `sendMessage` every Nth send, or from `readConversation`, or left as a
  manual admin action) before an Executor should wire one in.

  **Fixed 2026-09-29 (R8.205).** The owner chose a future always-on local PC,
  so cleanup is now a bounded short-lived command (`npm run cleanup:messenger`)
  intended for one daily Windows Task Scheduler task. It does not depend on a
  browser session or `next dev`, and the operational runbook records the setup.

### Closed 2026-09-29 (R8.196)

- **SF-12** Today scope controls are links styled with `filterChipClasses`, not
  buttons inside links. Browser-verified in R8.196: keyboard activation moves
  between `scope=all` and the default scope, exactly one current link is exposed,
  and neither link contains a button.

### Closed 2026-09-28 (R8.173 Backend Executor, R8.174 Lead)

- **KB-042** hash outside the transaction, **KB-048** role id validated, **KB-049** a corrupt
  hash is a failed verification (the original "login calls argon2 directly" detail was wrong:
  `login.ts` already routes through `verifyPassword`), **KB-044** direct
  `runSerializableTransaction` tests plus a concurrent project-numbering test. R8.173
  (`5e036ae`); reviewed and independently re-run by the Lead (548/548). The new password and
  role-action tests were run against the pre-fix code and fail there.
- **SF-08** a typed project number that differs from `project_code` is rejected
  (`PROJECT_CODE_IMMUTABLE`), R8.173; the edit dialog now shows the stored number instead of
  slicing the name, R8.174.
- **SF-09** batched blocker and open-item counts, **SF-10** bounded header quick-search,
  **SF-15** revision history returns counts and loads items on demand. R8.173. Their browser
  checks are queued in `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md` (PENDING, batch pass).
- **KB-025** `masterdata/services/index.ts` had no importer at all, so it was dead code, not an
  over-wide barrel: deleted, R8.174.
- **KB-047** `listAssignableRoles` now returns `appIds` (which apps a role covers) instead of the
  full permission list; the Users picker is unchanged. The full matrix stays behind
  `platform.role.read`. R8.174 (owner asked the Lead to decide, 2026-09-28).
- **KB-037a / KB-037b** closed as **accepted by the owner, no change** (2026-09-28): the
  composition root may import an app's `runtime`, and `(platform)/layout.tsx` may import each
  app's nav from its route lane. The boundary checker already allows exactly these layers.
- The R8.163 ledger gap was backfilled by the remote R8.164 work.

### Working-tree debris (not a repo defect - owner call)

15 untracked `.fuse_hidden*` files sit inside route directories, up to 45 KB,
containing real component source (one begins `"use client"`). They are
filesystem/sync artifacts, not importable by the `@/` alias or the Next router,
and per KB-053 both checkers cannot see them. Plus a `nul` file at the repo root
(a reserved Windows device name). Untracked, so they do not affect Git parity -
but they will mislead the next reader or agent.

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
