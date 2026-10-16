# Active Plan

Plan ID: WO-BQ-OPTIONAL-SUBSECTION-ENTRY-01
Scope: Optional Subsection entry in Structure
Module(s): bq
Target revision: R9.118
Status: READY
Priority: P2
Owner: Product Owner
Last updated: 2026-10-17

## Outcome

An estimator sees Subsection as an optional way to organize a Section, not as a
required next step. Its creation action appears with the other Section actions
only when that Section is being intentionally interacted with.

## Locked Decisions

- Subsection remains optional. It is an organizational child of a Section, not
  a Component Group and not a prerequisite for Work Items.
- The normal entry path is Section → Work Item. When a Section is deliberately
  split into Subsections, new Work Items go into a Subsection so the two
  organizational approaches do not become a confusing mixed default.
- On desktop, Add Subsection is a hover/focus-visible `+` action on its parent
  Section. Its existing inline naming flow remains the only creation flow.
- At widths where Struktur is intentionally hidden, the compact canvas
  fallback remains visible so this structural action is not lost.

## Boundaries and Non-goals

- EXTEND BQ editor composition and its durable UI contract only. No schema,
  service, calculation, permission, Work Item entry, Component Group behavior,
  or deletion behavior changes.

## Acceptance Criteria

- Desktop Struktur has no persistent Add Subsection row.
- Hovering or keyboard-focusing a Section exposes an accessible Add Subsection
  action and retains the existing inline naming flow.
- Narrow screens retain a reachable Subsection action.

## Verification

- Typecheck, lint, production build, and staged/unstaged whitespace checks.

## Reviewer Acceptance

- At desktop, confirm the action is hidden at rest, visible on hover/focus,
  creates a named Subsection, and does not obstruct Work Item actions.
- At 375 px, confirm the compact fallback remains reachable.

## Executor Prompt

You are the Backend Executor. Location: rumah. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this READY `PLAN.md`, then implement the entire
READY outcome, run required checks, update the changelog, and create R9.118.
