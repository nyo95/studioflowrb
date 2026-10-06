# StudioFlow Contract — Legacy Behavior on the Centralized Foundation

Status: **ACTIVE — the single StudioFlow authority.** Owner-ratified 2026-09-15
(R8.70); rewritten to the implemented state on 2026-10-06 (R8.349). Every
statement below describes the code as it is; history lives in `CHANGELOG.md`
and the pre-rewrite text is kept at
`docs/archive/studioflow-rb/STUDIOFLOW-REWORK-CONTRACT-2026-10-06.md`.
Owner: repository owner.

Legacy evidence: `D:\Misc\ProjectsHUB\studioflow`, branch `main`, commit
`c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27` (see `D-SF-RECOVERY-DISCOVERY.md`).
Only committed files are evidence. The legacy working tree and the legacy
database remain forbidden.

## 0. Why this contract exists

On 2026-09-15 the owner ruled that the first rebuild StudioFlow deviated from
how the studio works, archived it (git tag only, code deleted) and asked for
legacy business logic rebuilt on the Foundation (Core, Utilities, UI Engine)
with a better UI. Since then the owner has simplified the workflow further:

| ID | Decision (current) |
|---|---|
| RW-01 | A phase is a chain of **client-sent rounds** (iterations): `NOT_SENT → SENT → ANSWERED → REVISED / DONE`. No internal review and no `vMAJOR.MINOR` (WO-SF-ITER-01, R8.285–R8.295; legacy commands removed R8.321). |
| RW-02 | A project has a **PIC Designer** and a **PIC Drafter**. Authorization = platform RBAC grant AND assignment (§3). The Construction Drawing phase is the drafter's seat. No role enum. |
| RW-03 | What the client said is the round's **client notes**; per-point feedback is retired (R8.327). |
| RW-04 | No personal to-dos, My Tasks or Quick add; the checklist holds **requirements** only (WO-SF-NOTES-ONLY-01, R8.342). |
| RW-05 | A project completes **only** by an explicit "Mark as completed" (KB-060). |
| RW-06 | Project names are free text; there is no project code (R8.213). |

## 1. Authority and how legacy is used

This contract amends the legacy-isolation rule in `AGENTS.md` for StudioFlow
only:

- Legacy **behavior** at the pinned commit is the functional specification
  where this contract is silent.
- An Executor **may read** pinned legacy files and port algorithms, validation
  rules, ordering rules, copy, and interaction flows.
- An Executor **may not** import legacy modules, copy the legacy schema or
  migration history, reuse the legacy UI kit (`src/ui_engine`, `ui-*` classes,
  shadcn wrappers), reuse legacy auth/RBAC/audit/db runtimes, restore the
  legacy `Role` enum, or touch any legacy database.
- Every ported behavior lands on rebuild services, Prisma models, platform
  audit, and UI Engine components.

Older StudioFlow documents are history only, under `docs/archive/studioflow-rb/`
(including the Phase Engine V2 contract, its baseline audit and the
Presentation plan, archived 2026-10-06).

## 2. Legacy → rebuild disposition matrix

