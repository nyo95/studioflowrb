# Active Plan

Plan ID: WO-SF-ITERNAME-01 (iteration names built from the project name, the phase prefix and the number)
Scope: StudioFlow backend for the new default iteration name, its short label, the "Rename" rules and a one-time data migration. The Lead changes the screens afterwards.
Target revisions: next unused revision at commit time (one commit).
Status: READY
Priority: P2
Owner: Product Owner. Decisions confirmed in chat on 2026-10-08 (kantor).
Last updated: 2026-10-08

Previous plan WO-MD-ENTRY-01 is BUILT (R8.416–R8.419, screens R8.420).

## Outcome

A new iteration is named like the files designers already use:
`<project name> <phase prefix><number>`, for example
`2026-474 Sociolla SBW R1 D1` (the "R1" is part of that project's own name; D is
Design 3D's prefix). The screens can show the short label `D1`; the full name is
the document name. A person may still give one iteration a name of their own;
the next iteration then goes on with the next number (`D2`), not from the
custom text.

## Locked Decisions (owner 2026-10-08)

1. **Default name** = project name + one space + the phase's `prefix_snapshot` +
   the iteration number (`major`). It is a snapshot taken when the iteration is
   created (renaming the project later does not rewrite existing names).
2. **Kinds keep their names.** Iterations with a kind (`CD Mall`, `CD Final`)
   keep that name exactly as today, and the existing lock
   (`ITERATION_KIND_NAME_LOCKED`) stays.
3. **Rename stays and becomes an override.** Any name may be set (as today). The
   number is never taken from the name: the next default uses `major + 1`.
   Saving an **empty** name resets the iteration to its default name.
4. **Short label.** Iteration reads also return `shortName`: `<prefix><major>`
   (e.g. `D1`) when the name is default-like (ends with ` <prefix><major>`),
   otherwise the stored name. Kinds are never default-like. The existing `label`
   field stays.
5. **Existing data (owner: "ganti").** One idempotent data migration rewrites
   iterations whose name equals the old default (`<phase name_snapshot>
   <major>`) to the new default. Kind names and typed names are untouched. Apply
   to the rebuild dev and test databases only.

## Backend Contract

- **Domain:** pure `defaultIterationName(projectName, prefix, major)` and a
  short-label counterpart next to `revisionLabel`, with unit tests.
- **Creation:** every path that creates an iteration without a kind (first
  iteration, add, revision, supervision visit, auto-start, admin reset) uses it;
  the project name is read in the same transaction.
- **Rename:** `renameIteration` treats an empty name as "reset to default";
  non-empty validation unchanged; audit and undo keep working.
- **Reads:** `shortName` on the iteration rows of `getPhaseDetail` (current,
  previous brief, earlier iterations, active revision), the project card's
  current iteration, and history labels that show an iteration name.
- **Migration:** additive data migration in `prisma/migrations` with a SQL
  comment; report how many rows changed per database.
- **Tests:** update the old-default expectations ("Moodboard 1" etc.); add
  creation default, custom-then-next numbering, empty-rename reset, kind names
  unchanged, migration scope and idempotence, `shortName` rules.

## UI Contract

The Lead changes tabs, iteration card title, undo bar/messages, earlier list,
the Rename dialog and history to use `shortName` in tight spaces and the full
name as tooltip/heading. Do not edit screens.

## Boundaries and Non-goals

No change to phase definitions, prefixes or lock rules; no rewrite of names on
project rename; no change to deliverable or file names here; no new dependency;
no push, tag, PR or release.

## Acceptance Criteria

1. First iteration is `<project name> <prefix>1`; the next `<prefix>2`; a
   revision gets the next number.
2. After renaming iteration 1 to "Custom", the next is `<prefix>2`; an empty
   rename restores `<project name> <prefix>1`.
3. `CD Mall` / `CD Final` keep names and lock.
4. `shortName` is `D1` for default-like names, the name itself for kinds and
   custom names, in every read listed.
5. The migration changes exactly the old-default iterations; a second run
   changes nothing.
6. Existing suites pass with updated expectations listed in the changelog.

## Verification

`tsc --noEmit`, `npm run lint -- --quiet`, `check:boundaries`,
`check:legacy-runtime`, `npm test` (full), `npm run build`; run the long ones in
the background and finish them before the commit. Verify the database target is
rebuild-only before any database command; use the reachable rebuild-only
database on port 5433 as is and do not stop, remove or recreate any Docker
container. Browser not required.

## Reviewer Acceptance

After the Lead's screen changes: create a project, send and revise a phase and
read names on the tabs, card, undo bar and history; rename one iteration and add
the next; reset the name; check old names after the migration.

## Regression Risks and Recovery

The name appears in many messages (covered by the Lead's screen pass). The
migration only touches names equal to the old default, so a revert rebuilds the
old names from phase name and number.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and `PLAN.md`, then implement the entire READY outcome
(WO-SF-ITERNAME-01) and nothing beyond it, verified and committed once with the
next unused revision from `CHANGELOG.md`. Never commit a half-done change. Edit
only `src/apps/studioflow/**`, `prisma/migrations/**`, `CHANGELOG.md` and
`docs/BACKLOG.md`; stage only your own files. Run the long checks (`npm test`,
`npm run build`) as background jobs and finish them before the commit. Do not
stop, remove or recreate any Docker container: use the reachable rebuild-only
database on port 5433 as is, and tell the Lead if it is not reachable. Stop only
for a material locked-decision conflict or unsafe boundary, using the BLOCKED /
CONFLICT report; otherwise report the commit, checks, limitations, and remaining
unrelated dirty files.
