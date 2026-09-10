# Product Roadmap by Application

Status: active planning ledger, reconciled through R7.44 on 2026-09-10.

This file answers **what remains to be built**. It does not activate work by
itself. Completed items are struck through or removed only after verification
and must remain recorded in `CHANGELOG.md`. Bugs belong in
[`knownbug.md`](knownbug.md), not here.

## Platform Foundation

### Planned features

- [ ] Add configurable main-route settings. Route eligible users to the selected
  main app and redirect users without access to an allowed landing page.
- [ ] Execute [`PLATFORM-ASSET-STORAGE-ROADMAP.md`](PLATFORM-ASSET-STORAGE-ROADMAP.md):
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
- [ ] Add one canonical image workspace when an approved consumer activates it:
  picker, preview, crop, zoom/pan, annotation, validation, progress, and errors.
- [ ] Connect the canonical rich-text editor to MOM when MOM is activated.
- [ ] Audit canonical date/time and project/client lookup controls across
  activated consumers.

## Master Data

- [ ] Define media/file behavior after shared storage exists.
- [ ] Define the physical Samples workflow.
- [ ] Define workbook import/export policy and error reporting.
- [ ] Keep StudioFlow Library access read-only through the Master Data public
  port; never add a StudioFlow write path or cross-schema foreign key.

## BQ

- [ ] Add a safe calculator expression input such as `=15000*3` or
  `0.5*80000`, with exact decimal parsing and no arbitrary code execution.
- [ ] Decide the smallest reusable exact-decimal arithmetic extension while
  keeping BQ formula and rounding policy app-owned.
- [ ] Add waste tracking (`waste = 1 - coefficient`).
- [ ] Add Quotation PDF output and Terms & Conditions.
- [ ] Add price modes such as TBC and By Owner.
- [ ] Add Rate Library after sufficient project-line evidence exists.
- [ ] Add revision/version comparison between BQ snapshots.
- [ ] Define formal StudioFlow linking through a stable external reference.

## StudioFlow

### Project workflow

- [ ] Put current-deliverable summary and intake directly inside each phase;
  retain the File page only as a project-wide filing view.
- [ ] Present project-owned to-dos and phase deliverables as one coherent work
  surface without adding a second task entity.
- [ ] Demote Start Round/internal approval/send controls to contextual or
  administrative actions after deliverable intake is proven end-to-end.
- [x] Finish English-only UI copy across every route and state (KB-006).
- [x] Restore Add Project parity after read-only legacy audit, including
  in-context client creation (KB-005).
- [x] Rebuild the useful legacy Settings structure after audit (KB-007),
  excluding Database Settings until its backend contract exists.

### Project extensions

- [ ] Integrate MOM after deciding whether action items create project `Task`
  records.
- [ ] Integrate Product Catalogue/FFNI/Schedule after deciding entry scope,
  client option semantics, and position identity.
- [ ] Complete legacy-audit phases for artifacts/MOM, schedule, SketchUp, and
  operational hardening before each related slice.
- [ ] Rebuild SketchUp only as an authenticated, idempotent adapter with retry,
  observability, and reconciliation.

### Discovery and automation

- [ ] Revamp Overview / Operational Catalog after its daily hierarchy is locked.
- [ ] Explore a safe Library crawler that uses approved Master Data websites to
  retrieve representative logo/image metadata, with legal/technical checks and
  a deterministic fallback.
- [ ] Explore opt-in, auditable, reversible AI file organization that never
  silently changes filing state.

### Lifecycle and release decisions

- [ ] Decide project archival and retention beyond metadata-only files.
- [ ] Decide whether contracts merge to `main` or stay on the StudioFlow branch
  until the application release gate.

## Completed or explicitly removed

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
