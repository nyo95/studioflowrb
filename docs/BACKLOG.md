# Backlog

Status: open items only, reconciled with the code on 2026-10-06 (R8.349).
Closed items and their narratives up to that date are in
`archive/backlog-2026-10-06.md`; `CHANGELOG.md` is the record of what shipped.
Browser checks still to walk live in `agent/BROWSER-ACCEPTANCE-BACKLOG.md`.

Tags:

- **[PLANNED]** — approved or likely work, not built.
- **[UNVERIFIED]** — built and tested, still to walk on real data or in the browser.
- **[BUG]** — a reproducible defect against a contract or correct business logic.
- **[CLEANUP]** — dead code or doc drift; not a behavioral defect on its own.
- **[BLOCKED]** — waits on a named owner decision. Never guess the answer: ask
  the owner, then turn it into `[PLANNED]` or a `PLAN.md` slice.

Rules: nothing here authorizes code on its own. An item leaves this file when
it ships or is verified — record the evidence in `CHANGELOG.md` and delete the
entry, do not mark it done in place. A new defect is fixed at once when safe and
scoped; otherwise it is added here as `[BUG]` with what was observed.

## Standing decisions

- Google Drive storage: deferred; files stay on the local storage root.
- Master Data workbook import/export (owner, 2026-09-28): edit in Excel and
  re-import with a preview, all-or-nothing apply, a per-row error report, and
  unknown vendors/units/categories rejected rather than created.
- Sample requests (owner delegated to the Lead, 2026-09-29): Master Data's
  "priced" never flips StudioFlow's `RECEIVED`; version one records the quote
  and links ids but does not create the SKU or price. **Changed by the owner
  2026-10-07:** putting a requested sample on the shelf in Master Data does mark
  the StudioFlow request received (WO-MD-SAMPLE-01); "priced" still does not.
- Platform Owner force delete (owner, 2026-10-20): the Platform Owner can
  permanently delete everything, and the delete removes linked data (a trash bin
  and delete-only-when-unused were declined). Lockout guards stay (no self-delete,
  not the last Platform Owner). Deleting a user removes only their personal data;
  the business work they authored is kept under their name.

## Platform Foundation

- [ ] [UNVERIFIED] WO-PLATFORM-FORCE-DELETE-01 (R9.165): Platform Owner deletes a user permanently. Browser walk still owed: Users → ⋯ → Delete permanently on a test user, wrong name refused, your own row has no Delete, a project/BQ the user created still opens and names them or shows "Deleted user".
- [ ] [PLANNED] Platform Owner force delete, later slices (one plan per module, each with its cascade spelled out for the owner before READY): roles; StudioFlow clients and projects (today archive only); Master Data units, categories, vendors, brands, SKUs, prices (today archive or the approval-based deletion request, and many `Restrict` links, e.g. a unit used by SKUs); BQ projects (today a deletion request). BQ library, StudioFlow templates/MOM/schedule items and samples already have delete.

