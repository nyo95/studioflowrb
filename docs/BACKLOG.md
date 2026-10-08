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

## Platform Foundation

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
- [ ] [CLEANUP][P3] Schedule and Presentation image deletes still decide and
  remove after commit (`removeUnreferenced`): a failure is recorded in the
  cleanup ledger, but a process crash between commit and removal is not
  pre-enqueued as deliverable and MOM deletes are (R8.372).

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
- [ ] [PLANNED][P3] Owner decision: should a workbook re-import add missing
  categories and contacts to suppliers that already exist? Today it merges
  nothing, and its area suffix only separates repeats within one file.
- [ ] [PLANNED] Define media/file behavior on the shared storage.

## BQ

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
- [ ] [PLANNED][P3] BQ and Excel (owner, 2026-10-08): do not build an importer for the estimator's own workbook. If old data must come across, use a flat sheet (Section, Item, Unit, Qty, SKU or work-price code) with no prices; prices always come from Master Data. XLSX *output* for the client stays in the list above, waiting for the estimator.
- [ ] [PLANNED] Rate Library after enough project-line evidence exists.
- [ ] [PLANNED] Formal StudioFlow linking through a stable external reference.
- [ ] [PLANNED] A unit-conversion helper for `purchase_to_base_factor`.

## StudioFlow

- [ ] [PLANNED][P2] Ideas board (owner, 2026-10-08): a personal page where a
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
- [ ] [PLANNED][P3] Product Schedule: codes are stable since R8.382, but the
  highest number in a group can come back after its row is deleted (next =
  highest + 1). Never reusing it needs a stored per-group high-water mark;
  owner to say whether that matters in practice.

- [ ] [UNVERIFIED] Re-layout (R8.347–R8.348) on real data: send → client
  answered with notes → Revision (the next round shows the brief) → OK; CD Mall
  → CD Final; a supervision visit; ticking and dismissing requirements in the
  aside; Everyone's scope as a manager with several designers; phone width.
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
- [ ] [PLANNED][P3] The workbook imports (SKU prices, price database) still reject the whole file when any row is invalid. Revisit a "apply the valid rows" option once WO-MD-ENTRY-01 has proven the grid version; the import's preview step makes it a separate decision.
- [ ] [UNVERIFIED] WO-MD-ENTRY-01, still open after the 2026-10-08 walks (passed: auto-link on price save; the material, the labor and the several-suppliers grids each save what is valid and keep the failing row or cell with its reason; "Show those prices" opens the Pricing list filtered to those prices): only changing a Brand owner while its prices exist.
- [ ] [UNVERIFIED] The ordered browser walk that closes every [UNVERIFIED] entry above is in `docs/BROWSER-ACCEPTANCE.md` (11 sections, about an hour). Run it once, record PASS/FAIL per section, then remove the entries that passed and file each FAIL as a [BUG].
- [ ] [CLEANUP][P3] The unexpected-error branch of the several-suppliers grid (R8.421) has no fault-injection test, as the per-row isolation of R8.419 has none.
- [ ] [UNVERIFIED] Walk 2026-10-08 did not cover: client-note images (a file upload cannot be driven from the built-in browser), formatted notes, Timeline and Schedule, re-layout on real data, the BQ screens, the sample shelf, Dark mode, the 840 px rail. Run them from `docs/BROWSER-ACCEPTANCE.md` sections 6 to 10 on the owner's own browser.
- [ ] [CLEANUP][P3] The bullet and numbering buttons in the notes editor do nothing when the note is empty (they work on selected or typed lines); with an empty note they should insert the first marker.
- [ ] [UNVERIFIED] BQ walk 2026-10-08 passed (isolated server, seeded project): section, Work Item and Cost Component with a Master Data snapshot; a rate override with the "Harga diubah" badge and revert; the snapshot staying Rp.100.000 after the Master Data price was raised to 150.000; the source picker still listing Master Data prices when the Library holds 90 items (R8.422 fix); the printed quotation carrying the DRAFT box while the project is active and none once it is locked; Lock (type LOCK) giving "Locked — read only" with no edit controls and an Unlock button. Still open: BQ Library and templates screens, assemblies, project deletion approval, the Excel-free import decision, and a real project by the estimator.
- [ ] [PLANNED][P3] BQ language (found in the 2026-10-08 walk): the screens mix Indonesian and English ("Belum ada section", "dapat diedit", "Nama Work Item", "Tambah", "Terapkan Assembly", "Harga diubah", "Belum ada harga", "X dari Y Cost Component sudah ada harga", "Belum lengkap — ada item tanpa harga", the column "URAIAN" next to "Add section", "Lock project", "Quotation"). Owner decision: one language per screen, or follow the account's guide language.
- [ ] [PLANNED][P3] BQ new Work Item defaults to unit "ls", which shows as "ls (inactive snapshot)" when Master Data has no active unit with that code (the seeded test database has none). Check the owner's real units; if "ls" is not there, offer the default from an active unit.
- [ ] [PLANNED][P3] BQ lock asks to type LOCK although Unlock exists; consider a plain confirmation (the type-to-confirm is for actions that cannot be undone).
- [ ] [CLEANUP][P3] The SKU pickers on the shelf and in "Put on shelf" offer 'New SKU "X" (no price yet)' even when an existing SKU is named exactly X; hide it on an exact match so a click cannot only end in an identity conflict.
- [ ] [CLEANUP][P3] In Sample requests a request already marked received shows "Already received" with a red dot, which reads as a warning; use the neutral or green tone.
- [ ] [UNVERIFIED][P3] Iteration names (WO-SF-ITERNAME-01, built R8.431, browser-checked R8.438): only the rewrite of the owner's real existing names by the migration is not seen yet; look at the owner's projects once after the next real data load.
- [ ] [PLANNED][P3] Notes follow-ups (owner, 2026-10-08; R8.435 built the editor and the merged card): annotated images (pins and arrows, reuse the Presentation annotation) and images placed inside the note text are not done; the images still sit in the strip under the text. Browser pass by the owner on the real notes.
- [ ] [PLANNED][P2] New SKU inside the price table (owner, 2026-10-08): type a name in a price row, choose "add as new SKU", fill category and an optional size inline, save existing and new SKUs together; replaces the separate new-SKU form and its window switch. Step 1 backend `createMaterialSkuPricesBulk` built in R8.441 (Codex, `PLAN.md` WO-MD-SKUBULK-01); step 2 remains the table screen (Lead): brand from the dialog filter, category remembered, units pcs by default and M² locked with a size, remove the old form after, then complete browser acceptance.
