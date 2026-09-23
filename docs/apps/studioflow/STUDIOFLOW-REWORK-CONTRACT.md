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
| Activity TODO/FEEDBACK per revision, deferral, due date (`Activity`, `activity-manager.tsx`) | PARTIAL | FEEDBACK-only, §6.1; TODO mode and deferral superseded by V2-D1 (todos live in `SfChecklistItem`, §6.2; deferral mesh purged R8.98) |
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
| submitInternal | IN_PROGRESS | ON_REVIEW_INTERNAL | blocked by unchecked root checklist items only (`todoBlockers`, V2-D1 — `SfActivity` carries no TODO mode or deferral) |
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

**Superseded by V2-D1 (Todo SSOT migration, R8.9x):** `SfActivity` is
FEEDBACK-only — the TODO mode, `due_at`, and `defer` command described above
do not exist on the rebuilt model. Project/phase to-dos live exclusively in
`SfChecklistItem` (§6.2); the deferral mesh (`deferred_from_version` and the
defer command) was fully purged in R8.98. Adding a `mode: "TODO"` activity is
rejected with `ACTIVITY_TODO_DEPRECATED`.

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

Two pure projections over the same counts (`domain/blockers.ts`), used by the
phase commands and shown in the UI before the button is pressed:
- `fullBlockers` (approveInternal, submitClient, approveClient): open FEEDBACK
  activities in the active revision + unchecked **root** checklist items of
  the phase.
- `todoBlockers` (submitInternal): unchecked **root** checklist items only —
  no activity or deferred bucket (V2-D1; superseded the original "TODO-only
  subset of the same list" design, since `SfActivity` no longer carries a
  TODO mode to subset from).

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

Document: `topic` (caller-required at creation, no default — the "New MOM"
dialog prompts for it before the row exists), `meeting_date`, `venue?`,
`attendees?`, `prepared_by_name`, `created_by`. Items ordered, with
`is_text_only` and one free-typed `content` field per section; images ordered
per item through `ObjectStorage` and the UI Engine image workspace (crop,
freehand pen + arrow/box/circle annotation, and a Pan tool for repositioning —
same shared workspace as Schedule photos, §11.7). Commands: create/update/
delete document; create/update(content)/delete/reorder items, images.
Parent-chain project scope assertion kept. Print view kept (UI_ENGINE §13). No
issue/supersede state. Delete is a real delete of a MOM document with
confirmation (legacy behavior) and an audit snapshot.

