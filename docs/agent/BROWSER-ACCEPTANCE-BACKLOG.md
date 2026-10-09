# Browser Acceptance Backlog

Items collected here are **not** blocking Executor commits. They are batched and
run by the Reviewer at phase gate close — typically once per SF phase or
Reviewer acceptance session. The Reviewer records PASS per item before the
phase gate closes.

**Executor:** when a `PLAN.md` specifies browser verification, append each item
here using the format below instead of blocking your commit. Report the
additions in your handoff.

**Reviewer:** run these in one authenticated session using the local fixture.
Mark each item PASS or FAIL. A FAIL opens a new correction plan.

---

## Item format

```
### [Revision] Title
- Surface: <route or component>
- Fixture: <user / project / phase>
- Viewport: desktop (default) | 375 px
- Steps: numbered actions
- Acceptance: what must be true
- Status: PENDING | PASS <date> | FAIL <date> → see <plan-id>
```

---

## Pending

### [R8.376] StudioFlow Projects batch access read
- Surface: `/studioflow/projects`
- Fixture: an unassigned staff member with project read access; the project's designer PIC
- Viewport: desktop (default)
- Steps: 1. Open Projects as the unassigned staff member. 2. Open the same list as the designer PIC.
- Acceptance: the unassigned staff member still sees View only for each project; the designer PIC still sees the same row edit menu as before.
- Status: PENDING

### [R8.376] StudioFlow Timeline batch access read
- Surface: `/studioflow/timeline`
- Fixture: an unassigned staff member with project read access; the project's designer PIC
- Viewport: desktop (default)
- Steps: 1. Open Timeline as the unassigned staff member. 2. Open the same timeline as the designer PIC.
- Acceptance: editable segments and Edit dates remain unavailable to the unassigned staff member and available for the designer PIC exactly as before.
- Status: PENDING

### [R8.355] StudioFlow phase menu and active skip
- Surface: `/studioflow` and `/studioflow/projects/[projectId]?phase=...`
- Fixture: signed-in designer PIC; one fresh project and one project whose active phase has a sent round with client notes
- Viewport: desktop (default) and 375 px
- Steps: 1. On the fresh project, open Moodboard's ⋯ menu, skip it with a reason, inspect the next phase, then Undo. 2. Skip the phase with the sent round and inspect Earlier rounds. 3. Inspect each Home phase menu in pending, active, sent and done states. 4. Sweep Home, phase canvas, dialogs, toasts and History for the word “iteration”.
- Acceptance: empty unsent round 1 disappears on skip and returns on Undo; sent history and notes stay; auto-advance is identical to a normal finish; Home and the strip say Skipped and the phase page shows the reason; menus expose only allowed actions; every visible workflow label says round.
- Status: PENDING

### [R8.351] StudioFlow Product Schedule re-layout
- Surface: StudioFlow project → Schedule, Board and List views
- Fixture: editable project with Material and Fixture categories, reserved and multi-option items, final choices, photos, and requested/received samples; designer PIC and read-only staff
- Viewport: desktop (default) and 375 px
- Steps: 1. Check section counts, final progress and all four filters in Board and List. 2. Quick-add once with Type and once reserved; add a new category through Add item. 3. Edit a hidden field, toggle its eye, add option B, Save, set B final, then Discard another edit. 4. Request and receive a sample inline; reuse from a past project; open photo from the card. 5. Try previous/next, close and section switch with unsaved edits. 6. Repeat at phone width and as read-only staff.
- Acceptance: counts and filters match; quick-add uses the right category/code; cards have no nested controls or sample links; the one drawer preserves every action and asks before discarding; hidden values remain saved; List opens the same drawer; all actions remain permission-gated; the narrow board has two columns and the drawer is full width.
- Status: PENDING

### [R8.347] StudioFlow Home and project phase re-layout
- Surface: `/studioflow` and `/studioflow/projects/[projectId]`, plus MOM, Schedule, Presentation and History project pages
- Fixture: signed-in designer PIC; a project with requirements, a pinned note, a deliverable, CD and Supervision phases, and at least two rounds
- Viewport: desktop (default) and 375 px
- Steps: 1. Inspect Home and switch Mine/Everyone's plus Running/Completed. 2. Open a project and each document section; follow an old phase URL. 3. Run send → client answered with notes → Revision → OK and verify the next round brief. 4. Run CD Mall → CD Final. 5. Add and close a supervision visit. 6. Tick, dismiss, rename and add a subtask to requirements in the phase aside. 7. Inspect a missing-deliverable phase. 8. Repeat Home, the project header/nav and phase canvas at 375 px.
- Acceptance: the project rail and Requirements page are gone; the shared header/nav stays usable and marks the current section; old phase URLs redirect; each round and its notes appear once; every existing command and permission still works; project-wide and phase requirements remain editable under their existing rules; missing files are neutral; narrow layouts retain every action.
- Status: PENDING

