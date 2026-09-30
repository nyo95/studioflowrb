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

### [R8.173] Project overview revision history loads on demand
- Surface: `/studioflow/projects/[projectId]`
- Fixture: reader with StudioFlow access/project-read; project with active and closed revisions, including an empty closed revision
- Viewport: desktop
- Steps: 1. Open the project overview. 2. Expand each closed revision. 3. Close and reopen one revision. 4. Simulate a failed action request and reopen to retry.
- Acceptance: overview renders; closed-revision counts are correct; items load only when opened and retain content, order and done styling; empty history says No items; loading/error lines appear appropriately and retry works.
- Status: PENDING

### [R8.173] Phase page retains active items and lazy closed history
- Surface: `/studioflow/projects/[projectId]/phases/[phaseId]`
- Fixture: reader with StudioFlow access/project-read; phase with active and closed revisions
- Viewport: desktop
- Steps: 1. Open the phase page. 2. Inspect active items. 3. Expand a closed revision. 4. Verify a user without project-read cannot load revision activities.
- Acceptance: phase renders; active items remain visible; closed history shows the same list when opened; unauthorized reads fail.
- Status: PENDING

### [R8.173] Header quick-search preserves results
- Surface: StudioFlow header quick-search
- Fixture: authorized reader; more than six matching projects/clients, archived records and projects matching only their client name
- Viewport: desktop
- Steps: 1. Search by project name. 2. Search by client name with mixed case. 3. Open a result.
- Acceptance: up to six projects and six clients retain previous ordering and archive handling; result labels and navigation are unchanged.
- Status: PENDING

### [R8.173] Project rename rejects a changed number
- Surface: project edit dialog
- Fixture: user with project-manage; writable project with a known project number
- Viewport: desktop
- Steps: 1. Submit a formatted name with a different number. 2. Submit with the existing number. 3. Submit only a readable name.
- Acceptance: changed number returns the plain-language validation error without saving; same-number and readable-name edits still work. Edit-dialog hint polish remains Lead-owned.
- Status: PARTIAL (Lead, 2026-09-29). Verified: the edit dialog shows the stored number ("The number 2026-507 stays fixed.") and a changed number is refused with "The project number cannot be changed." and nothing is saved. NOT verified: same-number and readable-name-only edits.

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
