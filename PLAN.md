# Active Plan

Plan ID: WO-MODULES-M3-IDEAS-01 (Extract Ideas Board)
Scope: Ideas module/schema extraction with StudioFlow public Schedule and phase-image boundaries
Module(s): ideas, studioflow, platform boundary harness
Target revision: R8.512
Status: IMPLEMENTED — AWAITING REVIEW
Priority: P1
Owner: direct decision 2026-10-12; accepted M2 report R8.511
Last updated: 2026-10-12 (Lead)

## Outcome

Ideas becomes a real optional module with its own app directory, schema, runtime, manifest and public door while preserving its current personal-board behavior, existing URL, permission id, module state, stored grants, data and image objects. StudioFlow exposes only the project/Schedule/phase-image functions Ideas needs. Presentation is consumed only through its public door.

## Locked implementation

- Move Ideas code from StudioFlow to `src/apps/ideas`; move the Ideas route/actions/components mechanically to module-owned route files while retaining `/studioflow/ideas`.
- Add `prisma/schema/ideas.prisma` using PostgreSQL schema `ideas`. Atomically move the existing card/usage tables with ids/data/timestamps/object keys intact; drop only the usage → Schedule FK and keep the card → usage cascade.
- Add exactly one named migration-isolation exception for this extraction. It may only create the Ideas schema, move/rename Ideas tables/indexes/constraints, drop the cross-module FK and run guards; no unrelated StudioFlow mutation.
- Retain permission `studioflow.ideas.manage`, manifest id/version/state and `requires: ["studioflow"]`. The manifest moves to Ideas public ownership; no grant/state migration.
- Add typed StudioFlow public functions for writable Schedule targets, placement entries, live usage resolution, authorized phase-note image source and idempotent external-image placement. They own all project/PIC/override, archived/completed, Schedule code and Schedule write policy.
- Ideas stores Schedule option ids as plain values. Reads resolve them in one StudioFlow public batch, hide missing options, and clean dangling usages idempotently. No historical snapshot is added.
- Cross-module placement uses an operation id. A retry cannot create a second Schedule item/option. Schedule success remains authoritative if the non-authoritative Ideas usage write fails; that failure is audited/reported without rolling back valid Schedule work.
- Ideas owns validation, private card storage and cleanup. Existing `studioflow/ideas/*` keys remain valid; new keys use `ideas/cards/*`. Do not copy stored objects.
- Move Ideas audit writes to app id/action prefix `ideas` for new events only; never rewrite history and never include card text/source URL in audit metadata.
- Save phase-note image, use in Schedule and card CRUD remain available with the same gates. Moodboard calls Presentation public `addStoredImageToMoodboard`; no Ideas import of Presentation internals.
- Add explicit route ownership for `studioflow/ideas/**`; boundary checks must reject Ideas imports/delegates outside declared public doors.
- Do not modify Presentation schema/service/routes in this revision beyond the minimum public export of its existing moodboard command.

## Verification

- Migration chain on verified disposable office rebuild test database; pre/post cards/usages have equal counts, ids, owners, fields, timestamps, keys and card relationships; no duplicate old tables remain.
- Ideas privacy, ownership not-found, permission/module gates, target selection, project assignment/override, archived/completed refusal, file validation, upload/copy rollback, replace/delete cleanup and missing-usage cleanup.
- Schedule placement as new item and extra option; idempotent retry; simulated usage-write failure; Schedule option deletion has no visible dangling usage.
- Save phase-note image and moodboard action continue through public boundaries; Presentation disabled behavior remains correct.
- `npm test`, typecheck, lint, boundary check, legacy-runtime check, production build, staged/unstaged whitespace. Browser journeys are recorded for Reviewer rather than blocking Executor commit.

## Non-goals

No Presentation extraction; no Workspace model/UI; no permission/URL redesign; no Schedule/MOM extraction; no new dependency or generic event framework; no push, deployment or release.

## Executor Prompt

You are the Backend Executor on the same checkout. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, `PLAN.md`, `docs/apps/platform/MODULES-M2-COUPLING-REPORT.md`, `docs/MODULE-BOUNDARIES.md`, and the active StudioFlow contract. Implement WO-MODULES-M3-IDEAS-01 exactly as R8.512. Extract Ideas to its own module/schema, add only the locked StudioFlow public ports and narrow Presentation public moodboard command, preserve data/objects/grants/routes/behavior, add migration and regression tests, update browser acceptance backlog and changelog, run every mandatory Executor gate, and commit locally without pushing.
