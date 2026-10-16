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

### [R9.100] Declined sample request leaves Product Schedule waiting state
- Surface: Master Data → Sample requests; StudioFlow project → Product Schedule
- Fixture: disposable project option with a requested sample and a Master Data staff account
- Viewport: desktop (default) and 375 px
- Steps: 1. Take the request in Master Data and decline with a reason. 2. Open or refresh the project's Product Schedule. 3. Check the Sample waiting filter and Home sample count. 4. Request another sample from the same option. 5. For an older Master Data-declined/StudioFlow-requested mismatch, use Update product schedule in the queue.
- Acceptance: notification and Schedule agree on declined; reason is readable, not counted as waiting, and a new request is allowed. Retry fixes the old mismatch without a second decline notification; the screens remain usable on a phone.
- Status: PASS 2026-10-16 (Codex acting as Lead, R9.102) — isolated Chromium journey takes and declines the request, checks requester notification and reason, removes it from the Schedule filter and Home waiting counts, recreates an older intake/Schedule mismatch only in the guarded disposable test database, repairs it through “Update product schedule” without another decline notification, and submits a new request. Reason and controls remain visible at 375 px.

### [R9.99] SKU dimensions and supplier price units are independent
- Surface: Master Data → Pricing → Material, then SKUs
- Fixture: disposable HPL SKU with dimensions 1220 × 2440 × 0.7 mm; two material suppliers and active sheet/box units
- Viewport: desktop (default) and 375 px
- Steps: 1. Add the SKU with its first price per sheet. 2. Add another supplier price per box. 3. Open the SKU editor and change its dimensions. 4. Reload Pricing and SKUs.
- Acceptance: each supplier price keeps its own purchase unit; the SKU shows dimensions as information only; no BQ/base unit or conversion is asked for or shown; forms remain usable at 375 px.
- Status: PASS 2026-10-16 (Codex acting as Lead, R9.102) — isolated Chromium journey creates a dimensioned HPL SKU from Pricing with a per-sheet price, adds another supplier price per box, reads the size and both units in SKUs, edits the dimensions, and confirms persistence without altering either price unit. SKU edit and Pricing controls remain reachable at 375 px. No BQ/base-unit conversion field appeared in this flow.

### [R9.99] A price-less sample-shelf SKU needs no purchase unit
- Surface: Master Data → Samples → shelf SKU creation, then SKUs
- Fixture: disposable sample request and shelf item
- Viewport: desktop (default)
- Steps: 1. Create a new SKU while shelving the sample without recording a price. 2. Open the new SKU in the catalogue.
- Acceptance: the SKU exists without a price or purchase unit; any optional dimensions remain informational.
- Status: PASS 2026-10-16 (Codex acting as Lead, R9.102) — isolated Chromium journey creates a new SKU through Add sample without a price or purchase unit, shelves it, then finds the SKU with “No price” in the catalogue.

### [R9.91] Deliverable version numbers stay attached to uploads
- Surface: StudioFlow project → Phases → a phase's deliverables
- Fixture: disposable rebuild-only project with an active phase; one PDF name uploaded repeatedly
- Viewport: desktop (default)
- Steps: 1. Upload the same named file three times and mark the earliest surviving file Final. 2. Upload again to prune an older working file. 3. Reload and inspect every visible version number and the newest badge. 4. Delete the latest, reload, upload again and inspect the numbers. 5. Upload a different name and inspect its first number.
- Acceptance: Final and surviving working files retain their upload-order numbers (gaps are allowed); only the highest surviving number per name says newest; after deletion, the next upload uses a higher number rather than restarting; a different name starts at Version 1.
- Status: PASS 2026-10-15 (Reviewer, R9.92) — browser regression on an isolated rebuild-only project showed Final Version 1, surviving working Versions 3 and 4 after pruning, Version 3 newest after deleting 4, new upload Version 5, and another file name beginning at Version 1; persisted through page reloads.

### Lead walk 2026-10-15 (R9.87) — what the remaining items still need
Ran on a disposable "ZZ QA" project, BQ project and Master Data records (all archived afterwards). Items marked PASS above are closed; for the rest:
- **Needs the Developer switch (separate /system sign-in):** [R9.78], [R9.31] enable/disable flow, [R8.498] toggles, [R8.542], [R8.544], [R8.532], [R8.519] — the Workspace board is Off and Ideas is Off on this database.
- **Needs a second account:** [R8.376] ×2, [R9.51] hidden-without-permission, [R8.221], unassigned-staff parts of [R8.225]/[R8.228]/[R8.351]/[R8.252], [R8.208] messenger.
- **Partly walked, PASS so far:** [R9.82] (instant layout, one coalesced save, no picture re-download, kept after reload; minor: adding a pin greys the toolbar ~1 s), [R9.81] (Notes stream zoom + mark-up reply; board variant needs the module), [R9.68]/[R9.64] C (add/link/drag pin, arrow nudge after the R9.87 fix, slide delete confirmation with counts, print legend), [R9.66]/[R9.64] A (two-tab stale edit keeps the draft and shows the latest on Reload; copy says "card"), [R9.64] B/[R9.73] (@ popup above the caret, chip card + Open item), [R9.64] D/[R9.70] (Schedule 4:5 centre and MOM 4:3 top-edge exports match the preview pixel-exact), [R9.64] E (375 px sideways scroll found and fixed in R9.87), [R8.347] steps 3–6, [R8.351] steps 1–4/6, [R8.252] (PIC), [R8.225]/[R8.228] (PIC; Drawing list clipping fixed R9.87), [R8.240] (versions/Final; >52 MB and refusals not run), [R8.249] (locale/timezone; no start-page choice and no Storage screen exist), [R8.173] (mixed case, open result; >6 results not available), [R8.223] (three numbers max; table shows all three, not "+2"), [R8.266] (phone is free text by design; malformed contacts not reachable from the UI), [R8.275] (title case on blur, Enter adds a row, validation keeps rows).
- **Not run:** [R8.178] ×3 (needs an expired archive), [R8.216]/[R8.278] (need workbook files / downloads), [R8.276], [R8.277], [R8.280], [R9.64] E full consumer matrix, [R8.527] owner verdict. [R8.257] Archived/All and phone-width filter checks were completed in the R9.87 continuation; its permission contrast still needs a second account.