### [R8.266] Master Data write-path hardening
- Surface: Suppliers, Categories, Settings → Supplier Types, workbook import, and audit history
- Fixture: signed-in Master Data manager; a Supplier with one contact; active Categories attached to a SKU, Brand, Supplier, and work price; a capability-dependent Supplier Type
- Viewport: desktop (default)
- Steps: 1. Submit malformed Supplier contacts and reopen the Supplier. 2. Try deactivating each used Category and archiving the dependent Supplier Type. 3. Apply one workbook and one sample-request price update, then inspect entity audit history.
- Acceptance: malformed contacts show a readable validation error and preserve stored contacts; lifecycle guards state why the record cannot change; each changed SKU/price has its own audit event as well as the batch event.
- Status: PENDING

### [R8.257] Master Data directory findability
- Surface: Brands, Suppliers, SKUs, and Pricing directories
- Fixture: signed-in Master Data reader with active and archived records, linked brands/suppliers, and prices in more than one currency or unit
- Viewport: desktop (default)
- Steps: 1. Confirm each directory initially shows only Active records, then try Archived and All. 2. Apply and clear each contextual filter; confirm the result count changes. 3. Search supplier/brand/category details and open a Brand link. 4. Check supplier phone links and SKU lowest-price display. 5. Filter pricing by supplier, brand, and work category.
- Acceptance: filters only alter the displayed rows; cleared filters restore the active default; links are safe and external; pricing is never compared across mixed currency or unit.
- Status: PASSED by the Lead on 2026-09-30 (R8.261) with "ZZ SAMPLE" fixtures (since removed): Pricing all three tabs (filters, search by brand/category, sort headers, Group by item with Lowest, mixed currency without a badge, contacts with tel/WhatsApp, filtered tab counts, clear filters), SKU per-currency "from" summary, Suppliers (Active default, brand, capability and product-category filters, Brands column including owned brands), Brands (Supplied by, Links, filters). Not covered: Archived/All views on SKUs and Brands with real archived rows, the narrow-width layout of the Pricing filter bar, an account without supplier-read permission (contacts must be hidden).

### [R8.249] My Preferences and Storage report
- Surface: Settings → My Preferences and Platform → Storage
- Fixture: signed-in staff member with one accessible app; platform settings reader; a settings reader without another app
- Viewport: desktop (default)
- Steps: 1. Save a personal timezone, locale, theme and accessible start page. 2. Clear the locale/timezone and revisit the account session table. 3. Open Storage as a settings reader, then as a person without that permission.
- Acceptance: the saved values persist for the same person; cleared display values fall back to the studio setting; Storage shows grouped usage and is refused to an unauthorized person.
- Status: PENDING

### [R8.240] StudioFlow deliverable file lifecycle
- Surface: `/studioflow/projects/[projectId]/phases/[phaseId]`
- Fixture: designer PIC and project manager; active writable phase; a PDF above 52 MB if local storage permits
- Viewport: desktop (default)
- Steps: 1. Upload a large PDF and download it. 2. Upload three same-named working versions, mark one Final, then upload two more. 3. Extend a working file near expiry and inspect its Final/expiry text. 4. Try the controls as an unassigned user and on an archived project.
- Acceptance: large upload completes and downloads; Final is retained while only the two newest working versions remain; extend re-arms expiry; unauthorized and archived writes fail without a file.
- Status: PENDING

### [R8.234] Sample quote to material price list
- Surface: `/masterdata/sample-requests` and `/masterdata/pricing`
- Fixture: staff with sample-request and material-price manage grants; an in-progress sample request with a supplier, SKU, amount, and currency
- Viewport: desktop (default)
- Steps: 1. Open the sample-request queue and record a complete quote with a linked SKU. 2. Use the Lead-owned Add to price list action once it is wired. 3. Open Pricing and locate the matching SKU and supplier. 4. Repeat the action.
- Acceptance: the price appears or updates with the quoted amount and currency; the sample request shows its linked SKU and price; existing notes remain and the repeat changes nothing.
- Status: PENDING

