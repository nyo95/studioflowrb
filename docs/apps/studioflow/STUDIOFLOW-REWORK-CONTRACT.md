# StudioFlow Rework Contract — Legacy Behavior on the Centralized Foundation

Status: **ACTIVE — owner-ratified 2026-09-15 (R8.70). Supersedes every other
StudioFlow contract in this folder.**
Owner: repository owner
Lane that produced it: Planner, kantor

Legacy evidence: `D:\Misc\ProjectsHUB\studioflow`, branch `main`, commit
`c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27` (same pin as D-SF). Only committed
files are evidence. The legacy working tree (`foldering/`, dumps, `.env`) and
the legacy database remain forbidden.

Rebuild evidence: branch `studioflow/contracts`, revision R8.69.

## 0. Why this contract exists

The rebuild StudioFlow (R7.xx–R8.69) redesigned the product around Iterations,
client Responses, IterationPoints, first-class Requirements with evidence,
phase templates, and a single project lead. The owner reviewed the result on
2026-09-15 and ruled that it **deviates from how the studio actually works**.

Owner instructions, 2026-09-15:

1. The current rebuild StudioFlow is partial and diverges from legacy.
2. Master Data and BQ are accepted and stay untouched.
3. StudioFlow documentation/contracts may be rewritten.
4. The existing rebuild StudioFlow app is archived: **git tag only, code
   deleted** from the working branch.
5. The goal is to rework legacy behavior *into* the rebuild: legacy business
   logic, rebuilt on the centralized Foundation (Core, Utilities, UI Engine),
   with an improved UI/UX.

Decisions taken in the same session:

| ID | Decision |
|---|---|
| RW-01 | Phase workflow is the **legacy phase state machine** with revisions `vMAJOR.MINOR` and FEEDBACK→TODO conversion. The screen shows **simplified labels** (§5.3). |
| RW-02 | Project keeps **PIC Designer** and **PIC Drafter** as assignment fields. Authorization comes only from platform RBAC grants. The CD phase is presented as the drafter's phase in the UI. No role enum. |
| RW-03 | Archive = local git tag on the last pre-rework commit, then delete the rebuild StudioFlow code, routes, tests, and `sf_*` schema from the working branch. |
| RW-04 | First rework wave: Project + Client + Phase + Revision; Task/Checklist + Today; MOM; Product Schedule. CD List, Deliverables/files, SketchUp, collaboration, Upcoming, Library are wave 2+. |

## 1. Authority and how legacy is used

This contract amends the legacy-isolation rule in `AGENTS.md` for StudioFlow
only:

- Legacy **behavior** at the pinned commit is the functional specification.
  Where this contract is silent, legacy behavior wins over any older rebuild
  StudioFlow document.
- An Executor **may read** pinned legacy files and port algorithms, validation
  rules, ordering rules, copy, and interaction flows.
- An Executor **may not** import legacy modules, copy the legacy schema or
  migration history, reuse the legacy UI kit (`src/ui_engine`, `ui-*` classes,
  shadcn wrappers), reuse legacy auth/RBAC/audit/db runtimes, restore the
  legacy `Role` enum, or touch any legacy database.
- Every ported behavior lands on rebuild services, Prisma models, platform
  audit, and UI Engine components.

Superseded (kept only as history, moved under `docs/archive/studioflow-rb/`
in R8.71): `studioflow.md`, `studioflow-project-contract.md`,
`studioflow-schedule-contract.md`, `studioflow-mom-contract.md`,
`studioflow-ux-spec.md`, `studioflow-work-orders.md`,
`studioflow-implementation-plan.md`, `STUDIOFLOW-LEGACY-AUDIT-ROADMAP.md`.
`D-SF-RECOVERY-DISCOVERY.md` stays as evidence; its D-SF-01…07 remain valid
except where §9 below overrides them.

## 2. Legacy → rebuild disposition matrix