**MOM point-per-row → single free-text content (owner decision, 2026-09-23).**
The `SfMomPoint` table and per-item `list_style`/per-point `style` enums are
gone. Each section (`SfMomItem`) now holds one `content` string edited as a
single `SimpleTextEditor` box (the same bold/italic/bullet-list "WYSIWYG-lite"
control as Master Data's Notes field, §9), instead of a list of independently
add/reorder/delete-able point rows. List markers (`1.`, `-`, `•`) are literal
characters the user types and the editor auto-continues on Enter — the same
convention as WhatsApp/Notion — not a value chosen from a list-style dropdown
or rendered outside the box. This intentionally overrides the "ordered
document/block/point/image hierarchy… is the minimum" legacy-parity floor
recorded in the archived `studioflow-mom-contract.md` §4.3/§14: the owner
judged the per-note reorder/delete UI and the Normal/Plain per-note style
toggle not worth the interaction cost for a repeating list of short site notes
(owner: *"sistem add note dan add point2 yg independen di ganti jadi sebuah
text area yg bisa wysiwyg... di whatsapp aja bullet/numberingnya bisa
otomatis"*). Historical revisions saved before this change keep their old
`points`/`listStyle` shape inside the stored JSON snapshot; `parseMomSnapshot`
(`src/apps/studioflow/domain/mom.ts`) normalizes them into the current
`content` shape on read, recomputing the same marker each point used to
render, so restoring an old revision looks the same as it did before.

**Revision snapshots.** Independent of the "no issue/supersede state" rule
above (that's about document *lifecycle*, not this): a document carries a
save/restore revision-snapshot system (`RevisionsCard`, `saveMomRevisionAction`/
`restoreMomRevisionAction`) — the user can name and save a full snapshot of
the current content at any point, see a list of prior saved revisions with
who saved them and when, and restore any of them (replacing current content,
own confirmation flow). Retention keeps the latest `revisionRetention` saved
revisions, oldest pruned first. This is manual, user-triggered snapshotting,
not automatic versioning tied to edits, and it's unrelated to StudioFlow
Phase `SfRevision` (§5.4) — a different, project-phase-scoped concept.

The Meeting Details header (topic/date/venue/prepared-by/attendees) renders
collapsed to a `Topic · Date · Venue` summary by default and expands to the
full form on click, since it's metadata set once and rarely revisited. A
section's content box recognizes a typed `1.`/`-`/`•` list prefix and
auto-continues it on Enter unconditionally (there is no per-item list style
to conflict with anymore).

Implementation notes (R8.72, SF-R2; content merge R8.117):

- Photos: at most two per section in `slot` 0/1; filling slot 1 while slot 0
  is empty lands in slot 0, removing photo 1 moves photo 2 up, swap exchanges
  them. Browser crop is fixed 4:3 (legacy cropper), output JPEG ≤ 1600 px,
  server accepts PNG/JPEG/WebP ≤ 3 MB (under the 4 MB server-action body limit) with a magic-byte check. Objects are
  written before the row and removed after commit on replace/delete.
- A section's `content` defaults to `""` (no "always keep one note" row to
  maintain now that there is nothing to delete down to). The last section
  cannot be deleted from the UI.
- Every child change bumps the document `updated_at`. Audited: created,
  header updated (field diff), deleted (snapshot), section deleted, photo
  added/replaced/removed; content edits and reorders are not audited (legacy).
- Routes: `/studioflow/projects/[projectId]/mom`, `…/mom/[momId]`, print at
  `/studioflow/print/projects/[projectId]/mom/[momId]` (no app shell).
- Read: `studioflow.project.read`; write: `studioflow.mom.manage`.

## 11. Product Schedule (port `extensions/schedule` + `CatalogBoard`)

### 11.1 Entry

`project_id`, `section` (`material` | `fixture`), `category`, `prefix`,
`increment`, `sort_order`, `qty?` (decimal), `unit?`, `location?`,
`active_index`, `version_locked`, `template_item_id?`. Unique
`(project_id, section, prefix, increment)`. Code shown `PREFIX-NN`.

**Qty/Unit are Fixture-only in the editor** (R8.113, owner decision
2026-09-23: "material harusnya ga perlu keluarin qty" — a Material line is a
specification, not a count, matching legacy's own CSV import, which already
discards Qty on Material sheets). The columns stay on the entry for both
sections — nothing is dropped from the schema — but the checklist only
offers the Qty row when `section = FIXTURE`.

### 11.2 Numbering

Legacy renumbering via negative temporary values is replaced by one
transactional renumber that uses a deferrable unique constraint or a
two-phase update inside the service (Executor chooses; behavior must match:
codes stay gapless per `(project, section, prefix)` after add/delete/reorder).

### 11.3 Option (the spec)

`label` (A, B, C…), `is_final`, `status` DRAFT/APPROVED/NOT_USED, snapshot as
**typed columns** (brand id/name via Master Data public Brand port, `product_name`,
color, pattern, finishing, dimension, notes, image key?) plus an `extra` JSON
array (§11.9) and derived `search_key`. Marking final approves it and sets
siblings NOT_USED; deleting the final option promotes the next sibling.

**Vocabulary (owner decision 2026-09-23).** Three things were previously all
called "metadata"; they are now named separately everywhere — UI, code and
this contract:

| Name | Owner | Fields |
|---|---|---|
| **Spec** | Option | Brand, Type, Color, Pattern, Finishing, Size, Notes, plus `extra` |
| **Item details** | Entry | Location, Qty, Unit |
| **Card fields** | Entry | which of the above caption the board card (§11.8) |

**Type** is the product designation — "Nude Pro - ATS 1132 M" — stored in
`product_name` and shown as the card title. It is the legacy Google Sheet's
`Type` column and is always displayed, so it is not a card-field toggle.

**`sku_text` is PURGED (R8.111).** Legacy carried both an "Item No"
(`specs.catalog_sku`) and a Type; the owner ruled they are the same
designation, so the column was dropped and any value it held was folded into
`product_name` as `Type - Code`. CSV import appends an article-code column to
Type the same way instead of storing it twice.

**Reuse pool.** `search_key` is empty when brand *and* type are both
placeholders (`N/A`, `PENDING`, `[RESERVED]`, `GENERIC`, blank…), which keeps
an unfilled row out of "From past project" — legacy's
`deriveScheduleSpecFields` rule, which the rebuild had not ported. Brand is
**not** required: a spec with no catalogued brand is normal and stays
searchable by its Type.

**The card speaks for the final option, else the first** (legacy
`selectedCatalogOption`). A row holding one unapproved option shows that
product rather than reading as empty.

### 11.4 Reuse from past projects

Search `search_key` across other projects' options (read-only) and copy the
snapshot into a new option. Manual entry stays default. CSV import from the
legacy Google Sheets format is kept (port `lib/schedule/csv-*`).

### 11.5 Templates and prefixes

Prefix dictionary `(section, category) → prefix`; schedule template
categories with `is_default_entry` seed empty reserve entries on new projects
and via an explicit "Apply template" action; template items with a snapshot.
Managed in StudioFlow settings as three tables (prefix dictionary, default
categories, template items); template items can be added and edited there
(section/category fixed after creation; rows already copied into projects keep
their own snapshot). A schedule row whose final option (or only option) is set
can be saved as a template item from the project schedule ("Save as template
item", legacy `createScheduleTemplateItemFromEntryAction`); the item keeps the
option photo and the row's qty/unit/location. Both need `settings.manage`; the
schedule page links to these settings for that permission.

### 11.6 Implementation notes (R8.73–R8.74)

- Option labels continue after the highest existing label (A…Z, AA…); a
  deleted label is not reused. Approving sets siblings NOT_USED and keeps
  `active_index` on the final option; `version_locked` is not set (legacy did
  not use it). An entry may have no options ("reserved code").
- New projects receive every active template item once and an empty row for
  each default category without a row (same routine as "Apply templates").
- Moving a row to another category gives it the next code of that category's
  prefix and renumbers the old group; one category spelling per project.
- CSV import accepts the legacy Google Sheets export (header row starting with
  `Code`; Material needs `Product Category`, both need `Ex` and `Type`; `Qty`
  is ignored on Material like legacy). Existing codes update the final option
  (brand text, product, notes from initials/contact/image) and
  qty/unit/location; new codes add rows. Category: sheet value, else the
  prefix dictionary (must be unique). A category seen for the first time
  registers the sheet prefix. Any row error rolls back the whole import.
  Legacy duplicate-product checks are not ported; image URLs from the sheet
  are kept in notes.

### 11.7 Option photos (R8.81, owner review 2026-09-16)

Legacy per-item photos (CatalogBoard) are restored as **one photo per option**:
`image_key` on the option, uploaded through `platform/core/storage` private
keys (`studioflow/schedule/<projectId>/…`) and the UI Engine image workspace
with a 4:5 crop, PNG/JPEG/WebP, magic-byte checked, ≤3 MB after crop, read
through short-lived signed URLs. Commands: set (add/replace) and remove, both
`schedule.manage`, project-scoped, blocked on archived projects, audited.
Clients never send storage keys; edits keep the stored photo. Reuse from a
past project, template seeding, and "Save as template item" share the stored
object, so an object is deleted only after commit and only when no option or
template item references it. The schedule list shows the final option's
thumbnail; the item panel shows each option's photo. Retention of objects left
behind by failures stays under KB-002.

The shared `platform/ui_engine` image workspace (used for this crop step, and
identically by MOM photos, §10) opens the file picker immediately on mount
(no separate "Choose image" click first), lets the user scroll-to-zoom and
drag-to-pan the preview directly (the crop-zoom/horizontal-focus/vertical-
focus sliders remain as a secondary, keyboard-accessible way to set the same
values), and includes an annotation toolbar — pen, arrow, box, circle, a
5-color swatch set, and a "Pan" tool for repositioning without leaving
drawing mode — baked into the saved image at crop time. This is UI-Engine-
owned browser behavior, not Schedule- or MOM-specific policy.

### 11.8 Card fields

`sf_schedule_entry.card_fields` is **nullable JSON**: `null` means "no
override" and renders `SCHEDULE_DEFAULT_CARD_FIELDS`; an array is an explicit
ordered choice and **may legitimately be empty** (a card with its photo, code
and Type only). This is legacy's `catalog_fields` null-vs-list distinction.
The R8.109 `TEXT[]` column used `{}` for both meanings, which made "default"
and "everything" the same stored value, hid the "Use default" affordance, and
forced a rule that the last checkbox could not be unticked; all three are
gone.

Selectable fields: **Brand, Color, Pattern, Finishing, Size, Location, Qty,
Notes**, plus one entry per extra spec line the shown option carries (§11.9),
addressed as `x:<slug-of-label>`. Type and the photo always render.

**Default set: Brand, Color, Finishing, Location, Notes** (owner decision
2026-09-23; legacy's own default was Type + Brand). An override is stored in
canonical field order, never in the order the boxes were ticked, so unticking
and re-ticking a field never moves its row to the bottom of the card.

Edited from the entry panel via `schedule.manage`, project-scoped like every
other schedule write; the panel states whether the entry is on the default or
on a custom choice, and "Use default" writes `null`. An empty row (a chosen
field the option has not filled in) is not rendered **on the card** — but
ticking a field's checkbox is never refused for being empty; see §11.10.

A template item carries the card-field choice of the row it was saved from
(`sf_schedule_template_item.card_fields`), so "Apply templates" reproduces the
card the studio approved rather than resetting it to the default.

**Qty and Unit stay available for both sections but are off by default**
(owner decision 2026-09-23: quantity is a Fixture concept; legacy's own sheet
import discards Qty on Material sheets, which the rebuild already mirrors).

### 11.9 Extra spec fields

An option and a template item each carry `extra`, a JSON array of
`{label, value}` — free-form specification lines such as "Abrasion class /
PEI IV" that do not deserve a column of their own. Owner decision
2026-09-23: the fields that appear on nearly every card stay typed columns so
search, ordering and CSV keep working off the database, and only the long tail
goes to JSON. This is deliberately **not** legacy's `data_snapshot`, which
mirrored four fields into columns and documented its own sync risk; here the
JSON is the only copy of what it holds.

Rules: at most 12 lines per option, label ≤ 60 and value ≤ 300 characters,
both trimmed; a line missing either half is dropped; labels de-duplicate
case-insensitively. Values join `search_key`, so an extra line is searchable
in "From past project". Extras travel with reuse, "Save as template item" and
"Apply templates", exactly like the typed columns.

### 11.10 The entry editor (R8.112, owner review 2026-09-23)

The entry panel is one `Dialog` (`size="lg"`), on both desktop and mobile —
not a 22rem sidebar squeezed beside the board on desktop with a separate
`Drawer` on mobile. Same dialog pattern as every other schedule dialog in
this file (Add item, Import CSV, …).

**Item details and card fields share one checklist**, row per field
(`ChecklistRow`): a checkbox, and — only once ticked — the input(s) that fill
that field in, in the same row. Location and Qty(+Unit) write to the entry;
Brand, Color, Pattern, Finishing, Size and Notes write to the option the card
speaks for (§11.3's "the final option, else the first"), auto-saving the full
option snapshot on blur. Unticking a field only stops it captioning the card;
it never discards what was typed. Row order (R8.113, owner-specified):
**Brand, Type, Color, Pattern, Finishing, Location, Qty (Fixture only,
§11.1), Size, Notes**, then any extra spec lines (§11.9).

**Type sits in the checklist too, right after Brand, with no checkbox**
(R8.113) — it edits `product_name` directly, but since Type always shows
(this section, above) it is never optional, so there is nothing to tick.

**Brand is one `CreatableSearch` combobox, not a select-plus-fallback-input
pair** (R8.113, owner: *"knp brand perlu 2? kasi aja pakai creatable
search?"*). Search Master Data brands, pick one, or type a name that is not
in it — both live in the same control, and no Master Data write happens
either way: an unmatched typed name becomes `brand_name` on the option with
`brand_id` left null, exactly the "not required, stays searchable by its
Type" rule already in §11.3. Nothing is created in Master Data from a
Schedule option; the combobox's own "create" affordance is repurposed to mean
"use this typed text", never a real insert (verified: no `masterData.create`/
`insert`/`upsert` call is reachable from the schedule app).

**Notes uses `SimpleTextEditor`** (R8.113, owner: *"pakai wysiwyg seperti
pada notes pada masterdata"*) — the same bold/italic/bullet-list toolbar over
a plain-text field already used for Notes on Brand, Vendor and Pricing in
Master Data, so schedule notes look and behave the same way elsewhere in the
app. It stores plain marked-up text (`**bold**`, `- bullet`), not HTML.

**Ticking is never refused for a field being empty.** An earlier pass greyed
out and disabled the checkbox for a field with nothing to show, reasoning
that ticking it would not visibly change the card — but that made "I don't
know the brand yet, tick it anyway so I remember to fill it in" impossible,
which is the normal state of an unfinalized spec. Owner: *"kalau brandnya
masih belum tau gmn? better legacy sih sebenernya ya?"* — legacy never
conflated "show this field" with "this field has a value" in the first
place. A row backed by an option is disabled only when **no option exists
yet** to attach a value to ("Add an option below first"); this is a
different, legitimate reason from the field being blank, which is not a
reason to disable at all. Extra spec lines keep a plain checkbox with no
reveal, since one cannot exist with a blank label or value (§11.9).

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