### [R8.225] StudioFlow CD List phase canvas
- Surface: `/studioflow/projects/[projectId]/phases/[phaseId]` on a drafter-seat Construction Drawing phase
- Fixture: designer PIC, drafter PIC, unassigned phase worker, and a project with a Construction Drawing phase
- Viewport: desktop (default)
- Steps: 1. Open the Construction Drawing phase as each fixture user. 2. Add drawings with numeric and non-numeric codes. 3. Edit an item, change its status, assign/clear a phase worker, and delete it. 4. Try the same writes as the unassigned worker and on a designer-seat phase.
- Acceptance: rows are grouped and numerically ordered; both PICs can edit the drafter phase; the unassigned worker can only view; a non-drafter phase has no usable CD List; the list does not affect phase approval.
- Status: PENDING

### [R8.216] Master Data SKU price workbook workflow
- Surface: `/masterdata/workbook`
- Fixture: staff member with SKU and material-price read/manage grants; a catalogue SKU with one supplier price
- Viewport: desktop (default)
- Steps: 1. Open the temporary workbook tools route. 2. Export the workbook. 3. Change one SKU name and one amount in Excel, preview it, then apply the same file using the returned hash. 4. Try an unknown supplier and confirm apply is refused.
- Acceptance: export is a usable `.xlsx`; preview identifies each changed or invalid row; apply changes every valid row together and rejects an invalid workbook without partial changes.
- Status: PENDING

### [R8.208] Remaining browser checks that need a second person, real hardware, or data the dev database lacks
- Surface: messenger (`/messenger`, topbar popup), BQ Cost Component picker, StudioFlow archive/cleanup, Deliverables
- Fixture: needs (a) a second signed-in user, (b) Master Data with at least one supplier price, (c) an archived project past its retention date, (d) a real device
- Viewport: desktop and 375 px
- Steps: 1. Two users exchange text and one small attachment; unread badge appears and clears (R8.198/R8.199). 2. Real file dialog, OS file drag, and a real IME in the quick popup (R8.207). 3. In BQ add a Master Data material price, including one whose SKU sorts past the 200th (R8.208 fix), a Master Data labor/material+labor price, and a BQ Library item; try promotion review controls and the calculator on an inline numeric cell. 4. Run cleanup a second time (no-op), run it as a user without project-manage (refused), and confirm a shared schedule image survives; restore a MOM revision after a purge. 5. Upload an image deliverable, reach OUTDATED, and confirm a missing deliverable never blocks approval.
- Acceptance: each step behaves as its contract in `docs/BACKLOG.md`/`CHANGELOG.md` says.
- Status: PENDING

### [R8.201] QuickMessenger popup stays viewport-anchored
- Surface: authenticated shell topbar / QuickMessenger
- Fixture: authenticated user with access to the platform shell
- Viewport: desktop and 375 px
- Steps: 1. Open the messenger from the topbar icon. 2. Repeat at 375 px.
- Acceptance: the panel sits at the bottom-right of the viewport and is fully visible at both viewports.
- Status: PENDING

### [R8.178] Archive retains files inside the configured window
- Surface: StudioFlow project archive dialog and settings (Lead UI follow-up)
- Fixture: disposable project with deliverable, MOM current/revision images and schedule photos; settings manager
- Viewport: desktop
- Steps: 1. Set retention to a valid value. 2. Archive the project. 3. Check retained files. 4. Try settings outside 7–730 whole days.
- Acceptance: files remain inside the window; invalid settings are rejected; archive copy states the configured retention.
- Status: PASS (2026-09-29, R8.208). Settings accept only whole days 7 to 730; the archive dialog states the retention; the archived row shows the kept-until date (28 Dec 2026 for 90 days); a real uploaded deliverable stayed on disk and downloadable after archive.

### [R8.178] Manual cleanup respects permissions and shared files
- Surface: StudioFlow manual cleanup button (Lead UI follow-up)
- Fixture: disposable expired archived project; shared schedule image used by a live project/template; users with and without project-manage
- Viewport: desktop
- Steps: 1. Run cleanup with project-manage. 2. Review summary and both audit events. 3. Run again. 4. Attempt without project-manage.
- Acceptance: expired project references are cleared; shared files remain; repeat run is a no-op; unauthorized run fails; both counts-only audit events use SYSTEM actors.
- Status: PARTIAL (Lead, 2026-09-29). Verified with project-manage: the review dialog counted exactly 1 archived project, DELETE was required, the run reported its summary, both audit events exist with SYSTEM actor and the locked counts, and the row and banner then read "files removed". NOT verified in the browser: a repeat run, a user without project-manage, and shared files (no real files in the fixture).