| Legacy capability (pinned paths) | Disposition | Rebuild destination |
|---|---|---|
| Project list, create dialog, edit, priority, complete (`projects/page.tsx`, `project-list-client.tsx`, `create-project-dialog.tsx`, `project-service.ts`) | KEEP | `/studioflow/projects`; §4 |
| Auto project naming `[Year]-[Number] [Name]`, toggle in settings (`core/domain-shared/project-naming.ts`, `SystemConfig.is_auto_naming_enabled`) | KEEP | app-owned naming policy; §4.2 |
| Hard project delete + deletion impact (`executeDeleteProject`) | FIX | archive/restore with reason + audit (no hard delete) |
| Client by name, address, logo (`Client`, `client-management-table.tsx`, `client-branding.tsx`) | KEEP | `/studioflow/clients`; logo via platform `ObjectStorage` |
| PIC designer/drafter + role eligibility (`assertPicAssignable`, `DESIGNER_ROLES`) | FIX | plain user references; eligibility = holds the relevant grant (§3) |
| Five fixed phases, sequential activation, `allow_parallel`, lock (`phase-policy.ts`, bootstrap) | KEEP | §5 |
| Phase actions: activate, bypass, submit internal, approve internal, reject internal/client, submit client, approve client, reopen, complete supervision (`phase-service.ts`) | KEEP | §5.2 |
| Admin revision override hard reset (`executeOverrideRevision`, `admin-revision-override.tsx`) | KEEP | `studioflow.phase.override`; history snapshot into audit |
| Revision `major.minor` (`Revision`) | KEEP | §5.4 |
| Activity TODO/FEEDBACK per revision, deferral, due date (`Activity`, `activity-manager.tsx`) | KEEP | §6.1 |
| Approval blocker `assertNoPendingTasks` (root checklist only) | KEEP | §6.4 |
| Checklist tree (depth 1), priority 1–4, due, assignee, labels, cascade toggle, reorder, filter views (`ProjectChecklist`, `checklist-*`, `saved-checklist-filters.tsx`) | KEEP | §6.2 |
| Checklist templates global/per-phase + sync (`ChecklistTemplate`, `template-manager.tsx`, `executeSyncProjectChecklists`) | KEEP | §6.3 and StudioFlow settings |
| Task comments on checklist (`Comment.task_id`) | DEFER | wave 2 with collaboration |
| Today feed grouped by project, quick add, inline add (`today-view.tsx`, `task-feed.ts`) | KEEP | `/studioflow` (Today); §7 |
| Upcoming date buckets (`upcoming-view.tsx`) | DEFER | D-SF-01 stands |
| Project activity log / global activity (`activity-log-table.tsx`) | MERGE | project History tab reads platform audit |
| Undo button (`undo-executor.ts`) | PURGE | audit is read-only history |
| Project identity strip (`project-identity-strip.tsx`) | KEEP | project header; §8 |
| Project nav rail with phase status + open counts (`nav-inner.tsx`, `project-layout-shell.tsx`) | KEEP | project workspace nav via UI Engine; §8 |
| Phase reading / CD list (`phase-reading.tsx`, `cd-list-table.tsx`, `CDList`) | DEFER | wave 2 (CD List) |
| Deliverables and uploads (`deliverables-table.tsx`, `upload/*` routes, `File`) | DEFER | wave 2 via `ObjectStorage`; unsafe upload routes PURGE |
| MOM documents/items/points/images/print (`extensions/mom/*`) | KEEP | §10; legacy content model and editing flow, no ISSUED/SUPERSEDED lifecycle |
| Product schedule entries/options/templates/prefix/codes (`extensions/schedule/*`, `CatalogBoard.tsx`) | KEEP | §11 |
| Product requests + vendor follow-up (`ProjectProductRequest`) | DEFER | vendor fields write into Master Data — needs a MD public port decision |
| Reuse pool "from a past project" (`searchReusableSpecs`) | KEEP | §11.4 (project-owned rows searched across projects, read-only) |
| SketchUp sync, render boards (`extensions/sketchup/*`) | DEFER | D-SF-06 stands |
| Project chat / live providers | DEFER | D-SF-05 stands |
| Studio settings: app title, UI settings, logo (`studio-settings-panel.tsx`) | ALREADY_REPLACED | Platform General Settings/Appearance |
| Database backup/restore screen | PURGE | D-SF-02 stands |
| Fixed `Role` enum, `core/rbac/*` matrices, project membership guards | PURGE | platform RBAC |
| Audit compat readers | PURGE | platform audit |

Rebuild concepts that are **PURGED** by this contract (they have no legacy
counterpart the owner wants): Iteration, Response/ResponsePoint,
IterationPoint, InternalApproval record, Requirement templates/project
requirements/evidence, phase-template administration, per-project phase
add/remove, `SfFile` three-treatment model (returns only if wave 2
Deliverables needs it), global `SfProductCatalogue`, "Waiting on me" queue as
home page.

## 3. Permissions

