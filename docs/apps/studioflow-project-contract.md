# Project Contract — StudioFlow

Status: **PRD revised under owner request, 2026-09-08 — not an executable work order**

R7.07 resolves L1–L9 and their dependent rules. Earlier owner decisions remain
unless explicitly revised here. These are navigator product decisions for the
requested PRD update, not a claim of separately approved implementation.
Evidence boundary: the recorded legacy audit was read; legacy code was not
re-inspected in this session. Acceptance scenarios in §16 protect intended
outcomes; code-level legacy parity remains a gate before implementation.

Authority: owner decisions locked 2026-09-07/08, reconciled with the shared
rules in [`studioflow.md`](studioflow.md) and the dispositions in
[`STUDIOFLOW-LEGACY-AUDIT-ROADMAP.md`](../STUDIOFLOW-LEGACY-AUDIT-ROADMAP.md).
Legacy code at the recorded audit commit is behavioral evidence only.

Client, Project, Phase, Iteration, tasks, and assets are one contracted
workflow. Client is a reusable counterparty across projects; transaction scope
follows each command, not one giant aggregate spanning all clients/projects. Legacy split them across `Project`,
`Phase`, `Revision`, `Activity`, `ProjectChecklist`, and `File`, with four
different completion vocabularies. That split is the source of the bookkeeping
this rebuild removes, so it is not preserved.

## 1. The governing principle

Workflow state is a **consequence of work**, not a field to maintain.

Legacy asked the owner to restate, by hand, facts the system had already
observed: that a design existed, that it was the third round, that it had gone
out to the client. Every such restatement is a second copy of the truth that
can drift from the first.

People record business events: start work, send, record the client's answer,
and confirm that the phase's scope is finished. Numbers and workflow summaries
follow those events. No normal phase-status dropdown is needed.

Client approval describes a round; phase completion describes the whole scope.
The app must not guess the second from the first. Corrections preserve history;
exceptional phase closure never substitutes for correcting a client answer.

## 2. Client

A StudioFlow Client is the paying counterparty of a project. It is owned by
StudioFlow and has no relationship to a Master Data Party (see
[`studioflow.md`](studioflow.md) §4). Clients never have accounts.

| Field | Type | Rule |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | String | Required |
| `contact_name` | String? | Optional |
| `contact_phone` | String? | Optional |
| `contact_email` | String? | Optional; validated when present |
| `address` | String? | Optional |
| `notes` | String? | Internal only |
| `created_at` / `updated_at` | DateTime | UTC instants |
| `deleted_at` | DateTime? | Archive state; a Client with live Projects cannot be archived |

`name` is the only required field. A Client may exist before any project. New or restored projects require a live
Client; if the Client was archived while all its projects were archived, restore
the Client explicitly before restoring a project. No silent cascading restore.

## 3. Project

| Field | Type | Rule |
|---|---|---|
| `id` | UUID | Primary key |
| `code` | String | Server-generated, unique, immutable after creation. Never typed by a user |
| `name` | String | Required |
| `client_id` | FK → Client | Required |
| `lead_user_id` | FK → User? | Nullable. Who is accountable for the engagement. Plain reference to the platform `User` table |
| `address` | String? | Site address; independent of the Client address |
| `area` | Decimal? | Square metres |
| `type` | Enum | `RESIDENTIAL` / `COMMERCIAL` / `HOSPITALITY` / `OTHER` |
| `status` | Enum | `ACTIVE` / `ON_HOLD` / `COMPLETED` |
| `priority` | Int | Ordering hint for the project list; not a workflow input |
| `opened_at` | DateTime | Project opening date |
| `created_at` / `updated_at` | DateTime | UTC instants |
| `deleted_at` | DateTime? | Archive state |

`status` is the commercial state of the engagement and is set by a human. It is
distinct from phase state, which is workflow and is derived. A project may be
`ON_HOLD` while a phase is `WAITING_CLIENT`; neither implies the other.

Creating a project requires `studioflow.project.manage` and, in the same
transaction, seeds its five phases (§4.1).

Permanent deletion is deferred (§12). Its future two-step request/approval
policy is StudioFlow-owned and will require `studioflow.project-deletion.approve`.

## 4. Phase

### 4.1 The five phases

`MOODBOARD`, `LAYOUT`, `DESIGN_3D`, `CD`, `SUPERVISION`.

Every project has exactly these five, seeded at creation, in this order. They
are not user-creatable, not renameable, and not deletable.

Legacy's sixth value `COMPLETED` is **PURGE**. It was a terminal marker stored
inside the phase enum, which made "which phase" and "is it finished" the same
field. Project completion is `Project.status = COMPLETED`.

### 4.2 States

| State | Meaning |
|---|---|
| `NOT_STARTED` | No round has been opened; Supervision has not been started |
| `IN_PROGRESS` | Work exists and is being worked on |
| `WAITING_CLIENT` | Sent to the client; no answer recorded yet |
| `DONE` | The studio explicitly closed the whole phase scope |

Four states. Legacy had seven.

