# Active Plan

Plan ID: WO-BQ-STRUCTURE-ENTRY-ICONS-01
Scope: Distinct Structure entry icons
Module(s): bq
Target revision: R9.119
Status: READY
Priority: P2
Owner: Product Owner
Last updated: 2026-10-17

## Outcome

An estimator can distinguish the two creation actions in a hovered Section
without having to open each tooltip.

## Locked Decisions

- Add Work Item uses the standard list-with-plus icon.
- Add Subsection uses the standard folder-with-plus icon.
- Accessible labels, hover/focus behavior, and existing entry flows remain
  unchanged.

## Boundaries and Non-goals

- EXTEND BQ editor composition only. No schema, service, calculation,
  permission, hierarchy, entry flow, or deletion behavior changes.

## Acceptance Criteria

- Hovering or keyboard-focusing a Section shows visually distinct icons for
  Add Work Item and Add Subsection when both are available.
- Each retains its accessible name and existing result.

## Verification

- Typecheck, lint, production build, and staged/unstaged whitespace checks.

## Reviewer Acceptance

- At desktop, confirm the two actions are recognizable at a glance and their
  tooltips/keyboard labels identify the same action.

## Executor Prompt

You are the Backend Executor. Location: rumah. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this READY `PLAN.md`, then implement the entire
READY outcome, run required checks, update the changelog, and create R9.119.