### [R8.178] Restore before and after asset cleanup
- Surface: StudioFlow archived project and MOM revision restore (Lead UI follow-up)
- Fixture: disposable archived projects inside and beyond retention; retained MOM revision text
- Viewport: desktop
- Steps: 1. Restore inside retention and inspect files. 2. Purge the expired project, restore it, and restore a MOM revision with different text.
- Acceptance: inside-window files remain; after purge the removed date is visible, project restore succeeds, and MOM revision restores text without missing-image references; restore audit records assetsPurged correctly.
- Status: PARTIAL (Lead, 2026-09-29). Verified: restoring after the purge shows "Files cannot be brought back" with the removal date, succeeds, records assetsPurged true, and archiving the project again clears the marker so a new cycle can purge. 2026-09-29 (R8.208): restoring inside the window with a real file also verified (dialog says files are safe; file still downloads with 200). NOT verified: restoring a MOM revision after a purge.

### [R8.173] Header quick-search preserves results
- Surface: StudioFlow header quick-search
- Fixture: authorized reader; more than six matching projects/clients, archived records and projects matching only their client name
- Viewport: desktop
- Steps: 1. Search by project name. 2. Search by client name with mixed case. 3. Open a result.
- Acceptance: up to six projects and six clients retain previous ordering and archive handling; result labels and navigation are unchanged.
- Status: PENDING

---

## Completed