**`ON_REVIEW_INTERNAL`, `APPROVED_INTERNAL`, and `READY_FOR_NEXT` are PURGE.**
Owner decision 2026-09-08: internal review is not tracked in the application.
It happens by conversation in the studio, and recording it produced status
updates that carried no information anyone read back. No equivalence between legacy `READY_FOR_NEXT` and internal approval is
asserted without code evidence. Its useful possible intent — an approved round
with more phase scope remaining — is retained through `APPROVED` plus an open
phase, without restoring a fifth phase state.

Where legacy used internal review state to express "the drafter is holding
this", this contract uses `Iteration.assignee_id` (§5.1). Assignment answers
that question directly and needs no lifecycle of its own.

### 4.3 One phase summary, with explicit closure

`Phase.state` is persisted and maintained by the service in the same transaction
as each workflow event. The four iteration-bearing phases use this precedence:

| Condition (first match wins) | Phase state |
|---|---|
| Explicit phase closure is in force | `DONE` |
| Any iteration is `SENT` | `WAITING_CLIENT` |
| At least one iteration exists | `IN_PROGRESS` |
| No iteration exists | `NOT_STARTED` |

Closure is an app-owned fact (`closed_at`, `closed_by`, `closure_reason`, and
`closure_kind = NORMAL | EXCEPTION`, cleared when open; reason required only for exception closure). It is
not a second arbitrary status. `DONE` requires closure; an open phase must obey
the table. Only one `DRAFT` and one `SENT` may coexist per phase. This permits
work ahead without hiding an unanswered client exchange.

**Finish phase** requires `iteration.review`, an approved latest non-`VOIDED` round, and no
`DRAFT` or `SENT`. It is available separately or as an explicit, initially
unchecked **Also finish this phase** choice when recording approval. Both facts
are saved atomically; approval alone leaves the phase `IN_PROGRESS`, displayed
as “Ronde disetujui · fase masih terbuka”. No extra lifecycle state is added.
Open work items warn with their count but do not block phase closure.

**Reopen phase** requires `iteration.review` and a reason. It clears closure,
recomputes the summary, and preserves every round and response. Starting a round
on a closed phase first requires this explicit action; upload never reopens it.
Neither closure nor reopening changes `Project.status` or another phase.

### 4.4 Supervision

`SUPERVISION` has no iterations and does not use §4.3's projection.
`iteration.review` authorizes the normal actions **Start supervision**
(`NOT_STARTED` → `IN_PROGRESS`), **Finish supervision** (`IN_PROGRESS` → `DONE`),
and **Reopen supervision** (`DONE` → `IN_PROGRESS`, reason required).
Completion records normal closure metadata; reopening clears it. These actions
are audited. Tasks inform the work but do not determine its state or block it.
`WAITING_CLIENT` is invalid for Supervision; no fictional review round is made.

### 4.5 Exceptional closure, not an arbitrary state setter

`phase.override` permits **Close phase by exception** with a nonblank reason,
including an unused phase whose scope is not applicable. It records exception
closure metadata and one audit event with before/after state, reason, and actor.
There must be no `DRAFT` or `SENT` round; unresolved work cannot be hidden behind
`DONE`. This also applies to unused Supervision. Reopening follows §4.3/§4.4.

This deliberately replaces “set any phase to any state”. It never fabricates,
removes, or changes a client response, and cannot force `WAITING_CLIENT` or
`NOT_STARTED`. Correct a response using §6.5. No arbitrary override overlay,
expiry policy, or separate override state machine is needed.

Phases are not sequentially locked. Ordering is presentation, not a gate;
CD and Supervision can proceed for different areas at the same time.

## 5. Iteration

An Iteration is one numbered round of work in a phase: the thing that is
produced, sent, and answered. It replaces legacy `Revision`.

Iterations exist in `MOODBOARD`, `LAYOUT`, `DESIGN_3D`, and `CD`. Owner
decision 2026-09-08: moodboards are revised by clients in practice and are
included. `SUPERVISION` has none (§4.4).

### 5.1 Fields

| Field | Type | Rule |
|---|---|---|
| `id` | UUID | Primary key |
| `phase_id` | FK → Phase | Required |
| `number` | Int | Server-assigned, sequential and gapless within the phase, starting at 1. **Never supplied by a client request** |
| `state` | Enum | `DRAFT` / `SENT` / `APPROVED` / `SUPERSEDED` / `VOIDED` |
| `assignee_id` | FK → User? | Who is holding this round. Plain reference to the platform `User` table; carries the designer/drafter handoff |
| `sent_at` | DateTime? | Set on `SENT`, cleared only by audited withdrawal back to draft; retained if round is voided |
| `responded_at` | DateTime? | Timestamp of the effective response; previous timestamps remain in response history |
| `voided_at` / `voided_by` / `void_reason` | Nullable | Required together for `VOIDED`; nonblank reason |
| `created_at` / `updated_at` | DateTime | UTC instants |

Unique on `(phase_id, number)`. `SUPERSEDED` means the effective client answer
requests revision. `VOIDED` means the studio stopped an unanswered round; it
never implies client rejection or approval.

### 5.2 Label is derived, never stored

| Phase | Label |
|---|---|
| `MOODBOARD` | `MB 1`, `MB 2`, … |
| `LAYOUT` | `Layout 1`, `Layout 2`, … |
| `DESIGN_3D` | `D1`, `D2`, … |
| `CD` | `CD 1`, `CD 2`, … |

