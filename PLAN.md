# Active Plan

Plan ID: WO-BQ-SECTION-AND-SUBSECTION-ORGANIZATION-01
Scope: Safe Section removal and optional Subsection organization
Module(s): bq
Target revision: R9.122
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
- Work Item drag is direct ↔ Subsection only inside its current Section.
- Multiple Work Items under one Section can form a new named Subsection; no
  Subsection nesting and empty Subsections remain until intentionally removed.

## Boundaries and Non-goals

- EXTEND BQ presentation copy only. No schema, service behavior, calculation,
  permission, hierarchy, entry flow, deletion behavior, platform setting, or
  print-document wording changes.

## Acceptance Criteria

- Directory, project, library, template, assembly, source-picker, settings and
  deletion-review screens no longer mix sentence-level Indonesian and English.
- Canonical domain nouns and print quotation language remain intentional.
- Copy is prepared in a BQ-owned catalogue so the future setting can add EN
  selection without a second string hunt.

## Verification

- Focused BQ copy tests, typecheck, lint, production build, and whitespace
  checks.

## Reviewer Acceptance

- Walk every BQ screen and its common dialogs in Indonesian; verify contract
  nouns remain exact and quotation print stays unchanged.

## Executor Prompt

You are the Backend Executor. Location: rumah. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this READY `PLAN.md`, then implement the entire
READY outcome, run required checks, update the changelog, and create R9.122.