StudioFlow owns this vocabulary in `src/apps/studioflow/public`. Core owns
grant mechanics. Registered set (replaces the old eleven):

| Permission | Grants |
|---|---|
| `studioflow.access` | Open the app |
| `studioflow.project.read` | Read projects, clients, phases, revisions, tasks, MOM, schedule |
| `studioflow.project.manage` | Create/edit clients and projects, PICs, priority, status, archive/restore |
| `studioflow.phase.work` | Activate a phase, submit for internal review, add/edit/defer/complete activities |
| `studioflow.phase.review` | Approve/reject internal, submit to client, approve/reject client, reopen, complete Supervision, bypass a pending phase |
| `studioflow.phase.override` | Admin revision override (hard reset) |
| `studioflow.task.manage` | Create/edit/complete/reorder/delete checklist items, labels, saved filters |
| `studioflow.settings.manage` | Naming toggle, checklist templates, schedule templates/prefixes |
| `studioflow.mom.manage` | Create/edit/delete MOM documents and content |
| `studioflow.schedule.manage` | Create/edit/delete schedule entries and options, mark final |

Rules:

- One grant decision per service operation. No project membership table, no
  PIC-based authorization (legacy `getProjectMembershipOrThrow` is PURGE).
- PIC eligibility: `pic_designer_id` must be an active user holding
  `studioflow.phase.work`; `pic_drafter_id` likewise. Legacy DIC/DRIC maps to
  RBAC role configuration, not code.
- Suggested holder configuration (owner configures in Platform Access):
  Designer = access, read, phase.work, phase.review, task.manage, mom.manage,
  schedule.manage; Drafter = access, read, phase.work, task.manage;
  Admin = all.

## 4. Client and Project

### 4.1 Fields

Client: `name` (unique, case-insensitive), `address?`, `logo_storage_key?`,
timestamps, `archived_at?`.

Project (legacy shape, rebuild conventions):

| Field | Rule |
|---|---|
| `project_code` | unique; derived from the naming policy (`YYYY-NNN`) |
| `name` | unique; full formatted name |
| `client_id?` | StudioFlow client; create-in-context allowed |
| `pic_designer_id`, `pic_drafter_id` | required plain references to platform `User` (no cross-schema FK) |
| `opening_date?` | date-only |
| `project_type` | legacy `core_project_type`, default `RETAIL`; free text with suggestions |
| `status` | `ACTIVE`, `ON_HOLD`, `COMPLETED` |
| `priority` | `URGENT`, `NORMAL`, `LOW` |
| `client_contact?`, `address?`, `area?` (decimal m²) | as legacy |
| `archived_at?`, `archived_by_id?`, `archive_reason?` | reversible archive |

### 4.2 Naming

Port legacy `projectNamingPolicy` exactly: auto mode formats
`[Year]-[Number] [Name]` (space, not dash, after the number), with a
concurrency-safe sequence; manual mode validates that format. `project_code` is
the `YYYY-NNN` part. Toggle lives in StudioFlow settings.

### 4.3 Bootstrap (one transaction)

Create/upsert client → create project → create the five phases (§5.1) with
phase 1 `IN_PROGRESS` and the rest `PENDING` → create revision `1.0 ACTIVE` on
phase 1 → seed checklist items from active templates (§6.3) → seed schedule
default entries (§11.5, when SF-R4 exists) → audit `project.bootstrapped`.

### 4.4 Lifecycle

`executeCompleteProject` (legacy) sets `COMPLETED`; approving the last phase or
completing Supervision also completes the project. `ON_HOLD` blocks phase
activation (legacy "Project must be ACTIVE"). Archive requires a reason; an
archived project is read-only everywhere and hidden from Today by default.

## 5. Phases and revisions

### 5.1 Fixed phase set

`MOODBOARD(1) → LAYOUT(2) → DESIGN_3D(3) → CD(4) → SUPERVISION(5)`. LAYOUT,
DESIGN_3D, CD are created with `allow_parallel = true`. Phase set is app code,
not an administered template.

### 5.2 State machine (port `PhasePolicy` + `phaseService`)

Stored states: `PENDING`, `IN_PROGRESS`, `ON_REVIEW_INTERNAL`,
`APPROVED_INTERNAL`, `ON_REVIEW_CLIENT`, `READY_FOR_NEXT`, `COMPLETED`, plus
`is_locked`, `allow_parallel`, `status_changed_at`.

