# Product Roadmap by Application

Status: active planning ledger, reconciled through R8.10 on 2026-09-12.

This file answers **what remains to be built**. It does not activate work by
itself. Completed items are struck through or removed only after verification
and must remain recorded in `CHANGELOG.md`. Bugs belong in [`knownbug.md`](knownbug.md), not here. Implemented-but-
unverified work belongs in [`review.md`](review.md), not here.

## Mandatory Architectural & Enforcement Refactoring (Prerequisite for StudioFlow Continuation)

- [ ] **Decompose Master Data God-Service:** Refactor `src/apps/masterdata/service.ts` (~214 KB) into focused domain use-case service modules (`services/brand.service.ts`, `services/vendor.service.ts`, `services/pricing.service.ts`, `services/sku.service.ts`, `services/unit.service.ts`, `services/category.service.ts`, `services/supplier-category.service.ts`, `services/deletion.service.ts`).
- [ ] **Decompose BQ & StudioFlow God-Services:** Apply the same use-case modularization pattern to growing service modules in BQ (`src/apps/bq/service.ts`) and StudioFlow (`src/apps/studioflow/service.ts`).
- [ ] **Strict Cross-App Surface Isolation:** Enforce `src/apps/<app>/public/index.ts` as the sole public surface for cross-app reads and integrations across Master Data, BQ, and StudioFlow.
- [ ] **Enforceable UI Engine Boundary Checker:** Upgrade automated boundary checker tooling (`scripts/check-boundaries.mjs`) to detect and fail on ad-hoc app-local visual primitives, unapproved styling patterns, or private wrapper components that bypass canonical UI Engine exports.
- [ ] **StudioFlow Continuation Gate:** Pause further StudioFlow feature development until service modularization and UI Engine enforcement rules are fully implemented and verified.


## Platform Foundation

### Planned features

- [x] ~~Add configurable main-route settings.~~ Verified in R7.56: persistence,
  permission-aware redirects, default/stale preferences, read-only controls,
  and desktop/narrow browser saves. Evidence and limits: `CHANGELOG.md`.
- [ ] Execute [`PLATFORM-ASSET-STORAGE-ROADMAP.md`](apps/platform/PLATFORM-ASSET-STORAGE-ROADMAP.md):
  storage port/test seam, provider adapter, Brand mark migration, then approved
  future consumers.

### Decision gates

- [ ] Decide StudioFlow `STORED`-asset retention before storage bytes ship.
- [ ] Decide Google Drive activation, account ownership, and production egress.

## UI Engine and Shared Utilities

- [x] Replace StudioFlow-local drag/drop with one canonical `FileDropZone`
  export, shared tests, and the StudioFlow deliverable consumer (KB-011).
- [ ] Redesign the top-header/sidebar boundary using the approved Claude design
  artifact for direction; preserve the approved semantic colors.
- [x] Add one canonical image workspace for the approved MOM consumer (R7.52):
  picker, preview, crop, zoom/pan, annotation, validation, progress, and errors.
- [x] Connect the canonical rich-text editor to MOM (R7.52).
- [x] Audit canonical date/time and project/client lookup controls across
  activated consumers. See
  [`apps/ui-engine/date-time-lookup-audit-2026-09-10.md`](apps/ui-engine/date-time-lookup-audit-2026-09-10.md).
- [x] Consolidate the three separate hand-rolled `Intl.DateTimeFormat` call
  sites found in Master Data, BQ, and StudioFlow behind the canonical
  `FormattedInstant` UI Engine component, per the audit's Finding 1. R8.05.

## Master Data

- [ ] Define media/file behavior after shared storage exists.
- [ ] Define the physical Samples workflow.
- [ ] Define workbook import/export policy and error reporting.
- [ ] Keep StudioFlow Brands/Library discovery read-only through the Master
  Data public Brand port; this is StudioFlow's only Master Data read. Product
  Catalogue remains independently StudioFlow-owned.

## BQ

- [ ] Add a safe calculator expression input such as `=15000*3` or
  `0.5*80000`, with exact decimal parsing and no arbitrary code execution.
- [ ] Decide the smallest reusable exact-decimal arithmetic extension while
  keeping BQ formula and rounding policy app-owned.
- [ ] Add Quotation PDF output and Terms & Conditions.
- [ ] Add price modes such as TBC and By Owner.
- [ ] Add Rate Library after sufficient project-line evidence exists.
- [ ] Add revision/version comparison between BQ snapshots.
- [ ] Define formal StudioFlow linking through a stable external reference.

## StudioFlow

### Project workflow

- [x] Put current-deliverable summary and intake directly inside each phase;
  retain the File page only as a project-wide filing view. R7.48.