A stored label would be a second copy of `(phase, number)` and could disagree
with it. This follows the legacy B1 decision that document structure is
**virtual metadata, not a typed path** — the one legacy conclusion this
contract adopts wholesale.

### 5.3 One round-opening rule, independent of the trigger

Whenever work needs a round, the server resolves the phase's existing `DRAFT`;
if one exists, reuse it. Otherwise create the next number, starting at 1.
Never delete a numbered round or reuse its number. Allocate under the same
phase-level concurrency guard for every caller.

The triggers are **Start round** (`iteration.manage`), the first deliverable
upload (`iteration.manage`, only once storage is activated), and a recorded
revision request (`iteration.review`). They call this same rule. Start round
works before files exist; an upload into a draft does not create another number.
For a revision request, newly entered points join that draft, even if it already
contains work. Nothing already there is replaced or copied again.

Work may start while one earlier round is `SENT`. Its pending answer remains
visible and keeps the phase `WAITING_CLIENT`; the new draft cannot be sent until
that answer is recorded or the earlier round is explicitly voided. No queue of simultaneous
client reviews is introduced. Closed phases require explicit reopening first.
Failed uploads do not leave a numbered empty round; opening and asset metadata
attachment occur only at successful upload finalization. Concurrent retries of
the same command must not create duplicate rounds, assets, or points.

## 6. The client review exchange

The audit roadmap requires this section explicitly: *"Rejection creates a new
revision and transforms feedback into TODOs … define whether feedback is a work
item, comment, or immutable review record; do not encode it as a side effect
without a contract."*

It is contracted here as a **record plus a documented consequence**, both in
one transaction.

### 6.1 Responses are immutable, with one effective answer

| Field | Type | Rule |
|---|---|---|
| `id` | UUID | Primary key |
| `iteration_id` | FK → Iteration | Multiple historical records allowed |
| `outcome` | Enum | `APPROVED` / `REVISION_REQUESTED` |
| `note` | String? | Client wording where possible |
| `points` | Immutable ordered values | Stable point id and original text for each discrete request |
| `replaces_response_id` | FK → Response? | Null for first answer; otherwise the immediately preceding effective answer of the same iteration |
| `correction_reason` | String? | Nonblank for a correction |
| `recorded_by` / `recorded_at` | User / DateTime | Actor and UTC instant |

There is exactly one root response and a linear replacement chain per reviewed
iteration. The terminal response is effective; older entries are visibly marked
corrected and remain readable. Guard concurrent replacement against the expected
effective response id: one wins, the other reloads. No edit, delete, or branching
chain. A correction replaces the complete answer, including its point list.

### 6.2 Transitions

Permissions below use the `studioflow.` prefix.

| From | Action | Permission | To | Consequence |
|---|---|---|---|---|
| `DRAFT` | Send to client | `iteration.review` | `SENT` | No other `SENT`; set `sent_at`; phase becomes `WAITING_CLIENT`; open active points warn (§7.4) |
| `SENT` | Record approval | `iteration.review` | `APPROVED` | Append response; set `responded_at`; recompute phase. Optional explicit phase closure obeys §4.3 |
| `SENT` | Record revision request | `iteration.review` | `SUPERSEDED` | Append response; resolve/create next draft via §5.3, add source-linked points; phase remains open |
| `SENT` | Withdraw send | `iteration.review` | `DRAFT` | Only if no later round exists; reason required, clear `sent_at`, preserve previous send in audit; there is no response to discard |
| `DRAFT` / `SENT` | Stop round | `iteration.review` | `VOIDED` | Reason required; preserve number, content and send history; exclude from current work and closure guards; recompute phase |
| `APPROVED` / `SUPERSEDED` | Correct answer | `iteration.review` | According to replacement outcome | Append replacement; apply §6.5, never unsend |

Stopping a round is explicit, never an automatic effect of answer correction.
It is available even when a successor exists. The stopped round stays readable
and frozen; its points are not copied. `VOIDED` is terminal; further work starts
through §5.3. A voided send is a correction of the studio's tracking record, not
a recall of externally sent files. No response can be recorded on it. If all
rounds are voided, the phase stays `IN_PROGRESS` (work did occur); close by
exception or start new work. If the latest non-voided round is approved, ordinary
closure is possible. Thus an unnecessary D4 can be stopped without deleting it
or forcing a fake send/approval merely to finish the phase.

Send records an external action already performed by the studio; it does not
email or deliver files. Storage is not a prerequisite. Confirmation requires a
nonblank delivery note describing what was sent and by which channel, retained
in the send audit. Even a round without uploaded assets can therefore be recorded
honestly. It does not turn all internal assets into externally delivered files.

The response, affected iteration state/timestamps, draft creation/point changes,
phase summary/closure, and one primary audit event are one atomic command. That
event names all affected records. The server enforces current state and expected
record version; retries cannot duplicate responses or their consequences.

### 6.3 History is preserved

