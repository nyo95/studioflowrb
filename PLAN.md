# Active Plan

Plan ID: SF-R1-ARCHIVE-AND-LEGACY-PROJECT-BACKBONE
Scope: Archive the rebuild StudioFlow; rebuild the legacy project backbone (Client, Project, Phase, Revision, Activity, Checklist, Today, StudioFlow settings) on the Foundation
Status: READY — implemented and committed in R8.71
Priority: P1
Owner: Repository owner
Last updated: 2026-09-15

## Outcome

The rebuild StudioFlow of R7.xx–R8.69 is preserved only in a local git tag
and removed from the branch. In its place, StudioFlow behaves like legacy for
day-to-day project work: create a project with auto-naming and PIC
designer/drafter, move its five phases through the legacy review workflow with
`vMAJOR.MINOR` revisions and FEEDBACK→TODO conversion, manage revision
activities and the project/phase checklist (subtasks, priority, due, labels,
assignee, saved filters, templates), and see all of it on the Today page —
with simplified status wording and an improved, UI-Engine-based layout.

## Context and Evidence

- Authority: `docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md` (R8.70).
  Sections §1–§8, §12, §13 govern this plan. It supersedes every older
  StudioFlow contract, including SF-A and the R8.62 Requirements decision.
- Legacy evidence: `D:\Misc\ProjectsHUB\studioflow`, `main`,
  `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`, committed files only. Key
  paths: `src/lib/services/project-service.ts`, `phase-service.ts`,
  `checklist-service.ts`, `checklist-task.ts`, `task-feed.ts`,
  `task-feed-query.ts`, `settings-service.ts`, `src/lib/domain/phase-*.ts`,
  `src/core/domain-shared/project-naming.ts`, `src/components/{today-view,
  today-inline-add, today-quick-add-modal, project-list-client,
  project-identity-strip, nav-inner, phase-actions, activity-manager,
  task-list, template-manager, saved-checklist-filters,
  admin-revision-override, create-project-dialog}.tsx`,
  `src/app/(dashboard)/projects/**`.
- Rebuild state: R8.69 on `studioflow/contracts`; Master Data and BQ are
  accepted and must not change behavior. Foundation F-E accepted in R8.61.

## Locked Decisions

- **Archive (RW-03).** Before any deletion, create local tag
  `archive/studioflow-rb-r8.69` on the pre-change HEAD (local only, never
  pushed). Then delete `src/apps/studioflow/**`,
  `src/app/(platform)/studioflow/**`, their tests, StudioFlow-only UI Engine
  showcase fixtures, and StudioFlow-only scripts/work orders. Move superseded
  StudioFlow contracts listed in contract §1 to
  `docs/archive/studioflow-rb/` (keep `D-SF-RECOVERY-DISCOVERY.md` and the
  new contract in place).
- **Schema cutover.** One migration drops every existing `studioflow` schema
  table/enum from the rebuild (`sf_*`) and creates the new models. This is an
  authorized destructive change **for rebuild databases only** (kantor/rumah
  dev and the disposable test DB). Legacy databases stay untouched. No data is
  migrated. Master Data/BQ/platform tables are not altered.
- **Model meaning** is contract §4–§6: Client, Project (PICs, type, status,
  priority, archive), Phase (fixed five, legacy states, `is_locked`,
  `allow_parallel`, `status_changed_at`), Revision (one ACTIVE per phase),
  Activity (TODO/FEEDBACK, deferral, due), ChecklistItem (depth 1, priority
  1–4, due, assignee, template link SetNull, labels), ChecklistLabel,
  ChecklistFilterView, ChecklistTemplate, StudioFlow settings singleton
  (`auto_naming_enabled`). User references are plain ids (no cross-schema FK).
  Table/enum naming follows rebuild conventions (`@@map`, `studioflow`
  schema); the Executor chooses exact names.
- **Behavior** is ported from legacy per contract §5.2, §6.4 and §4.2–4.4,
  including the CD fallback assignee to PIC drafter and reasons on reopen /
  archive. Hard project delete is replaced by archive/restore.
- **Permissions** are exactly contract §3 (ten grants), replacing the old
  eleven in the StudioFlow public module; `app-registrations.ts` keeps
  importing them from `@/apps/studioflow/public`. Stale grant rows for removed
  StudioFlow permissions are cleaned by the migration or the registry sync —
  whichever the platform registry already supports; do not add a new platform
  mechanism.
- **Routes**: `/studioflow` (Today), `/studioflow/projects`,
  `/studioflow/projects/[projectId]`,
  `/studioflow/projects/[projectId]/phases/[phaseId]`,
  `/studioflow/projects/[projectId]/history`, `/studioflow/clients`,
  `/studioflow/clients/[clientId]`, `/studioflow/settings`. Temporary
  redirects from legacy `/projects`, `/projects/[id]`,
  `/projects/[id]/phases/[phaseId]` only. No MOM/Schedule/Library/Catalogue
  nav entries until their slices exist (no disabled placeholders).