- [x] Present project-owned to-dos and phase deliverables as one coherent work
  surface without adding a second task entity. R7.50.
- [x] Demote Start Round/internal approval/send controls to contextual or
  administrative actions after deliverable intake is proven end-to-end. R7.50.
- [ ] Complete the client answer against project contract §6: replacement chain
  with reasons, draft answers, and withdraw send (KB-013, KB-014, KB-015). One
  migration and one slice; these are the largest remaining contract gap.
- [ ] Add project archive and restore, and let a client become archivable once
  its projects are (KB-016).
- [ ] Add studio phase-template administration and per-project add/remove of a
  phase, so a new phase stops requiring a seed change (KB-017).
- [ ] Open a MOM correction as an editable draft instead of issuing a copy
  (KB-012).
- [x] Finish English-only UI copy across every route and state (KB-006).
- [x] Restore Add Project parity after read-only legacy audit, including
  in-context client creation (KB-005).
- [x] Rebuild the useful legacy Settings structure after audit (KB-007),
  excluding Database Settings until its backend contract exists.

### Project extensions

- [x] Integrate project-owned MOM at every phase with no Task/To-do, phase, or
  iteration linkage. Preserve the legacy ordered document/block/point/image
  capability and reuse the canonical rich-text and image tools. R7.52.
- [x] ~~Integrate the StudioFlow-owned Product Catalogue reuse pool shared across
  StudioFlow projects. Never read Master Data SKU, unit, or pricing. R7.53.~~
  **⚠ KB-021: implemented as global pool; owner requires per-project scoping.
  This item is re-opened — see correction item below.**
- [ ] **Correct Product Catalogue to per-project scoping (KB-021):** migration
  adding `project_id` FK to `SfProductCatalogue`, contract revision, route
  restructure to `/studioflow/[id]/catalogue`, and a data migration plan for
  existing global records. All Schedule work is blocked on this.
- [ ] **Re-anchor MOM requirements against legacy behavior** before resuming any
  MOM work or KB-012 (KB-022). Owner confirmation required first.
- [ ] **Restore general project todos to the StudioFlow home page** in a form
  matching legacy presentation (KB-023). Confirm exact page with owner.
- [ ] Add the project Schedule/FFNI slice on top of that reuse pool: entries,
  competing options, one entry lifecycle, templates that carry filled
  specifications, and project snapshots that later catalogue edits never
  rewrite (KB-003, schedule contract §4–§5).
- [ ] Complete legacy-audit phases for artifacts/MOM, schedule, SketchUp, and
  operational hardening before each related slice.
- [ ] Rebuild SketchUp only as an authenticated, idempotent adapter with retry,
  observability, and reconciliation.

### Discovery and automation

- [ ] Revamp Overview / Operational Catalog after its daily hierarchy is locked.
- [ ] Explore a safe Library crawler that uses approved Master Data websites to
  retrieve representative logo/image metadata, with legal/technical checks and
  a deterministic fallback.
- [ ] **Parked 2026-09-10 (owner instruction) — held until Platform routing,
  UI Engine, and BQ land; see `README.md`'s Active sequence.** Explore opt-in,
  auditable, reversible AI file organization that never silently changes
  filing state.

### Lifecycle and release decisions

- [ ] Decide project archival and retention beyond metadata-only files.
- [ ] Decide whether contracts merge to `main` or stay on the StudioFlow branch
  until the application release gate.

## Completed or explicitly removed

- ~~Project-owned MOM with draft/issue/supersede lifecycle and images.~~ R7.52.
- ~~StudioFlow-owned Product Catalogue reuse pool.~~ R7.53.
- ~~Unsupported Project `type` field.~~ Removed in R7.54; it was never in the
  audited legacy workflow.
- ~~Global Library MVP with hashtag, brand, category, and resource links.~~ R7.40.
- ~~My Activity / What's Today aggregation.~~ Implemented before R7.40.
- ~~Project list/detail, add task, phase management, and phase-scoped to-dos.~~
- ~~Deliverable intake opens/reuses a draft and replaces the prior unsent current
  record.~~ R7.40; storage-byte release remains deferred.
- ~~BQ override Revert and Updated-date visibility.~~ R7.40.
- ~~Explorer-style folder viewer.~~ Removed from scope; foldering is metadata only.

## Rules

- Do not create code, schema, dependencies, empty modules, or placeholder routes
  merely because an item appears here.
- Every completed item needs end-to-end evidence and a changelog entry before it
  is removed or struck through.
- Every discovered but unfixed defect goes to [`knownbug.md`](knownbug.md).
- Shared capabilities require one canonical implementation, public export,
  named consumers, boundary checks, and cross-consumer regression evidence.