Sent, answered, and voided round content is frozen. An audited withdrawal
back to draft explicitly permits further edits, retaining send audit history. Number, assets, original answers,
and original client wording remain readable. Correcting the effective answer
changes the reviewed round's summary state, not its historical contents.
Draft working text may change under §7.2; “preserved history” does not mean
unsent working text can never be edited. Assignment changes are permitted under
§10 and do not rewrite who sent or recorded earlier events.

### 6.4 Revision points become the next round's checklist

A revision request creates `CLIENT_REVISION` checklist points on the draft
resolved by §5.3, linked to the exact response and original point id. The pair
is unique so retries cannot duplicate it. The original wording remains readable
beside editable working wording. No assets or unrelated checklist items are
copied forward automatically.

### 6.5 Correcting a mistaken client answer

Choose **Correct answer**, enter a reason and the complete replacement answer.
The dialog previews the affected round, closure, and any successor work.

- Always retain the previous response and every later round, including empty
  ones. An unnecessary unanswered round can subsequently be stopped explicitly
  under §6.2; correction never stops it automatically. Numbers, files, assignment, and work are never rolled back or deleted.
- If the corrected round has no non-voided successor and the replacement requests revision,
  reopen its closed phase if necessary, then create the next draft and its points
  atomically. A mistaken approval cannot leave the phase falsely `DONE`.
- If a non-voided successor already exists, do not create a round or retarget existing
  points as a side effect of historical correction. Keep that successor even if
  the corrected answer is approval. The UI states that existing work is retained.
- On the immediate non-voided successor still in `DRAFT`, points from the replaced response are retained
  but shown as **source corrected**, excluded from open-point warnings. If the
  replacement requests revision, add its new points to that draft with new source
  links. Do not replace internal points or transfer completion ticks.
- If the immediate non-voided successor is already sent or answered, its checklist snapshot
  stays frozen. Show the corrected-source annotation by reading response history;
  do not change its send-time counts or subsequent answers. Show the replacement
  feedback in history for the reviewer to address through ordinary new work.
  The confirmation explicitly says it does not amend later delivered rounds.
- A correction of the latest non-voided round reopens any phase closure, even
  when the replacement is approval; finishing the scope again is explicit. A
  historical correction with later non-voided rounds does not undo a later phase closure.
  Show that closure and require acknowledgement that later work remains intact.

This is a small replacement chain, not an undo engine. It guarantees correction
of the record without pretending later human work can be reversed automatically.

## 7. Work items

There is one work-item vocabulary with two shapes. They are deliberately **not**
collapsed into one entity, and the design work they replace is deliberately not
represented as a task at all.

### 7.1 Design work is not a task

The main deliverable of a phase is never written as a to-do. When a client
requests a revision, the system resolves or opens the next draft, and **that
iteration is the queue item** — it appears in the work list as "3D · D4 · not
started". Writing "update the 3D design" as a task would be a second copy of
something the system already knows.

This is also why legacy's tasks felt hard to file under a phase: what the owner
was typing genuinely was general work. The phase-bound work already existed as
revisions and simply had no queue of its own.

### 7.2 IterationPoint — checklist inside a round

| Field | Type | Rule |
|---|---|---|
| `id` | UUID | Primary key |
| `iteration_id` | FK → Iteration | Required |
| `text` | String | Required |
| `done` | Boolean | Default false |
| `source` | Enum | `CLIENT_REVISION` / `INTERNAL`; immutable |
| `source_response_id` / `source_point_id` | Reference? | Both required for client points, both null for internal points; immutable |
| `withdrawn_at` / `withdrawn_by` / `withdrawal_reason` | Nullable | Explicit point withdrawal, reason required; original text and provenance retained |
| `sort_order` | Int | Manual ordering |

Its phase is inherited from its iteration and is **never chosen by a user**.

In `DRAFT`, internal points may be edited or deleted. Client points can be
reworded for execution, checked, reordered, or explicitly **withdrawn with a
reason**; they cannot be deleted or converted to internal points. Withdrawing
means no longer pursued, not completed. The original wording and source link
remain visible. Rewording, withdrawal, and restoration of client points are
audited; toggles and reordering are not. Restoring a withdrawn point requires
`iteration.manage` on a draft; a corrected-source point cannot be reactivated
against its obsolete response. Only active, non-withdrawn points whose source
has not been replaced contribute to current open-point warnings. Frozen rounds
retain their send-time snapshot.

### 7.3 Task — everything else

| Field | Type | Rule |
|---|---|---|
| `id` | UUID | Primary key |
| `project_id` | FK → Project | Required |
| `phase_scope` | Enum? | **Nullable, and the creation form never asks.** Null means General |
| `title` | String | Required |
| `status` | Enum | `OPEN` / `DONE` |
| `assignee_id` | FK → User? | Optional |
| `due_date` | DateTime? | Optional |
| `sort_order` | Int | Manual ordering |

`phase_scope` is set only two ways: inherited when the task is created from
within a phase view, or assigned later by dragging the task onto a phase. **A
user is never asked to choose a phase at creation time.** Tasks typed into the
General box stay General, which is the correct outcome, not a missing value.

General tasks are pinned at the top of the project surface and remain visible
when a phase filter is applied.

### 7.4 The single blocker projection

The audit roadmap requires one documented blocker rule. It is this:

