# Active Plan

Plan ID: WO-BQ-STRUCTURE-WORK-ITEM-ENTRY-01
Scope: Work Item entry location and BQ hierarchy wording
Module(s): bq
Target revision: R9.117
Status: READY
Priority: P2
Owner: Product Owner
Last updated: 2026-10-17

## Outcome

An estimator creates Work Items from Struktur, at the Section or Subsection
where the work belongs, while the estimating canvas remains for reading and
editing the selected Work Item's cost breakdown.

## Locked Decisions

- The customer-facing hierarchy is `Section → Subsection → Work Item →
  Component Group → Cost Component`. “Item” alone is not a level name.
- Add Work Item lives in Struktur on desktop. A Section receives it only when
  it has no Subsections or already has direct Work Items; each Subsection has
  its own action. The existing complete Work Item dialog, including Assembly,
  is reused.
- At widths where Struktur is intentionally hidden, a compact canvas fallback
  preserves the same dialog and parent rule. It is a responsive fallback, not
  a second desktop workflow.
- Cost Component stays inside an expanded Work Item. Its source-picker flow is
  not a structural action and must not appear in Struktur.

## Boundaries and Non-goals

- EXTEND BQ editor composition and its durable UI contract only. No schema,
  service, calculation, permission, import source, Component Group behavior,
  or deletion behavior changes.

## Acceptance Criteria

- Desktop Struktur exposes an unobtrusive, hover/focus-visible Add Work Item
  action at valid Section/Subsection parents, opening the existing form.
- Desktop canvas has no Work Item entry rows.
- Cost Component creation remains available only from its expanded Work Item or
  Component Group context.
- Narrow screens retain a reachable Work Item entry action.

## Verification

- Typecheck, lint, production build, and staged/unstaged whitespace checks.

## Reviewer Acceptance

- At desktop, create from a Section and a Subsection and confirm the new row
  appears at that parent. Confirm canvas contains no Work Item add row.
- At 375 px, confirm the compact fallback opens the same dialog.

## Executor Prompt

You are the Backend Executor. Location: rumah. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this READY `PLAN.md`, then implement the entire
READY outcome, run required checks, update the changelog, and create R9.117.