_(cleared 2026-09-22 — see `CHANGELOG.md` for the revisions that superseded
this backlog's former SF-A entries.)_

### [R8.213] Sample request quote: create a supplier inline (KB-060)
- Surface: Master Data → Sample requests → Record quote
- Fixture: user with sample-request and supplier manage grants; one pending request
- Viewport: desktop (default)
- Steps: 1. Open Record quote. 2. Type a supplier name that does not exist. 3. Choose "Add … as a new supplier", pick a Supplier Type, create. 4. Save the quote.
- Acceptance: the new supplier is a real Master Data supplier, is selected on the quote, and the option is hidden for users without supplier manage.
- Status: PENDING

### [R8.213] Schedule: mark a sample received from the card (KB-061)
- Surface: StudioFlow project → Product Schedule (board view and option cards)
- Fixture: option with a REQUESTED sample request
- Viewport: desktop (default)
- Steps: 1. Find the "Sample requested" badge. 2. Click "Mark received" (board) or "Mark sample received" (option card).
- Acceptance: badge turns to "Sample received"; Master Data quote status is unchanged.
- Status: PENDING

### [R8.213] New/Edit project: free name, searchable client, no project type
- Surface: StudioFlow → Projects → New project / Edit project; Settings
- Fixture: any staff with project manage
- Viewport: desktop (default)
- Steps: 1. Create a project named without year/number. 2. In Client type a new name and add it. 3. Edit the project name. 4. Open Studio Settings.
- Acceptance: any name saves as typed; duplicate name shows a clear error; client is created and selected; no Project type field and no naming switch.
- Status: PENDING

### [R8.214] Project dates are set only from Timeline
- Surface: StudioFlow → Timeline; Projects → New / Edit project
- Fixture: staff with project manage; a project with an opening date
- Viewport: desktop (default)
- Steps: 1. Confirm New and Edit project have no date fields. 2. On Timeline click "Edit project dates", change start and opening date, save. 3. Edit the project's address on Projects and save.
- Acceptance: the bar and both date labels update immediately; the opening date survives the unrelated edit; clearing start falls back to the day the project was added.
- Status: PENDING

### [R8.221] PIC-based edit rights (WO-SF-ACCESS-01 + UI gating)
- Surface: StudioFlow → Projects, project page (phase canvas), MOM, Schedule, Presentation, Timeline
- Fixture: one project; three accounts: designer PIC, an unassigned staff member (all base grants, no override), a holder of "Edit any project" (override). Drafter PIC too if available.
- Viewport: desktop (default)
- Steps: 1. As the unassigned staff open each page. 2. As the drafter PIC open the drafter-seat phase and a designer-seat phase. 3. As designer PIC edit project fields, open Timeline. 4. As override holder repeat.
- Acceptance: unassigned staff sees "View only" notices, no edit/phase buttons, row shows "View only" in Projects, and any forced attempt is refused; drafter PIC edits only the drafter-seat phase plus MOM/Schedule/Presentation; designer PIC edits everything; override edits everything. Designer/Drafter pickers list only holders of the matching PIC permission. Owner (override) verified on 2026-09-30: all pages render, no "View only".
- Status: PENDING (read-only paths not yet seen in a browser)

### [R8.223] Supplier contacts: auto-link Brand, Brand-side contacts, three phone numbers
- Surface: Master Data → Suppliers (Edit supplier, contacts), Brands (Create/Edit brand, Supplier contacts)
- Fixture: a material supplier not linked to a Brand; a Brand with an owner
- Viewport: desktop (default)
- Steps: 1. In Edit supplier add a contact, pick a Brand the supplier does not carry, read the hint, save. 2. In Brands → Edit, add a contact for the owner with three numbers, save. 3. Reopen both dialogs; check the Suppliers table.
- Acceptance: step 1 saves and the supplier now appears in that Brand's suppliers; step 2 contact shows on the Supplier with all three numbers; the table shows the first number with "+2"; a fourth number is impossible to add.
- Status: PENDING

### [R8.228] CD List screen on the Construction Drawing phase
- Surface: StudioFlow project → Construction Drawing phase (project page canvas and phase page)
- Fixture: a project with a drafter PIC; accounts: drafter PIC, designer PIC, unassigned staff
- Viewport: desktop (default)
- Steps: 1. Add drawings with numbers like 101, 205, 310 and one without a number. 2. Change a status, edit a drawing (number, name, assignee), delete one. 3. Open as the unassigned staff member.
- Acceptance: items sort by number and sit under 100/200/300 series headings ("Other" for unnumbered); status and edit work; the list never blocks approving the phase; the unassigned staff member sees the list read-only. Lead added and deleted one drawing on the dev project on 2026-09-30 (add, list, delete verified).
- Status: PENDING

### [R8.252] Product Schedule card editor
- Surface: StudioFlow project → Product Schedule → open an item (click its card)
- Fixture: a Material item with two or three options (one final, one with a sample requested) and a Fixture item; accounts: designer PIC, unassigned staff
- Viewport: desktop and a narrow phone width
- Steps: 1. Open the item; the final option is the card shown. 2. Edit Type, Brand, Color and Location on the card, then pick another option in the hand and edit it too; press Save. 3. Turn slots off and on, use "Use default". 4. Tap the photo, change it, then go back. 5. Set as final, request a sample, mark it received, delete an option. 6. Close with unsaved edits. 7. Open as the unassigned staff member.
- Acceptance: both options' edits save together; hidden slots keep their text; photo, final, sample and delete behave as before; closing with unsaved edits asks to discard; the unassigned staff member sees the card read-only with no Save; Qty and its slot appear only on Fixture items; on a phone the card comes first, slots and hand stack below.
- Status: PENDING

### [R8.275] Bulk work-price table, supplier-first category list, name capitalization
- Surface: Master Data → Pricing → New price → Labor price (and Material + labor price); also the Brand, Supplier, Category, Unit and Supplier Type dialogs
- Fixture: a supplier with the Subcon type and two categories; a second supplier with no category; a unit list in lower case
- Viewport: desktop and a narrow tablet width
- Steps: 1. Choose the supplier, then the category; the supplier's own categories are listed first and a one-category supplier fills it in. 2. Type three rows in lower case; leave each name field. 3. Press Enter in the last amount to add a row; the unit is copied and the cursor lands in the new name. 4. Make one row invalid (a name that already exists) and press Create; the bad row is marked and nothing is saved. 5. Fix it and save; the supplier gains the category. 6. Type a lower-case name in a Brand or Category dialog and leave the field.
- Acceptance: names become First Letter Capital (MEP and 60x60 keep their shape); a failed save keeps the table and marks only the bad rows; a successful save creates every row with its own history entry; unit codes stay lower case.
- Status: PENDING

### [R8.276] Material price table with brand-link shortcut
- Surface: Master Data → Pricing → New price → Material price
- Fixture: a material supplier linked to one Brand with a SKU, plus a SKU of a second Brand that is not linked; accounts: one with brand-manage, one with only price-manage
- Viewport: desktop and a narrow tablet width
- Steps: 1. Choose the supplier; its Brands' SKUs are listed first, the other Brand's SKU below with a "not linked" note. 2. Add three rows (Enter adds one); amounts format as you leave them. 3. Pick the unlinked SKU: the row shows "Link brand to supplier"; use it as the brand-manager and the SKU becomes priceable; as the price-only account the button is replaced by who to ask. 4. Enter an amount for a SKU this supplier already prices and press Create: that row is marked, nothing is saved. 5. Fix it and save. 6. Use "Create a new SKU with its first price", then "Back to the price table".
- Acceptance: one failed row never leaves partial prices; each saved row has its own history entry; the unit follows the SKU; linking works only with the right permission.
- Status: PENDING

### [R8.277] Compare-suppliers grid (R8.323: "New price" → Labor or Material + labor → "Several suppliers")
- Surface: Master Data → Pricing → New price → Labor / Material + labor → Several suppliers
- Fixture: three labor-capable suppliers; one already holds a price named "Screeding base"; an Excel block of five items (one section heading line, one "-" cell, one "By Request" cell)
- Viewport: desktop and a narrow tablet width
- Steps: 1. Choose type, category and two suppliers; the grid opens with two amount columns. 2. Type two rows by hand (typing "By Request" must give the same result as pasting it); Enter in the last cell adds a row. 3. Paste the Excel block; items fill, the heading is skipped, the note says how many. 4. Set one cell to the existing "Screeding base" name and press Create: that row shows the supplier-named problem and nothing is saved. 5. Fix it and save; each supplier gains the category.
- Acceptance: blank cells create nothing; pasted amounts with dots, commas and Rp read correctly; a failure never leaves partial prices.
- Status: PENDING

### [R8.278] Supplier and price database workbook
- Surface: Master Data → Import & export prices → Supplier and price database / Import from Excel
- Fixture: the company file "RADIANT - DATABASE SUB CON & SUPPLIER"; a second copy with one amount edited; an export from the same page
- Viewport: desktop
- Steps: 1. Choose the company file, Labor only, default unit m2; press Check file: the totals, the supplier notes and the skipped-sheet notes show and nothing is saved. 2. Import. 3. Open Suppliers and Pricing: suppliers, categories and prices are there. 4. Check the same file again: everything is "unchanged". 5. Check the edited copy: one price "changed". 6. Download the export and check it: unchanged. 7. Try a file with an unknown unit and no default: the row is named and Import stays disabled.
- Acceptance: nothing changes before Import; a file with any error imports nothing; names, areas and amounts match the file.
- Status: PENDING

### [R8.280] Material prices: brand first, supplier on every row; specification under names
- Surface: Master Data → Pricing → New price → Material price; the Material + labor and Labor only lists
- Fixture: two Brands with SKUs (one SKU code the same in both), two suppliers (one linked to only one Brand), an imported list with items that have specifications; accounts: brand-manage and price-only
- Viewport: desktop and a narrow tablet width
- Steps: 1. Leave All brands, search the shared code: both SKUs appear with their brand beside the code. 2. Choose one Brand: only its SKUs remain. 3. Pick a SKU, pick a supplier; add a row (Enter): the supplier is already filled. 4. Pick the supplier not linked to the Brand: it is marked, and the row offers "Link brand to supplier"; use it as brand-manage, as price-only the button is replaced by who to ask. 5. Price one SKU for two suppliers (two rows) and one supplier for two SKUs; save: all rows appear. 6. Repeat a SKU and supplier that already have a price and save: that row is marked and nothing is saved. 7. In the lists the specification shows under each name and typing part of it in the search finds the row.
- Acceptance: nothing is saved when any row fails; the unit follows the SKU; the supplier carries down but can be changed per row; linking works only with permission.
- Status: PENDING

### [R8.498] Optional StudioFlow module gates
- Surface: StudioFlow rail, Ideas, project notes, Presentation, and Presentation print
- Fixture: an Ideas card and a Presentation board with at least one slide; System Owner command access
- Viewport: desktop (default)
- Steps: 1. With both modules enabled, open Ideas and Presentation and confirm their existing workflows. 2. Disable Ideas; reload and inspect the rail and project-note image actions, then open the old Ideas URL. 3. Re-enable Ideas and confirm the same card returns. 4. Repeat for Presentation, including its project tab, moodboard entry points, board URL, and print URL.
- Acceptance: enabled behavior is unchanged; disabled entries disappear without breaking surrounding layouts; disabled URLs are not-found; enabling restores the same saved data.
- Status: PENDING