- Open `IterationPoint` rows **warn** on Send and never block. The dialog says
  how many remain and offers to send anyway. Owner decision 2026-09-08.
- `Task` rows, General or phase-scoped, **never block anything**. They are
  informational.

No work item blocks a workflow transition. State, authorization, closed/archived
record, validation, and concurrency guards remain mandatory. Legacy's `assertNoPendingTasks` and its divergent
completion rules across `Activity` and `ProjectChecklist` are **PURGE**. A hard
block was rejected on the grounds that it teaches people to tick boxes
untruthfully in order to proceed.

## 8. Assets

**Implementation is blocked** on the platform storage port and its private-object
extension ([`studioflow.md`](studioflow.md) §5). The model is contracted now so
that nothing else waits on it.

### 8.1 Fields

| Field | Type | Rule |
|---|---|---|
| `id` | UUID | Primary key |
| `project_id` | FK → Project | Required |
| `iteration_id` | FK → Iteration? | Null for project-level input files |
| `group` | Enum | `DATA` / `REFERENCE` / `IN` / `OUT` |
| `storage_key` | String | Server-generated, opaque, immutable. **Never supplied by the client** |
| `filename` | String | Original name, for display only. Never part of the storage key |
| `mime_type` | String | Recorded at upload |
| `bytes` | BigInt | Recorded at upload |
| `checksum` | String | Recorded at upload; a working file must arrive byte-identical |
| `audience` | Enum | `INTERNAL` / `EXTERNAL` |
| `uploaded_by` | FK → User | Actor |
| `uploaded_at` | DateTime | UTC instant |

Invariant: `group = OUT` if and only if `iteration_id` is set. Deliverables
belong to a round; inputs do not.

### 8.2 Folders are virtual

The displayed structure is derived from metadata:

| Displayed as | Derived from |
|---|---|
| `Data`, `References`, `IN` | `group`, no iteration |
| `3D / D4`, `CD / CD 2`, … | `group = OUT`, the phase, and the iteration number |

No user types a path, and no request supplies one. The legacy general upload
endpoint accepted a caller-selected folder and validated only the path that
followed it; that design is **PURGE** on security grounds as well as
structural ones.

Renaming a project, renumbering nothing, or reclassifying a file never moves a
stored object, because the object key is opaque and unrelated to the display
structure.

### 8.3 Audience

`EXTERNAL` marks what genuinely left the studio. `INTERNAL` is working
material. The distinction is independent of `group` and of storage location,
and it drives retention at project archival — a decision still open
([`studioflow.md`](studioflow.md) §7.1).

## 9. Audit

Every transition writes one audit event through the platform audit contract,
with StudioFlow-owned, stable event metadata. Legacy compatibility readers and
schema-capability probes are **PURGE**.

Audited: project create/edit/archive/delete, phase start/close/reopen and
exception closure, iteration open/send/withdraw-send/stop, response and correction,
assignment changes, client-point reword/withdraw/restore, asset upload and delete.
Reasons are required where the governing section specifies them.

Not audited: task create/complete, checklist point toggle, reordering. These
are high-frequency and low-consequence; auditing them would bury the events
that matter.

## 10. People on a project

StudioFlow stores **no membership table**. Owner decision 2026-09-08: access is
decided by the persisted RBAC role and by page access
([`studioflow.md`](studioflow.md) §3.2), so a per-project membership row would
carry no authorization meaning and would be one more record to keep current.

People reach a project through three plain references to the platform `User`
table, each of which the work already carries:

| Field | On | Meaning |
|---|---|---|
| `lead_user_id` | Project | Nullable. Who is accountable for the engagement |
| `assignee_id` | Iteration | Who is holding this round |
| `assignee_id` | Task | Who owes this task |

Legacy's `pic_designer_id` and `pic_drafter_id` are **MERGE**: accountability
becomes `Project.lead_user_id`, and the drafter stops being a project-level fact
at all. A drafter is whoever is assigned the CD iterations. This is the more
accurate statement — the legacy columns claimed a drafter for the whole project,
including phases that drafter never touched.

A project's participants are **derived** — the distinct assignees of its
iterations and open tasks — and are never stored. A new project with nothing
assigned shows no participants, which is the truth about it.

### 10.1 Disabled people and visible reassignment

New lead or assignee selection requires an `ACTIVE` platform user with
`studioflow.access` and `studioflow.project.read`; the server revalidates at save.
Assignment grants no permissions. Never create a StudioFlow identity lifecycle.
Existing references survive disabling or loss of access and show an unavailable
badge; historical actor labels stay readable. Disable does not automatically
clear or reassign work, and never blocks Core's disable operation.

Open rounds (`DRAFT`/`SENT`) and `OPEN` tasks with an unavailable or null assignee
appear under **Needs assignment** on the project page and its project-list
filter, visible to project readers. An unavailable lead is also flagged there.
This is not an automatic transfer to the lead's personal queue. Any permitted
manager can reassign using `project.manage`, `iteration.manage`, or `task.manage`
for the corresponding field; assignment changes are audited. This operational
read view ships with the project surface; a cross-project personal dashboard
remains deferred. Restoring access makes the existing assignment usable again.

