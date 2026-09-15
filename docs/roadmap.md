# Product Roadmap by Application

Status: active planning ledger, reconciled through R8.71 on 2026-09-15.

This file answers **what remains to be built**. It does not activate work by
itself. Completed items are struck through or removed only after verification
and must remain recorded in `CHANGELOG.md`. Bugs belong in [`knownbug.md`](knownbug.md), not here. Implemented-but-
unverified work belongs in [`review.md`](review.md), not here.

## Active rebuild program

The Project Rebuild Foundation Reference dated 2026-09-12 governs shared
ownership. Master Data and BQ remain canonical and behaviorally unchanged. The
rebuild StudioFlow implementation is archived by SF-R1 and replaced by the
legacy rework.

One exception resolves a sequencing deadlock in the two references: read-only
StudioFlow recovery discovery occurs before the final UI Engine and utility
Foundation passes because those passes require mature StudioFlow evidence.
Discovery changes no application code and does not open StudioFlow feature
development. Recovery implementation still begins only after Foundation freeze.

Normal sequence:

1. **F-A — Core and storage purity** (PF-1).
2. **F-B — Application ownership and navigation** (PF-2 + PF-3).
3. **D-SF — StudioFlow recovery discovery and contract** (R-SF1 + R-SF2;
   read-only evidence and owner decisions only).
4. **F-C — Settings, Appearance, and UI Engine** (PF-4 + PF-5), informed by
   D-SF rather than an incomplete StudioFlow abstraction.
5. **F-D — Shared utility curation and executable boundaries** (PF-6 + PF-7).
6. **F-E — Foundation acceptance and freeze** (PF-8).
7. **SF-R1 through SF-RF — StudioFlow legacy rework** (replaces SF-A…SF-H,
   owner direction 2026-09-15).

Each item above is one coherent Executor outcome by default. Split only for a
real owner decision, external dependency, migration/security/rollback boundary,
independently useful outcome, or demonstrated context/tool limit.

## Foundation execution

- [x] ~~**PF-0 / Freeze:** Pin the RB foundation and legacy evidence baselines
  and freeze normal StudioFlow continuation.~~ Implemented in R8.18 and
  accepted after correction review in R8.21. See
  [`FOUNDATION-BASELINE-FREEZE.md`](FOUNDATION-BASELINE-FREEZE.md).
- [x] ~~**F-A / PF-1 — Core and storage purity:** Move the provider adapter out
  of Core, return MOM policy to StudioFlow, and migrate Platform Brand mark
  bytes to object storage.~~ Accepted in R8.34 with local filesystem storage;
  Supabase remains deferred.
- [x] ~~**F-B / PF-2+PF-3 — Application ownership and navigation:** Give each
  app one canonical permission vocabulary, registration, route helpers, and
  navigation definition; central composition only imports public metadata.~~
  Accepted in R8.43 after registry/boot correction, full disposable-database
  integration evidence, and authenticated grant-filtered browser smoke for all
  three app roots. The unrelated Windows storage failure remains KB-030.
- [x] ~~**F-C / PF-4+PF-5 — Settings, Appearance, and UI Engine:** Keep Platform
  General Settings narrow; add only typed global appearance settings; clarify
  app-owned settings (including ratified StudioFlow workflow settings); and
  stabilize the shell, layouts, primitives, interactions, and token API against
  Master Data, BQ, frozen RB StudioFlow, and D-SF evidence. Add only generic
  layouts with proven consumers.~~ Accepted in R8.56: R8.53 implementation
  passed its automated gates, and Reviewer browser acceptance passed against
  the kantor fixture for authorized/unauthenticated settings access, persisted
  canonical Light appearance, desktop/375 px SettingsShell, and all three app
  entries.
- [x] ~~**F-D / PF-6+PF-7 — Utility curation and boundaries:** Consolidate only
  domain-neutral utilities with real consumers, then enforce Core purity,
  public cross-app reads, permission SSOT, app route ownership, UI Engine
  ownership, and prohibited duplicate primitives. Record stable Master Data/BQ
  convergence opportunities rather than changing their behavior silently.
  Implemented in R8.57 and accepted in R8.59 after automated boundary/full
  suite evidence and authenticated desktop/375 px Master Data and BQ browser
  smoke.~~
