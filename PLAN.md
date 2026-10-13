# Active Plan

Plan ID: WO-SF-WORKSPACE-02 (Workspace default section: a fixed system section every project's loose cards land in)
Scope: StudioFlow Workspace backend only — a system-owned default section per project, its migration, and every write that today falls back to "the first section"
Module(s): studioflow (core; Workspace is not an optional module)
Target revision: R8.525 (Executor). The Lead's board-first UI follows as its own revision.
Status: READY
Priority: P1
Owner: owner decisions 2026-10-13 (board-first correction of R8.523, recorded in R8.524)
Last updated: 2026-10-13 (Lead, R8.524)

## Why

The owner rejected the R8.523 screen because it made two places to work (a
phase Notes feed and a separate Workspace tab). The correction is
**board-first**: one project Workspace board shown in full on the Phases page.
Its global "+ Add card" and the Phase Engine's client-answer and site-visit
cards must land in a **default section with a fixed system identity**, not in
"whatever section is first" (R8.519 `firstSection`), because the team may
reorder or add sections at any time. That identity is a data rule, so it is
backend work before the Lead rebuilds the UI.

## Owner decisions (2026-10-13, board-first)

Recorded here so the Lead UI revision that follows has one source; only items
B1–B4 are this Executor slice.

- B1. Every project has at most one **default section** with a fixed system
  identity. Loose cards (no section chosen), "Client answered" cards and
  site-visit cards always go there, wherever it sits in the order.
- B2. Its initial name is **"Workspace"**; it may be renamed and moved, but
  **never deleted**.
- B3. Each existing project's R8.519 "Notes" section becomes its default
  section and is renamed "Workspace" (no project ends up with two general
  sections).
- B4. No new section is ever created as default by a person; only the system
  creates it, lazily, when a project needs it and has none.
- UI (Lead, next revision, not this slice): the Workspace tab and route are
  removed; one full board sits on the Phases page after the phase strip and
  workflow bar; choosing a phase changes only the workflow controls and the
  phase/round context of new cards, the board stays on "All"; toolbar All ·
  General · selected phase · Starred · Client feedback, round selector only
  under a phase filter; sections are columns with internal horizontal scroll
  on desktop and stacked on narrow screens; "+ Add card" per section plus one
  global button (default section); "Starred" with a star icon; "Client
  feedback" is the card label, "Client answered" stays the workflow command;
  Requirements, Files and round history move to a Phase details drawer whose
  button shows counts ("Requirements 0/3 · Files 0"); Workspace / Drawing List
  is a lens switch on the Phases page (Drawing List = the existing CD list on a
  drafter phase). Bringing ideas in from Ideas is a later, separate slice.

## Locked decisions

### Schema (one forward-only migration, `studioflow` schema)

- `SfWorkspaceSection` gains `system_key String?` (`system_key` column, text,
  nullable) and `@@unique([project_id, system_key])`. The only value written
  is `"DEFAULT"`; ordinary sections stay `NULL` (PostgreSQL treats NULLs as
  distinct, so any number of ordinary sections is allowed). Export the value
  as `WORKSPACE_DEFAULT_SECTION_KEY = "DEFAULT"` and the initial title as
  `DEFAULT_WORKSPACE_SECTION = "Workspace"` (replacing `"Notes"`).
- Backfill, per project that has at least one section: choose the section
  whose title is exactly `Notes`, earliest `created_at` then `id`; if none,
  the first by `sort_order`, `created_at`, `id`. Set its `system_key =
  'DEFAULT'`, and rename it to `Workspace` only when its title is still
  exactly `Notes` (a section the owner already renamed keeps its name).
  Increment its `version`. Projects without sections get nothing now (B4).
- Guard: after the backfill, refuse (raise) if any project has more than one
  `DEFAULT`, or has sections but no `DEFAULT`.
- No other table changes. DB names stay (`is_pinned`, `origin =
  CLIENT_ANSWER`); "Starred" and "Client feedback" are UI labels only.

### Service (`src/apps/studioflow/workspace/service.ts`)

- Replace `firstSection` with `defaultSection(tx, projectId, createdById,
  at)`: lock the project row, return the `DEFAULT` section; when the project
  has none, create one titled `Workspace` with `system_key = 'DEFAULT'` at the
  front of the order (`sort_order` = current minimum − 1, or 0 when the project
  has no section), relying on the unique constraint as the last line against
  races.
- Every fallback that used `firstSection` uses `defaultSection`:
  `insertWorkspaceCard` without `sectionId` (so `createWorkspaceCard` without a
  section, `postPhaseNote`, the Phase Engine's client-answer card and the
  site-visit card). The Phase Engine's own rules, events, permissions and
  audit are unchanged; only the section a card lands in changes.
- `deleteWorkspaceSection` refuses the default section with `CONFLICT`
  `WORKSPACE_SECTION_DEFAULT` ("The default section can be renamed or moved,
  not deleted.") before any other check that could mutate. Rename and reorder
  work on it as on any section. `createWorkspaceSection` never sets
  `system_key`. The "delete only when empty" rule and every version check are
  unchanged.
- `readWorkspace` returns `isDefault: boolean` per section. The optional
  `phaseId` filter is kept.
- Audit metadata for `workspace-section.*` gains `isDefault` where the
  section is the default one; when `defaultSection` creates one, audit
  `studioflow.workspace-section.created` with `{ projectId, isDefault: true,
  bySystem: true }`.

### Wiring

- `workspaceAction` and its schema are unchanged except that the existing
  board can show the refusal message; do not touch the R8.523 screens beyond
  passing `isDefault` through `workspace/page.tsx` if the type requires it.
  The Lead replaces the UI next revision.
- Update `STUDIOFLOW-REWORK-CONTRACT.md` §6.1 (default section rule) and the
  R8.519/R8.523 browser-backlog item (default section named "Workspace",
  cannot be deleted).

## Tests (disposable database)

- Populated migration fixture: (a) a project with the R8.519 "Notes" section
  plus a later ordinary section placed before it; (b) a project whose "Notes"
  was renamed by the owner; (c) a project with only ordinary sections and no
  "Notes"; (d) a project with no sections. After migrate: (a) the old Notes is
  DEFAULT and titled Workspace, the other section untouched; (b) DEFAULT keeps
  the owner's title; (c) the first section by order is DEFAULT; (d) no
  section; every card, image and order unchanged; the guard fails a seeded
  double-default.
- Service: a card created without a section goes to the default section even
  when another section is first; client answered with text and a site visit
  with a note put their cards in the default section (atomic as before); a
  project with no section gets one "Workspace" DEFAULT section created at the
  front on its first loose card, and two concurrent first cards create exactly
  one; deleting the default section is refused with
  `WORKSPACE_SECTION_DEFAULT` even when empty; renaming and reordering it work;
  `createWorkspaceSection` never creates a default; `readWorkspace` reports
  `isDefault`.
- The whole existing Phase Engine and Workspace suites stay green.

## Verification

`npm test`, typecheck, eslint, `check:boundaries`, `check:legacy-runtime`,
production build, `prisma migrate diff` (no drift), the full migration chain on
a fresh disposable rebuild database and incremental deploy on the standard
disposable test database, staged and unstaged whitespace. Apply the migration
to the kantor dev database only after the tests pass and the target is verified
as `studioflow_rebuild` on localhost:5433. Browser acceptance belongs to the
Lead's UI revision.

## Non-goals

No UI redesign, no route or navigation change, no Phase details drawer, no
lens switch, no Ideas integration, no renaming of `is_pinned` or `origin`, no
Phase Engine meaning change, no new permission, no new dependency, no push.

## Executor Prompt

You are the Backend Executor on the same checkout (location: kantor). Read
`AGENTS.md`, `docs/agent/EXECUTOR.md`, `PLAN.md` (WO-SF-WORKSPACE-02), the
StudioFlow contract §6.1 (Project Workspace), `CHANGELOG.md` R8.519 and R8.523,
and `src/apps/studioflow/workspace/service.ts`. Implement exactly the locked
default-section backend as one local revision commit R8.525 (confirm it is the
next unused number in `CHANGELOG.md`): the `system_key` column with its unique
constraint, the forward-only migration with the Notes→Workspace backfill and
guard, `defaultSection` replacing `firstSection` for every loose,
client-answer and site-visit card, the refusal to delete the default section,
`isDefault` on reads and audit, the contract and browser-backlog updates, and
every test in the plan including the populated migration fixture. Stop with
BLOCKED / CONFLICT if a locked decision cannot be met as written. Database
commands only against verified disposable rebuild-only databases, then the
kantor dev database after the gates pass. Run every gate in Verification,
update `CHANGELOG.md`, commit locally without pushing, and reply with only a
Planner/Reviewer prompt: commit, checks with results, limitations, dirty
files, and a request for verdict.