### [R9.86] Brand by role: consultant letterhead on prints, mark follows the area
- Surface: StudioFlow Settings → Document letterhead; BQ Settings (quotation letterhead); any project's MOM, Schedule and Presentation prints; a BQ quotation print
- Steps: 1. Fill B (name, logo, address, e-mail) in StudioFlow Settings and A in BQ Settings. 2. Print a MOM and a Schedule: B's logo at top left, address/e-mail at top right. 3. Print a Presentation: B's small logo beside the date on every page. 4. Print a BQ quotation: A as before. 5. Move between StudioFlow, BQ, Master Data, Home and Settings: the top-left mark shows B, A, A, then the platform mark. 6. Remove B's logo and clear its name: StudioFlow prints and the StudioFlow mark fall back to the platform mark.
- Acceptance: each role's brand shows only in its own area and documents; the fallback never leaves a blank.
- Status: PASS 2026-10-15 (Lead walk, R9.87) — A/B saved with logos; MOM/Schedule/Presentation prints carry B, quotation A; shell mark B/A/A/platform incl. client navigation; clearing B falls back to RAD on prints and the mark.

### [R9.84] Project tabs scroll again; Phases stays fixed
- Surface: a project with many Schedule entries, a long MOM list and Timeline
- Steps: 1. Open Schedule (Board and List), MOM, Presentation, Timeline and History: scroll to the bottom of each with the mouse wheel. 2. Open Phases at ≥ 1280 px: the page stays put and only the notes/board scroll inside; below 1280 px it scrolls as a page.
- Acceptance: no project tab is cut off at the window bottom; Phases keeps its fixed layout.
- Status: PASS 2026-10-15 (Lead walk, R9.87; short-desktop correction R9.88) — Schedule scrolls (854/7212), no clipped card; Phases fixed at 1440, page-scroll at 1024. Subsequent 720 px review found the Notes composer clipped after R9.87's Drawing list fix; R9.88 automated browser checks cover 1280/1440 × 720 and × 900 plus the 1280 × 1141 transition, with the add row, editor, and Send button in view and no outer scroll.

### [R9.82] Presentation editor feels instant
- Surface: a Presentation board with several slides and large renders
- Steps: 1. Click through layouts quickly, toggle Crop to fill / Show whole, drag the crop sliders, move and nudge pins, edit pin details, reorder slides, swap images between boxes, delete a pin/image/slide. 2. Watch that nothing flickers or reloads and the pictures do not load again; the line under the board title says "Saving…" then "All changes saved". 3. Reload: every last choice is kept. 4. Try to close the tab right after a change: the browser asks first. 5. Cause a refusal (e.g. shrink a layout while its extra boxes still hold images): an error shows and the board returns to what was saved.
- Acceptance: every change shows at once, saves quietly in order, repeated changes save once, pictures are not re-downloaded, and failures show and resync.
- Status: PENDING

### [R9.81] Zoom a note image and send a marked-up copy as a reply
- Surface: Notes stream image viewer; the same viewer inside a board note window; Ideas/Workspace image viewers (zoom only)
- Fixture: a large drawing (e.g. a floor plan) posted as a note image, a board note image, an album
- Viewport: desktop 1440 px; a touch device for pinch
- Steps: 1. Open the image: scroll, pinch, +/−, double-click and the keys zoom; drag pans; Fit returns; Previous/Next still work in an album. 2. "Mark up": zoom in on a detail, draw with Pen/Arrow/Box/Circle in a few colours on several spots, use Pan, Undo last mark and Clear marks. 3. "Send as reply". 4. Repeat on a board note image (thread) and with the board switched off.
- Acceptance: the reply is a new image quoting the original, showing the whole picture with every mark where it was drawn, readable; the original image is unchanged; on a board note the reply stays in that thread (in Notes when the board is off); people who cannot write any phase see no Mark up.
- Status: PENDING

### [R9.80] Supervision: Done (handover) without an open visit
- Surface: project card and the Supervision phase panel
- Fixture: ACTIVE project whose Supervision phase is active
- Steps: 1. Record a visit, close it with "Next visit", then Cancel the "New site visit" dialog. 2. Both "New visit" and "Done (handover)" show; press Done (handover). 3. Use Undo. 4. On a Supervision phase with no visit yet, only "New visit" shows.
- Acceptance: the phase closes and locks like a handover on a visit (next phase starts if any), the completed visit is unchanged, Undo reopens it with both buttons again; no button without a completed visit; "Skip this phase…" unchanged.
- Status: PASS 2026-10-15 (Lead walk, R9.87) — Next visit + Cancel → New visit and Done (handover); handover closes, Undo restores. Step 4 unreachable (Supervision opens SV1 by itself).

