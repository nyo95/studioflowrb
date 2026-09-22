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

_(empty — the SF-A Requirements items formerly listed here described routes
that no longer exist: `SfRequirement` and its `/requirements` panels were
merged into the phase checklist as `is_blocking` in R8.106. Removed
2026-09-22 rather than left as dead acceptance items for a deleted feature.)_

---

## Completed

_(cleared 2026-09-22 — see `CHANGELOG.md` for the revisions that superseded
this backlog's former SF-A entries.)_