## 11. Legacy classification

| Legacy behavior | Disposition | Destination |
|---|---|---|
| Project with client, area, opening date, priority, ordered phases | **KEEP** | §3 |
| `pic_designer_id` / `pic_drafter_id` columns | **MERGE** | `Project.lead_user_id` plus iteration assignment (§10) |
| Six-value `PhaseName` including `COMPLETED` | **FIX** | Five phases; completion moves to `Project.status` (§4.1) |
| Seven-value `PhaseStatus` | **MERGE** | Four states; internal-review states purged (§4.2) |
| Sequential phase activation plus bypass | **PURGE** | Ordering is presentation; override is permissioned (§4.5) |
| `Revision` entity | **MERGE** | `Iteration` (§5) |
| Rejection creates revision and converts feedback to TODOs | **FIX** | Contracted record plus consequence (§6) |
| `Activity` as task carrier, phase-tagged deferred activities | **MERGE** | `Task` (§7.3) |
| `ProjectChecklist` + `ChecklistTemplate` | **MERGE** for the in-round case (§7.2); templates **DEFER** ([`studioflow.md`](studioflow.md) §6) |
| `assertNoPendingTasks` hard blocking | **PURGE** | Warn-only (§7.4) |
| Flat `File` under `Revision`; local disk writes; caller-selected folders | **PURGE** | §8, platform storage port |
| B1 virtual folder structure from metadata | **KEEP** | §8.2 — the one legacy design conclusion adopted intact |
| `Role` enum and RBAC compatibility adapter | **PURGE** | Permission vocabulary only ([`studioflow.md`](studioflow.md) §3) |
| Audit compatibility readers | **PURGE** | §9 |
| Direct Prisma queries in page components | **PURGE** | Thin routes calling one application service |

## 12. Access matrix

Every verb, its permission, and its contextual rule. There is no project-scoped
gate ([`studioflow.md`](studioflow.md) §3.2); the third column is domain
invariant, not authorization.

| Action | Permission | Additional rule |
|---|---|---|
| Read any project, phase, iteration, task, asset | `project.read` | — |
| Create / edit Client | `project.manage` | A Client with live Projects cannot be archived |
| Create Project | `project.manage` | Seeds five phases in the same transaction |
| Edit Project fields, set `lead_user_id` | `project.manage` | `code` is immutable |
| Archive Project (`deleted_at`) | `project.manage` | Reversible |
| Permanently delete Project | `project-deletion.approve` | Deferred: no destructive action until retention and deletion policy is approved |
| Open iteration, add / remove assets, edit checklist points | `iteration.manage` | Open via §5.3; content edits only in `DRAFT`; client-point deletion forbidden (§7.2) |
| Assign an iteration (`assignee_id`) | `iteration.manage` | — |
| **Send to client** | `iteration.review` | From `DRAFT` only, no pending send. Open points warn but do not block |
| Record client approval | `iteration.review` | From `SENT` only. Response is immutable once written |
| Record client revision request | `iteration.review` | From `SENT` only. Resolves or opens the next draft in the same transaction |
| Withdraw send | `iteration.review` | `SENT`, no successor, reason required; no response exists |
| Stop round | `iteration.review` | `DRAFT`/`SENT` → `VOIDED`; reason; history kept (§6.2) |
| Correct client answer | `iteration.review` | Replacement record and retained successors, §6.5 |
| Finish / reopen phase; start Supervision | `iteration.review` | §4.3–4.4; no arbitrary state choice |
| Close phase by exception | `phase.override` | §4.5; reason, audit, no unresolved round |
| Create / assign / complete / reorder / delete tasks | `task.manage` | — |

Phase completion is an explicit scope decision (§4.3). Closing a project is
`Project.status = COMPLETED` and needs `project.manage`; show unfinished phases
and open-work counts before confirmation, without silently closing them.
`ON_HOLD` and `COMPLETED` are commercial labels, not workflow mutation locks.
Archived projects are read-only until restored; restoration requires
`project.manage`. Permanent deletion and asset retention remain deferred until
an explicit retention/deletion contract is approved; the permission alone does
not activate destruction. A used Client is archived, not cascade-deleted.

Every read and mutation requires `studioflow.access` and `project.read` in
addition to its action permission. Page reachability never replaces server-side
authorization. Assignment eligibility and lifecycle guards apply independently.

## 13. Dependencies

StudioFlow consumes shared capabilities and adds no private version of any of
them. Where something generic is missing, it is proposed as a shared-layer
change, never built inside this app.

### 13.0 Rebuild on the existing foundation — owner direction, R7.08

StudioFlow is an app consumer of this rebuild repository's established platform.
The legacy repository supplies business evidence to KEEP/FIX/MERGE/PURGE; it
supplies neither an implementation base nor an alternative foundation. The work
is to implement aligned, simplified app logic on the existing foundation. Do not
rebuild login, role administration, shell, design system, audit, or DB runtime as
part of “rebuilding StudioFlow”. Shared contracts remain the authority for their
concern; this PRD must not redefine them.

The following existing-code mapping was checked at rebuild commit `db79fe6`.
It records usable mechanisms, not a claim that every future workflow is tested.

