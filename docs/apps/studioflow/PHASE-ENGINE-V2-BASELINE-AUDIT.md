# Phase Engine v2 — Baseline Audit (draft vs codebase)

Status: PLANNER NOTE — evidence only, not a contract, not authorization to change code/schema
Date: 2026-09-16
Input: `STUDIOFLOW-PRODUCT-MENTAL-MODEL-PHASE-V2-DRAFT.md` (owner direction draft)
Checked against: `main` @ `d19188e` (R8.86) — matches the draft's pinned baseline.
Authority in force: `STUDIOFLOW-REWORK-CONTRACT.md` (ACTIVE, owner-ratified 2026-09-15, R8.70).

---

## 1. Draft "VERIFIED CURRENT" claims — all confirmed

| Draft claim | Evidence | Result |
|---|---|---|
| 5 hardcoded phases, blueprint in app code | `domain/phase.ts` `PHASE_KEYS`/`PHASE_BLUEPRINT`; Prisma `enum SfPhaseKey` | ✅ |
| 7 stored statuses | `PHASE_STATUSES`; `enum SfPhaseStatus` | ✅ |
| Revision `{major,minor}`, label `vM.m` | `revisionLabel()`, `nextRevision()`, `model SfRevision` | ✅ |
| Internal reject → minor+1, client reject → major+1.0 | contract §5.2, `nextRevision()` | ✅ |
| FEEDBACK → TODO on reject | contract §5.2, `SfActivityMode` | ✅ |
| Approval blocked by open work/checklist | contract §6.4, `domain/blockers.ts`, `phases/blocker-query.ts` | ✅ |
| CD = drafter seat | `phaseOwnerSeat()` | ✅ |

Minor naming drift: code labels are "Layout Plan" and "3D Design"; draft uses "Layout" and "Design 3D".

## 2. The draft reverses decisions ratified ONE DAY earlier

The v2 contract must say explicitly that it overrides these, otherwise the Executor faces two conflicting authorities:

| Rework contract (2026-09-15) | Draft v2 (2026-09-16) |
|---|---|
| §2 PURGE: "phase-template administration, per-project phase add/remove" | Office Phase Template + project snapshot (§4.1) |
| §5.1 "Phase set is app code, not an administered template" | configurable, a 6th phase is possible |
| §2 PURGE: "Requirement templates/project requirements/evidence" and §9 "Requirements are checklist templates" | Requirement is a separate domain from Todo (§7.1, §9) |
| RW-01 / §5.4 label `vMAJOR.MINOR` | `D3`, `D3.1` (prefix per phase, TBD) |
| §6.1 Activity = revision work | Todo is not owned by a revision (§7.2) |
| §8 phase page is the place for actions + project rail lists 5 phases | Overview is the main workspace; phase page is secondary |
| RW-04 Deliverables = wave 2 | Deliverables v2 is on the critical path before Timeline |

Note: the first-class Requirements + evidence model already existed at R8.62–R8.69 and was purged in R8.70 (`20260915100000_sf_r1_legacy_rework_cutover` runs `DROP SCHEMA "studioflow" CASCADE`). v2 needs to state how its Requirements differ from what was purged (proposal: a lighter model with no evidence linking).

## 3. Key finding — two "Todo" stores + Requirements live inside the Todo table

The codebase currently has **two** work-item stores:

| | `SfActivity` | `SfChecklistItem` |
|---|---|---|
| Owner | project + phase? + **revision?** | project + phase? |
| Features | TODO/FEEDBACK, assignee, due, defer | priority 1–4, due, assignee, labels, subtasks (depth 1), reorder, saved filters |
| Where it shows | Overview "General to-dos", phase page, Today | Overview "General checklist", phase checklist, Today |

- **`SfChecklistItem` already almost exactly matches the draft's Todo v2 model** (§7.2: project_id required, phase_id optional, assignee, due, priority, labels, status). It is Todoist-shaped.
- **Current Requirements = checklist items generated from `SfChecklistTemplate`**, stored in the same table as ordinary tasks (the Overview shows "General checklist — Studio-wide requirements for every project"). This is exactly the `Todo != Requirement` conflation the draft forbids.
- The blocker (§6.4) counts unchecked root checklist items → today, both requirements and ordinary todos block approval.