| Legacy capability (pinned paths) | Disposition | Rebuild destination |
|---|---|---|
| Project list, create dialog, edit, priority, complete (`projects/page.tsx`, `project-list-client.tsx`, `create-project-dialog.tsx`, `project-service.ts`) | KEEP | `/studioflow/projects`; §4 |
| Auto project naming `[Year]-[Number] [Name]` (`core/domain-shared/project-naming.ts`) | PURGE (R8.213) | free-text names; §4.2 |
| Hard project delete (`executeDeleteProject`) | FIX | archive/restore with reason + audit, file retention window (§4.4) |
| Client by name, address, logo (`Client`, `client-management-table.tsx`) | KEEP | `/studioflow/clients`; logo via platform `ObjectStorage` |
| PIC designer/drafter + role eligibility (`assertPicAssignable`) | FIX | plain user references; eligibility = holds the PIC position grant (§3) |
| Five phases, sequential activation, `allow_parallel` (`phase-policy.ts`) | KEEP | phase templates and definitions (§5.1) |
| Phase state machine with internal review and `vMAJOR.MINOR` revisions (`phase-service.ts`) | PURGE | client-sent rounds (§5.2) |
| Admin revision override hard reset (`executeOverrideRevision`) | KEEP | `studioflow.phase.override`; history snapshot into audit (§5.3) |
| Activity TODO/FEEDBACK per revision (`Activity`) | PURGE | client notes per round (§6.1); `sf_activity` kept as closed history |
| Approval blocker `assertNoPendingTasks` | PURGE | requirements never block (§6.2) |
| Checklist tree (depth 1), cascade toggle (`ProjectChecklist`) | KEEP | requirements (§6.2) |
| Checklist templates global/per-phase + sync (`ChecklistTemplate`) | KEEP | §6.3 and StudioFlow settings |
| Today feed, quick add, inline add (`today-view.tsx`, `task-feed.ts`) | PURGE | Home is project cards (§7) |
| Task comments on checklist (`Comment.task_id`) | DEFER | with collaboration |
| Upcoming date buckets (`upcoming-view.tsx`) | DEFER | D-SF-01 stands |
| Project activity log (`activity-log-table.tsx`) | MERGE | project History page reads platform audit |
| Undo button (`undo-executor.ts`) | FIX | one undo per phase event, same person, five minutes (§5.2) |
| Project identity strip (`project-identity-strip.tsx`) | KEEP | shared project header (§8) |
| Project nav rail with phase status (`nav-inner.tsx`) | PURGE (R8.347) | phase strip + project header nav (§8) |
| CD list (`cd-list-table.tsx`, `CDList`) | KEEP | Drawing list on the drafter phase (§5.5) |
| Deliverables and uploads (`deliverables-table.tsx`, `upload/*`) | FIX | streamed private files with a version lifecycle (§5.4) |
| Render boards (`RenderBoard`, `RenderAnnotation`) | KEEP | Presentation boards (§8a) |
| MOM documents/items/images/print (`extensions/mom/*`) | KEEP | §10 |
| Product schedule (`extensions/schedule/*`, `CatalogBoard.tsx`) | KEEP | §11 |
| Product requests + vendor follow-up (`ProjectProductRequest`) | FIX | physical sample requests read by Master Data (§11.12) |
| Reuse pool "from a past project" (`searchReusableSpecs`) | KEEP | §11.4 |
| SketchUp sync | DEFER | D-SF-06 stands |
| Project chat / live providers | DEFER | D-SF-05 stands (platform messaging is separate) |
| Studio settings: app title, UI settings, logo | ALREADY_REPLACED | Platform General Settings/Appearance |
| Database backup/restore screen | PURGE | D-SF-02 stands |
| Fixed `Role` enum, `core/rbac/*`, membership guards, audit compat readers | PURGE | platform RBAC and audit |

## 3. Permissions

StudioFlow owns this vocabulary in `src/apps/studioflow/permissions.ts`; Core
owns grant mechanics.

| Permission | Grants |
|---|---|
| `studioflow.access` | Open the app |
| `studioflow.project.read` | Read projects, clients, phases, rounds, requirements, files, MOM, schedule, presentation, library, timeline |
| `studioflow.project.manage` | Create/edit clients and projects, PICs, priority, status, archive/restore, mark completed; see every running project on Home; edit planned phase dates |
| `studioflow.project.override` | Pass every assignment gate (replaces legacy "admin always allowed") |
| `studioflow.project.pic-designer` / `.pic-drafter` | Positions: who may be picked for each PIC seat |
| `studioflow.phase.work` | Round commands (add, send, client answered, outcome, visits, rename, delete unsent, notes), pinned note, dismiss requirement, undo of those commands, CD list, files |
| `studioflow.phase.review` | Skip a phase that is pending or active (bypass, reason required) and undo that skip |
| `studioflow.phase.override` | Admin reset of a phase's rounds (audited snapshot) |
| `studioflow.task.manage` | Rename requirements, add subtasks |
| `studioflow.settings.manage` | Archive retention, checklist templates, phase templates, schedule templates and prefixes |
| `studioflow.mom.manage` | Create/edit/delete MOM documents and content |
| `studioflow.schedule.manage` | Schedule entries, options, photos, card fields, sample requests |
| `studioflow.presentation.manage` | Presentation boards, slides and pins |

Rules:

