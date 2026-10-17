# Active Plan

Plan ID: WO-MASTERDATA-FULL-CANVAS-01
Scope: Align Master Data workspace width with Bill of Quantity
Module(s): masterdata, platform-ui-engine
Target revision: R9.128
Status: IMPLEMENTED
Priority: P2
Owner: Product Owner
Last updated: 2026-10-17

## Outcome

Every Master Data screen uses the same full application canvas as Bill of
Quantity. Directory and overview pages use the available workspace width
without changing data, access, controls, or responsive behavior.

## Locked Decisions

- The Master Data application layout owns the canvas measure, as BQ does.
- Pages must not introduce a nested narrower `PageShell` that defeats the app
  layout's full canvas.
- Existing UI Engine directory and table patterns remain the visual system of
  record; this is a layout alignment, not a new table redesign.

## Business Rules and Architecture Constraints

- REUSE the UI Engine `PageShell` and its `measure="full"` behavior.
- No schema, service, permission, route, data-table behavior, or dependency
  change is allowed.

## Backend Contract

- No backend contract changes.

## UI Contract

- Master Data's shared layout uses the full canvas and its overview does not
  reapply a narrower inner page shell.

## Boundaries and Non-goals

- No change to Master Data information architecture, copy, data operations,
  directory controls, or mobile overflow behavior.

## Acceptance Criteria

- The Master Data overview and directory routes use the full available canvas,
  matching BQ's workspace measure.
- Existing controls remain intact and responsive behavior is unchanged.

## Verification

- Typecheck, lint, production build, and whitespace checks: passed.
- Desktop browser inspection: overview has one full canvas and no nested wide
  measure; its workspace is 1856 px wide at the current desktop viewport.
- Narrow browser inspection: at 375 px, the overview has no page-level
  horizontal overflow (375 px client width and scroll width).

## Reviewer Acceptance

- Inspect Master Data overview and a directory on desktop and narrow viewport.
- Confirm the workspace uses the full canvas without clipping, duplicated
  gutters, or broken table overflow.

## Executor Prompt

You are the Lead and Executor. Location: rumah. Read `AGENTS.md` and this
READY `PLAN.md`, reuse the UI Engine `PageShell`, implement the bounded layout
alignment, run the listed checks, update the browser backlog and changelog, and
create R9.128.
