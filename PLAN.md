# Active Plan

Plan ID: WO-BQ-SECTION-AND-SUBSECTION-ORGANIZATION-01
Scope: Safe Section removal and optional Subsection organization
Module(s): bq
Target revision: R9.123
Status: READY
Priority: P2
Owner: Product Owner
Last updated: 2026-10-17

## Outcome

An estimator can safely remove a Section or move its complete contents to
another Section, and can organize Work Items into optional Subsections without
changing any cost calculation.

## Locked Decisions

- Removing an empty Section uses ordinary confirmation.
- Removing a populated Section offers: move its contents to another Section of
  the same project, preserving direct Work Items and Subsections with nested
  data; or permanently delete all contents after count-aware confirmation.
- Work Item selection is direct ↔ Subsection only inside its current Section.
- Multiple Work Items under one Section can form a new named Subsection; no
  Subsection nesting and empty Subsections remain until intentionally removed.

## Business Rules and Architecture Constraints

- EXTEND the BQ-owned project-tree service and its existing project detail
  server-action boundary. No schema or shared capability change is needed.
- Every mutation requires BQ project-management permission, an editable
  project, atomic data and audit writes, and rejects stale, missing, or foreign
  targets.
- A Section move appends direct Work Items and Subsections to their respective
  target sibling lists and preserves their relative order and nested data.
- Subsections are only visual organization. They never alter quantities,
  markup, pricing, or totals.

## Backend Contract

- Provide audited project-tree commands to delete or move a Section, move one
  or more Work Items between a Section's direct list and its Subsections, and
  group selected Work Items into a newly named Subsection.
- Expose validated server actions returning the refreshed project detail.

## UI Contract

- Struktur exposes Section deletion and organization. Destructive deletion is
  explicit and only valid same-Section Work Item destinations are offered.

## Boundaries and Non-goals

- No change to BQ calculations, permissions, hierarchy depth, template
  behavior, project deletion workflow, or quotation wording.
- No cross-Section Work Item drag-and-drop.

## Acceptance Criteria

- An empty Section can be removed after confirmation.
- A populated Section can either move all of its contents to another Section
  in the same project or delete the entire owned hierarchy after a
  count-aware confirmation.
- Work Items can be moved direct ↔ Subsection within one Section and selected
  Work Items can become a named Subsection, with preserved data and ordering.
- Invalid targets, locked/archived projects, missing permission, and audit
  failure leave data unchanged.

## Verification

- Focused BQ service integration tests for both Section outcomes and optional
  Subsection organization.
- `npm test`, typecheck, lint, boundary check, legacy-runtime check,
  production build, and whitespace checks.

## Reviewer Acceptance

- In Struktur, test empty and populated Section removal, including moving to a
  peer Section and destructive confirmation.
- Move a Work Item into and out of a Subsection, group multiple Work Items,
  and confirm totals do not change.

## Executor Prompt

You are the Backend Executor. Location: rumah. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this READY `PLAN.md`, then implement the entire
READY outcome, run required checks, update the changelog, and create R9.122.
