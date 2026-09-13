# Product Roadmap by Application

Status: active planning ledger, reconciled through R8.24 on 2026-09-13.

This file answers **what remains to be built**. It does not activate work by
itself. Completed items are struck through or removed only after verification
and must remain recorded in `CHANGELOG.md`. Bugs belong in [`knownbug.md`](knownbug.md), not here. Implemented-but-
unverified work belongs in [`review.md`](review.md), not here.

## Active rebuild program

The Project Rebuild Foundation Reference dated 2026-09-12 governs shared
ownership. Master Data and BQ remain canonical and behaviorally unchanged. The
current StudioFlow implementation stays frozen except for security/data-
integrity fixes and narrow Foundation compatibility.

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
7. **SF-A through SF-F — StudioFlow recovery implementation and cutover.**
8. **SF-G — Workflow Optimization vNext**, only after parity is accepted.

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
- [ ] **F-B / PF-2+PF-3 — Application ownership and navigation:** Give each app
  one canonical permission vocabulary, registration, route helpers, and
  navigation definition; central composition only imports public metadata.
  Preserve route behavior and do not perform the StudioFlow route redesign yet.
  Do not create a plugin or route framework.
- [ ] **F-C / PF-4+PF-5 — Settings, Appearance, and UI Engine:** Keep Platform
  General Settings narrow; add only typed global appearance settings; clarify
  app-owned settings; and stabilize the shell, layouts, primitives,
  interactions, and token API against Master Data, BQ, frozen RB StudioFlow,
  and D-SF evidence. Add only generic layouts with proven consumers.
- [ ] **F-D / PF-6+PF-7 — Utility curation and boundaries:** Consolidate only
  domain-neutral utilities with real consumers, then enforce Core purity,
  public cross-app reads, permission SSOT, app route ownership, UI Engine
  ownership, and prohibited duplicate primitives. Record stable Master Data/BQ
  convergence opportunities rather than changing their behavior silently.
- [ ] **F-E / PF-8 — Foundation acceptance and freeze:** Run the complete
  repository gates plus Master Data/BQ browser smoke, resolve findings as one
  correction pass, document the accepted Foundation baseline, and only then
  release StudioFlow implementation.

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

## StudioFlow Recovery

The recovery reference dated 2026-09-12 is the product baseline. Existing RB
StudioFlow is evidence and a temporary runtime, not the destination. Its 111 KB
service is not refactored as a standalone task; replacement modules acquire
clean ownership while each capability is recovered.

### Discovery gate before Foundation freeze

- [ ] **D-SF — Full extraction and recovery contract:** After the owner supplies
  the exact legacy checkout path for this home session, inspect only pinned
  commit `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`. Produce and ratify the
  capability, route, settings, permission, persistence/ownership, and shared-
  capability matrices. Classify every meaningful behavior as KEEP, MERGE,
  ALREADY_REPLACED, REDESIGN, PURGE, or DECISION_REQUIRED.

  D-SF also locks the canonical `/studioflow/projects/...` hierarchy,
  compatibility redirects, project-owned Product Catalogue, settings
  ownership, cross-app reads, and the specific generic UI/utility pressure that
  F-C/F-D must satisfy. Resolve Upcoming, Database Settings, project live/chat,
  MOM behavior, and existing global catalogue data treatment with the owner.
  D-SF is read-only discovery and documentation; it creates no production code,
  schema, placeholder route, or dependency.

### Implementation after F-E Foundation acceptance

- [ ] **SF-A — Daily work and project operations:** Build the modular
  StudioFlow backbone and canonical routes for home/general todos, activity,
  projects, clients, project lifecycle/archive, project detail, phase
  navigation, phase administration, project todos, and StudioFlow-owned phase/
  project-engine settings. Preserve accepted behavior, implement ratified
  parity gaps such as KB-016/KB-017/KB-018/KB-023, use controlled redirects,
  and cut over these routes together.
- [ ] **SF-B — Delivery and client collaboration:** Recover deliverables/files,
  iterations and revision provenance, send/withdraw, draft client answers,
  corrected-answer chains, phase consequences, activity/history, permissions,
  audit, error recovery, and relevant retention behavior as one end-to-end
  production workflow. This absorbs KB-013 through KB-015 and any ratified
  replacement for the frozen simplified workflow.
- [ ] **SF-C — Project records and discovery:** Re-anchor MOM to the audited
  owner workflow; correct Product Catalogue to project ownership including an
  explicit disposition for existing global rows; preserve useful Library/
  discovery behavior; and cut over their project/global routes. Resolve KB-012,
  KB-021, and KB-022 together only where the ratified model says they interact;
  do not retain the incorrect global reuse-pool premise.
- [ ] **SF-D — Product Schedule / FF&E:** Restore the complete project-owned
  Schedule capability, its catalogue snapshots/options/lifecycle/templates,
  Schedule-owned settings, permissions, history, and browser workflow. Keep it
  separate because its domain and migration can be accepted or rolled back
  independently from the other project-record modules.
- [ ] **SF-E — SketchUp and external integration:** Implement only the ratified
  SketchUp capability through an authenticated, idempotent adapter with retry,
  observability, reconciliation, safe failure, and no legacy runtime/database
  dependency. Keep this separate because external integration and operational
  recovery form their own security and rollback boundary.
- [ ] **SF-F — Parity cutover and frozen-code purge:** Prove every classified
  route/capability, Master Data/BQ non-regression, migrations, permissions,
  persistence, audit/history, error states, and real browser workflows. Remove
  the frozen StudioFlow service/routes/contracts only after no live consumer
  remains. Record every remaining deviation as an explicit owner decision and
  freeze the recovered StudioFlow baseline.
- [ ] **SF-G — Workflow Optimization vNext:** After SF-F PASS, compare recovered
  parity, the frozen RB todo/phase/deliverable ideas, and the owner's current
  daily workflow. Only then simplify clicks, transitions, and information
  architecture deliberately. Reassess the Overview/Operational Catalog and any
  Library crawler here; a crawler requires separate legal, security, source-
  permission, failure, and deterministic-fallback decisions.

Each milestone normally targets one implementation commit. When review finds
material defects, bundle all related findings into one correction prompt and
commit per review pass. Progressive compatibility redirects and route cutovers
occur inside the owning milestone; SF-F is verification and dead-code removal,
not a giant last-minute replacement.

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