- [x] ~~**F-E / PF-8 — Foundation acceptance and freeze:** Run the complete
  repository gates plus Master Data/BQ browser smoke, resolve findings as one
  correction pass, document the accepted Foundation baseline, and only then
  release StudioFlow implementation. Accepted in R8.61 after R8.60 candidate
  automated evidence and authenticated desktop/375 px Master Data/BQ smoke.~~

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

- [ ] Decompose the BQ service as a separate architecture backlog. This is not
  a prerequisite or work item inside StudioFlow Recovery.
- [ ] Add a safe calculator expression input such as `=15000*3` or
  `0.5*80000`, with exact decimal parsing and no arbitrary code execution.
- [ ] Decide the smallest reusable exact-decimal arithmetic extension while
  keeping BQ formula and rounding policy app-owned.
- [ ] Add Quotation PDF output and Terms & Conditions.
- [ ] Add price modes such as TBC and By Owner.
- [ ] Add Rate Library after sufficient project-line evidence exists.
- [ ] Add revision/version comparison between BQ snapshots.
- [ ] Define formal StudioFlow linking through a stable external reference.

## StudioFlow Rework (owner direction 2026-09-15)

The rebuild StudioFlow of R7.xx–R8.69 diverged from how the studio works. The
owner replaced the SF-A…SF-H recovery sequence with a legacy-behavior rework
governed by
[`apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md`](apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md).
D-SF discovery stays as evidence. The previous SF-A plan (Requirements,
phase-template administration) is cancelled; R8.62–R8.69 are archived with the
rest of the rebuild StudioFlow.

### Wave 1

- [ ] **SF-R1 — Archive and legacy project backbone:** local archive tag,
  delete rebuild StudioFlow code/routes/schema, then port Client, Project
  (auto-naming, PIC designer/drafter), five-phase legacy workflow with
  revisions, activities, checklist with templates, Today, and StudioFlow
  settings. Implemented in R8.71; owner browser acceptance is deferred to the
  end of wave 1 (see `review.md`).
- [ ] **SF-R2 — MOM (legacy):** legacy document/item/point/image model,
  editing flow, and print on `ObjectStorage` and UI Engine. Closes KB-012 and
  KB-022 by replacing the ISSUED/SUPERSEDED lifecycle. Implemented in R8.72;
  owner acceptance deferred to the end of wave 1.
- [ ] **SF-R3 — Product Schedule (legacy):** entries/options/final approval,
  gapless codes, prefix dictionary, schedule templates and default entries,
  reuse from past projects, CSV import, typed snapshots, Master Data Brand read
  through the public port. Closes KB-003 and KB-021.

### Wave 2 (not activated)

- [ ] CD drawing list per CD phase.
- [ ] Deliverables/files per revision through `ObjectStorage` (retention and
  client-delivery decisions still open).
- [ ] Library / Brand discovery page (read-only Master Data port).
- [ ] Product requests and vendor follow-up (needs a Master Data write-port
  decision).
- [ ] Task comments and StudioFlow-global collaboration (D-SF-05).
- [ ] Upcoming / planning timeline (D-SF-01).
- [ ] SketchUp integration (D-SF-06).
- [ ] Optional phase accent palette (contract §13.8) — owner approval needed.

### Closing gate

- [ ] **SF-RF — Parity acceptance:** walk every wave-1 legacy flow at desktop
  and 375 px, remove the temporary `/projects/...` redirects, and freeze the
  reworked StudioFlow baseline.

## Historical implemented or removed evidence

These entries describe what the frozen RB implementation delivered. They do
not count as Recovery parity and may be replaced by SF-A through SF-F.

- ~~Project-owned MOM with draft/issue/supersede lifecycle and images.~~ R7.52;
  behavior must be re-anchored in D-SF/SF-C.
- ~~StudioFlow-owned global Product Catalogue reuse pool.~~ R7.53; ownership is
  known wrong and must become project-scoped in SF-C.
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