| Command | From | To | Side effects |
|---|---|---|---|
| activate | PENDING | IN_PROGRESS | sequential check (prev READY_FOR_NEXT/COMPLETED unless order 1 or `allow_parallel`); project must be ACTIVE; revision 1.0 |
| bypass | PENDING | READY_FOR_NEXT (or COMPLETED if last) | locked; revision 1.0 COMPLETED; project COMPLETED if last |
| submitInternal | IN_PROGRESS | ON_REVIEW_INTERNAL | blocked by open TODO activities in the active revision or phase-tagged deferred TODOs |
| approveInternal | ON_REVIEW_INTERNAL | APPROVED_INTERNAL | full blocker (§6.4) |
| submitClient | IN_PROGRESS / ON_REVIEW_INTERNAL / APPROVED_INTERNAL | ON_REVIEW_CLIENT | full blocker (§6.4) |
| rejectInternal | ON_REVIEW_INTERNAL / ON_REVIEW_CLIENT | IN_PROGRESS | close revision; new `major.minor+1`; open FEEDBACK → TODO (assignee kept, fallback PIC designer, or PIC drafter when phase is CD) |
| rejectClient | ON_REVIEW_CLIENT | IN_PROGRESS | close revision; new `major+1.0`; FEEDBACK → TODO as above |
| approveClient | ON_REVIEW_CLIENT | READY_FOR_NEXT, locked | full blocker (§6.4); close revision; project COMPLETED if last phase |
| reopen(intent) | locked or PENDING | IN_PROGRESS, unlocked | new revision (CLIENT → major+1, INTERNAL → minor+1); reason required (rebuild addition) |
| completeSupervision | SUPERVISION + IN_PROGRESS | COMPLETED, locked | project COMPLETED |
| override(mode, target, note) | any | IN_PROGRESS with target revision, or PENDING | wipes revisions/activities; full history snapshot in the audit payload |

Rebuild addition: CD fallback assignee uses PIC drafter (legacy always used
designer — FIX, matches RW-02). Every command writes one platform audit event
with previous/next state, as legacy did. Content mutations obey
`PhasePolicy.isModifiable` (not locked, not READY_FOR_NEXT/COMPLETED).

### 5.3 Simplified display (RW-01)

| Stored | Shown label | Group chip |
|---|---|---|
| PENDING | Not started | Not started |
| IN_PROGRESS | Working | Working |
| ON_REVIEW_INTERNAL | Internal review | In review |
| APPROVED_INTERNAL | Ready to send | In review |
| ON_REVIEW_CLIENT | With client | In review |
| READY_FOR_NEXT | Approved | Approved |
| COMPLETED | Done | Done |

Raw enum names never appear on screen. A phase shows "waiting N days" from
`status_changed_at` (unknown → no duration). A phase that cannot be activated
says why ("Layout starts after Moodboard is approved") instead of a silent
lock.

### 5.4 Revision

`major` ≥ 1, `minor` ≥ 0, `status` ACTIVE/COMPLETED, at most one ACTIVE per
phase (enforce with a partial unique index). Label `v{major}.{minor}`.

## 6. Work items

### 6.1 Activity (revision work)

Legacy `Activity`: `content`, `mode` TODO/FEEDBACK, `status` OPEN/COMPLETED,
`assigned_to_id?`, `due_at?` (date-only), `project_id`, `phase_id?`,
`revision_id?`, `deferred_from_version?`. Commands: add, edit, set due, toggle,
delete, defer (detach from revision, keep phase tag, record version).

### 6.2 Checklist item (project/phase tasks)

Legacy `ProjectChecklist`: `project_id`, `phase_id?` (null = general),
`label`, `is_checked`, `checked_at`, `parent_id?` (depth max 1), `sort_order`
(step spacing), `priority` 1–4 (4 = none), `due_at?` date-only,
`assigned_to_id?`, `template_id?` (SetNull), labels (many-to-many with a
global label list: name + color token). Toggle cascades both ways to
children; children never roll up. Saved filter views per user
(`name`, `query_json` validated by Zod).

### 6.3 Checklist templates

Global (`phase_key = null`) or per phase; `label`, `is_active`, `sort_order`.
Sync is idempotent on `(template_id, phase_id)` and appends after existing
rows. Deleting a template detaches generated rows (they become plain tasks).

### 6.4 Blocker projection