- One grant decision plus one assignment decision per mutating operation
  (owner, 2026-09-30), in one shared helper (`requireProjectAccess`): project
  data = PIC designer; phase transitions = PIC designer on every phase, PIC
  drafter only on a drafter-seat phase; phase content = drafter-seat phase:
  drafter or designer, other phases: designer; project documents (MOM,
  Schedule, Presentation) = designer or drafter. `studioflow.project.override`
  passes every gate. Reading needs only `studioflow.project.read`.
- Suggested role configuration (owner configures in Platform Access):
  Designer = access, read, pic-designer, phase.work, phase.review, task.manage,
  mom.manage, schedule.manage, presentation.manage; Drafter = access, read,
  pic-drafter, phase.work, task.manage; Admin = all.

## 4. Client and Project

### 4.1 Fields

Client: `name` (unique, case-insensitive via `name_key`), `address?`,
`logo_storage_key?`, timestamps, `archived_at?`.

Project:

| Field | Rule |
|---|---|
| `name` | unique (duplicate gives `PROJECT_NAME_TAKEN`); free text |
| `client_id?` | StudioFlow client; create-in-context allowed |
| `pic_designer_id`, `pic_drafter_id` | required plain references to platform `User` (no cross-schema FK) |
| `opening_date?`, `timeline_start_date?` | date-only; timeline start falls back to the created date (§8) |
| `status` | `ACTIVE`, `ON_HOLD`, `COMPLETED` |
| `priority` | `URGENT`, `NORMAL`, `LOW` |
| `client_contact?`, `address?`, `area?` (decimal m²) | as legacy |
| `archived_at?`, `archived_by_id?`, `archive_reason?`, `assets_purged_at?` | reversible archive and its file purge |

### 4.2 Naming

Project names are free text on create and edit (owner, R8.213, KB-062). There
is no naming convention, auto-numbering, settings toggle or project code. A
studio habit such as `2026-536 Sociolla …` is part of the name, and screens
show the name as stored without parsing it.

### 4.3 Bootstrap (one transaction)

