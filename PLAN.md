# Active Plan

Plan ID: KB-033-SCHEDULE-PHOTO-ADD-FLOW
Scope: Restore legacy-functional Product Schedule photo flow.
Status: IMPLEMENTED — R8.86 committed; browser acceptance pending
Priority: P1
Owner: Repository owner
Last updated: 2026-09-16
Lane: Planner + Executor (owner-combined), rumah

## Evidence

- Owner browser comment on `/studioflow/projects/.../schedule`: reserved row
  opens `Add option`, but the dialog has no photo control; asking for the
  overflow menu is a UX regression because the menu only exists after an option
  is created.
- Legacy evidence: `D:\Projects\studioflow` commit `102ff85`, branch `main`,
  clean working tree, `src/extensions/sketchup/components/CatalogBoard.tsx`.
  Legacy exposed `+ Add photo` / `Change photo` directly on catalog cards and
  opened a 4:5 cropper.

## Locked decisions

- Use existing rebuild storage and Schedule service commands: `createOption` /
  `updateOption` for product details and `setOptionImage` for photo bytes.
- No schema, dependency, permission, or storage-policy change.
- A new option with a prepared photo is saved in two safe steps: create option,
  then attach the photo to the returned `optionId`.
- Keep overflow actions, but do not make photo upload dependent on discovering
  an overflow menu.

## Non-goals

Card-board redesign, full legacy CatalogBoard port, Google Drive, retention
policy, Product Schedule settings IA, and cross-project reuse changes.

## Verification

Executor: `npm test`, `npm run typecheck`, `npm run lint`,
`npm run check:boundaries`, `npm run check:legacy-runtime`, `npm run build`,
and `git diff --cached --check`.

Reviewer/browser acceptance: on a reserved Schedule row, open Add option,
prepare a photo, save, and confirm the new option displays the photo and the
row thumbnail updates; also confirm an existing option exposes a visible
`Change photo` action.

## Executor Prompt

Executor lane, rumah. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this
`PLAN.md`. Finish KB-033 by restoring the legacy-functional Schedule photo flow
in the rebuild Product Schedule without schema/dependency changes, run the
required checks, update ledgers, commit locally, and do not push.
