# Active Plan

Plan ID: WO-BQ-STRUCTURE-LAYER-ACTIONS-01
Scope: Structure-layer deletion controls
Module(s): bq
Target revision: R9.114
Status: READY
Priority: P2
Owner: Product Owner
Last updated: 2026-10-16

## Outcome

The Structure rail behaves like a compact layer toolbar: deletion lives there,
while the estimating canvas is kept clear for reading and editing costs.

## Locked Decisions

- Delete Work Item and Delete Subsection live in Struktur, shown only while a
  layer row is hovered or focused by keyboard. Existing accessible labels,
  confirmation and server behavior remain intact.
- The canvas loses its persistent right-edge action column. Component Group and
  Cost Component deletion remains available through existing contextual menus
  and the selection panel, rather than becoming new Structure layers.

## Boundaries and Non-goals

- EXTEND only BQ layout composition; no schema, service, permission,
  calculation, dependency, or workflow changes.

## Acceptance Criteria

- Editable Work Items and Subsections expose delete in Struktur on hover/focus.
- The canvas has no empty delete column or visual competition with the layer
  controls, at desktop and 375 px.

## Verification

- Focused UI evidence plus full required gate: test, typecheck, lint,
  boundaries, legacy-runtime, production build, and whitespace checks.

## Reviewer Acceptance

- At desktop and 375 px, hover and keyboard-focus layer rows, check canvas
  alignment, and cancel then confirm an existing deletion flow.

## Executor Prompt

You are the Backend Executor. Location: rumah. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this READY `PLAN.md`, then implement the entire
READY outcome, run required checks, update the changelog, and create R9.114.