| Need | Disposition and existing rebuild surface | StudioFlow owns |
|---|---|---|
| Identity and current access | **REUSE** [Core auth](../../src/platform/core/auth/request.ts), [RBAC](../../src/platform/core/rbac/index.ts), and [app registrations](../../src/app/app-registrations.ts) | Permission vocabulary, assignment eligibility and action/state guards; no new users, roles, sessions or authorization cache |
| Persistence and atomic changes | **REUSE** [shared DB runtime](../../src/platform/core/db/index.ts) and [serializable transaction runner](../../src/platform/core/db/transactions.ts) | StudioFlow tables, command transaction scope, numbering uniqueness and expected-version checks; no second pool or app retry framework |
| Audit | **REUSE** [audit envelope](../../src/platform/core/audit/index.ts) and [existing persistence writer](../../src/platform/core/audit/persistence.ts) | Event names, safe business metadata, response history and correction consequences; no second audit store or generic undo system |
| Action results and validation | **REUSE** [safe actions](../../src/platform/core/actions/index.ts), [errors](../../src/platform/core/errors/index.ts), [validation](../../src/platform/core/validation/index.ts) | Input schemas and app error codes; authentication/permissions remain explicit because the safe wrapper does not perform them |
| Dates, numbers and list mechanics | **REUSE** existing `src/platform/utilities/{date,decimal,normalization,pagination}` and Core settings | Business date/area meaning, filter/query scope and sort order; no local formatter or alternative locale/timezone settings |
| Authenticated navigation and page frame | **REUSE** [authenticated shell](../../src/platform/authenticated-shell/index.tsx) and [UI Engine public exports](../../src/platform/ui_engine/index.ts) | App navigation entries and project content; no StudioFlow shell, account menu or separate design tokens |
| Forms, lists and user feedback | **REUSE** UI Engine `DirectoryShell`, `PageShell`, `PageHeader`, `DataTable`, `Field`, `Combobox`, `InlineEdit`, `DraftDialog`, `ConfirmDialog`, `RowActionMenu`, and standard states | Field meaning, columns, phase/round compositions, dialog copy and command callbacks |
| Private assets | **DEFER**, then **EXTEND/ADD** the activated shared storage capability (§13.2) | Allowed formats, attachment ownership, audience and retention; no local filesystem upload substitute |

App-owned code is expected: phase/round transitions, client-answer replacement,
point provenance, project read models and UI compositions are domain logic. They
do not become shared merely because they use common database or React patterns.
Conversely, a missing generic interaction is not an excuse for an app-local copy.

Each future executable work order must name the existing imports it consumes,
the app-owned behavior it adds, and any precisely demonstrated shared gap.
REUSE is the default. EXTEND/ADD requires a named current consumer, a narrow
shared contract change, and shared regression coverage before app consumption.
Do not broaden Core or UI Engine for hypothetical future workflows. Existing
Master Data and BQ are consumers to protect, not code to fork into StudioFlow.

### 13.1 Platform Core — consumed as-is

| Capability | Use |
|---|---|
| Identity (`User`) | `lead_user_id` and both `assignee_id` fields reference it directly |
| Persisted RBAC and grants | Core resolves explicit grants; StudioFlow declares permissions and enforces its business guards |
| App permission registry | `studioflow` registration, per the existing composition root |
| Audit contract | §9. StudioFlow supplies stable domain event metadata only |
| Errors and validation | Shared `AppError` and Prisma error mapping. StudioFlow may define namespaced error codes under Core categories |
| Deletion mechanics | Reuse proven generic mechanics where available; StudioFlow policy/retention remains deferred and app-owned |

### 13.2 Platform Core — extension required

The private large-object storage requirement described in
[`studioflow.md`](studioflow.md) §5 remains deferred. First verify the shared port
actually available when its work order activates; ADD the absent capability or
EXTEND the existing one, rather than assuming a roadmap means it is implemented.
This is a **shared-layer change**, proposed there, not implemented inside
StudioFlow. Assets (§8) do not begin until it lands.

### 13.3 UI Engine — reuse first

Routes consume existing UI Engine layouts, inputs, dialogs, and state components.
The iteration rows and send/response content are app-owned compositions, not new
shared business components. If an approved interaction proves a generic gap,
EXTEND or ADD that capability in UI Engine before consuming it (CORE §14 and
UI_ENGINE §16); do not build a private substitute or demand a second consumer
when a shared concern already proves the need. No speculative component is added.

### 13.4 Master Data

Read-only, through the Master Data public read port, for the brand catalog. Used
by Library/Schedule only, and therefore **inactive in the first release**. No
cross-schema foreign key, ever. Selected catalog facts are snapshotted as plain
values so later Master Data edits cannot rewrite project history.

### 13.5 BQ

None. A StudioFlow project and a BQ project are unrelated records.

## 14. Risks and unproven assumptions

Recorded so a reviewer can test them rather than inherit them.