Create/upsert client → create project → create one phase per definition of the
active default phase template (§5.1), snapshotting name, prefix, seat and
`allow_parallel`; the first phase is `ACTIVE` with round 1 (`NOT_SENT`, named
after the definition's first iteration kind or `<phase> 1`) and the rest are
`PENDING` → seed requirements from active checklist templates (§6.3) → seed
schedule rows from template items (§11.5) → audit `studioflow.project.created`.
Without an active default template the create fails with
`PROJECT_PHASE_TEMPLATE_MISSING`.

### 4.4 Lifecycle

- `ON_HOLD` blocks phase commands ("The project must be active").
- **Completion (owner, 2026-10-04/05).** Completion is a person's explicit
  choice; no phase change completes a project. Every phase must be done; a
  project manager may complete a blocked project only with a written reason,
  kept in the audit history. Requirements are only listed in the confirmation.
  **A completed project is read-only everywhere** until a PIC or override
  holder reopens it; archive/restore stay available. Enforced in the services
  (`assertProjectWritable`, `requireProjectAccess`); the access model reports
  `completed` so screens hide edit controls from one source.
- **Archive** requires a reason and makes the project read-only. Its files are
  kept for the archive retention window (default 90 days, 7–730, StudioFlow
  settings); restoring inside the window keeps everything, after it a sweep
  removes the project's own files and stamps `assets_purged_at`. The client
  logo is never part of a project purge.

## 5. Phases and rounds

### 5.1 Phase templates and definitions

Phases come from an office **phase template** (`SfPhaseTemplate`, one active
default) whose ordered **definitions** (`SfPhaseDefinition`) carry name,
prefix (≤ 4), order, `allow_parallel`, seat (`designer` | `drafter`) and
optional ordered iteration kinds (e.g. `CD Mall`, `CD Final`). Managed in
StudioFlow settings (`settings.manage`); a definition used by a project cannot
be deleted. A project's phases snapshot these values at creation, so later
template edits never rewrite existing projects. The studio default is
Moodboard → Layout Plan → Design 3D → Construction Drawing (drafter seat,
CD Mall then CD Final) → Supervision.

A phase may start when it allows parallel work, is first, or the previous
phase is done (`canActivatePhase`); otherwise the screen says
"Starts after <previous phase>".

### 5.2 Rounds (iterations)

Phase status: `PENDING → ACTIVE → DONE`. The work is a chain of rounds
(`SfRevision`: `major`, `name`, `status`, `sent_at`, `answered_at`, `done_at`,
`visit_date?`, `note?`):

- `NOT_SENT` → **Send to client** → `SENT` (days waiting shown) → **Client
  answered** (write the client notes) → `ANSWERED` → **Revision** (`REVISED`;
  the next round opens with these notes as its brief) or **OK, done** (`DONE`;
  phase done). "Save, decide later" keeps the answer and leaves the choice.
- **CD Mall** (the first of two iteration kinds) answers with Revision or
  **Continue to CD Final**; only CD Final's OK closes the phase.
- **Supervision** runs on dated site visits: New visit, then **Next visit** or
  **Done (handover)**.
- A done phase can take **+ New round** (reopen by adding a round); history is
  kept and other phases keep running. An active phase with no open round (its
  only unsent round was deleted) can take one too (R8.356); a phase that
  already has an open round cannot.
- Screens take their buttons from `iterationChoices`
  (`domain/iteration-kinds.ts`), the same rule the commands enforce.
- Commands: `addIteration`, `sendIteration`, `recordClientAnswer`,
  `chooseOutcome`, `createVisit`, `chooseVisit`, `renameIteration`,
  `deleteIteration` (never-sent only), `setIterationNote`, `setPhaseNote`,
  `dismissRequirement`, `bypass` (§5.3), `override` (§5.3). Each writes an
  `SfPhaseEvent`; the person who made the latest change may **undo** it for
  five minutes (`UNDO_WINDOW_MS`).
- Round names default to `<phase> <n>`; screens show those as `Round <n>`
  (`domain/phase-display.ts`). Other names (CD Mall, renamed rounds, visits)
  show as stored. **Round** is the only user-facing word; `iteration` remains
  only in code and persistence identifiers.

### 5.3 Skip and admin reset

- **Skip** (`bypass`, `phase.review`): a pending or active phase is marked done
  and locked; a reason is required and audited. A sent or otherwise populated
  open round is closed and kept in history, labelled "Closed by skip" (never
  "Approved", which would claim a client approval). A never-sent round is removed only
  when it has no client notes or files; skipping a pending phase
  still records its closed round 1. The next eligible phase opens by the normal
  auto-advance rule. Home and the phase strip say **Skipped**, and the phase
  page shows the reason. The same actor may undo the skip for five minutes;
  undo restores the exact phase/round state and removes the auto-opened phase.
- **Admin reset** (`override`, `phase.override`): rewrite a phase's rounds to
  "restart at round N" or "back to not started"; a note is required and the
  full history snapshot goes into the audit event.

### 5.4 Files (deliverables)

Per phase, uploaded through an authenticated streaming route (default limit
500 MB, `STUDIOFLOW_DELIVERABLE_MAX_BYTES`; PDF, PNG, JPEG, WebP, ZIP), stored
privately and read through signed URLs. A file is tagged to the round that was
current at upload. Files with the same name form a slot: one **Final** version
is kept, plus the two newest working versions; working files expire after
30 days (the uploader is warned in the last seven, and may extend). A daily
sweep removes expired rows before object cleanup. Status per phase: no files
/ current / outdated.

### 5.5 Drawing list (CD list)

On a drafter-seat phase only: drawings with code, name, status and optional
assignee, grouped by hundreds series; it never blocks a step. Content gate as
§3.

## 6. Notes and requirements

### 6.1 Three kinds of text per phase

- **Client notes** (per round, `SfRevision.note`): what the client said.
  Written at "Client answered", editable on any answered round while the
  project is open, undoable, kept in the admin reset snapshot. Never copied,
  ticked or assigned: a Revision answers them.
- **Pinned note** (`SfPhase.note`, one per phase): what holds for the whole
  phase, whatever the round.
- **Requirements** (§6.2): the standard checklist.

`sf_activity` (legacy feedback rows) is closed history: no command writes it.

### 6.2 Requirements

`SfChecklistItem`: `project_id`, `phase_id?` (null = project-wide), `label`,
`is_checked`, `checked_at`, `parent_id?` (depth max 1: a subtask breaks a
requirement down), `sort_order`, `is_blocking` (kept; nothing is gated),
`template_id?`, `dismissed_at?`. Root rows come only from templates (§6.3).
Ticking cascades to children; children never roll up. A requirement is a
reminder: it never blocks a step or completion, and it stays visible after its
phase is done until ticked or dismissed.

Screen: the aside of the open phase on `/studioflow/projects/[projectId]`
shows that phase's requirements, with the project-wide ones under a collapsed
**Project-wide** disclosure. Anyone who works on the project may tick or
dismiss; renaming and subtasks need `studioflow.task.manage`. Read-only when
the project is completed or archived.

### 6.3 Checklist templates

Global (`definition_id = null`) or per phase definition; `label`,
`is_active`, `sort_order`. Sync is idempotent per `(template, phase)` and
appends after existing rows ("Apply checklist templates" on the project row
menu). Deleting a template detaches generated rows.

## 7. Home

`/studioflow` is Home: one card per project.

Home also shows the current-scope running-project figures: work waiting for the
viewer, rounds with the client, phases done, and requested physical samples.
The waiting count includes only an active phase whose answered round that viewer
may act on; the same read supplies the Home rail badge.

- **Mine** = running projects where I am PIC designer or drafter.
  **Everyone's** is available to holders of `studioflow.project.manage`.
  A Running / Completed switch sits beside it.
- A card shows the project name and client, badges (On hold, Completed, Check
  later phases), the pinned-notes marker, the actions menu (Open, Mark as
  completed…, Reopen), and the phase strip (`PipelineStrip variant="track"`)
  with each phase's round, state and its next action. Only a decision after
  the client answered is a primary button there. Each phase also has a ⋯ menu:
  **Open phase**; **Client notes…** for an editable open round (hidden while it
  is with the client); **+ New round** for a finished phase or an active one with no open round; and **Skip phase…**
  for an eligible pending/active phase when the viewer can act and holds
  `phase.review`.

## 7a. Library

`/studioflow/library`: a **read-only** discovery page over Master Data's Brand
catalog through its public read port `listBrandLibraryReads` (name, notes,
owner vendor, categories, hashtags, links; website preview images are fetched
and cached). Never writes to Master Data. Read gate as every StudioFlow read.
Search filters client-side by name, category, vendor or hashtag.
Brand cards choose official logo metadata or logo assets first; social preview images are fallback only.

## 8. Project workspace and timeline

| Route | Content |
|---|---|
| `/studioflow/projects` | project directory (filters: status, priority, PIC, client; search); administrative edits through the row menu (Edit details, Archive/Restore, Apply checklist templates) |
| `/studioflow/timeline` | portfolio Gantt (below) |
| `/studioflow/projects/[projectId]` | phase strip + the open phase (`?phase=`) |
| `/studioflow/projects/[projectId]/phases/[phaseId]` | redirect to `?phase=` |
| `/studioflow/projects/[projectId]/mom`, `/mom/[momId]` (+ print) | MOM (§10) |
| `/studioflow/projects/[projectId]/schedule` (+ print) | Product Schedule (§11) |
| `/studioflow/projects/[projectId]/presentation`, `/presentation/[boardId]` (+ print) | Presentation (§8a) |
| `/studioflow/projects/[projectId]/history` | audit timeline for the project |
| `/studioflow/clients`, `/studioflow/clients/[clientId]` | clients |
| `/studioflow/library` | §7a |
| `/studioflow/settings` | archive retention, checklist templates, phase templates |
| `/studioflow/schedule-templates` | schedule prefixes and template items |

**Project header (R8.347).** There is no project side rail. Every project
sub-page shares one header: the project name as stored, client and assigned
designer/drafter (read-only `MetaList`), a `StudioFlow / Projects / <name>`
context capsule above the title, and below the header a pill tab bar — Phases,
MOM, Schedule, Presentation, History — with counts, the current one marked
(R8.360–R8.361). The layout renders the frame at once; the header and the
counts stream in their own `Suspense` boundaries with real links in the
fallback.

**Open phase (R8.347).** Under the phase strip, two columns: the main column
holds the current round card (round name, state, next step, its buttons and a
More menu; the brief from the previous round when it had notes; the client
notes once answered), Earlier rounds (each with dates, outcome and its client
notes), and the Drawing list on a drafter phase; the aside holds the pinned
note, requirements and files.

**Timeline.** A project's bar spans `timeline_start_date` (falls back to the
created date) to `opening_date` (falls back to today + 30 days). Each phase is
a segment coloured by its accent, dimmed while `PENDING`; a phase with
`planned_start_date` and `planned_end_date` draws at its real position,
otherwise it takes an equal-width slot (`domain/timeline.ts`).
`/studioflow/timeline` shows one bar per non-archived project, filterable by
client, designer/drafter, status and date range; clicking a segment
(`project.manage`) sets or clears its planned dates. Planned dates are entered,
not derived from status history.