### [R9.78] Workspace board note threads
- Surface: StudioFlow project Phases page with the `workspace-board` module on; the Notes stream with it off
- Fixture: ACTIVE project with an image, a file and a text element on the board; designer of one phase, drafter of another; a second session
- Viewport: desktop 1440 px (the board); 375 px for the All notes list
- Steps: 1. Double-click empty board: a "Board note" window opens with a dot; send a text, then a photo; the marker shows 2. 2. Double-click an image and a file: "Note on image/file" windows; the marker sticks to the element when you drag the element. 3. Text element: its menu "Add a note" opens a note (double-click on a text still writes in it). 4. Drag a free marker, reload: it stays; an attached marker cannot be dragged. 5. Mark a message as client feedback: the marker turns amber. 6. "All notes · N" lists every board note; "Show on board" pans to it and opens it. 7. Delete an image that has notes: the confirmation names the count; as the drafter, try deleting a designer-noted image (refused, nothing deleted). 8. Delete the last message of a thread: the marker disappears. 9. Switch the module off: the messages are in the Notes stream; switch it on again: markers are back. 10. Text tool (T) and click still writes a text on the board.
- Acceptance: notes behave like the Notes chat (replies, @/# suggestions, photos, edit/star/delete); no empty markers; no thread message appears as a loose board card; permissions and confirmations as described; nothing is lost when the board is off.
- Status: PENDING

### [R9.73] Notes suggestions and item cards using the R9.72 editor API
- Surface: StudioFlow Notes composer/bubbles and Schedule entry deep link; supplements [R9.64] B, WO-SF-NOTES-PRESENTATION-IMAGE-01 slice B
- Fixture: ACTIVE editable project with 12+ Schedule entries, HT code variants, final/active photos, reserved entries and explicit Board links; controlled slow/failed search and unavailable image; read-only account
- Viewport: desktop, narrow tablet and 375 px; light/dark; mouse, keyboard and touch
- Steps: 1. Type bare @/#, partial codes/names and unmatched input; verify Loading/results/empty/error plus Retry, then change the token/close while an older response is pending. 2. Insert mid-text using arrows/Enter/Tab and pointer; keep prefix/suffix/formatting, editor focus and active option association; Escape preserves text and IME never picks or sends. 3. Inspect the popup above the caret at both horizontal edges, long text and after resize; active rows scroll internally. 4. Send escaped/formatted/repeated/unknown codes and inspect inline chips versus explicit links; hover/focus previews, engage by Enter/tap, Open item opens the correct entry, unknown/deleted entry links open Schedule normally. Check missing/failed images and final/active metadata. 5. Check required phase, five-tag rule, feedback/reply/album behavior, Enter/Shift+Enter/list behavior and round 44 px attach/send; refused lookup keeps the draft and displays its safe message. Repeat under read-only rights.
- Acceptance: all slice B interactions remain usable with no shared editor/formatter change; stale results cannot reopen the popup or replace the current list; chip cards and deep links work by keyboard/touch; screenshots/contrast, native touch/IME and subjective layout acceptance remain Reviewer/owner work. Automated Notes and viewport evidence is recorded separately in CHANGELOG.md.
- Status: PARTIAL (R9.95): bare `@`, HT code-prefix search, caret popup, keyboard selection, inline chip, hover/focus card and deep link were already browser-checked in the Notes chat flow; R9.95 adds unmatched-query feedback, lookup-failure feedback and successful Retry without losing the draft. Fast-query race, touch/IME, screenshot/contrast and narrow-viewport checks remain PENDING.

### [R9.70] Shared image crop parity, gestures and all consumers
- Surface: ImageWorkspace in Schedule photo/change, existing-option photo, new-option photo and MOM; ImageGallery in Notes/Workspace/Ideas; supplements [R9.64] D and E, WO-SF-NOTES-PRESENTATION-IMAGE-01 slice D
- Fixture: coloured-quadrant landscape/portrait/square images; 1600×900 at 4:3; transparent PNG, large JPEG, corrupt/refused file; default omitted-aspect/PNG workspace; controlled callback/upload failure; device with two-pointer touch
- Viewport: desktop, narrow tablet and 375 px; light/dark; resize a loaded workspace
- Steps: 1. At fixed 4:5, 4:3 and omitted aspect, compare preview and exported pixels at zoom 1/2/3 and each focus edge; omitted aspect follows the source, and the trace fixture pans from source x=0 to x=400 at zoom 1. For identical zoom/focus/colour/strokes, compare native PNG/JPEG output with R9.69's export in the same browser/encoder (unit fixtures establish identical source rectangles and render/encoder inputs, not native codec bytes). 2. Drag in Pan: picture follows the pointer 1:1 only where overflow exists, with no blank edge. Wheel zoom keeps the cursor's source point fixed unless an image edge clamps it and does not scroll the page; min/max zoom stay 1/3. 3. Pinch around a moving midpoint in Pan and each Draw mode; the second pointer removes only the unfinished first-pointer stroke. Lift either finger, cancel/lose capture, then begin another gesture: no accidental stroke or stuck movement. 4. Verify Pan on mount/new file, Reset crop, Undo last stroke versus Clear annotations, tool-switch retention and crop-relative stroke placement after export. New file resets crop, annotations, colour adjustments, drawing colour and tool. 5. While pending/disabled, try wheel/pointer/draw/picker/drop/page paste and repeated prepare; none changes the working file or duplicates the callback. Check retry after preparation/callback failure, object-URL cleanup and resize redraw. 6. Exercise all four unmodified consumers with their existing initialFile/openOnMount/paste/size/JPEG settings and a default omitted-aspect/PNG fixture. Check colour controls and filter-unavailable fallback, JPEG white background, byte/dimension limits and simple-upload pass-through. 7. Check 44 px swatch/gallery removal targets around unchanged 24 px visuals, missing-image contrast and pending indicator; gallery sm/md/fill/album navigation/actions/index and Ideas square override remain correct.
- Acceptance: preview and export show the same source crop without changing existing export/compression policy; gestures remain bounded and never draw during pinch; all consumers, callbacks/intake, gallery variants and keyboard sliders remain usable. Automated fixtures cover geometry and handler state; rendered pixel, native codec, touch feel and viewport acceptance remain for Reviewer/owner.
- Status: PARTIAL (R9.98): a Chromium regression captures the visible Schedule 4:5 preview at right-edge focus, saves the prepared JPEG through the real consumer, and compares their centre pixels within encoder tolerance. Earlier [R9.64] D checks covered Schedule centre and MOM top-edge. Other focus/zoom positions, the public omitted-aspect mode, gestures, pending/failure handling, remaining consumers and gallery/viewport checks above remain PENDING.

### [R9.68] Presentation pin movement and destructive-action safety
- Surface: Presentation board list/editor and print, supplementing [R9.64] C; WO-SF-NOTES-PRESENTATION-IMAGE-01 slice C
- Fixture: editable ACTIVE project, read-only account, archived/completed project; board with multiple slides, occupied/empty boxes, cover/contain/unknown-ratio images and linked/unlinked pins; controlled action/upload failure
- Viewport: desktop, narrow tablet and 375 px; light/dark themes; mouse, keyboard and touch
- Steps: 1. Drag a pin in cover and contain images, including cropped overflow and every edge. Check local preview, one save on release, retained item/note/label/order, no image drag or trailing added pin. Click under 3 px to select; cancel by Escape, pointercancel and lost capture without saving. 2. Focus/select a pin and use arrows (1%) and Shift+arrows (5%), including bounds and rapid bursts; verify one save after about 400 ms, Escape cancels and a refused save restores the stored position with a visible error. 3. Replace an occupied box through both picker and file drop; remove an image, delete a pin/slide/board. Check all affected counts, cancel each without preparation/upload/write, confirm each once, and repeat clicks while pending. Empty-slot upload and existing-image swap still work without destructive confirmation. 4. Refuse board deletion: stay in the editor with the safe error; successful deletion returns to the list. Refuse board creation: show the safe error and keep its typed title. Fail pin creation and an upload: show a safe error and allow retry. 5. Inspect English labels, keyboard focus, 44 px pin/layout/fit hit regions, 28 px visible dots and selected glyph contrast in both themes at every viewport. 6. Reopen and print the board: saved coordinates align with the image and legend and print pins remain non-interactive; a missing Schedule item displays unlinked without changing stored data. Confirm read-only, archived and completed gates.
- Acceptance: movement saves coordinates only and handles cancellation/refusal without hidden writes; every destructive action has accurate counts, no work on Cancel, and no navigation on failure; pending prevents duplicates; image workflows and paper geometry remain intact. No new layouts, shared UI Engine or StudioFlow behavior changes. Run existing Presentation composition/print and applicable screen-size scenarios with the English selectors.
- Status: PARTIAL (R9.94, R9.96, R9.98): browser regressions confirm picker/drop replacement, pin/image/slide/board deletion, accurate affected counts, Cancel preserving the board through reload, and each confirmed action completing. Forced failures show safe errors and allow retry; R9.98 fixes the saved-but-invisible pin after a failed attempt and verifies the pin appears immediately and remains after reload (three repeated passes). Read purity was proven in the existing R9.68 integration test and was not rerun. Narrow-viewport, pending-repeat, movement, permission and print checks above remain PENDING.

### [R9.66] Notes conflict recovery, full mention edits and refresh ordering
- Surface: StudioFlow project Notes, supplementing the existing [R9.64] A group
- Fixture: WO-SF-NOTES-PRESENTATION-IMAGE-01 slice A; Board disabled; authorized project PIC and unassigned phase-work grant holder; phase-labelled and General notes; more than 100 notes; two Schedule entries; two sessions; controlled lookup/page-read failure
- Viewport: desktop (default) and 375 px
- Steps: 1. Begin an edit in both sessions, save the first, then save the stale second draft; press Reload and inspect the latest saved note beside the retained draft, then cancel/reopen to edit its current version. 2. Star/delete stale rendered notes and verify refusal remains visible after the view reloads. 3. Remove, replace and repeat @CODE mentions on edit; fail an item lookup and retry without losing the draft. 4. Edit/star/delete an existing General note with Board off, repeat without document assignment and attempt a designer-phase note as its drafter. 5. Load older notes, stop reading away from the bottom and refresh through a phase step; repeat for phase/tag/feedback/starred filters, quickly switching filters while reads are in flight. 6. Fail Show older notes and retry. 7. Send a note and confirm the view moves to its newest matching message; switch project and verify its default All view. 8. Confirm official text stays correctable/deletable and origin/phase labels stay locked.
- Acceptance: captured edit version is never advanced under the old draft; explicit reload retains the draft and exposes the latest saved body; every mutation uses the rendered version with clear stale refusals; full mention set stays consistent and lookup failure never saves a partial set; existing General/document and phase-specific gates remain; filtered refresh never shows unfiltered initial data, reading anchor/loaded depth survive, obsolete results cannot win and errors are handled. Canonical policy currently gives a phase PIC document access too; test unassigned phase-work permission separately rather than inventing a phase-only PIC role. No phase × or new General creation.
- Status: PARTIAL (R9.93, R9.97): browser regression confirms removing `@HT-01` from an edit removes its link after reload, and an existing General note can be edited with Board off and persists after reload. A tagged Notes filter remains selected with only matching messages after a real phase rename refresh. The Notes chat suite is 6/6 PASS. Conflict, permission variants, loaded-depth/scroll anchoring, lookup failures and narrow-viewport steps above remain PENDING.

### [R9.64] A — Notes integrity, reader context and existing General edits
- Surface: StudioFlow project Notes with workspace-board off; same records on Board when enabled
- Fixture: WO-SF-NOTES-PRESENTATION-IMAGE-01 slice A (R9.66) implemented; ACTIVE project, designer, drafter with only a different phase's rights, outsider; official text/image/file records, manual feedback, General text, linked Schedule item; two sessions
- Viewport: desktop (default) and 375 px
- Steps: 1. Edit an ordinary note in two sessions; save the first, then the stale second draft. 2. Remove its @CODE and reload the item's linked notes. 3. Attempt official record edit/delete in both views. 4. Filter by phase/tag/feedback/starred, scroll to an older note, then refresh through a phase action elsewhere. 5. With Board off edit an existing General note as an authorized project PIC; repeat without project-level rights. 6. Repeat mutation attempts on completed/archived projects.
- Acceptance: official records stay editable/deletable with origin and phase labels locked (G1 kept, R9.65); stale draft retained with clear conflict; removed link gone; filter and reading position retained with matching records; General edit follows existing rights and never enables the Board module; closed/archive refusals remain. This is future acceptance, not an R9.64 implementation claim.
- Status: PENDING

### [R9.64] B — @/# suggestions, inline item cards and composer
- Surface: StudioFlow Notes composer and sent bubbles
- Fixture: slice B implemented with G2 prerequisite/authority and G3 phase-removal decision recorded; project with at least 12 Schedule items including HT1/HT2, distinct names/locations, one thumbnail, missing thumbnail and topic tags; controlled lookup failure
- Viewport: desktop (default) and 375 px
- Steps: 1. Type bare @ then HT, a name and an unmatched value. 2. Exercise loading/failure/retry and fast query changes. 3. Insert in mid-text; use arrows, Enter/Tab, Esc, hover/click and IME. 4. Send formatted text with @CODE and focus/hover its chip, then Open item. 5. Repeat # known/new/feedback/no-match/failure states. 6. Exercise attach/send, Shift/list Enter, reply, album and the recorded phase-tag behavior.
- Acceptance: immediately visible caret-anchored popup above composer, clamped to viewport; header/code/name/right location and first selection; clear pending/empty/error states; stale requests cannot reopen/replace results; token highlight and exact replacement preserve formatting; item card/link usable by keyboard/touch with safe missing-image handling; established feedback/tag/permissions and send behavior survive. No unapproved General creation.
- Status: PENDING

### [R9.64] C — Presentation pin drag, confirmation and print
- Surface: Presentation board list/editor and print
- Fixture: slice C implemented, board with six layouts, cover/contain images and numbered linked pins; editable/read-only staff; controlled action refusal
- Viewport: desktop (default) and 375 px
- Steps: 1. Select/add a pin, drag it to each edge in cropped and whole images, cancel a gesture and reload. 2. Use approved keyboard nudges. 3. Drag the image to another occupied/empty box. 4. Cancel then confirm picker/drop replacement and pin/image/slide/board deletion. 5. Cause pin-add/create/delete failure. 6. Open print and compare positions, numbering and legend. 7. View a stale Schedule-linked board as read-only.
- Acceptance: pin saves once in image coordinates on release; cancellation/failure restores position; pin drag never adds a pin or moves the image, image drag preserves associated pins; every destructive path is confirmed and cancel does no upload/write; errors stay visible, failed delete does not navigate; printing and read-only views remain correct. Read-side nonmutation additionally needs automated persistence evidence.
- Status: PENDING

### [R9.64] D — Shared crop, gestures and drawing state
- Surface: UI Engine ImageWorkspace through Schedule and MOM
- Fixture: slice D implemented; known colored-quadrant landscape/portrait photos, large JPEG, transparent PNG, unsupported/corrupt image; physical or instrumented two-pointer touch
- Viewport: desktop (default) and 375 px
- Steps: 1. Compare crop preview/export at default and edge focus for Schedule 4:5 and MOM 4:3, plus public no-aspect fixture. 2. Wheel near each corner, pinch around different midpoints, drag Pan to bounds and cancel a gesture. 3. Use sliders and Reset crop/Fit. 4. Change Pan/Draw/subtools, draw several strokes, undo one, clear all and choose another file. 5. Check pending/disabled preparation and saved output colors/size.
- Acceptance: preview/export match, zoom anchors and pan feel direct without blank edges, fixed frame stays visible, gestures cancel cleanly and never become accidental strokes; active state is clear, undo and clear are distinct; existing crop-space annotation bake/quality/format/dimension/byte/fallback contracts preserved. Subjective feel requires Reviewer assessment.
- Status: PENDING

### [R9.64] E — Every image consumer, theme, focus and viewport
- Surface: all production consumers in PLAN.md image matrix; touched Notes and Presentation screens
- Fixture: A–D implemented as applicable; Schedule photo/change, option photo, new-option photo, MOM photo; Notes single/5-image album, Board image viewer, Ideas square image; fitting/oversized images, signed/missing URLs and consumer actions
- Viewport: 375, 640, 839, 840, 841 px and desktop; light/dark themes
- Steps: 1. At every matrix call site exercise its existing picker/drop/paste and successful/error callback. 2. Verify gallery fill/square/album +N, arrows, focus return, viewer actions and removal where offered. 3. Tab all touched controls, inspect focus/selected contrast and measured hit regions. 4. Check reader/popup/editor layout for page-level horizontal overflow and run the screen-size suite when affected. 5. Confirm simple upload consumers did not acquire an extra drawing/crop step.
- Acceptance: every existing consumer retains behavior/limits/options, visible focus and adequate local hit areas; semantic colors/contrast in both themes; no clipped popup/action or sideways page scroll; no unintended global density change. This consumer matrix is coverage, not a pre-implementation no-regression assertion.
- Status: PENDING

### [R9.31] Workspace image reaches Moodboard without Ideas
- Surface: project Phases page, Notes stream and optional Workspace board image viewer
- Fixture: a person with Presentation manage access; one project note/Workspace image; Presentation enabled and Ideas disabled
- Viewport: desktop (default)
- Steps: 1. Disable Ideas and keep Presentation enabled. 2. Open a note or Workspace image in the large viewer. 3. Confirm Save to Ideas and Use in schedule are absent, while Add to moodboard remains. 4. Press Add to moodboard and open the project's Presentation tab. 5. Disable Presentation and reopen the image viewer.
- Acceptance: the image is copied as the last slide of the project's one Moodboard board while Ideas is off; the source image remains; disabling Presentation removes only Add to moodboard and leaves the viewer usable.
- Status: PENDING

### [R9.21] Neutral grouping applies without a price dialog
- Surface: `/bq/[id]` project editor
- Fixture: estimator with an ACTIVE BQ project, one Work Item, and at least two direct Cost Components
- Viewport: desktop (default)
- Steps: 1. Select two direct Cost Components. 2. Choose **Kelompokkan…**. 3. Keep the default name, quantity 1, and markup 0. 4. Choose **Lanjut**.
- Acceptance: the group is applied immediately without the price-change dialog; the returned tree shows both rows in the new Component Group, selection clears, moved rows/group highlight briefly, and the notice says the Work Item price did not change.
- Status: PASS 2026-10-15 (Lead walk, R9.87)

### [R9.21] Price-changing move previews, cancels, then applies
- Surface: `/bq/[id]` project editor
- Fixture: estimator with an ACTIVE BQ project, one direct Cost Component, and an existing Component Group with quantity 2 and markup 10%
- Viewport: desktop (default)
- Steps: 1. Select the direct row and choose the quantity-2/markup-10 Component Group from **Pindahkan ke**. 2. Inspect the preview and choose **Batal**. 3. Verify the row stayed direct. 4. Repeat and choose **Pindahkan**.
- Acceptance: the dialog names one row and its Component Group, shows server values for unit rate and total before/after plus total difference; cancel says nothing changed and writes nothing; apply moves once, updates the returned tree, clears selection, and highlights the destination.
- Status: PASS 2026-10-15 (Lead walk, R9.87) — preview Rp.288.000 checked by hand; Batal writes nothing.

### [R9.21] Move a grouped Cost Component back to the Work Item
- Surface: `/bq/[id]` project editor
- Fixture: the applied state from the price-changing move journey
- Viewport: desktop (default)
- Steps: 1. Open the Component Group. 2. Select the moved row. 3. Choose **Pindahkan ke → Langsung di Work Item**. 4. Confirm if the server reports a price change.
- Acceptance: the row moves back under the same Work Item, the empty Component Group remains and says **Component Group kosong**, selection clears, and no row moves to another Work Item.
- Status: PASS 2026-10-15 (Lead walk, R9.87) — empty group stays "Component Group kosong".

### [R9.21] Locked project hides selection controls
- Surface: `/bq/[id]` project editor
- Fixture: estimator with the same BQ project in LOCKED state (repeat for ARCHIVED when available)
- Viewport: desktop (default)
- Steps: 1. Open the project. 2. Inspect direct and grouped Cost Components and their Work Item row.
- Acceptance: no Cost Component checkbox, select-all checkbox, or selection bar is rendered; the project remains read-only.
- Status: PASS 2026-10-15 (Lead walk, R9.87) — only "Buka di panel"; selection is now Ctrl/Shift+click, not checkboxes.

### [R9.21] Stale selection refreshes safely
- Surface: `/bq/[id]` project editor in two authenticated tabs
- Fixture: estimator with an ACTIVE BQ project and selectable Cost Components
- Viewport: desktop (default)
- Steps: 1. Select a row in the first tab. 2. In the second tab, move or delete that row. 3. In the first tab, request a group or move.
- Acceptance: nothing is applied from the stale request; the first tab says **Daftar berubah. Muat ulang untuk melihat yang terbaru.** and refreshes the project tree.
- Status: PASS 2026-10-15 (Lead walk, R9.87)

### [R9.21] BQ project screen uses the contract nouns
- Surface: `/bq/[id]` project editor and its add/save/apply dialogs
- Fixture: readable BQ project with a Section, Subsection, Work Item, Component Group, Cost Component, Assembly, and rows marked TBC and BY_OWNER
- Viewport: desktop (default)
- Steps: 1. Read the project tree and price status controls. 2. Open the Section, Work Item, Assembly picker, and save-as-Assembly dialogs. 3. Open the Slice 3 selection/group/move controls.
- Acceptance: the screen consistently reads **Section / Subsection / Work Item / Component Group / Cost Component / Assembly / TBC / By Owner**; none of the replaced Indonesian nouns reappear.
- Status: PASS 2026-10-15 (Lead continuation, R9.87) — after the copy fix, the live BQ tree, readiness count, quick-entry labels, Work Item form, Assembly picker (including its Cost Component count), and expanded Work Item controls use the contract nouns; no remaining UI copy use of the replaced nouns in the affected editor files.

### [R8.544] Existing Ideas/Workspace image flows, destinations and recovery
- Surface: Workspace image actions, Ideas image board, shared Use in schedule and Add to moodboard dialogs, Ideas details dialog
- Fixture: private Ideas owner and another user; editable/read-only/completed project; Ideas/Presentation independently enabled and disabled; disposable rebuild fixture for writes
- Viewport: desktop (default) and 375 px
- Steps: 1. From Workspace verify the real fixed project name, choose an existing Schedule item, copy the image and verify source/destination independence. 2. From Ideas with multiple targets verify the picker remains and switching projects clears the item choice. 3. Save a Workspace image to Ideas and add it to Moodboard; verify only the correct owner/project receives a copy. 4. Delay/fail Schedule, Moodboard and Ideas-details requests; pending controls/close are locked and rejection restores controls without losing form text. For uncertain non-idempotent copy completion, check the destination before retrying. 5. Repeat permitted flows with modules disabled/read-only and on phone; no capability or private card becomes reachable through UI changes.
- Acceptance: existing privacy, public module boundaries, permissions, snapshots and independent-copy rules stay intact; destination is clear; no stuck busy state, wrong item or background intake while a dialog owns the interaction.
- Executor evidence 2026-10-13: full automated suite 1,069/1,069; Ideas browser regression with held/aborted Schedule submit and successful retry 1/1 on Edge, including phone width/deletion. In-app Workspace dialog diagnosis verified fixed project name and working item/text controls without a dev write. These checks do not constitute Reviewer PASS.
- Owner manual walk 2026-10-13: owner personally tried the app and says it is provisionally OK; explicitly authorised push with the wider checks deferred to the consolidated BACKLOG. Exact manual steps were not reported; this is separate from Playwright and Lead acceptance.
- Status: PENDING

### [R8.542] Workspace popup interaction and board responsiveness
- Surface: project Workspace, image viewer, Ideas Use in schedule dialog
- Fixture: Designer PIC, editable project with a standalone image; use a disposable rebuild fixture for persisted writes
- Viewport: desktop (default) and 375 px
- Steps: 1. Open a Workspace image and Use in schedule; click/type in Product name and Category, switch new item/existing option and operate selectors without moving the background. 2. Submit to a new Schedule item, verify its image, then place another copy as an option on an existing item; source image stays intact. 3. Close/cancel the nested popup and reopen it. 4. While a popup is open, tool/delete/escape gestures must not change the board behind it. 5. Pan, zoom, drag/resize several elements, type/autosave, paste/upload an image and reload; final positions and content stay correct, with no redundant refresh or keyboard exception. 6. Repeat image-to-Schedule interaction in the stacked phone view.
- Acceptance: popup controls remain interactive, copied images appear in Schedule, no lost edits or unauthorized writes, no background gesture while using a popup; assess sustained-drag responsiveness independently.
- Executor diagnosis 2026-10-13: desktop native clicks and typing, enabled submit, Cancel, pan/zoom/reset verified; image-to-Schedule copying passed integration tests. No dev Schedule write with test product text. Full persisted browser flow and phone check await Reviewer.
- Status: PENDING

### [R8.532] Workspace canvas on the Phases page
- Surface: project Phases page (phase strip, workflow card, Phase details drawer, Workspace canvas, Drawing list lens)
- Fixture: Designer and Drafter PICs, a viewer, a project with existing cards on two phases, a drafter phase with drawings
- Viewport: desktop (default) and 375 px
- Steps: 1. No Workspace tab; the canvas sits under the workflow card. 2. Middle-click drag and Space + left drag move the canvas; the wheel zooms; Fit and 100% work; reload keeps your own view. 3. Drag a card within its frame and into another frame (guide lines show, it snaps), widen it, reload: it stays. 4. Drag and resize a frame; its cards move with it. 5. Add card: type, Enter, type, Enter: two cards in a row, labelled with the selected phase; "+" on a frame adds there. 6. Double-click a card to edit; edit the same card in two sessions (Use theirs / Keep mine). 7. Star, client feedback, phase label, Move to, Delete (gone at once). 8. Filters dim; the phase filter offers its rounds. 9. Phase details shows Requirements, Deliverables, Rounds with counts on the button. 10. On Construction Drawing switch to Drawing list and back. 11. As the Drafter and the viewer: only allowed cards and frames move. 12. 375 px: frames stacked, no horizontal page scroll.
- Acceptance: the canvas feels like the R8.529 prototype; nothing typed is lost; moving never makes a text edit stale; the phone view reads top to bottom.
- Lead check 2026-10-13 (R8.532): steps 1, 3 (drag, kept after reload), 5, 7 (delete), 9, 10 and 12 passed on project 2026-536; test cards removed.
- R8.533 adds: the strip and the round bar are one card; clicking a phase swaps only the bar (no reload, no jump, canvas untouched; `?phase=` survives a reload); on a desktop the page does not scroll and the canvas reaches the bottom of the window, also after resizing it.
- Status: PENDING (owner walk)

### [R8.527] Workspace canvas prototype interaction walk
- Surface: `prototypes/workspace-canvas/index.html` opened directly as a local file
- Fixture: built-in fictional Rumah Puri Indah sample content only
- Viewport: desktop (default) and 375 px
- Steps: 1. Type directly, type `/` and choose each block kind, press Enter, and paste an image. 2. Drag blocks freely, into and out of frames; drag and resize a frame and block; pan and zoom. 3. Create and rename a frame, delete an ordinary frame, and try to delete the default Workspace frame. 4. Star a block, set and clear its phase, switch the active phase, and try every filter. 5. Record Client answered text and open Phase details. 6. Repeat editing, creation, phase/filter controls, Client answered and Phase details at 375 px; inspect the stacked document fallback.
- Acceptance: direct editing and Notion-like creation work; desktop geometry never snaps or jumps; filters only dim; phase selection changes the label context for new blocks; Client answered always adds a labelled Client feedback block to the default Workspace frame even after it is renamed or moved; the default frame refuses deletion; desktop remains a free canvas and 375 px becomes a readable top-to-bottom document without page-level horizontal overflow.
- Status: LEAD WALK PASS 2026-10-13 after R8.528 fixes (served over a local static server: free drag into frames, `/` menu, Client answered, Starred filter dimming, 375 px stacked document with no page overflow, reload keeps changes). Owner's product verdict on the direction is still pending.

### [R8.519] Workspace backend and notes parity
- Surface: project Phases (phase notes), the new project Workspace tab, the phase-note image viewer (Ideas / Schedule / Moodboard), Client answered, supervision visits
- Fixture: Designer and Drafter PICs, a viewer with read only, an unassigned staff member; a project with notes on two phases (text, images, pinned, a client answer, a visit note) migrated from before R8.519; a second browser session for conflicts
- Viewport: desktop (default) and 375 px
- Steps: 1. On the migrated project, check every old note shows on its phase with the same text, images, star, round label and client-feedback mark, and the Workspace board shows them all in the default section named "Workspace" oldest first. 2. Post, edit, star, mark client feedback, add and remove images, and delete a note on a phase; check it appears in Workspace with that phase label. 3. In Workspace add sections, rename, reorder, move cards between sections and positions, set/clear the phase label (the round label goes with it), filter by phase, and try to delete a section that still has cards. Rename and move the default section, then verify it still cannot be deleted even when empty. 4. Edit the same card in two sessions; the second save says someone changed it. 5. Put an ordinary section before the default, then use the global add, record a client answer with text and add a supervision visit with a note; all three cards must still land in the default section with their labels. 6. As the Drafter: write a general card and a CD card, but not a Moodboard card; as the viewer: read only. 7. Use a note image for Ideas, Schedule and Moodboard. 8. Skip a phase whose never-sent round has a card; hard-reset a phase and check its cards stay without a round label.
- Acceptance: no note lost or changed by the migration; the phase notes screen behaves as before; every Workspace command works and is refused where the rule says; conflicts never overwrite silently; no page-level horizontal overflow at 375 px. Lead smoke on the disposable fixture already passed: phase-notes acceptance (7.1, 7.2, 7.6, 8.3), note-image Moodboard (P.5) and a Workspace card/section/move/phase-label/375 px journey.
- R8.523 adds the final board: also drag a card within and across sections and a section by its grip (desktop), use the menu moves at 375 px, the phase and pinned filters (reordering off), Add card with images and a phase label, inline section rename, and the two-session text conflict showing "Their newer text" with Use theirs / Keep mine.
- R8.525 adds the fixed default-section rule: its initial name is "Workspace", it keeps receiving loose, client-answer and site-visit cards after any rename or reorder, and deleting it is refused even when empty.
- Status: PENDING (owner asked Codex to run the acceptance)

### [R8.514] Presentation module extraction parity
- Surface: project Presentation list/editor, Presentation print, Ideas/phase-note Moodboard actions, project navigation, and archived-file cleanup
- Fixture: Designer PIC and viewer/other PIC; editable, completed, and archived projects; boards with several slides and pins with and without Product Schedule links; Presentation enabled and disabled in turn
- Viewport: desktop (default) and 375 px
- Steps: 1. Create, rename, open, and delete a board. 2. Upload several images, reorder and delete slides. 3. Create, move, edit, and delete pins with free notes and Product Schedule links. 4. Add Ideas-card and phase-note images to Moodboard. 5. Compare editor and print content. 6. Toggle Presentation off and on, then verify the existing data returns and project navigation count remains safe. 7. Archive a project and run retention once while Presentation is enabled and once while disabled, including one forced retryable cleanup failure.
- Acceptance: retained URLs and visible behavior are unchanged; board/slide/pin order and Schedule labels remain correct; Moodboard receives independent image copies; editor and print agree; disabled Presentation hides/refuses only its own capability without data loss or StudioFlow breakage; archive cleanup owns Presentation data independently, retries failures, and never lets StudioFlow mark the project purged after a partial failure; neither viewport has page-level horizontal overflow.
- Status: PASS 2026-10-12 (R8.517) after correction R8.516; the retention restore race now has a permanent disposable-database regression test (fails without the fix). Earlier: FAIL 2026-10-12 (R8.515) → see WO-MODULES-M3-PRESENTATION-01-C1. Browser part passed on the disposable rebuild fixture: board create/rename/delete, three-image upload, reorder and delete, pins with and without a Schedule link (edit label side, delete), editor/print parity, navigation count, a deleted Schedule entry shown as unlinked and cleared, Presentation off (tab hidden, list/board/print not found, data kept) and on (data back), 375 px without horizontal scroll, Ideas-card and phase-note Moodboard (existing P.5 and 7.6), print P.6/P.7, upload P.1/P.2. Retention: hook failure and object-delete retry passed; a project restored while the batch runs loses its Presentation slides (Finding 1). Pins have no move control in the editor (unchanged from before R8.514); moving is covered by the service tests only.

### [R8.512] Ideas module extraction parity
- Surface: `/studioflow/ideas`, phase-note image viewer, Product Schedule, and project Presentation moodboard
- Fixture: Designer PIC with Ideas and Schedule permissions; another user; editable, completed, and archived projects; Ideas/Presentation enabled and disabled in turn
- Viewport: desktop (default) and 375 px
- Steps: 1. Create, edit, replace-image, and delete a private card; confirm another user cannot see it. 2. Use one card as a new Schedule item and as an option, then retry one submission. 3. Save a phase-note image to Ideas and place it in Schedule. 4. Add card and note images to Moodboard. 5. Delete the used Schedule option. 6. Repeat target selection against completed/archived projects and toggle Ideas/Presentation off.
- Acceptance: URL and screen remain unchanged; cards stay private; each destination receives an independent image copy; retry creates one Schedule placement; deleted upstream rows leave no visible stale usage; completed/archived writes fail; disabled modules hide/refuse their own capability without breaking StudioFlow.
- Status: PASS 2026-10-12 (R8.513) — dedicated Ideas CRUD/Schedule/responsive journey plus the existing note-image, Moodboard, module-gate and full 138-scenario browser suite all passed on the disposable rebuild fixture; the Lead also visually checked the migrated office Ideas route.

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
- Status: PASS 2026-10-15 (Lead walk, R9.87) for skip/Undo and skip-after-sent; wording later changed to "iteration" by owner decision (leftover: "Round history").

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
- Status: PASSED by the Lead on 2026-09-30 (R8.261) with "ZZ SAMPLE" fixtures (since removed): Pricing all three tabs (filters, search by brand/category, sort headers, Group by item with Lowest, mixed currency without a badge, contacts with tel/WhatsApp, filtered tab counts, clear filters), SKU per-currency "from" summary, Suppliers (Active default, brand, capability and product-category filters, Brands column including owned brands), Brands (Supplied by, Links, filters). Lead continuation 2026-10-15 (R9.87): Brands showed 24 Active, 2 Archived, 26 All and reset to Active; SKUs showed 19 Active, 1 Archived, 20 All and reset to Active. At 375 px, all Pricing filters remained available and page scroll width equalled viewport width. Still not covered: an account without supplier-read permission (contacts must be hidden).

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
- Status: PARTIAL 2026-10-15 (Lead walk, R9.87) — quote with linked SKU updated the price to the quoted amount; the repeat/no-op condition was not run.

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
- Status: PASS 2026-10-15 (Lead walk, R9.87) — 375 and 1280 px, bottom-right and fully visible.

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
- Status: PASS 2026-10-15 (Lead walk, R9.87) — new supplier created inline with a type and selected.

### [R8.213] Schedule: mark a sample received from the card (KB-061)
- Surface: StudioFlow project → Product Schedule (board view and option cards)
- Fixture: option with a REQUESTED sample request
- Viewport: desktop (default)
- Steps: 1. Find the "Sample requested" badge. 2. Click "Mark received" (board) or "Mark sample received" (option card).
- Acceptance: badge turns to "Sample received"; Master Data quote status is unchanged.
- Status: SUPERSEDED by R8.351 (cards carry no controls); receipt from the drawer PASS 2026-10-15.

### [R8.213] New/Edit project: free name, searchable client, no project type
- Surface: StudioFlow → Projects → New project / Edit project; Settings
- Fixture: any staff with project manage
- Viewport: desktop (default)
- Steps: 1. Create a project named without year/number. 2. In Client type a new name and add it. 3. Edit the project name. 4. Open Studio Settings.
- Acceptance: any name saves as typed; duplicate name shows a clear error; client is created and selected; no Project type field and no naming switch.
- Status: PASS 2026-10-15 (Lead walk, R9.87) — duplicate name → "A project with this name already exists."

### [R8.214] Project dates are set only from Timeline
- Surface: StudioFlow → Timeline; Projects → New / Edit project
- Fixture: staff with project manage; a project with an opening date
- Viewport: desktop (default)
- Steps: 1. Confirm New and Edit project have no date fields. 2. On Timeline click "Edit project dates", change start and opening date, save. 3. Edit the project's address on Projects and save.
- Acceptance: the bar and both date labels update immediately; the opening date survives the unrelated edit; clearing start falls back to the day the project was added.
- Status: PASS 2026-10-15 (Lead walk, R9.87)

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
- Fixture: an Ideas card and a Presentation board with at least one slide; Developer command access
- Viewport: desktop (default)
- Steps: 1. With both modules enabled, open Ideas and Presentation and confirm their existing workflows. 2. Disable Ideas; reload and inspect the rail and project-note image actions, then open the old Ideas URL. 3. Re-enable Ideas and confirm the same card returns. 4. Repeat for Presentation, including its project tab, moodboard entry points, board URL, and print URL.
- Acceptance: enabled behavior is unchanged; disabled entries disappear without breaking surrounding layouts; disabled URLs are not-found; enabling restores the same saved data.
- Status: PASS except the note-image buttons (R8.500, Lead, home dev database): rail Ideas entry, Ideas URL not-found, Ideas-card "Add to moodboard…" hidden with Presentation off, project Presentation tab gone with the tab bar intact, Presentation URL not-found, both back with the same cards and board after enabling. The home database has no phase-note image, so the note-image buttons were checked in code only; still to walk once a note has an image.

### [R9.51] Create and select a Brand without leaving New price
- Surface: `/masterdata/pricing` → New price → Material → Brand
- Fixture: staff with material-price, SKU and Brand manage access; an active product category, unit and supplier
- Viewport: desktop (default)
- Steps: 1. Fill a price row. 2. Search for a new Brand name and choose Create brand. 3. Confirm the stored, title-cased name is selected without losing the row. 4. Add a New SKU row and save its price. 5. Open Brands and inspect the new Brand.
- Acceptance: the Brand is immediately available and selected, existing row input survives, the saved new SKU carries that Brand, and the Brand has no owner; supplier/category enrichment follows the existing price-save path.
- Status: PASS 2026-10-15 (Lead walk and continuation, R9.87) — "zz qa brand" → "Zz Qa Brand" selected, new SKU row saved with it; the archived Brand's Edit dialog showed Owner supplier unset, while ZZ QA Supplier was listed only under Suppliers.

### [R9.51] Brand creation is hidden without Brand manage access
- Surface: `/masterdata/pricing` → New price → Material → Brand
- Fixture: staff with material-price manage and Brand read access, without Brand manage
- Viewport: desktop (default)
- Steps: 1. Open New price. 2. Search for an unknown Brand name. 3. Select an existing Brand.
- Acceptance: no Create brand option is offered; existing Brands remain selectable.
- Status: PENDING
