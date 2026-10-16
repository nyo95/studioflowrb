# Active Plan

Plan ID: WO-BQ-SUBSECTION-DELETE-AND-WORK-ITEM-ACTIONS-01
Scope: Safe Subsection removal and contextual Work Item actions
Module(s): bq
Target revision: R9.113
Status: READY
Priority: P1
Owner: Product Owner
Last updated: 2026-10-16

## Outcome

An estimator can remove a Subsection without losing its Work Items: they become
direct children of the same Section. The Work Item action row gives one clear
primary way to add content and shows grouping or Assembly actions only when
they are relevant.

## Context and Evidence

- The owner explicitly directed that deleting a Subsection keeps its Work
  Items, without a Subsection, under the parent Section.
- BQ already permits a Work Item to belong to exactly one Section or
  Subsection. Direct Section items are therefore the established destination;
  no schema change is needed.
- The current Work Item footer puts Cost Component, Component Group, apply
  Assembly, and save Assembly side by side even though grouping requires a
  selection and saving requires direct Cost Components.
- BQ contract §13.2 already makes multi-selection the canonical place for
  grouping and describes Assembly as content insertion, not an editing field.

## Locked Decisions

- Deleting a Subsection transfers every contained Work Item to its own parent
  Section, preserving every Work Item and all of its nested data. It never
  deletes or flattens Work Items.
- Transferred Work Items are appended after existing direct Work Items in the
  parent Section, preserving their order within the removed Subsection.
- The transfer, Subsection deletion, and one audit event are one BQ
  transaction. It requires the existing `bq.project.manage` grant and rejects
  locked or archived projects.
- The Structure rail offers a clearly labelled destructive control only for an
  editable Subsection, protected by a confirmation that names the number of
  Work Items being moved.
- `Tambah Cost Component` remains the primary footer action. `Terapkan
  Assembly` is available from its adjacent add menu as `Dari Assembly`.
- `Component Group` is not a permanent footer action: it remains available
  through the established multi-selection panel/context menu. `Simpan sebagai
  Assembly` is available only through that contextual selection flow when its
  existing eligibility rules hold.

## Business Rules and Architecture Constraints

- EXTEND the BQ project-tree service, existing BQ action boundary, Structure
  rail, selection panel, and Assembly flows. Do not add a role, permission,
  schema migration, dependency, cross-app access, or client-side calculation.
- Preserve BQ's Section/Subsection XOR parent invariant for every Work Item.
- Reuse the existing audit writer and safe action result boundary; the client
  sends only a Subsection ID and the service re-reads its owning Section.

## UI Contract

- The Structure rail has a compact delete affordance for a Subsection. The
  confirmation says its Work Items move to the named parent Section; an empty
  Subsection needs no move-count sentence.
- The open Work Item footer groups add choices rather than presenting unrelated
  commands as equal links. The entry affordance remains keyboard accessible,
  clearly labelled, and usable at narrow widths.
- Selection actions stay in the existing side panel and right-click menu, so
  they appear only after selection and retain their existing guidance.

## Boundaries and Non-goals

- Do not support deletion of a Section, cross-Section Work Item moves,
  Component Group/Cost Component reordering, or saving grouped Work Items as
  Assemblies.
- Do not change calculation, price, quotation, template, or permission policy.

## Acceptance Criteria

- Removing a populated editable Subsection retains every Work Item and nested
  Component Group/Cost Component; the items appear directly under the parent
  Section, after its existing direct Work Items, in their original order.
- The deletion is atomic: a failed audit or mutation leaves the Subsection and
  its items unchanged. Missing IDs, missing management permission, locked and
  archived projects are refused.
- The Structure rail confirmation makes the transfer consequence explicit and
  Cancel makes no server call.
- A Work Item footer shows the primary add action with a `Dari Assembly` path,
  not four equal actions. Grouping and saving an Assembly remain accessible in
  their selection context only.
- Existing right-click, selection, direct Assembly apply, lock/read-only, and
  browser layout behavior remains intact.

## Verification

- Focused BQ service/action/UI tests for move-on-delete, sort order, audit
  rollback, authorization/lifecycle rejection, footer hierarchy and selection
  affordances.
- Full Executor gate: `npm test`, typecheck, lint, boundary check,
  legacy-runtime check, production build, staged and unstaged whitespace
  checks.

## Reviewer Acceptance

- In the browser, delete a populated and an empty Subsection; cancel once,
  confirm once, and verify placement/order after reload.
- Inspect the Work Item footer at desktop and 375 px, add a Cost Component and
  apply an Assembly through the add menu, then select Cost Components to find
  grouping and saving only in the selection context.

## Regression Risks and Recovery

- The Section-level partial unique item sort index can reject a naive parent
  transfer; assign fresh direct-Section positions inside the same transaction.
- A database cascade would destroy children if deletion preceded transfer; move
  first, then delete, with the audit write before commit.

## Executor Prompt

You are the Backend Executor. Location: rumah. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this READY `PLAN.md`, then implement the entire
READY backend outcome and nothing beyond it. Inspect current repository
evidence, preserve unrelated owner work, run the required checks, update the
changelog, and create target local revision R9.113. Stop only for a material
locked-decision conflict or unsafe boundary; otherwise finish the coherent
outcome and report the commit, checks, limitations, and remaining unrelated
dirty files.