One pure function used by approveInternal, submitClient, and approveClient (and shown in the UI before the
button is pressed): open activities in the active revision + open deferred
activities tagged to the phase + unchecked **root** checklist items of the
phase. submitInternal uses the TODO-only subset (§5.2).

## 7. Today (StudioFlow home)

`/studioflow` is Today (D-SF-01 kept). Port legacy `TasksPage` + `TodayView`:

- Scope = active projects where I am PIC designer or drafter; a toggle
  "All projects" is available to holders of `studioflow.project.manage`
  (rebuild addition).
- Grouped by project, a project with an empty queue still shows.
- Rows unify activities and checklist items (`fromActivity`,
  `fromChecklistTask`, `nestChecklistSubtasks`, `sortFeedTasks`).
- Filter tabs, due, priority, assignee, labels, saved filters, inline add,
  quick-add dialog (project + phase target).
- Legacy KB-023 (general todos on the home page) is satisfied by this page.

## 8. Project workspace

Routes (canonical, D-SF-07 redirects from `/projects/...` stay allowed):

| Route | Content |
|---|---|
| `/studioflow/projects` | project directory (legacy filters: status, priority, PIC, client; search) |
| `/studioflow/projects/[projectId]` | overview: identity header, phase strip, general checklist, open work |
| `/studioflow/projects/[projectId]/phases/[phaseId]` | phase page: state + actions, active revision, activities, phase checklist, revision history |
| `/studioflow/projects/[projectId]/mom` and `/mom/[momId]` (+ print) | MOM |
| `/studioflow/projects/[projectId]/schedule` | Product Schedule |
| `/studioflow/projects/[projectId]/history` | audit timeline for the project |
| `/studioflow/clients`, `/studioflow/clients/[clientId]` | clients |
| `/studioflow/settings` | naming, checklist templates, schedule templates/prefixes |

The project workspace keeps the legacy two-level navigation: app rail +
project rail listing Overview, the five phases (state dot + open-root-task
count), MOM, Schedule, History. Mobile: drawer.

## 9. Overrides of earlier ratified decisions

- D-SF-03 (MOM lifecycle DRAFT/ISSUED/SUPERSEDED) → **replaced** by §10
  (legacy content floor *and* legacy lifecycle). Closes KB-022/KB-012 by
  purge.
- D-SF-04 (project-owned catalogue) → kept in spirit: schedule options are
  project-owned (§11). Global catalogue rows are dropped in SF-R1.
- "No project-scoped authorization" → kept.
- "Requirements are first-class" (R8.62) → **reversed**: requirements are
  checklist templates (§6.3).

## 10. MOM (port `extensions/mom`)

Document: `topic` (default "SITE INSPECTION REPORT"), `meeting_date`,
`venue?`, `attendees?`, `prepared_by_name`, `created_by`. Items ordered, with
`is_text_only` and list style (`decimal`, `disc`, `dash`, `none`); points
ordered with style (`default`, `none`); images ordered per item through `ObjectStorage` and the UI Engine
image workspace. Commands: create/update/delete document; create/update/
delete/reorder items, points, images. Parent-chain project scope assertion
kept. Print view kept (UI_ENGINE §13). No issue/supersede state. Delete is a
real delete of a MOM document with confirmation (legacy behavior) and an audit
snapshot.

## 11. Product Schedule (port `extensions/schedule` + `CatalogBoard`)

### 11.1 Entry

`project_id`, `section` (`material` | `fixture`), `category`, `prefix`,
`increment`, `sort_order`, `qty?` (decimal), `unit?`, `location?`,
`active_index`, `version_locked`, `template_item_id?`. Unique
`(project_id, section, prefix, increment)`. Code shown `PREFIX-NN`.

### 11.2 Numbering

Legacy renumbering via negative temporary values is replaced by one
transactional renumber that uses a deferrable unique constraint or a
two-phase update inside the service (Executor chooses; behavior must match:
codes stay gapless per `(project, section, prefix)` after add/delete/reorder).

### 11.3 Option

`label` (A, B, C…), `is_final`, `status` DRAFT/APPROVED/NOT_USED, snapshot as
**typed columns** (brand id/name via Master Data public Brand port, product
name, sku text, color, finishing, dimension, notes, image key?) instead of a
JSON blob, plus derived `search_key`. Marking final approves it and sets
siblings NOT_USED; deleting the final option promotes the next sibling.

### 11.4 Reuse from past projects

