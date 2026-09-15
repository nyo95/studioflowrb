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

### [R8.72 / SF-A] Phase Requirements — full lifecycle
- Surface: `/studioflow/projects/[id]/phases/[phaseId]/requirements`
- Fixture: Berkah / 2026-483-Sociolla SPZ PI / Moodboard phase
- Viewport: desktop
- Steps:
  1. Navigate to Phase Requirements for any phase on the fixture project.
  2. Create a new requirement.
  3. Satisfy it (add satisfaction note).
  4. Reopen it (add reopen reason).
  5. Archive it (add reason). Reload page.
  6. Restore it. Reload page.
- Acceptance: each transition persists after reload; status label correct at
  each step; satisfaction note visible on SATISFIED record.
- Status: PENDING

### [R8.72 / SF-A] Phase Requirements — evidence link on live requirement
- Surface: `/studioflow/projects/[id]/phases/[phaseId]/requirements`
- Fixture: Berkah / 2026-483-Sociolla SPZ PI / any phase
- Viewport: desktop
- Steps:
  1. On an OPEN or SATISFIED phase requirement, link an existing project file.
  2. Verify evidence appears.
  3. Archive the requirement.
  4. Verify unlink control is absent; evidence file still shows (read-only).
- Acceptance: unlink control visible only when OPEN/SATISFIED; invisible when ARCHIVED.
- Status: PENDING

### [R8.72 / SF-A] Permission denial — Requirement routes
- Surface: both General and Phase Requirement routes
- Fixture: user without project access (or a project the fixture user cannot access)
- Viewport: desktop
- Steps:
  1. Sign in as a user without access to the target project.
  2. Navigate directly to `/studioflow/projects/[id]/requirements`.
  3. Navigate directly to `/studioflow/projects/[id]/phases/[phaseId]/requirements`.
- Acceptance: permission-denied screen at both routes; no error boundary; no
  application crash.
- Status: PENDING

### [R8.72 / SF-A] Signed-out redirects — Requirement routes
- Surface: both General and Phase Requirement routes
- Fixture: signed-out session (clear cookies / incognito)
- Viewport: desktop
- Steps:
  1. While signed out, navigate to `/studioflow/projects/[id]/requirements`.
  2. While signed out, navigate to `/studioflow/projects/[id]/phases/[phaseId]/requirements`.
- Acceptance: both routes redirect to `/login`; no error boundary.
- Status: PENDING

### [R8.72 / SF-A] 375 px — Project List
- Surface: `/studioflow/projects`
- Fixture: Berkah
- Viewport: 375 px
- Steps:
  1. Set viewport to 375 px width.
  2. Scroll the full page.
- Acceptance: no horizontal overflow; all project cards and actions fully
  visible and reachable.
- Status: PENDING

### [R8.72 / SF-A] 375 px — Project Detail
- Surface: `/studioflow/projects/[id]`
- Fixture: Berkah / 2026-483-Sociolla SPZ PI
- Viewport: 375 px
- Steps:
  1. Set viewport to 375 px width.
  2. Scroll the full page; open any expandable section.
- Acceptance: no horizontal overflow; all controls reachable; no text cut off.
- Status: PENDING

### [R8.72 / SF-A] 375 px — General Requirements
- Surface: `/studioflow/projects/[id]/requirements`
- Fixture: Berkah / 2026-483-Sociolla SPZ PI
- Viewport: 375 px
- Steps:
  1. Set viewport to 375 px width.
  2. Scroll full page; open create form; open a requirement's action menu.
- Acceptance: no horizontal overflow; form and action controls reachable.
- Status: PENDING

### [R8.72 / SF-A] 375 px — Phase Requirements
- Surface: `/studioflow/projects/[id]/phases/[phaseId]/requirements`
- Fixture: Berkah / 2026-483-Sociolla SPZ PI / Moodboard phase
- Viewport: 375 px
- Steps:
  1. Set viewport to 375 px width.
  2. Scroll full page; open create form; open a requirement's action menu.
- Acceptance: no horizontal overflow; form and action controls reachable.
- Status: PENDING

---

## Completed

### [R8.72 / SF-A] General Requirements — full lifecycle
- Surface: `/studioflow/projects/[id]/requirements`
- Fixture: Berkah / 2026-483-Sociolla SPZ PI
- Viewport: desktop
- Steps: create → satisfy (with note) → reopen → archive → restore
- Acceptance: each transition persists; status label correct; satisfaction note visible.
- Status: PASS 2026-09-14 (Executor-run; Reviewer to confirm at phase gate)

### [R8.72 / SF-A] General Requirements — evidence link + archived unlink guard
- Surface: `/studioflow/projects/[id]/requirements`
- Fixture: Berkah / 2026-483-Sociolla SPZ PI
- Viewport: desktop
- Steps: link project PDF as evidence → archive requirement → confirm no unlink control
- Acceptance: evidence visible; unlink absent when ARCHIVED.
- Status: PASS 2026-09-14 (Executor-run; Reviewer to confirm at phase gate)

### [R8.72 / SF-A] Create project — client_name persists
- Surface: create project form
- Fixture: Berkah
- Steps: create new project with a named client; reload project detail
- Acceptance: client name visible on project detail after reload.
- Status: PASS 2026-09-14 (Executor-run; Reviewer to confirm at phase gate)
