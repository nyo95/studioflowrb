# Active Plan

Plan ID: SF-R4-PHASE-ACCENT-PALETTE
Scope: StudioFlow phase accent palette from contract §13.8.
Status: READY (implemented locally in R8.84; Reviewer/browser acceptance pending)
Priority: P2
Owner: Repository owner
Last updated: 2026-09-16
Lane: Planner + Executor (owner-combined), rumah

## Evidence

- `docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md` §13.8 approves a
  restrained five-hue phase accent set, tokens only, used for the phase strip,
  project rail dots, and Today group/task markers.
- `docs/roadmap.md` lists SF-R4 as approved after SF-RF.
- Current implementation before this plan used status colors for phase markers,
  so the StudioFlow UI still read as generic status chrome rather than
  phase-aware navigation.

## Locked decisions

- Token-only visual identity: no schema, migration, dependency, or app behavior
  change.
- The accent indicates phase identity. Workflow state must remain available via
  text, labels, `aria-current`, notes, titles, and existing status semantics.
- StudioFlow owns the `PhaseKey` to accent mapping; UI Engine owns the generic
  token and `PipelineStrip` affordance.

## Non-goals

Workspace skeleton redesign, Master Data home, app-wide UX redesign, browser
acceptance verdict, and any lifecycle/status behavior change.

## Verification

Executor: `npm run typecheck`, `git diff --cached --check`.
Reviewer acceptance: browser walk of StudioFlow project overview, project rail,
and Today at desktop and 840 px; confirm the accents are visible but restrained
and status remains understandable without color alone.

## Executor Prompt

Executor lane, rumah. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this
`PLAN.md`. Finish SF-R4 phase accent palette within the locked boundaries,
run proportionate checks, update `CHANGELOG.md`, commit locally, and do not
push.