Planner implication: Todo v2 does not need a new table. The most likely path is to **consolidate on `SfChecklistItem`** as the single Todo SSOT, separate Requirements (template-generated) into their own representation, and restrict `SfActivity` to review feedback, or retire it. This is a data/migration decision (draft TBD #7) that the owner must ratify.

## 4. State machine — v2 is almost 1:1 with the stored state (enum rename may not be needed)

| Draft §11 candidate | Stored today | UI label today |
|---|---|---|
| NOT_STARTED | PENDING | Not started |
| WORKING | IN_PROGRESS | Working |
| INTERNAL_REVIEW | ON_REVIEW_INTERNAL | Internal review |
| READY_TO_SEND | APPROVED_INTERNAL | Ready to send |
| EXTERNAL_REVIEW | ON_REVIEW_CLIENT | With client |
| APPROVED | READY_FOR_NEXT | Approved |
| (special) | COMPLETED (Supervision/bypass/last) | Done |

Recommendation: **keep the stored enum**, change only the presentation and the gate UX → no destructive migration for draft TBD #2.

Behaviour conflicts that need a decision:
1. `rejectInternal` is also allowed from `ON_REVIEW_CLIENT` (minor bump). Draft §8: external needs-changes → major. Keep it or remove it?
2. `submitInternal`/`submitClient` can go straight IN_PROGRESS → ON_REVIEW_CLIENT (skipping internal review). Draft §8 describes a strict WORKING → INTERNAL → READY → EXTERNAL order.
3. `overrideRevision` (HARD_RESET with arbitrary major/minor) and `reopen` → can **decrement** the number, contradicting "numbers only move forward". Draft §6.3 allows only an "audited exceptional correction".
4. `bypass` (skip phase) is not mentioned in the draft.

## 5. Configurable phases = the biggest schema impact

Current code binds everything to `key: SfPhaseKey` (enum):
`@@unique([project_id, key])`, `PHASE_ACCENT_DOT_CLASSES` per key, `phaseOwnerSeat(key)`, `SfChecklistTemplate.phase_key`, `canActivatePhase` via `allow_parallel` from the blueprint.
A 6th phase requires: a Phase Definition table, the project phase snapshotting label/order/parallel/seat/accent/prefix, and a migration from the enum to a definition reference. This is the only item in the draft that is clearly a **destructive schema change** → needs its own migration plan (draft §19.4).

## 6. Overview today vs Overview v2

Current (`projects/[projectId]/page.tsx`, 94 lines): PipelineStrip (links to the phase page) + one line of "next step" text + General to-dos (Activity) + General checklist + Details.
Missing for v2: phase cards with actions, iteration update, per-phase todos, deliverable status, a separate requirements section, progressive disclosure. All phase actions still live only on `phases/[phaseId]/page.tsx` (`PhaseActions`).

## 7. Deliverables

No deliverable model exists (no `SfFile`). Legacy "Outdated" behaviour has not been ported yet. Storage must go through platform `ObjectStorage`.

## 8. Hygiene findings (outside v2, recorded so they are not lost)

- `src/app/(platform)/studioflow/projects/_legacy_project_id/**` is still **tracked** by git (pre-R8.70 code: files, requirements, phases/iterations). Not routed (underscore prefix), but `src/apps/studioflow/requirements.ui.test.ts` still reads it → a test that guards dead code. Candidate for cleanup.
- Working tree: `.fuse_hidden*` files, a `nul` file, untracked `opencode.json`, `docs/PROJECT-REBUILD-FOUNDATION-REFERENCE.md`, `docs/STUDIOFLOW-RECOVERY-REFERENCE.md` (the latter is a 2026-09-12 proposal, already superseded by the rework contract).
- `PLAN.md` KB-033 (R8.86) is still waiting for browser acceptance.

## 9. Decisions required before the v2 contract can be READY

Draft TBDs #1–#12 still stand. From this audit, add:
- A. Todo SSOT: consolidate on `SfChecklistItem`? What happens to `SfActivity` (feedback only / retire)?
- B. Requirement: a new table, or a type flag on the checklist? With/without evidence? Block or warn?
- C. The four state-machine conflicts in §4.
- D. Configurable phases now (destructive migration) or later (v2 phase 1 keeps the enum)?

## 10. Proposed phasing (for owner approval)

1. **V2-C0 — contract** `STUDIOFLOW-PHASE-ENGINE-V2-CONTRACT.md` (docs only, overrides the parts of the rework contract listed in §2).
2. **V2-A — Overview workspace + iteration display** (no schema): phase cards in Overview with actions, `D3.1`-style labels, per-phase todos, phase page becomes secondary.
3. **V2-B — Todo SSOT + Requirements split** (schema + data migration).
4. **V2-C — Phase gates in Today** (virtual projection).
5. **V2-D — Deliverables v2** (new model + ObjectStorage, computed CURRENT/OUTDATED).
6. **V2-E — Phase Definition / snapshot** (destructive migration; may be deferred).

## 11. Owner decisions (2026-09-16, same session)

| ID | Decision |
|---|---|
| V2-D1 | Todo SSOT = `SfChecklistItem`. `SfActivity` is limited to review feedback or retired (migration plan in the contract). |
| V2-D2 | Requirement = a lightweight model separate from Todo, no evidence, can apply to specific phases, **warning only** (never blocks). |
| V2-D3 | Phase Definition / office Phase Template + per-project snapshot is done **first** (destructive migration accepted, still requires a migration plan). |
| V2-D4 | Per-project phase list/order is **locked** after the project is created. |
| V2-D5 | Iteration prefix lives on the Phase Definition and is included in the snapshot. |
| V2-D6 | Keep: direct send to client without internal review; bypass (skip phase); admin override **forward only** (never decrements). |
| V2-D7 | Drop: `rejectInternal` from `ON_REVIEW_CLIENT` → a rejection during client review is always major+1. |
| V2-D8 | A missing/outdated deliverable = **warning only**, never blocks. |
| V2-D9 | The phase route stays as a detail/deep-link page and is removed from the main project navigation. |

Still open (non-blocking for contract C0, record as TBD): phase-gate permission split, feedback capture after decoupling (V2-D1 detail), whether the stored status enum is kept (audit recommendation: keep it), Timeline relationship, BQ L1/L2/L3.
