# Active Plan

Plan ID: D-SF-PLANNER-RATIFICATION
Scope: Owner ratification of StudioFlow recovery decisions
Status: BLOCKED
Priority: P1
Owner: Repository owner
Last updated: 2026-09-14

## Outcome

Ratify the seven bounded product and rollout decisions found by completed D-SF
recovery discovery, then lock them in the affected StudioFlow contracts and
activate one coherent next implementation outcome. No legacy source access,
application change, schema/data operation, or partial SF-A work is authorized
until the owner decisions are recorded.

## Context and Evidence

- R8.48 recovered and documented source evidence at the exact legacy pin;
  R8.49 independently corrected the roadmap to keep D-SF open for ratification.
- The authoritative evidence and decision register is
  `docs/apps/studioflow/D-SF-RECOVERY-DISCOVERY.md` §5. It establishes the
  questions and their affected scopes; it deliberately does not choose policy.
- `docs/roadmap.md` now correctly shows D-SF evidence complete but the gate
  open. SF-A through SF-F remain unactivated.

## Locked Decisions

- Keep canonical rebuild hierarchy `/studioflow/projects/...`; never restore a
  parallel `/projects/...` tree.
- Preserve platform-owned profile, no legacy role enum, no cross-app internal
  import/write/database foreign key, and Master Data public read-only / BQ
  independence boundaries.
- The next executor receives only owner-ratified decisions; it may not choose
  D-SF-01 through D-SF-07 from legacy evidence.

## Boundaries and Non-goals

Do not start any implementation, migration, data disposition, route rollout,
or external integration during ratification. A later READY plan must have a
single coherent outcome and may only cover the decisions needed for that
outcome.

## Acceptance Criteria

Not applicable until the owner supplies ratifications. The output required now
is an explicit owner decision for each D-SF entry in the prompt below.

## Verification

After owner ratification, Planner/Reviewer must reconcile the selected policy
with affected contracts and create the next READY plan. No browser/database
check is applicable to this decision gate.

## Risks and Recovery

- Treating an unanswered decision as implied approval would authorize incorrect
  routes, data changes, operational access, or a privacy-sensitive feature.
- If one choice changes schema/data ownership, keep that work isolated in its
  own subsequent plan with explicit rollback/recovery evidence.

## Owner Decision Prompt

Ratify D-SF-01 through D-SF-07 in
`docs/apps/studioflow/D-SF-RECOVERY-DISCOVERY.md` §5: (1) global work-list
surfaces, (2) StudioFlow settings ownership, (3) MOM parity, (4) existing global
Product Catalogue data, (5) live/chat first-release scope, (6) SketchUp
activation, and (7) legacy-route compatibility. State the intended outcome for
each item; I will turn only the necessary decisions into the next READY plan.