## 8a. Presentation

Project-owned boards (`SfPresentationBoard`) of rendered-image slides
(`SfPresentationSlide`, private images) with non-destructive pins
(`SfPresentationAnnotation`: position, label side, note, optional link to a
Product Schedule entry). Export is PDF through the print view, one slide per
page; images are uploaded from the device (owner, 2026-09-28). Gate:
`studioflow.presentation.manage` plus the project-document assignment rule;
images are cleaned up only when no slide references them and are part of the
archive purge.

## 9. Overrides of earlier ratified decisions

- D-SF-03 (MOM lifecycle DRAFT/ISSUED/SUPERSEDED) → replaced by §10.
- D-SF-04 (project-owned catalogue) → kept: schedule options are project-owned
  (§11).
- "No project-scoped authorization" → replaced by the assignment gate (§3,
  owner 2026-09-30).
- "Requirements are first-class" (R8.62) → reversed: requirements come from
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
phase rounds (`SfRevision`, §5.2) — a different, project-phase-scoped concept.

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

The working screen has Material/Fixture and Board/List controls, a compact
Set up menu, Print/PDF, and the primary Add item action. Per section it shows
final progress plus All, Needs a decision, Sample waiting and No product yet
filters. Categories use `GroupHeader`; in All, each category ends with a
quick-add field that can create a typed product or reserve the next code.
Board cards expose photo and body as sibling buttons, carry at most two status
badges, and keep sample actions inside the editor.

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