Search `search_key` across other projects' options (read-only) and copy the
snapshot into a new option. Manual entry stays default. CSV import from the
legacy Google Sheets format is kept (port `lib/schedule/csv-*`).

### 11.5 Templates and prefixes

Prefix dictionary `(section, category) → prefix`; schedule template
categories with `is_default_entry` seed empty reserve entries on new projects
and via an explicit "Apply template" action; template items with a snapshot.
Managed in StudioFlow settings.

## 12. Foundation centralization map

| Need | Classification | Canonical home |
|---|---|---|
| Session/principal, grants, audit envelope, errors/action wrapper, Zod validation, transactions | REUSE | `platform/core/*` |
| Date-only due dates, instant formatting, "N days" age | REUSE / EXTEND | `platform/utilities/date` (`currentDateOnly`, `diffDateOnlyDays` added in R8.71) and `FormattedInstant` |
| Decimal area/qty | REUSE | `platform/utilities/decimal`, `measurement`, `unit` |
| Text normalization for names/search keys | REUSE | `platform/utilities/normalization` |
| Stepped sort order + sibling reorder (checklist, MOM, schedule, BQ lines) | APP-OWNED until a second app needs it (R8.71) | `apps/studioflow/domain/checklist.ts` `steppedSortOrders`; candidate `platform/utilities/ordering` |
| Image storage for client logo and MOM images | REUSE | `platform/core/storage` + `ImageWorkspace` |
| Confirm, unsaved-changes guard, dialogs, drawers, tables, toolbars, inline edit, creatable search, rich text | REUSE | UI Engine |
| Drag-to-reorder list | DEFERRED (R8.71 uses Move up/Move down actions) | UI Engine pattern `SortableList` once MOM/Schedule also need drag |
| Secondary context rail (project workspace nav) | EXTEND (R8.71) | UI Engine `SettingsShell` + new `ContextNavLink`/`ContextNavHeading`, shared with Platform settings navigation |
| Assignee / PIC people lookup | ADD (R8.71) | `platform/core/rbac/people` (`peopleDirectory`) |
| Phase strip / stepper | REUSE | UI Engine `PipelineStrip` (already existed) |
| Phase state machine, revision numbering, naming policy, blocker projection, schedule codes | APP-OWNED | `src/apps/studioflow/domain/*` |

`src/apps/studioflow` is modular (one folder per module: `projects`,
`phases`, `tasks`, `today`, later `mom`, `schedule`) plus pure `domain/`
rules and a thin `public/` boundary. No 100 KB single service file.

Implementation notes recorded in R8.71:

- Checklist root items come only from templates (legacy rule); people add
  one level of subtasks. General ad-hoc work is a project-level to-do
  (activity with no phase), which Quick add on Today also creates.
- Legacy `#PHASE` tags inside to-do text are not ported; Quick add selects the
  phase explicitly.
- Checked checklist rows older than 7 days drop out of Today (legacy
  retention); nothing is deleted.

## 13. UI/UX direction (owner may veto)

1. **Today first.** Opening StudioFlow answers "what is on my plate" across
   my projects; overdue and URGENT float up.
2. **Phase strip.** Project overview shows five stops with the current one
   highlighted, the simplified label, "waiting N days", and one primary
   action (e.g. "Send to client"). Secondary actions live in a menu.
3. **Named actions, not states.** Buttons read "Send for internal review",
   "Approve internally", "Send to client", "Client approved", "Client asked for
   changes", "Reopen". The reject dialogs list the open FEEDBACK items that
   will become TODOs before confirming.
4. **Designer / drafter lens.** CD phase header shows the drafter; other
   phases show the designer. "My projects" filter uses both PIC fields.
5. **Explained locks.** Disabled buttons carry the reason and, when the
   blocker projection is non-empty, a link that scrolls to the open items.
6. **Revision chip** `v2.1` with a history drawer (who/when/what changed).
7. **Schedule as a board.** Keep the table for dense editing but add a card
   view with option thumbnails; code chips `PT-01` stay visible in both.
8. **Visual identity.** DESIGN.md stays authoritative. Proposed, pending owner
   approval: a restrained five-hue phase accent set (tokens only, used for the
   strip, rail dots, and Today group markers) so the app stops reading as
   generic slate.

## 14. Non-goals for wave 1

CD drawing list, deliverables/files and uploads, SketchUp, render boards,
product requests/vendor follow-up, comments/chat/presence, Upcoming/Gantt,
Library/Brand discovery page, Google Drive, legacy data migration, undo.
