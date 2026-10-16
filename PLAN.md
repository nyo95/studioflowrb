# Active Plan

Plan ID: WO-SF-SAMPLE-DECLINE-01
Scope: Master Data sample-request refusal reaches Product Schedule
Module(s): masterdata; studioflow through their existing application coordinator and public app contracts
Target revision: R9.100
Status: COMPLETE — R9.100 built; R9.102 Lead browser and integration review PASS
Priority: P1
Owner: Product Owner; Codex implements the explicitly approved workflow
Last updated: 2026-10-16

Reviewer outcome: PASS in R9.102 for the locked decline flow, including notification, Schedule reason/waiting count, re-request, and recovery of a prior mismatch without a second notification. The owner separately directed Codex to act as Lead while Claude is limited. No next Work Order is selected by this completed plan.

## Outcome

When Master Data declines a physical sample request, the requester is notified and Product Schedule shows “Sample declined” with the staff reason. The request ceases to count as waiting, and the designer may request a new sample for the same option. A request already declined in Master Data but still `REQUESTED` in StudioFlow is visibly repairable without re-declining or duplicating the notification.

## Locked Decisions

- `DECLINED` is a distinct StudioFlow sample-request state; keep the staff reason, actor and time as historical facts on that request, not in `received_note`.
- Master Data owns its intake/refusal and notification; StudioFlow owns its schedule request. The application coordinator connects them through app-owned commands. No cross-app foreign key, implicit cross-app schema write or new permission.
- The existing physical sample `RECEIVED` fact is not rewritten by a late decline. A new request is permitted after a `DECLINED` one, following the existing re-request rule after `RECEIVED`.
- A normal refusal updates StudioFlow promptly. If the second app write cannot complete, preserve Master Data's committed refusal and expose an idempotent retry for staff, including pre-existing mismatches.
- Pending counts and “Sample waiting” filters remain defined only by `REQUESTED`.

## Implementation and Verification

Add StudioFlow-owned migration, read projection and narrow idempotent decline command; connect it in the coordinator and action, add a retry affordance to Master Data's queue, and display the declined state and reason in Schedule. Update the relevant contract, regression/integration tests, browser-acceptance ledger and changelog. Run the Executor commit gates. Do not touch the root `test/` directory, legacy database or remote GitHub.

## Executor Prompt

You are the Backend Executor at the kantor checkout. Implement this READY work order as R9.100 using app-owned contracts and the smallest correct UI wiring. Preserve historical data and unrelated changes, run required checks, update CHANGELOG, and create one local commit. Report results and any remaining browser acceptance; do not push.
