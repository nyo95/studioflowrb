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
- Status: PENDING

---

## Completed

_(cleared 2026-09-22 — see `CHANGELOG.md` for the revisions that superseded
this backlog's former SF-A entries.)_