**One prefix per category (2026-10-04).** Because numbering, reorder and
move are per prefix, two categories must never share one inside a project
section. A category already in the project keeps its spelling and historical
prefix; a new one takes the dictionary/fallback prefix unless another category
of the project numbers under it, in which case it takes the next free letter
pair from its name (`Wall panel` beside `Wallpaper` → `WL`, not `WA-02`), then
a numbered variant. The prefix dictionary refuses a prefix already used by
another category of the same section (`SCHEDULE_PREFIX_IN_USE`). Projects
created before this rule may still hold two categories under one prefix:
reorder and up/down then move rows only within their own category, and the
other category keeps its code slots.

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

Prefix dictionary `(section, category) → prefix`; template items with a
snapshot, seeded onto new projects and via an explicit "Apply template"
action. Managed in StudioFlow settings as two tables (prefix dictionary,
template items); template items can be added and edited there
(section/category fixed after creation; rows already copied into projects keep
their own snapshot). A schedule row whose final option (or only option) is set
can be saved as a template item from the project schedule ("Save as template
item", legacy `createScheduleTemplateItemFromEntryAction`); the item keeps the
option photo and the row's qty/unit/location. Both need `settings.manage`; the
schedule page links to these settings for that permission.

**"Default categories" folded into Template Items (owner, 2026-09-24).**
`SfScheduleTemplateCategory.is_default_entry` was a separate, third settings
table: a category flagged this way seeded an always-empty reserve row on new
projects, independent of whether it had any template items. Owner: *"default
categories mah tergantung template items aja ga sih? di joint... template itu
konsepnya reserved dengan jenis2 yg biasa kita pakai."* A category needing no
settled default product but that should still always be reserved is now
expressed the same way a live schedule entry already supports "Reserve code
only" (§11.1): a Template Item with **Type left blank**. `seedScheduleFromTemplates`
seeds one entry per active template item either way — with a snapshot when
Type is filled in, with none (zero options, reserved) when it is blank — so
the same seeding pass that always ran now covers both cases; the second,
separate seeding pass driven by `is_default_entry` is gone, and so is the
column, the dedicated "Default categories" table, and its two commands
(`upsertTemplateCategory`, `deleteTemplateCategory`). A live option's Type
stays required (`cleanSnapshot`'s default); only a Template Item's may be
blank (`cleanSnapshot(..., { requireProductName: false })`) — a template
represents "what to seed", which may legitimately be "nothing yet", where a
live option always names a real product.

### 11.6 Implementation notes (R8.73–R8.74)

- Option labels continue after the highest existing label (A…Z, AA…); a
  deleted label is not reused. Approving sets siblings NOT_USED and keeps
  `active_index` on the final option; `version_locked` is not set (legacy did
  not use it). An entry may have no options ("reserved code").
- New projects receive every active template item once (same routine as
  "Apply templates"); a template item with Type left blank seeds a reserved row.
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

**One dialog, not a photo dialog stacked on the item dialog (owner,
2026-09-24: "modalnya jd 1 aja").** The photo workspace above renders
*inline*, swapped in for the option's row inside the already-open entry
panel (`EntryDialog`/`EntryPanelContent`), the same in-place swap the panel
already uses for editing an option's product details. There is no longer a
separate `Dialog` for photo capture. Clicking a board card's photo area
opens the one entry dialog with that option's row pre-swapped to the photo
editor (an `initialPhotoOptionId` the panel consumes once, via the same
render-time ref-comparison pattern as its `shownIdRef` resync, not an
effect); clicking the card body/title opens the same dialog at its normal
view. Because the image workspace already auto-opens the OS file picker on
mount (previous paragraph), collapsing the wrapper dialog away is what
makes "click the photo → file picker appears" actually feel automatic —
before, the picker still had to wait for a whole second modal to mount
first.

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

### 11.10 The entry editor (R8.351, owner review 2026-10-06)

The board and list open one right-side UI Engine `Drawer` (`size="lg"`). It
keeps the schedule visible and handles an existing item, a new item, a new
option, the photo workspace, a sample request and reuse from a past project.
Photo, sample and reuse flows swap inline inside the drawer; only small
confirmations and Move to category may layer a dialog over it. On narrow
screens the same drawer fills the width.

The header shows code, category, section and state, with previous/next item
navigation and the item menu. The options row selects A/B/C, identifies Final
and Not used, creates the next unsaved option, or opens past-project search.
The selected option form keeps Type, Brand, Color, Pattern, Finishing, Size,
Location, Fixture Qty/Unit, extra specification lines and Notes editable at
all times. An eye control changes only whether that field captions the card;
it never clears or disables the value. Type and photo always show, and "Use
default" restores `card_fields = null`.

Every edit is a local draft. Nothing in the item/spec/card-field draft writes
until **Save**; **Discard** restores the saved values. Closing the drawer,
moving to the previous/next item, or switching section with unsaved work asks
"Discard changes? / Keep editing". An item with no options creates its first
option on Save when product details were entered. A completely blank product
keeps the item as a reserved code; product fields without Type are rejected.

Brand remains one `CreatableSearch`: choosing Master Data stores its id,
typing an unmatched brand stores free text, and Schedule never writes Master
Data. Notes remains `SimpleTextEditor` and stores marked-up plain text rather
than HTML. Qty/Unit stays Fixture-only. The field order is Type, Brand, Color,
Pattern, Finishing, Size, Location, Fixture Qty/Unit, extra lines, Notes.

### 11.11 Print / export (R8.132, owner-scoped 2026-09-24)

Legacy's `CatalogBoard` was itself the printable client-and-contractor
deliverable. The rebuild's board gains the same capability as a **second
consumer** of the shared print view (UI_ENGINE §13, §10's MOM print route was
the first), not app-owned code: `/studioflow/print/projects/:id/schedule`
renders every entry as a catalogue card (photo, code, Type, and whichever
card fields — §11.8 — the on-screen board shows for that entry, read through
the same `effectiveCardFields`/`cardFieldValuesOf` functions the board itself
calls, now shared from `domain/schedule.ts` so the two can never disagree),
grouped by category within each section. A "Print / PDF" link on the board
toolbar opens it, matching the MOM editor's own link exactly.

**Paper size and orientation are user-selectable** (A4/Letter,
portrait/landscape) via `?paper=&orientation=`, the one concrete gap the
owner named in legacy's export (fixed to one layout). This is a new UI
Engine capability — `DocumentSheet`'s `printFormat` prop plus the
`PrintFormatPicker` pattern — available to any future print consumer, not
schedule-specific. **No true per-page running header or page counter**:
Chrome/Firefox do not support CSS Paged Media running elements or `@page`
margin-box content, so — same as MOM's print page — the header (project,
client, print date) appears once at the top of the document; adding a real
"page N of M" would need a server-side PDF render pipeline, which the owner
declined to add for this.

### 11.12 Physical sample requests (owner, 2026-09-23)

A schedule option can carry a physical sample request: `requestedFrom` (vendor/supplier, free
text — no live reference into Master Data, same reasoning as `brand_name`
in §11.10) and an optional note. Status is `REQUESTED` → `RECEIVED`; an
option can have only one open (`REQUESTED`) request at a time, but a new one
may be started once the previous is `RECEIVED` (`SfScheduleSampleRequest`,
`option_id` FK, cascades with the option). Receiving a sample **never writes
to Master Data** — Master Data's public contract is read-only by design
(masterdata `pricing-contract.md` §12), so adding the resulting SKU/price is
a separate, manual step a Master Data user does themselves; StudioFlow only
records that a sample arrived (`receivedNote`, `receivedByName`). The
designer sees a `Badge` on the option card ("Sample requested" / "Sample
received") plus a "Requested from …" line. Master Data reads open requests
through StudioFlow's public read (`public/sample-request-read.ts`) into its
Sample requests queue, and the staff who work that queue get a platform
notification when a request arrives (`sample-request-notifier.ts`; the
requester is never notified of their own request). Actions: `Request sample` /
`Mark sample received` in the option's row-action menu
(`requestScheduleSampleAction`/`receiveScheduleSampleAction`).

## 12. Foundation centralization map

| Need | Classification | Canonical home |
|---|---|---|
| Session/principal, grants, audit envelope, errors/action wrapper, Zod validation, transactions | REUSE | `platform/core/*` |
| Date-only dates, instant formatting, "N days" age | REUSE / EXTEND | `platform/utilities/date` (`currentDateOnly`, `diffDateOnlyDays`) and `FormattedInstant` |
| Decimal area/qty | REUSE | `platform/utilities/decimal`, `measurement`, `unit` |
| Text normalization for names/search keys | REUSE | `platform/utilities/normalization` |
| Stepped sort order + sibling reorder | APP-OWNED until a second app needs it | `apps/studioflow/domain/checklist.ts` `steppedSortOrders` |
| Private files and images (logo, MOM, schedule, presentation, deliverables) | REUSE | `platform/core/storage` + `ImageWorkspace` |
| Confirm, unsaved-changes guard, dialogs, tables, toolbars, inline edit, creatable search, rich text, print view | REUSE | UI Engine |
| Phase strip | REUSE | UI Engine `PipelineStrip variant="track"`; round names and state wording are app-owned (`domain/phase-display.ts`) |
| PIC people lookup | REUSE | `platform/core/rbac/people` |
| Undo bar on phase commands | APP-OWNED until a second app needs it | `_components/phase-commands.tsx` |
| Drag-to-reorder | DEFERRED | Move up/down actions until a `SortableList` pattern is needed |
| Round rules, phase activation, timeline geometry, schedule codes, retention | APP-OWNED | `src/apps/studioflow/domain/*` |

`src/apps/studioflow` is modular — `projects`, `phases`, `tasks`
(requirements), `cd-list`, `mom`, `schedule`, `presentation`, `library` —
plus pure `domain/` rules and a thin `public/` boundary.

## 13. UI/UX direction (owner may veto)

1. **Projects first.** Home answers "where does each of my projects stand"
   with one card per project; whatever waits on me is the only primary button.
2. **One fact, one place** (R8.345). A phase list, round name, status or note
   is shown once per screen.
3. **Plain studio words.** Round 2, in progress, with client 6d, client
   answered, Revision, OK, done. Raw states never appear on screen.
4. **Designer / drafter lens.** The CD phase belongs to the drafter; Mine
   uses both PIC fields.
5. **Explained locks.** A step that cannot happen yet says why ("Starts after
   Layout Plan").
6. **Schedule as a board** with option photos; codes such as `PT-01` stay
   visible.
7. **Visual identity.** `DESIGN.md` is authoritative; per-phase accent colours
   are used only on the timeline and the project directory.

## 14. Not built

Upcoming as a separate queue, task comments, SketchUp sync, product
requests beyond physical samples, Google Drive, legacy data migration, a
duration report derived from status history, drag-to-reorder.
