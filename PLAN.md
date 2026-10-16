# Active Plan

Plan ID: WO-BQ-UI-LANGUAGE-ALIGNMENT-01
Scope: Consistent BQ Indonesian UI copy
Module(s): bq
Target revision: R9.121
Status: READY
Priority: P2
Owner: Product Owner
Last updated: 2026-10-17

## Outcome

Every BQ application screen reads as one coherent Indonesian interface while
retaining the BQ contract's English domain nouns.

## Locked Decisions

- Default UI prose, actions, statuses, empty states, validation, navigation,
  dialogs and accessible labels are Indonesian.
- Canonical domain nouns remain `Section`, `Subsection`, `Work Item`,
  `Component Group`, `Cost Component`, `Assembly`, `TBC`, and `By Owner`.
- `Quotation` is an English document heading/print format; interactive BQ UI
  calls it `Penawaran`.
- The future EN/ID switch is a separate per-person language preference. It
  must not overload date/number locale or the first-use-guide language. This
  BQ slice owns its copy catalogue only and does not add that platform setting.

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
READY outcome, run required checks, update the changelog, and create R9.121.