- **Structure**: `src/apps/studioflow/{public,domain,projects,phases,tasks,
  today,settings}`; pure domain functions (phase policy, revision numbering,
  naming, blocker projection, feed shaping) have unit tests; pages call
  services only.
- **Foundation first** (contract §12, `agent-rules`): reuse Core/Utilities/UI
  Engine. A missing generic need (e.g. `SortableList`, project context rail,
  stepped ordering utility) is added once in the shared layer with tests and
  inventory entries, never as an app-local substitute. The phase strip stays
  app-owned.
- **UI copy** English; simplified phase labels per contract §5.3; no raw enum
  on screen; named action buttons and explained locks per §13.1–§13.6. The
  phase accent palette (§13.8) is **not** approved — do not add tokens.

## Boundaries and Non-goals

MOM, Product Schedule, CD list, deliverables/uploads, SketchUp, comments/chat,
Upcoming, Library/Brand page, product requests, undo, legacy data import,
Master Data/BQ behavior, Platform settings/appearance, push/PR/deploy.

## Acceptance Criteria

- Tag exists locally; no file under the deleted paths remains; boundary and
  legacy-runtime checks pass; no dangling imports or nav links.
- Fresh migrate on the disposable DB produces only the new StudioFlow tables;
  Master Data/BQ integration suites still pass.
- Integration tests prove: bootstrap (naming auto/manual, five phases, 1.0
  revision, template seeding); every §5.2 command incl. sequential/parallel
  rules, ON_HOLD block, blockers (root-only, deferred TODOs), reject
  numbering and FEEDBACK→TODO with fallback assignee, reopen numbering,
  approveClient/completeSupervision completing the project, override with
  history snapshot; checklist cascade toggle, depth cap, reorder, template
  sync idempotency and detach on template delete; archive read-only;
  permission denial per command; one audit event per mutation.
- Today shows my projects grouped (empty projects included), unified rows,
  filters, saved filters, inline and quick add.
- Unit tests cover the pure domain functions and label mapping.

## Verification

- If the R8.70 documentation files (this plan, the rework contract, and the
  ledgers it names) are still uncommitted, commit exactly those first as
  `R8.70 | docs(studioflow): ratify legacy rework and plan SF-R1`; SF-R1 is
  then R8.71.
- Record HEAD/branch/dirty files first; set `STUDIOFLOW_LOCATION=kantor`;
  validate the disposable target before any DB command.
- Focused suites, then `npm test`, typecheck, lint, `check:boundaries`,
  `check:legacy-runtime`, build, fresh migration deploy on the disposable DB,
  `git diff --cached --check`. Update `CHANGELOG.md`, `docs/roadmap.md`
  (SF-R1 state), `docs/README.md` index, and `docs/knownbug.md` (close
  KB-013…018, KB-021, KB-023 as superseded by the rework; KB-022/KB-012 stay
  open for SF-R2). One local commit.

## Reviewer Acceptance

Desktop and 375 px with the kantor fixture: create a client in context and a
project (auto name), walk Moodboard through internal review → reject → client
review → approve, confirm Layout/3D/CD parallel activation and the explained
lock on Supervision, add activities/checklist items with subtasks, due,
priority, labels, see them on Today, save a filter, archive/restore a project,
hit a legacy `/projects/...` URL, and verify a drafter-only grant cannot
approve and signed-out access redirects to `/login`.

## Risks and Recovery

- Destructive schema cutover: the tag plus migration history is the rollback;
  never run it against a non-rebuild target.
- Large slice: if context runs short, finish archive + domain + services +
  tests first, commit nothing partial, and report the precise remaining UI
  work instead of shipping a broken nav.
- If a Foundation extension would change Master Data/BQ rendering, stop and
  report it as a blocker.

## Executor Prompt

You are the Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, this `PLAN.md`, and
`docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md`, then implement the
entire READY SF-R1 outcome: tag and archive the rebuild StudioFlow, cut over
the `studioflow` schema on rebuild databases only, and port the legacy project
backbone (pinned commit `c4b0c466`, read-only) onto the Foundation with the
simplified UI described in the contract. Preserve unrelated owner work and
Master Data/BQ behavior, run the required checks against the validated
disposable rebuild database, update the changelog and ledgers, and create one
local revision commit. Stop only for a locked-decision conflict, unsafe
boundary, or failed mandatory evidence; otherwise report the commit, checks,
limitations, and remaining unrelated dirty files.
