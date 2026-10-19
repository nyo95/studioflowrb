# Active Plan

Plan ID: WO-SF-DELIVERABLE-MANAGER-DELETE-01
Scope: Align Studio Manager Deliverable deletion with the locked StudioFlow authority matrix
Module(s): StudioFlow
Target revision: R9.143
Risk: high — this corrects an authorization boundary for private file deletion. Stop if the required behavior conflicts with the owner-ratified matrix or alters any other phase/content authority.
Status: READY
Priority: P1
Owner: Product Owner
Last updated: 2026-10-19

## Outcome

A Studio Manager can delete a private Deliverable from any open project through the centralized Deliverables page, even when that Manager is not the assigned Designer or Drafter. Upload remains limited to the phase's authorized PIC.

## Context and Evidence

- The owner-ratified authority matrix (§3 and §5.4 of the StudioFlow contract) assigns explicit Deliverable deletion to Studio Manager, while upload follows the phase-seat PIC.
- R9.141 presents the Delete action to a Studio Manager, but the deletion service subsequently applies the PIC content-mutation guard. A Manager who is not a PIC is therefore shown an action that the service refuses.
- The KB now records the same Manager/PIC split as the durable authority matrix; this is a correction to implementation, not a new product decision.

## Locked Decisions

- FIX only Deliverable deletion: require the existing `studioflow.project.manage` Manager authority and validate that the file belongs to the named open project.
- Do not use PIC content permission for this Manager-only deletion operation. Retain the existing audited delete, private object cleanup ledger and project/phase writable checks.
- Keep private file reads under project-detail access. Keep upload exactly phase-scoped: assigned Designer for designer-seat phases; assigned Drafter for drafter-seat phases; Platform Owner override continues its existing recovery behavior.
- Do not broaden Manager rights to phase transitions, notes, uploads, MOM, Schedule, Presentation, drawings or Timeline mutation. No schema, migration, role, public URL or storage behavior change.

## Acceptance Criteria

- A Studio Manager with `project.manage`, who is neither project PIC, can delete a phase Deliverable from an open project; audit and cleanup behavior remain intact.
- The same Manager cannot upload the replacement, alter phase content or bypass a closed/locked project through this correction.
- An assigned authorized PIC still uploads normally, and a user without `project.manage` cannot delete.

## Verification

- Tier: high (private-file authorization and destructive operation). Per-command timeout: 15 minutes.
- Add direct StudioFlow service integration coverage for a non-PIC Manager delete success and refusal for no-manager and closed/locked project cases; retain/extend existing PIC upload coverage as consumer evidence.
- Verify the centralized panel exposes the action consistently with the service boundary.
- Run `node scripts/verify.mjs --tier high` after the targeted tests. No database/schema change is expected; do not create or apply a migration.
- Browser acceptance remains Reviewer-owned and owner-deferred. Extend the existing Deliverables browser scenario only as a pending record; do not claim browser PASS.

## Reviewer Acceptance

- As a non-PIC Studio Manager, delete a phase file from the centralized Deliverables page and confirm it disappears after reload. As the same Manager, confirm upload is unavailable. Confirm an assigned PIC can upload and a non-manager cannot delete.

## Regression Risks and Recovery

- Over-broad authorization could let Managers mutate phase work. Limit the exception to the single deletion command and prove refusals with service integration tests. If regression appears, revert the correction commit; no data model changes are involved.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md` and this READY `PLAN.md`; implement only the Studio Manager Deliverable-delete correction, preserve all other PIC/phase permissions, add the locked authorization tests, run the high gate, update the changelog and pending browser scenario, then commit local revision R9.143. Do not claim browser acceptance or independent Claude review.