- [ ] [PLANNED] WO-DEVELOPER-02 updates from GitHub releases: the console shows "version X available", **Install** backs up the database, installs, migrates, rebuilds, restarts, and rolls back on failure (owner 2026-10-10, D10). It must refuse an older application over a newer database; rollback restores the pre-upgrade backup together with its code and never trusts the display-only `module_state.last_version`. Needs first: how the office server runs the app (manual `npm run start`, a Windows service, pm2, ...) and the release format.
- [ ] [UNVERIFIED] Add item "From a past project" (R8.458): the search box, the empty result and the toggle were walked in the browser on the local database, which has one project, so no hit could be chosen. Still to walk with two projects: pick a hit (section and category switch to the hit's, the product shows as a summary, Remove returns to the normal fields), Save creates the item and copies the product with its photo and notes, and a failure after the item is created leaves the item without the copy.

### Companion apps and integrations (owner, 2026-10-09: Codex builds them in isolation)

Harness: `agent/EXTENSIONS.md`. Foundation: `apps/platform/INTEGRATIONS.md`.
Order matters; each item is its own Work Order.

- [ ] [UNVERIFIED][P0] WO-SCHEDULE-ASSISTANT-02 (R9.174) guardrails: in a new Claude or Codex session say "susun jadwal untuk Sociolla"; the assistant asks which project and what to add before any preview; after the preview, applying shows the bridge dialog "Ya, terapkan" (Claude/Codex); untick or decline saves nothing; asking it to apply without a preview is refused.
- [ ] [UNVERIFIED][P0] WO-SCHEDULE-ASSISTANT-01 (R9.167): Product Schedule Composer MCP built and server/bridge tests pass. Kantor dev (R9.172): module on, token created, Claude desktop configured, bridge smoke read + preview OK over HTTP. Still owed: switch the module on, create a token with both Schedule Assistant scopes, connect Claude Code, Codex, OpenCode and Gemini CLI with `tools/schedule-assistant-mcp/README.md`, compose from a short brief in one client (preview shown, client asks before apply, Schedule screen shows the same codes, nothing final), and retry apply (replay, no duplicates).
- [ ] [PLANNED][P0] **Product Schedule Composer MCP (owner, 2026-10-22).** Built in
  R9.167 (`WO-SCHEDULE-ASSISTANT-01`, contract `docs/apps/schedule-assistant/CONTRACT.md`);
  remove this entry after the four-client walk above. Original proposal: build an
  independent, provider-neutral optional module (`schedule-assistant`, parent and
  required module `studioflow`, initially disabled) so Claude, Codex, OpenCode and
  Gemini can compose one project's Product Schedule from a written brief. One MCP
  bridge serves every client; local stdio is the first transport and it calls
  versioned StudioFlow integration routes with the existing personal `sfk_` token.
  StudioFlow stores no model-provider key and the module does not call an AI model.
  The required flow is **read context -> prepare and validate a complete draft ->
  show the user the proposed changes -> explicitly approved atomic apply -> read
  back the actual saved schedule**. V1 reads the current schedule, studio templates,
  category/prefix choices, active Master Data Brands and reusable options from past
  projects. An approved batch may apply templates and create or update entries and
  options; StudioFlow remains the authority for category spelling, code/prefix and
  increment allocation, Brand snapshots, Material/Fixture field rules, and option
  labels. A new option is never final merely because the agent created it.
  V1 deliberately excludes delete, final/unfinal decisions, sample actions, image
  upload, and global template/prefix changes. Use separate least-privilege read and
  write token scopes; derive actor identity and live grants only from the token;
  enforce assigned-team-or-manager project access and `studioflow.schedule.manage`;
  audit every write; require one stable operation id; and commit the schedule batch,
  integration idempotency result and audit in one transaction. The read contract
  returns a bounded schedule DTO without signed image URLs or unrelated private
  project data. No direct Prisma or StudioFlow-internal import is allowed.
  **Lead must settle before a READY Work Order:** (1) the exact MCP tool names and
  batch wire schema; (2) whether V1 may update existing entries/options or is
  create-only (owner intent currently includes create + update); (3) whether template
  application is always an explicit draft operation; (4) the confirmation contract
  between validation and apply, including a digest so apply cannot differ from the
  reviewed draft; (5) treatment of a Brand/category from the brief that is not in
  current choices; (6) packaging/location of the standalone Node MCP bridge and its
  four client setup examples. Step 0 must add a narrow transaction-aware Schedule
  composer contract under StudioFlow's protected `public/` door; the extension may
  not expose the private schedule service. Acceptance must cover no-write validation,
  outsider and insufficient-scope refusal, archived/completed-project refusal,
  unknown Brand handling, Material/Fixture validation, rollback of a partially
  invalid batch, concurrent code allocation, exact idempotent replay, unchanged
  non-final semantics, and smoke connection from all four MCP clients. This KB item
  is the proposal for Claude to turn into a bounded READY Work Order; it authorizes
  no implementation by itself.
- [ ] [PLANNED][P3] Integration tokens, admin view: `platform.integration.admin` can list and revoke any
  token in the service (`listAny`, `revokeAny`) but there is no screen yet, and the list has no owner
  name. Add when a second person starts using tokens.
- [ ] [UNVERIFIED] Moodboard branch (R8.477): on the Ideas board a card's menu **Add to moodboard...**; in a note, open an image
  large and press **Add to moodboard**. Both land as the last slide of the project's Moodboard board on the Presentation tab
  (created the first time). Follow-up if wanted: a "Used in: <project> moodboard" label on the card (needs a small table),
  and a client-facing moodboard layout (owner said team-only for now).
- [ ] [UNVERIFIED] Phase page (R8.470, R8.471): the "Hide requirements & files" button gives the notes the full width and
  is remembered after a reload; in a note, open an image large: "Save to Ideas" shows a new card on the Ideas board with
  the note "From the notes of <project>"; "Use in schedule" adds a new item or an extra option in that project (a person
  who may not edit the schedule gets the refusal message). Next, if it works well: annotated images (pins and arrows with
  text) on note images; a free-layout canvas was judged too big for now.
- [ ] [UNVERIFIED] Token page on My preferences (R8.465): create (secret shown once, copy button),
  the list with Active/Expired/Revoked, Revoke; needs a user whose role has `platform.integration.manage`.
- [ ] [PLANNED][P2] SketchUp plugin, rev 2 (owner 2026-10-22): the Schedule allocates every code, materials link to
  the schedule item (not the code), the model never overwrites the Schedule, Wall Finish Labels stay independent,
  plugin source moves to `tools/sketchup-plugin/`. Plan: `docs/apps/sketchup/WO-SKETCHUP-01.md` (Stage 0 Lead,
  1a Executor, 1b Lead; Stage 2 model-check report is an outline). Rev 1 (legacy push sync, merge queue,
  convergence planner, staging tables) is superseded and will not be built.
  Follow-ups (owner 2026-10-22, second review): `WO-SKETCHUP-02` P0 link safety (stale links, reused
  codes, id-verified merge, interrupted creation, other-project links, token transport) and
  `WO-SKETCHUP-03` P1 option-aware links and names (PL-01 / PL-01-B), both in `docs/apps/sketchup/`.
- [ ] [CLEANUP] SketchUp plugin legacy code still loaded but unreachable from the menus:
  `core/api_client.rb`, `core/web_launcher.rb`, `core/csv_exporter.rb`, `ModelScanner`, the auto-sync and
  `MaterialOps.apply_pull_data`/`merge_materials`/`swap`; `SyncService.material_selected` writes a texture
  swatch to `ui/tmp` whenever the current material changes although nothing reads it (found in the
  2026-10-22 SketchUp review).
- [ ] [PLANNED][P3] Per-token rate limit for `/api/integrations/**` (none exists in
  Platform; do not invent one inside an extension).
- [ ] [PLANNED][P3] Chatbot / AI gateway: a provider-neutral port with the key in
  local env, tools limited to public read contracts and the asking user's grants,
  audited. Blocked on the owner choosing a provider and approving an SDK; see also
  the AI file filing entry (`[BLOCKED]`).
- [ ] [PLANNED][P3] Outbound webhooks / events for extensions: not built; add only
  when an extension proves the need (MODULE-BOUNDARIES: no events yet).

- [ ] [PLANNED] Asset storage: phases 1–4 of
  `apps/platform/PLATFORM-ASSET-STORAGE-ROADMAP.md` are delivered; future file
  consumers (Master Data media, sample photos) each need their own Work Order.
  Phase 5 (cloud profile) is parked.
- [ ] [PLANNED] Notifications: the in-app inbox exists (polling every 60 s,
  read notifications removed after 90 days). Email, push, preferences and
  digests are deferred. Private user-to-user messaging is separate.
- [ ] [PLANNED][P3] A browser geometry test for the UI Engine shell (rail
  states × 839/840/841 px × long content) inside `npm test` needs a browser
  test dependency, which needs an owner decision.
- [ ] [PLANNED][P3] Platform hardening from the 2026-10-02 external audit,
  owner call: a required CI (typecheck, boundaries, tests, build) once a remote
  runs it; PostgreSQL and file-storage backup with a restore drill on a clean
  machine; split `phases/service.ts` by responsibility.
- [ ] [PLANNED] Personal start page (owner approved, 2026-10-06): `UserPreference.start_page`
  is stored and validated but nothing applies it and My preferences does not
  offer it. Theme shipped in R8.374.
- [ ] [UNVERIFIED] Dark mode visual QA with real data: R8.374 walked the main
  screens on seed data only; brand logos with real crawled images (LogoFrame
  hairline on white and black logos), long tables, the Gantt timeline and
  the MOM/Presentation editors still need a pass in Dark. Focus rings use a
  fixed light-theme shadow colour (`rgb(87 83 78 / .12)`) that is nearly
  invisible in Dark; the focus border still shows.
- [ ] [PLANNED][P3] Lifecycle sweeps (deliverable expiry, archived-asset purge,
  cleanup-ledger retry) run on in-process boot timers. That fits the always-on
  PC with a local storage root; a serverless host would first need object
  storage off the local disk and then a real scheduled trigger. Parked until a
  hosting change is planned.
- [ ] [PLANNED] Lead verdict on `agent/reports/STORAGE-TUNNEL-DISCUSSION.md`
  (R8.485): storage folder as a setting and remote access; not yet turned
  into a READY plan.

- [ ] [PLANNED][P1] Installable modules (owner, 2026-10-09;
  `apps/platform/MODULES-DECISION.md`): M1 registry, switch and read-only
  Settings page shipped in R8.495-R8.500; next are M2 Ideas/Presentation
  coupling report, M3 Ideas then Presentation extracted to their own module
  and schema, and later M5 customer build profiles, release tags and installer.
  Signed entitlement was dropped on 2026-10-10.


- [ ] [CLEANUP][P3] Archive retention residual window (R8.516, accepted): the eligibility re-check before the Presentation purge hook and the hook's own delete are separate steps, so a restore landing in the few milliseconds between them can still lose that project's Presentation slides. Closing it fully needs a purge-in-progress marker that restore respects; not justified for one office unless restores during the daily sweep become common.

## UI Engine and Shared Utilities


- [ ] [PLANNED][P2] One `EntryGrid` pattern for the three Master Data entry
  grids (work-price table, material-price table, compare-suppliers grid) and an
  `Input textCase` admission with showcase and test (Lead, 2026-10-01). Needs
  its own plan.
- [ ] [PLANNED][P3] Deferred until a second app needs it: the StudioFlow undo
  bar is app-local. A second consumer of transient "saved · Undo" feedback
  should get one generic toast in the UI Engine instead of a copy.

## Master Data



- [ ] [UNVERIFIED] Sample shelf R8.386-R8.390, still open after the 2026-10-08 walk (passed on an isolated server: add a sample with a typed new rack, lend it to a person and a StudioFlow project, return it, the history of both steps, "Remove" disabled with "return it first" while it is out; StudioFlow request, Put on shelf from Sample requests, the designer's Schedule card reading "Sample received" and the requester's notification "Your sample is on the shelf: R3 / B9"): send to a client, mark lost, discard, the right-click menu, the list view and the filters, and the "Sample received" shelf note inside the option dialog.

- [ ] [UNVERIFIED] Quick "New SKU" (no price) from Add sample and Put on shelf
  (R8.391): type a name nobody has, create it, and it is selected; the SKU then
  shows on the SKU page without prices until one is added on Pricing.

- [ ] [UNVERIFIED] Text price labels (R8.298): typing and pasting quoted text
  in the compare-suppliers grid (needs two labor suppliers) and the material
  price table, and re-importing the company file with a labelled cell. A text
  price is not yet shown as text in the SKU list "from" line or the BQ picker
  (BQ reads amount 0).
- [ ] [UNVERIFIED] Supplier categories merged into categories (R8.262): saving
  a work price and seeing the supplier gain the category, creating a category
  inline from the Suppliers dialogs, "Show all categories", the "New for this
  supplier" hint, and a supplier with no categories.
- [ ] [PLANNED] Backend roadmap still open: WO-MD-SCALE-01 (pagination),
  WO-SCHEMA-HARDEN-01 (MD-AUD-012 and the BQ/StudioFlow FK indexes), the
  Signage sheet of the owner's workbook, SKU prices read from that file, and an
  optional one-off rewrite of names the capitalization rule would change.
- [ ] [PLANNED] Define media/file behavior on the shared storage.

## BQ

State on 2026-10-14 (audit and redesign, Lead + Executor; commits R8.543, R8.545-R8.549, R9.01-R9.03; none pushed). Memo and decisions below are the handoff for the next session.

- [ ] [UNVERIFIED] R9.171 supplier in the source picker: with the seed (`STUDIOFLOW_LOCATION=kantor npm run seed:dev-bq`, already run on the kantor dev DB) search "gypsum" in Add Cost Component or an Assembly's Tambah baris: two "Gypsum Board 9mm" rows show Sinar Gypsum (A) Rp 72.000 and Mitra Plafon (B) Rp 76.500; the Supplier filter narrows to one; the picked Assembly line notes "Supplier: …"; open the example Assembly "Gondola Sociolla (contoh)". Seed records carry the note "Data contoh BQ (seed R9.171)" for later removal.
- [ ] [UNVERIFIED] R9.170 WO-BQ-ASSEMBLY-SOURCE-01: BQ Library → Assemblies → open an assembly → Tambah baris opens the project source picker; pick a Master Data material, a labor price and a BQ Library item (lines show their source and price); Custom with "Simpan juga ke BQ Library" ticked appears on the Items tab; the Library icon on an existing Custom line does the same. Raise that Master Data price, apply the assembly to a Work Item (group and "+ Work Item" with assembly): the new price lands and Revert offers it; archive a source and apply again: a notice names the line that kept the assembly price. In a project, a Custom Cost Component's panel offers "Simpan ke BQ Library".
- [ ] [UNVERIFIED] R9.168 Add assembly feedback: BQ Library → Add assembly → the page lands on Assemblies with the new assembly's Cost Components open; closing it and reloading does not reopen it; "1 Cost Component" singular.
- [ ] [UNVERIFIED][P1] **Slice 3 UI wiring (R9.21).** Selection, grouping, server preview, price-change confirmation, same-place no-op, stale handling, returned-tree update, highlight, locked/archived hiding, and empty-group display are implemented with focused pure tests. The six owner-approved browser journeys are pending in `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md`; Reviewer acceptance closes this item.
- [ ] [UNVERIFIED][P1] Browser acceptance for everything since R8.543, on the owner's signed-in browser: markup 100 accepted and 1000 refused with a clear message; empty price blocks lock (TBC clears it), Rp0 locks with confirmation; readiness chips jump to the first row; "+ Work Item" with a new empty one and from an Assembly (lines land directly under it, name/quantity/unit as chosen); revert link restores the source price; "Save as Assembly" refused when the Work Item has Component Groups; Struktur panel shows from 1024 px with + Subsection / + Section and the narrow fallback; one "+ Work Item" per table; drag and arrow re-order of Work Items in the panel; a rejected deletion keeps the requester's reason.
- [ ] [PLANNED][P3] Owner decision D3 still open: revert for a Work Item's own (direct) price needs a stored baseline like Cost Components have (a schema change). Default recommendation: do it only after the estimator asks; the contract (K-18) covers Cost Components only.
- [ ] [CLEANUP][P3] The move preview describes the data at the time it was read; the move itself does not re-check the previewed numbers. Two people editing one Work Item can see a different "after" than they get. Acceptable for now; if it bites, return before/after from `moveLineItems` and let the screen compare.
- [ ] [CLEANUP][P3] On a locked project a foreign or stale id in a move answers "list changed" before "project is locked"; both refuse, only the message order differs.
- [ ] [PLANNED][P3] Left out on purpose: dragging Cost Components between groups, re-ordering Component Groups and Cost Components inside a group, moving rows to another Work Item, saving a Work Item that uses Component Groups as an Assembly (an assembly line has no group quantity or markup), duplicate-name check for Assemblies.
- [ ] [UNVERIFIED][P3] The standard quotation terms (R8.328: validity 30 days,
  50/40/10 payment, VAT excluded) are a Lead draft; the owner should read and
  correct them once. A project can already use its own terms.
- [ ] [PLANNED] From the 2026-10-02 external audit, waiting for the
  estimator's feedback before planning (verify each against the code first):
  baseline/revision history and snapshot comparison; explicit audit of price
  changes; Promotion Coordinator treating an infrastructure failure as an
  invalid reference; delete section/subsection with a cascade preview; reorder
  Sections/L1/L2/L3; one cell edit reloading the whole tree; stale responses on
  fast inline edits; lifecycle state out of sync between header, editor and
  buttons; source picker initial-search race; project list reading every tree
  (pagination, aggregates); fewer `any` and implicit transactions; XLSX output,
  a readiness indicator and currency on the estimate.
- [ ] [PLANNED][P3] BQ estimator audit (external, 2026-10-08, checked against the code; three findings were wrong, see CHANGELOG): "Recommended Items" can be made in a template and the Library but the project editor never shows them, so an estimator searches the whole catalogue again. Show a template's recommendations in the project's source picker (own small work order, after the estimator has used BQ for a real project).
- [ ] [PLANNED][P3] BQ and Excel (owner, 2026-10-08; confirmed 2026-10-14): do not build an importer or a paste for the estimator's own workbook; work from a workbook is converted by hand, and the BQ screen follows the workbook's columns (R9.41). XLSX *output* for the client stays in the list above, waiting for the estimator.
- [ ] [PLANNED] Rate Library after enough project-line evidence exists.
- [ ] [PLANNED] Formal StudioFlow linking through a stable external reference.

## StudioFlow

- [ ] [UNVERIFIED] R9.176 look-alike categories: Schedule → "+ New category", type "HPL" → "Mungkin maksud Anda: High Pressure Laminate PL" appears first and picking it codes PL-xx; typing a really new name still creates it. Import a sheet with "HPL/Plastic Laminate" → stops with the suggestion; tick "Kategori baru di file ini memang dimaksudkan" → imports. Sociolla SBZ HPL items now read PL-01…07 and the homogeneous tiles HT-01…03.
- [ ] [UNVERIFIED][P1] **Studio Manager Deliverable deletion corrected in R9.143.** A non-PIC Manager may remove a current phase file; upload stays PIC-scoped and no other phase edit authority is widened. Direct service authorization coverage passes; independent browser confirmation is pending in `BROWSER-ACCEPTANCE-BACKLOG.md`.
- [ ] [UNVERIFIED][P1] **Deliverables: one private file per phase and centralized project view implemented in R9.139/R9.141.** A new upload replaces the prior phase file; storage retains no versions, Final state or expiry state. The project tab lists phase files centrally, while the phase sidebar contains Requirements only. R9.161 moved the automated upload/replace/confirmed-delete/refusal browser journey to the Deliverables tab and it passes; R9.162 enforces assignment on the Deliverable read itself and hides Upload on phases without an open iteration. Owner acceptance on real data remains in `BROWSER-ACCEPTANCE-BACKLOG.md`.
- [ ] [UNVERIFIED][P1] **Automatic Design-Handover Timeline implemented in R9.152; Table milestones corrected in R9.162.** Nullable canonical Handover, backward working-day plan, real active-phase status, Platform Owner-only date writes and no-Handover fallback are built. R9.162 makes the Timeline Table read the same computed plan milestones as Apply plan (it had shown CD Final equal to END and a stale stored Fit Out Start). Automated parity test passes; owner browser acceptance on real projects remains in `BROWSER-ACCEPTANCE-BACKLOG.md`. Contract record: `apps/studioflow/KB-SF-DELIVERABLES-TIMELINE-2026-10-18.md`.

- [ ] [UNVERIFIED][P1] **Notes/Workspace assignment-read correction implemented in R9.134; independent browser acceptance remains.** The service now requires caller identity and reuses `requireWorkSectionAccess` before reading cards, threads, tags, item-linked notes or signing asset URLs; server actions/components propagate the authenticated user. Real disposable-database regressions pass for an outsider refusal and retained Designer, Drafter and manager access, while Schedule-derived `searchNoteItems` remains readable. Focused StudioFlow integration passed 226/226 and action transport passed 7/7. After the BQ fixture correction in R9.135, the full high gate passed all 1,235 tests, typecheck/lint, boundary scans, Prisma generation and production build. Close after independent affected-flow browser review.

- [ ] [CLEANUP][P3] Copy drift seen in the R9.87 walk: the phase More menu still says "Round history (N)" beside "iteration" everywhere else; the Notes stale-edit refusal says "Someone changed this **card**" for a note; a Supervision phase with no open visit shows "Current iteration · Prepare this iteration, then send it to the client."; after the last phase is closed the phase bar falls back to Moodboard's state.
- [ ] [PLANNED] Owner decision: R8.249 built a per-person **start page** preference and a **Storage usage** report (backend `storageUsage` in `@platform/runtime`), but neither has a screen (the Storage action was removed as unused). Decide whether to add them to My preferences / Platform settings or remove the backend.

- [ ] [BUG][P2] **Shared crop preview differs from saved image (R9.64 D3) — fixed R9.70, Lead code review PASS R9.71; browser partial R9.98.** R9.98 compares actual Schedule 4:5 right-edge preview pixels with the saved JPEG in Chromium and passes; earlier browser work covered Schedule centre and MOM top-edge. The omitted-aspect public mode has deterministic geometry fixtures but no live app consumer or browser pixel comparison yet. Keep open until remaining [R9.64] D/E / [R9.70] browser acceptance, including other crop positions and gestures. Original evidence: `src/platform/ui_engine/patterns/image-workspace.tsx:199,205,279,283`; deterministic 1600×900/4:3 coordinate trace in PLAN.md.

- [ ] [PLANNED][P1] **DEFERRED by the owner 2026-10-19.** Workspace board: a note thread where you double-click
  (owner, 2026-10-15: "tulis aja di KB, nanti oper ke codex"). Mockup artboard
  *Workspace — klik dua kali untuk catatan* in
  https://claude.ai/artifact/7ns7QpSUBxSY6c1FYYJvbF. With the Workspace board
  module on, double-clicking anywhere on the board (empty space or an element)
  opens a small chat window at that spot, the same chat as Notes (R9.61):
  bubbles, albums, replies, the auto phase tag, `#` topics, `@` Schedule codes.
  The spot keeps a speech-bubble marker with its message count (amber when it
  holds client feedback); clicking it reopens the thread. "All notes · N" in the
  board toolbar lists every thread as one stream. Builds on WO-SF-NOTES-CHAT-01
  (replies, tags, item links already exist). **Lead to settle in the Work Order
  before Codex:** how a thread is stored (a pin element with a canvas point,
  optionally anchored to an element so it moves with it, whose messages are
  notes replying to it, vs. a new kind), what happens to its messages when the
  anchor element is deleted, and whether board threads show in Notes mode if an
  office later switches the module off (MODULES-DECISION: switching never loses
  data). Backend by Codex, the board UI by the Lead.
  **Settled R9.75 (WO-SF-BOARD-THREADS-01, PLAN.md):** own thread table,
  messages are ordinary notes with `thread_id`; deleting the anchor element
  deletes its threads and messages (owner) only when the actor may delete every
  message; free markers can be dragged; double-click replaces "new text" (text
  via + Text); board off shows messages in Notes. Backend R9.76, board UI R9.78
  (Lead). Remove this item after the owner's browser check ([R9.78] group).

- [ ] [PLANNED][P2] **DEFERRED by the owner 2026-10-19.** Ideas board (owner, 2026-10-08): a personal page where a
  user drops any image (Ctrl+V screenshot, a dropped download, picked files)
  and it becomes a card at once; title, source link and note are optional and
  may stay empty. No code, category or qty; no commitment. **Locked:**
  - One private board per user (others do not see it); it spans every project
    the user holds, i.e. projects where the user may edit the schedule
    (assigned designer/drafter, or a manager override; project not completed).
  - "Use in schedule": pick one of those projects, then a new item (only then
    does it get a code such as ST-04) or an extra option on an existing item
    (e.g. ST-02 option B). The image is copied into the option, so deleting the
    card never touches the schedule. The card stays on the board labelled
    "Used in: <project> <code><option>"; one card may be used in several
    projects.
  - StudioFlow-owned only: no Master Data link or write (Master Data stays
    read-only for the Library). A source URL is stored as text and never
    fetched by the server.
  - Not in this item: drag a card onto a schedule tab, cards shared between
    users, SketchUp/companion "unresolved material" intake (D-SF-06 stands).
  - Backend R8.450, board page R8.452 (`/studioflow/ideas`). [UNVERIFIED]
    owner walk on real data: paste from Pinterest, drop a download, edit
    details, Replace image, Use in schedule as a new item and as an option,
    the "Used" labels, delete a used card. Run the migration at home and at
    the office first.

- [ ] [UNVERIFIED] Client-note images R8.394–R8.395 in the browser: drop,
  paste a screenshot (Ctrl+V) and pick several images in the answer dialog and
  both client-notes dialogs; a large phone photo is shrunk and accepted; the
  13th image and a PDF are refused with a message; thumbnails in the next
  iteration's brief, the answered note and earlier iterations; large view with
  previous/next; remove with confirmation.
- [ ] [UNVERIFIED] Formatted notes R8.392, still open after the 2026-10-08 walk (passed: the bullet button on selected lines, Enter continuing a list, and the brief of the next iteration showing the notes as a list with "Add to notes"): bold and italic, numbering, pinned notes, visit notes, MOM and MOM print, earlier iterations as formatted text, renaming CD Mall refused. A bullet click on an empty note adds nothing (BACKLOG [CLEANUP]).
- [ ] [UNVERIFIED] Timeline R8.384, still open after the 2026-10-08 walk (passed: "Edit dates and plan" from a project's Timeline tab opens the dialog on the Timeline page with the lead times loaded; "Save and apply plan" computed the phase dates correctly and showed them; Today label at Week and Month zoom, also in Dark, now clear of the week numbers): "Back to the plan" and the suggested Fit Out Start.
- [ ] [UNVERIFIED] Product Schedule R8.382-R8.383, still open after the 2026-10-08 walk (passed: the page loads, the New category picker with a typed new category creates it and its first item, right-click Open / Delete on a board card): the studio-categories list and the "already in this project" hint, Add item picker, "Unset final", "Apply studio templates", a new option staying selected after Save, a re-import of a real Google Sheets export.
- [ ] [BLOCKED] Rows made Final automatically before R8.382 (typed product on
  add, template seeding, import) are still Final in existing projects. They can
  be told apart: a real decision has a `studioflow.schedule.option-finalized`
  audit event, an automatic one has none. Owner to decide whether a one-off
  data fix should return those rows to "needs a decision".
- [ ] [PLANNED][P3] Product Schedule: a per-project category order (drag a
  category). Today categories follow the studio template order, then A to Z;
  a project order needs its own stored field.

- [ ] [UNVERIFIED] Re-layout (R8.347–R8.348) on real data: send → client
  answered with notes → Revision (the next round shows the brief) → OK; CD Mall
  → CD Final; a supervision visit; ticking and dismissing requirements in the
  aside; phone width.
- [ ] [UNVERIFIED] R8.318–R8.324 on real data: the manager completion override
  with a reason end to end and its "Complete anyway" entry in History, saving a
  multi-supplier grid with real suppliers, typing "By Request" in each price
  table, Library images from real Brand websites, the StudioFlow rail at 840 px.
- [ ] [UNVERIFIED] Phase notes as a chat (R8.446, WO-SF-NOTEFEED-01): owner
  walk on the phase page (send with Enter, paste/drop images, star, mark client
  feedback, edit, delete, filters), the card's Add note… and Starred notes,
  Client answered with pasted screenshots, a visit's note. Migration ran on the
  office dev DB (4 notes converted, 1 starred); run it at home too.
- [ ] [UNVERIFIED] Client notes replace feedback (R8.327): run the data
  migration on the office and home databases, read its precheck NOTICE, then
  spot-check a few projects' round notes and requirements.
- [ ] [PLANNED][P3] After that migration has run everywhere: drop
  `sf_activity`, its relations and the `activity.*` History labels.
- [ ] [PLANNED][P3] Home "needs attention" row (from the unmerged R8.335 branch,
  owner not yet asked): counts of live phases that are *Client answered*
  (decide Revision/Done), *With client*, *Ready to send*; each count filters
  the project cards and selecting it again clears the filter. Not built in
  `main`. Needs an owner yes before a plan; must use DESIGN v2 stat cards.
- [ ] [UNVERIFIED][P3] Phone width (owner, 2026-10-06, seen on the phone): the
  header and tabs stay fixed and only the content scrolls; the phase row
  scrolls inside its own card instead of pushing the page sideways. DESIGN v2
  (R8.357–R8.362) may already cover it; check at 390 px before planning.
- [ ] [PLANNED][P3] Gantt follow-ups (R8.381 shipped the read-only Gantt, the
  project Timeline tab and the Plan panel): drag a bar to move or resize its
  dates (today a click opens the date dialog); a "today / this month" jump
  control; a print view of the Gantt; Design 3D keeps only an end date, so
  "Design Final" is a marker, not a bar — give Design 3D a start if the owner
  wants a bar; holiday import from a public calendar (the list sits behind one
  function). [UNVERIFIED] Both Gantt pages and the Settings "Planning and
  holidays" page on real data and at phone width.
- [ ] [BLOCKED][P3] AI file filing (owner, 2026-09-27: lowest priority, do not
  pick up until the owner raises it again). What is known: the real driver is
  proposing requirement ticks when an expected input arrives (the human
  confirms, through the existing tick command); folders `/IN`, `/DATA`,
  `References` are StudioFlow-native on the host machine; hardware for a local
  model is not provisioned; no AI SDK dependency exists. File facts today:
  PDF/PNG/JPEG/WebP/ZIP up to 500 MB, one Final plus the two newest working
  versions per file name, working files expire after 30 days (R8.240).
  Before a plan: confirm which file types to add, the folder-watching
  mechanism, and the hardware.

- [ ] [UNVERIFIED] First-use tour, still open after the 2026-10-08 walk (walked: language pick, 4 steps in English and Indonesian, language switch keeps the step, Done never replays after reload, Help replay, Esc, phone width docks the card): another browser or computer for the same account must not replay it; a role without project read skips step 2; the two Playwright full sessions that stalled earlier and the 13 phone layout checks.
- [ ] [PLANNED] Tours for Master Data and BQ (same registration as
  `STUDIOFLOW_TOUR`), after the owner approves the StudioFlow flow.
- [ ] [PLANNED][P3] Lead findings of the 2026-10-07 audit: shell polling fires
  twice on first load (mount effect and pathname effect), hard-coded "five
  phases" copy (new-project dialog, Projects header) although phase templates
  are configurable, `id-ID` hard-coded in print pages and BQ review instead of
  the account's display locale, `/ui-engine` showcase is a public path, and
  `studioflow/actions.ts` (1,248 lines) and `schedule-board.tsx` (1,533 lines)
  are oversized.
- [ ] [CLEANUP][P3] Sample holder project (external audit 2026-10-08, checked
  against the code): the browser path is safe (the action schema has no project
  name and `sample-request-coordinator.ts` resolves it from StudioFlow's
  non-archived projects, with a test for an unknown project), but
  `masterdata/services/sample.service.ts` `setSampleStatus` still takes
  `holderProjectId` and `holderProjectName` from its caller. Only the
  coordinator calls it today; if a second caller appears, make Master Data take
  the id alone through a port that returns the name.
- [ ] [PLANNED][P3] Sample workflow orchestration is split across
  `sample-request-coordinator.ts`, `sample-request-notifier.ts`,
  `masterdata/services/sample.service.ts` and
  `studioflow/public/sample-request-command.ts`. Not a defect; revisit as one
  application-level workflow once two or three more cross-app workflows exist.
- [ ] [UNVERIFIED] WO-MD-CRUD-01, still open after the 2026-10-08 walks (passed: Supplier archive and restore cascade through its owned Brand, SKU and price and leave a Brand that only lists it; a price-less SKU and its Brand archive and restore; Material+Labor shows material-, labor- and both-capable suppliers and Labor only labor-capable ones; the Material+Labor quick-add supplier offers all three Supplier Types and creates and selects the supplier; a Material+Labor price from a material-only supplier saves): a hand-archived Brand staying archived through a Supplier restore and a Brand with the same link typed twice. Renaming a Brand whose owner is archived is covered by a test only.
- [ ] [UNVERIFIED] WO-MD-ENTRY-01, still open after the 2026-10-08 walks (passed: auto-link on price save; the material, the labor and the several-suppliers grids each save what is valid and keep the failing row or cell with its reason; "Show those prices" opens the Pricing list filtered to those prices): only changing a Brand owner while its prices exist.
- [ ] [UNVERIFIED] Template-first imports (R8.482): on Import & export prices, both cards read Download template, choose a file (checked at once),
  Save (valid rows saved, problem rows skipped and listed). Automated for CSV; still to try by hand: an Excel file with the Suppliers sheet, the
  current-data download edited and uploaded back, the PDF price list, and a real company file copied into the template.
- [ ] [UNVERIFIED] Browser acceptance is now mostly automated (WO-E2E-ACCEPT-01, R8.469-R8.481): `npm run test:e2e` runs 129 checks
  (Master Data pricing, archive and restore, the sample shelf, notes, images, Schedule codes, the moodboard, the token page, the first-use
  guide, Ideas). What still needs the owner's own eyes, from `docs/BROWSER-ACCEPTANCE.md`: the BQ screens (section 9 part), Dark mode and
  the 840 px rail (section 10), MOM print formatting, drop and paste of several images in the answer dialog, the Schedule right-click menu
  and New category picker, the Google Sheets re-import, the manager completion override. Entries above for covered screens may be removed
  once the owner agrees the automated result is enough.
- [ ] [UNVERIFIED] Walk 2026-10-08 did not cover: client-note images (a file upload cannot be driven from the built-in browser), formatted notes, Timeline and Schedule, re-layout on real data, the BQ screens, the sample shelf, Dark mode, the 840 px rail. Run them from `docs/BROWSER-ACCEPTANCE.md` sections 6 to 10 on the owner's own browser.
- [ ] [UNVERIFIED] BQ walk 2026-10-08 passed (isolated server, seeded project): section, Work Item and Cost Component with a Master Data snapshot; a rate override with the "Harga diubah" badge and revert; the snapshot staying Rp.100.000 after the Master Data price was raised to 150.000; the source picker still listing Master Data prices when the Library holds 90 items (R8.422 fix); the printed quotation carrying the DRAFT box while the project is active and none once it is locked; Lock (type LOCK) giving "Locked — read only" with no edit controls and an Unlock button. Still open: BQ Library and templates screens, assemblies, project deletion approval, the Excel-free import decision, and a real project by the estimator.
- [ ] [PLANNED][P3] BQ language (owner decision 2026-10-17; WO-BQ-UI-LANGUAGE-ALIGNMENT-01): Indonesian prose throughout the app; canonical BQ nouns stay English; interactive `Quotation` becomes `Penawaran`; print quotation is unchanged. The future EN/ID selector is a separate per-person language preference, not locale or guide language.
- [ ] [PLANNED][P3] BQ new Work Item defaults to unit "ls", which shows as "ls (inactive snapshot)" when Master Data has no active unit with that code (the seeded test database has none). Check the owner's real units; if "ls" is not there, offer the default from an active unit.
- [ ] [PLANNED][P3] BQ lock asks to type LOCK although Unlock exists; consider a plain confirmation (the type-to-confirm is for actions that cannot be undone).
- [ ] [UNVERIFIED][P3] Iteration names (WO-SF-ITERNAME-01, built R8.431, browser-checked R8.438): only the rewrite of the owner's real existing names by the migration is not seen yet; look at the owner's projects once after the next real data load.
- [ ] [PLANNED][P3] Notes follow-ups (owner, 2026-10-08; R8.435 built the editor and the merged card): annotated images (pins and arrows, reuse the Presentation annotation) and images placed inside the note text are not done; the images still sit in the strip under the text. Browser pass by the owner on the real notes.
- [ ] [UNVERIFIED] New SKU inside the price table (R8.441 backend, R8.453 screen): owner walk on real data: a new SKU typed in a row with category and size next to existing-SKU rows, the same new name on two suppliers (one SKU, two prices), a name that already exists and "Use the existing SKU", a person who may price but not create SKUs (no "Create SKU").

- [ ] [PLANNED][P2] Workspace board phases after WO-SF-WORKSPACE-04 (owner 2026-10-13, concept https://claude.ai/artifact/TbUL52g4MYgm1Y3G3TBvhL): (2) comment pins and quick drawing on images, client feedback with Done merged into the round feedback list (`SfActivity` FEEDBACK, one source); (3) round lens and R1 ↔ R2 compare, "not yet placed" tray for phone site-visit photos; (4) light groups, overview map, send selection to a presentation, "Bring from My Ideas". Older follow-ups still open: free placement on touch screens; `placeItems` checks rights item by item (batch the check if a large first move is ever slow).

- [ ] [UNVERIFIED][P2] Workspace and existing Ideas/image flows after R8.542/R8.544, published in R9 (owner 2026-10-13): owner manually tried the app and reports it provisionally OK, explicitly authorising push before the wider review. This is an owner manual walk, not a Playwright or Lead verdict. Later check Workspace → Ideas/Moodboard copies and recovery when completion is uncertain, module-disabled/read-only/private-user UI, desktop/phone behaviour and sustained board responsiveness. Keep the detailed cases under R8.542/R8.544 in `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md`; do not close them or claim independent acceptance from this limited manual walk. Automated evidence: 1,069/1,069 and the targeted Ideas browser regression 1/1.

## Ideas to discuss

- [ ] [IDEA] **Clear error when `DATABASE_URL` is missing at start** (rescued from an old R4.07 stash, 2026-09-01; the rebuild never got it). If the dev server starts before `.env` exists, the failure shows up later as a cryptic database login error ("client password must be a string") instead of "DATABASE_URL is not set". Idea: `readDbPoolSettings` / `createDbRuntime` (`src/platform/core/db`) throws a plain, actionable message before the pool is built, and `README`/the location runbook says `.env` must exist before `npm run dev` because Next reads environment variables only at start. Small, safe, additive; needs the owner's yes.
