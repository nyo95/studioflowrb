# Active Plan

Plan ID: LDC-STABILIZATION
Scope: StudioFlow Logic Debt Closure & Phase Engine V2 Stabilization
Status: IN PROGRESS — WO-LDC-01 in progress
Priority: P1
Owner: Repository owner
Last updated: 2026-09-17
Lane: Executor, rumah

## Evidence

- Implementation plan: `docs/apps/studioflow/STUDIOFLOW-LDC-PLAN.md`
- Functional floor: legacy `nyo95/studioflow` pinned behavior + SF-R1–SF-R3 rebuild behavior
- Baseline: current `main` after `d934e8f`

## Locked decisions

- Requirements remain warning-only (LDC-3A)
- Phase templates snapshot into project phases (LDC-2A)
- Projects bootstrap from default template, not PHASE_BLUEPRINT (LDC-2B)
- Archive/phase mutability enforced at service level (LDC-1C, LDC-1D)
- Feedback defer removed from UI (LDC-1A)
- Quick Add requires taskManage, not phaseWork (LDC-1B)

## Non-goals

- Master Data redesign, BQ redesign, MOM rewrite, Schedule rewrite
- Generic repositories, Clean Architecture boilerplate
- Upcoming, collaboration/chat, CD List, SketchUp integration
- V2-E destructive migration
- Per-project phase add/remove
- Foundation RBAC vocabulary change

## Work Orders

WO-LDC-01: Runtime truth fixes
WO-LDC-02: Phase snapshot schema + migration
WO-LDC-03: Default Phase Template invariants + transactional CRUD
WO-LDC-04: Project bootstrap from Phase Template
WO-LDC-05: Remove project runtime dependency on PHASE_BLUEPRINT
WO-LDC-06: Requirements warning semantics + Overview projection
WO-LDC-07: Deliverable revision/status semantics
WO-LDC-08: Override provenance + historical compatibility
WO-LDC-09: UI/business consistency cleanup
WO-LDC-10: Integration tests + contract reconciliation

## Verification

Executor: `npm test`, `npm run typecheck`, `npm run lint`,
`npm run check:boundaries`, `npm run check:legacy-runtime`, `npm run build`,
and `git diff --cached --check`.

## Executor Prompt

Executor lane, rumah. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this
`PLAN.md`. Execute the LDC stabilization plan starting with WO-LDC-01.
