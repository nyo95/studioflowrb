# Active Plan

Plan ID: WO-SF-SCHEDULE-CONTACT-MD-01; full plan in `docs/apps/studioflow/WO-SF-SCHEDULE-CONTACT-MD-01.md`
Scope: a schedule option's Contact is suggested from the Brand's Master Data contacts as "Name (Title) - phone" and stays freely editable.
Module(s): `masterdata` (new public read `listBrandContacts`), `studioflow` (schedule read, action, then inspector UI).
Target revision: plan R9.220; backend (Codex) R9.221; UI (Lead) R9.222.
Risk: low-medium - a new cross-module read of contact phone numbers; no schema change.
Status: READY for Executor (R9.221).
Priority: P2
Owner: Product Owner (decision 2026-10-23: Contact from Master Data when present, with override; format "Andi (Sales) - 0813412457877")
Last updated: 2026-10-23

Previous plan: `WO-SF-SCHEDULE-BRAND-FREE-01` DONE in R9.217 (PASS in R9.218). R9.219 balanced the List's Type and
Initials type widths and recorded the owner-approved Phase 1 cleanup of project 2026-536.

## Locked Decisions

See `docs/apps/studioflow/WO-SF-SCHEDULE-CONTACT-MD-01.md` "Locked decisions" 1-6.

## Acceptance Criteria

As in WO-SF-SCHEDULE-CONTACT-MD-01 "Acceptance". Executor verification: typecheck, lint, masterdata and studioflow
unit and integration tests, boundary checks, build. No migration.
Reviewer (Lead) owns the UI (R9.222) and acceptance; browser checks are the owner's.

## Executor Prompt

```text
Role: BACKEND EXECUTOR. Read AGENTS.md, docs/agent/EXECUTOR.md, PLAN.md and
docs/apps/studioflow/WO-SF-SCHEDULE-CONTACT-MD-01.md. Location: kantor (load .env.kantor, STUDIOFLOW_LOCATION=kantor).
Implement only the "Executor scope (R9.221)": Master Data public read listBrandContacts(brandId) per decision 3;
StudioFlow formatScheduleContact (domain), schedule service listBrandContactChoices with schedule read and project
access, and server action listScheduleBrandContactsAction; tests; changelog R9.221. Contact stays a text snapshot:
no schema change, no foreign key, no auto-fill, no UI change (Lead R9.222). Restart the :3001 dev server, commit
locally as R9.221 (no push) and return the Planner/Reviewer prompt with outcome, commit, checks, limitations and
dirty files.
```
