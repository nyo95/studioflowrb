# Active Plan

Plan ID: OWNER-REVIEW-CORRECTIONS-R8.81
Scope: Owner review 2026-09-16 (legacy vs R8.80) — technical items first: Product Schedule photos, Schedule template settings, BQ lifecycle tabs. Design items (workspace skeleton, Master Data home) are deferred to a design pass by owner instruction.
Status: READY (R8.81 committed; R8.82 in this commit)
Priority: P1 (Schedule photo regression, workspace skeleton) / P2 (rest)
Owner: Repository owner
Last updated: 2026-09-16
Lane: Planner + Executor (owner-combined), rumah

## Evidence

- Rebuild HEAD `beb4969` (R8.80), branch `main`.
- Legacy evidence available on this computer: `D:\Projects\studioflow`, branch
  `main`, commit `102ff85` (clean). The pinned rework commit `c4b0c466` is not
  present in this clone; 102ff85 is used as read-only evidence only.
- Legacy workspace skeleton: `src/components/project-layout-shell.tsx`,
  `src/components/nav-inner.tsx` (pinned, full-height, collapsible project rail
  with Overview, phases with icons/open-item marker, MOM, Product Schedule).
- Legacy schedule photos: `src/extensions/sketchup/components/CatalogBoard.tsx`
  (per-item photo add/change/remove with 4:5 crop, board cards, "set as default
  template item", "apply default template").
- Legacy schedule template settings: `src/components/template-manager.tsx`.
- Rebuild gaps: `SfScheduleOption.image_key` exists but no command/UI;
  contract §11.6 excluded image upload; project workspace renders its nav as an
  in-content `SettingsShell` column, contradicting contract §8; KB-032.

## Owner points and disposition

1. UI skeleton follows legacy (colors stay current) → DEFERRED to design pass
   (roadmap). Direction: pinned full-height collapsible project rail per
   contract §8, as a domain-neutral UI Engine workspace shell.
2. MOM → no change.
3. Schedule photos → regression, FIX in R8.81.
4. Schedule template settings → FIX in R8.81 (tables, edit, link, save-as-template).
5. BQ deletion review → tabs Active / Archived / Deletion review in R8.82.
6. Master Data home → DEFERRED to design pass (roadmap; legacy had none).
7. Per-app contract/UX evolution → roadmap entry, not in these slices.

## Locked decisions

- No schema migration and no new dependency.
- Schedule option photo: one image per option, stored through
  `platform/core/storage` private keys (same policy as MOM: PNG/JPEG/WebP,
  magic-byte check, ≤3 MB after crop, 4:5 crop in `ImageWorkspace`), read via
  signed URL. Client-supplied `imageKey` in snapshots is no longer accepted.
  Objects are removed only when no other option/template row references the
  key (reuse copies share keys). Retention of orphaned objects stays KB-002.
- Schedule template item edit is a new `updateTemplateItem` command
  (`settingsManage`, audited). "Save as template" uses the entry's final
  option snapshot through the existing create command.
- BQ tabs are URL-addressable (`?view=active|archived|deletion`); Locked
  projects stay in Active. No lifecycle change.

## Non-goals

Workspace skeleton and Master Data home (design pass), global menu redesign (GLOBAL-MENU-DESIGN-BRIEF), centralized settings canvas
(KB-031), Schedule drag-reorder, render boards, cover page, phase accent
palette tokens.

## Verification

`npm test`, `npm run typecheck`, `npm run lint`, `npm run check:boundaries`,
`npm run check:legacy-runtime`, `npm run build` (as available on this
machine), `git diff --cached --check`. Browser acceptance (desktop + 840px)
is Reviewer/owner work after commit.

## Executor Prompt

Execute OWNER-REVIEW-CORRECTIONS as two local commits: R8.81
(StudioFlow: schedule option photos, schedule settings tables/edit/link/
save-as-template, contract §11 + KB-032 update) and R8.82 (BQ lifecycle tabs,
roadmap entries for the deferred design pass and per-app evolution). Follow the locked
decisions above, run the checks, update CHANGELOG, commit locally, do not push.
