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

- [ ] [UNVERIFIED] Sample shelf R8.386–R8.390 in the browser (WO-MD-SAMPLE-01
  "Reviewer Acceptance"): add, move, lend with a project, send to a client,
  mark lost, return, the remove refusal while out, history, right-click menu;
  then "Put on shelf" from Sample requests and "Sample received" with the shelf
  note in that project's Schedule plus the requester's notification. Staff
  roles first need `masterdata.sample.read` / `masterdata.sample.manage`
  granted in Settings → Access.
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
- [ ] [PLANNED] Rate Library after enough project-line evidence exists.
- [ ] [PLANNED] Formal StudioFlow linking through a stable external reference.
- [ ] [PLANNED] A unit-conversion helper for `purchase_to_base_factor`.

## StudioFlow

- [ ] [UNVERIFIED] Formatted notes R8.392 in the browser: bold, italic, bullets,
  numbering and Enter-continues-the-list in client notes, pinned notes, visit
  notes and MOM; the brief, earlier iterations, MOM read-only and MOM print show
  them formatted; "Add to notes" on the brief; renaming CD Mall is refused with
  a clear message.

- [ ] [UNVERIFIED] Timeline R8.384 in the browser: "Dates & plan" dialog (lead
  times load, Save, Save and apply plan, Back to the plan, suggested Fit Out
  Start), "Edit dates and plan" from a project's read-only Timeline tab opening
  the dialog, and the "Today · date" label at Week and Month zoom (it must not
  hide a week number that matters, and must read in Dark).

- [ ] [UNVERIFIED] Product Schedule R8.382–R8.383 in the browser: right-click Open/Delete
  on a board card, the "New category" picker (studio categories, typing a new
  one, also in an empty section, the "already in this project" hint), studio
  categories in the Add item category picker, "Unset final" in the option menu, "Apply studio
  templates" confirm and its count, a new option staying selected after Save,
  and a re-import of a real Google Sheets export.
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
- [ ] [PLANNED][P2] Phase notes with the full editor (owner, 2026-10-07): the
  client's notes per iteration (and the pinned note) move to the shared
  `SimpleTextEditor` — checkbox, numbering, bullets, bold, plus pasted or
  uploaded images on the existing storage. Replaces the plain-text client note
  (owner: replace, not add alongside); the carry-over of notes to the next
  iteration stays. Needs a Work Order with a safe migration of existing plain
  notes. Independent of the working-time/Gantt item below.
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