| # | Risk or assumption | Exposure | Mitigation or trigger to revisit |
|---|---|---|---|
| R1 | **Dropping internal review is the largest bet in this contract.** Legacy could express "the designer has approved this internally but it has not gone out". This contract cannot | If the studio grows past the point where internal approval is a conversation, that state must return | Owner-stated, 2026-09-08. Revisit when a second designer joins, or when work is sent that a designer had not seen |
| R2 | Phase state is only as truthful as the recorded client answer. A phase sits in `WAITING_CLIENT` until a reply is recorded or the round is explicitly stopped | Dashboards silently overstate what is genuinely blocked on the client | `WAITING_CLIENT` must display its age. Always show elapsed time; no unapproved threshold or notification job |
| R3 | Moodboards are assumed to be revised often enough to deserve numbering | If most moodboards are approved on the first round, `MB 1` is noise on every project | Owner-stated, 2026-09-08, not observed in data. Measure after real use |
| R4 | Supervision uses explicit start/finish/reopen (§4.4) | These business events need to match actual site work | Deliberately left minimal so it is cheap to change |
| R5 | Warn-only sending may let unfinished revision points ship | A client receives a round missing a point they asked for | Owner-stated, 2026-09-08. The warning must name the count, not merely exist |
| R6 | No project-scoped authorization assumes a small, fully trusted team | Any reviewer can act on any project | [`studioflow.md`](studioflow.md) §3.2. Revisit before any contractor or client-adjacent account exists |
| R7 | Large private-object storage is unbuilt, and its cost and transfer behavior at hundreds of MB per file are unmeasured | Asset work could prove far more expensive than the rest of the app combined | Storage lands first, as its own work, before any StudioFlow upload code |
| R8 | Derived participants (§10) means a new project shows nobody until something is assigned | May read as a bug rather than a fact | `lead_user_id` can be set at creation |

## 15. Out of scope for the first release

Library and Product Schedule, Minutes of Meeting, SketchUp exchange, checklist
templates, cross-project feeds, client-facing links, project archival with
retention manifest, and any legacy data migration. See
[`studioflow.md`](studioflow.md) §6 and §7.

## 16. PRD acceptance scenarios and simplification ledger

These are required behavior scenarios for future work orders, not tests claimed
as run today. Keep four phase states, five round states (including explicit `VOIDED`), two task states, one
round-opening rule, and one client-answer correction mechanism.

| Debt / scenario | Required observable result |
|---|---|
| L1: accidental approval, then correction to revision | Prior answer retained; phase reopens; exactly one next draft with source-linked points |
| L1: accidental revision, successor already contains work | Correct to approval; retain successor number, files, work and old points visibly marked source corrected; phase remains open |
| L1: correct history after later send/approval | Later delivery, response and closure retained; warning/acknowledgement states no downstream rollback |
| Unneeded D4 after corrected approval | Stop D4 with reason; keep its number/content in history; finish against latest non-voided approved round |
| Wrong send with a draft successor | Stop the unanswered sent round without fabricating a response; successor can then be sent |
| L2: normal, exceptional, and Supervision closure | Each obeys its own documented rule; no arbitrary inconsistent phase state |
| L3: start/upload/revision race | Reuse one draft, one next number; pending client reply stays visible; second send refused until answered |
| L4: client approves CD kitchen, other rooms unfinished | CD round approved, phase remains open; start next round without override |
| L4: final round approved and whole scope finished | Explicit finish choice closes phase atomically; project commercial status unchanged |
| L5: disable assignee or lead mid-project | History retained; unavailable work visible in Needs assignment; no new assignment to unavailable user |
| L6: send with open points vs invalid state | Open points warn and allow confirmation; missing permission, stale state or another pending send still refuse |
| L7: remove client point | Hard delete refused; reasoned withdrawal retains original wording/source and changes current warning count |
| L8: all phases done but engagement still active | Show “Semua fase selesai” separately from “Status project: Aktif” |
| L9: register first slice | Register only eight core permissions; four proposed Schedule/MoM permissions remain deferred |
| No uploaded file yet | Start round and record externally performed delivery with a delivery note; no dependency on upload availability |
| Repeated or racing corrections | One effective answer, no fork or duplicate consequence; loser reloads |

The simplification removes redundant status entry, role enums, phase sequencing,
and duplicate task types. It preserves scope completion, work-ahead visibility,
client feedback provenance, correction, and unavailable-user recovery. It does
not assert that fewer enum values alone prove non-regression. The recorded audit
is discovery evidence; exact legacy behavior characterization and real browser
acceptance remain required when an executable slice is authorized.

### 16.1 Foundation-fit acceptance

In addition to the business scenarios above, each activated slice must prove:

- the real Core session and live grants authorize its routes and commands;
- one business command and its audit commit or roll back together through the
  shared runtime, with no app-created Prisma client, pool, or audit subsystem;
- screens use the existing shell, tokens and interaction components, including
  unsaved input, pending/error feedback, keyboard operation and narrow viewport;
- any shared extension has focused regression checks and does not change Master
  Data/BQ behavior; no business default or StudioFlow state leaks into platform;
- the retained legacy outcome maps to the aligned app rule and its acceptance
  scenario. Reusing components alone is not workflow acceptance.

This PRD does not authorize a general foundation refactor. An actual shared
code/contract mismatch is reported for a narrow navigator decision before an
executor implements a substitute or changes unrelated consumers.
