# Active Plan

Plan ID: WO-SF-SUPERVISION-HANDOVER-01
Scope: Close the Supervision phase ("Done (handover)") when it is active with no open visit, provided at least one visit was completed
Module(s): studioflow (phases service, phase command action, phase actions UI)
Target revision: **R9.80** (Lead plan R9.79; built by the Lead on the owner's "kamu aja takeover")
Status: COMPLETE in code (R9.80); owner browser check pending
Priority: P2
Owner: Product Owner; Lead locks and reviews
Last updated: 2026-10-15

## Outcome

Today the only way to finish Supervision is "Done (handover)" on an **open** visit. After a visit is closed with "Next visit" the next-visit dialog opens; if there is no further visit and the user cancels, the phase stays active with only "New visit" — they must invent a visit, Undo, or "Skip this phase" (which records "skipped" although visits happened). After this plan, an active Supervision phase with no open visit and ≥1 completed visit also shows **Done (handover)**, which closes the phase exactly like closing it on a visit (phase DONE and locked, the next phase auto-starts as today, Undo restores it).

Previous Work Order WO-SF-BOARD-THREADS-01 is complete in code (R9.75–R9.78, history at `5bca20f:PLAN.md`); its browser group [R9.78] is pending with the owner.

## Context and Evidence

- Owner 2026-10-15 (screenshot of "New site visit"): "kalau ga ada "visit" gmn?" → "Ya, tambahkan tombol Done (handover) saat fase pengawasan aktif tanpa kunjungan terbuka (kalau sudah pernah ada kunjungan)."
- `chooseSupervisionVisit` (`src/apps/studioflow/phases/service.ts:418`) refuses without an open (`NOT_SENT`) visit; `closePhase` (:281) sets the iteration DONE, the phase DONE + locked, runs `autoAdvance`, records an undoable event (`phaseBefore`, `autoAdvance`) and audits.
- UI: `PhaseActions` in `src/app/(platform)/studioflow/_components/phase-commands.tsx:115–123` shows only "New visit" for an active Supervision phase with no current visit. The phase view is built at `phases/service.ts:~590–640` (`isSupervision`, `status`, open iteration).
- "Skip this phase…" (`bypassPhase`) remains the path for projects with **no** supervision at all — unchanged.

## Locked Decisions

1. Allowed only when: the phase is Supervision (`isLegacySupervisionDefinition`), status ACTIVE, project ACTIVE and writable, **no open visit** (`NOT_SENT`/`SENT`/`ANSWERED`), and **at least one visit with status DONE**. Otherwise refuse with `invalidState` and a clear message ("Close the open visit with Done (handover)." / "Record at least one visit, or skip the phase.").
2. Same permission gate as `chooseSupervisionVisit`.
3. Same effects as `closePhase` minus touching an iteration: phase DONE + locked, `autoAdvance`, undoable event anchored to the **last completed visit** (`from`/`to` DONE, `phaseBefore: "ACTIVE"`, `autoAdvance`), audit `supervision-finished`. Undo returns the phase to ACTIVE with no open visit and removes the auto-started next iteration (existing undo rules, incl. `UNDO_HAS_NEWER_DATA`).
4. No schema change, no migration, no new dependency. English copy.

## Backend Contract

- Service: `finishSupervision({ projectId, phaseId })` in the phases service, one transaction with the same locking as the other phase commands.
- Phase view: add `canFinishSupervision: boolean` (true exactly under Decision 1, independent of the actor's rights; the UI combines it with `canAct`).
- Action: `PhaseCommand` gains `{ command: "finishSupervision", projectId, phaseId }` routed to the service; returns the normal phase outcome (summary/undo like `chooseVisit` DONE).

## UI Contract (minimal wiring, Executor)

In `PhaseActions`, for an active Supervision phase without a current visit: keep **New visit**, and when `phase.canFinishSupervision` add **Done (handover)** (primary) running `finishSupervision` with summary `${phase.name} done`. No other UI changes.

## Verification

Integration tests: success after one completed visit (phase DONE/locked, next phase auto-started as with a visit close, undo restores ACTIVE and removes the auto-started iteration); refused with an open visit, with no completed visit, on a non-supervision phase, on a DONE/PENDING phase, for an actor without phase rights, on archived/non-ACTIVE projects; `canFinishSupervision` true/false cases. Then `npm test`, typecheck, full lint, `check:boundaries`, `check:legacy-runtime`, production build, whitespace. Kantor env; no DB schema change. Browser acceptance by the owner: close a visit with "Next visit", Cancel the new-visit dialog, press **Done (handover)**, then Undo.

## Executor Prompt

```text
ROLE: BACKEND EXECUTOR. Location: kantor (load .env.kantor, set
STUDIOFLOW_LOCATION=kantor, verify rebuild-only dev/test targets). Read
AGENTS.md, docs/agent/EXECUTOR.md and PLAN.md WO-SF-SUPERVISION-HANDOVER-01.
Add finishSupervision: an active Supervision phase with no open visit and at
least one DONE visit closes like Done (handover) (phase DONE + locked,
autoAdvance, undoable event on the last completed visit, audit), with the
refusals listed; phase view canFinishSupervision; PhaseCommand
"finishSupervision"; and the one Done (handover) button beside New visit in
PhaseActions. No schema/migration/dependency, legacy or remote operation.
Preserve untracked owner files under test/. Finish with the listed tests and
all checks, CHANGELOG R9.80, one local commit. Return only the
Planner/Reviewer prompt: outcome, commit, checks, limitations, remaining dirty
files. Stop with BLOCKED / CONFLICT if the plan contradicts the repository.
```
