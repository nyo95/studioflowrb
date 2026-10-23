# Active Plan

Plan ID: WO-SF-SAMPLE-PHOTO-01; full plan in `docs/apps/studioflow/WO-SF-SAMPLE-PHOTO-01.md`
Scope: Master Data's sample-request queue shows the requested schedule item's photo and code.
Module(s): `studioflow` (sample-request public read), sample-request coordinator, `masterdata` (queue UI).
Target revision: plan R9.224; backend (Codex) R9.225; UI (Lead) R9.226.
Risk: low-medium - widens a cross-app read contract that carried no images (signed URL only, never a storage key).
Status: READY for Executor (R9.225).
Priority: P2
Owner: Product Owner (decision 2026-10-23: when a sample is requested, show the schedule item's picture if there is one)
Last updated: 2026-10-23

Previous plan: `WO-SF-SCHEDULE-CONTACT-MD-01` DONE in R9.222 (Codex, PASS) and R9.223 (Lead UI); owner browser check owed.

## Locked Decisions

See `docs/apps/studioflow/WO-SF-SAMPLE-PHOTO-01.md` "Locked decisions" 1-6.

## Acceptance Criteria

As in WO-SF-SAMPLE-PHOTO-01 "Acceptance". Executor verification: typecheck, lint, studioflow and masterdata unit and
integration tests, coordinator tests, boundary checks, build. No migration.
Reviewer (Lead) owns the UI (R9.226) and acceptance; browser checks are the owner's.

## Executor Prompt

```text
Role: BACKEND EXECUTOR. Read AGENTS.md, docs/agent/EXECUTOR.md, PLAN.md and
docs/apps/studioflow/WO-SF-SAMPLE-PHOTO-01.md. Location: kantor (load .env.kantor, STUDIOFLOW_LOCATION=kantor).
Implement only the "Executor scope (R9.225)": SampleRequestRead.option gains imageUrl (15-minute signed read URL,
never the storage key; null without a photo or when it cannot be signed) and entryCode; wire the storage port into
createStudioFlowSampleRequestRead; SampleQueueRow.product carries both through the coordinator; update the contract
comment; tests; changelog R9.225. No intake snapshot change, no migration, no UI change (Lead R9.226). Restart the
:3001 dev server, commit locally as R9.225 (no push) and return the Planner/Reviewer prompt with outcome, commit,
checks, limitations and dirty files.
```
