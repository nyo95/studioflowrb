# Project Contract — StudioFlow

Status: **ACTIVE PROJECT-WORKFLOW CONTRACT — substantial slices implemented
through R7.55; current deviations are tracked in
[`../../knownbug.md`](../../knownbug.md) and [`../../roadmap.md`](../../roadmap.md)**

R7.07 resolved L1–L9 and their dependent rules. Later owner alignment in
[`../../alignment.md`](../../alignment.md) governs where this contract's detailed
mechanics would otherwise obscure the simplified workflow. Earlier owner decisions remain
unless explicitly revised here. These are navigator product decisions for the
requested PRD update, not a claim of separately approved implementation.
Evidence boundary: the recorded legacy audit was read; legacy code was not
re-inspected in this session. Acceptance scenarios in §16 protect intended
outcomes; code-level legacy parity remains a gate before implementation.

Authority: owner decisions locked 2026-09-07/08, reconciled with the shared
rules in [`studioflow.md`](studioflow.md) and the dispositions in
[`STUDIOFLOW-LEGACY-AUDIT-ROADMAP.md`](STUDIOFLOW-LEGACY-AUDIT-ROADMAP.md).
Legacy code at the recorded audit commit is behavioral evidence only.

Client, Project, Phase, Iteration, project-owned tasks, and assets are one
contracted workflow. Client is a reusable counterparty across projects;
transaction scope follows each command, not one giant aggregate spanning all
clients/projects. Legacy split them across `Project`, `Phase`, `Revision`,
`Activity`, `ProjectChecklist`, and `File`; the rebuild preserves the domain
meaning and history, while removing the duplicate user-facing task surfaces.

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
| `location` | String? | Short site label used in file names, e.g. "Funan" (§8.5). Not a postal address |
| `address` | String? | Site address; independent of the Client address |
| `area` | Decimal? | Square metres |
| `status` | Enum | `ACTIVE` / `ON_HOLD` / `COMPLETED` |
| `priority` | Int | Ordering hint for the project list; not a workflow input |
| `opened_at` | DateTime | Project opening date |
| `created_at` / `updated_at` | DateTime | UTC instants |
| `deleted_at` | DateTime? | Archive state |

`status` is the commercial state of the engagement and is set by a human. It is
distinct from phase state, which is workflow and is derived. A project may be
`ON_HOLD` while a phase is `WAITING_CLIENT`; neither implies the other.

Creating a project requires `studioflow.project.manage` and, in the same
transaction, snapshots the studio phase template into its phases (§4.1).

Permanent deletion is deferred (§12). Its future two-step request/approval
policy is StudioFlow-owned and will require `studioflow.project-deletion.approve`.

## 4. Phase

### 4.1 Phases come from a studio template

Phases are **not hardcoded**. The studio keeps one ordered phase template in
settings; every new project copies it. Owner decision 2026-09-08: legacy's fixed
enum could not express a phase the studio later decides to standardise, and
every such change needed a developer.

Each template entry carries:

| Field | Rule |
|---|---|
| `key` | Stable identifier, immutable once any project uses it |
| `name` | Display name |
| `sort_order` | Presentation order |
| `has_rounds` | Whether this phase uses numbered rounds (§5) |
| `round_prefix` | Label prefix when `has_rounds` — `MB`, `Layout`, `D`, `CD` |
| `folder_key` | The output folder this phase owns (§8.2) |
| `requires_internal_approval` | Default off. When on, Send warns if no internal approval exists (§6.7) |

The studio's current standard seeds Moodboard (`MB`), Layout (`Layout`),
Design 3D (`D`), CD (`CD`), and Supervision with `has_rounds = false`.

`has_rounds` replaces the hardcoded Supervision exception. A phase without
rounds is an ordinary template choice, not a special case in code, and the
studio can add another one without a developer.

A project **snapshots** the template at creation. Editing the studio template
never rewrites a running project — the same snapshot rule the schedule uses for
catalog facts. On an individual project, `project.manage` may add a phase, or
remove one that holds no rounds; a phase that holds rounds is closed by
exception (§4.5), never deleted.

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
| `working_revision` | Int | Starts at 0. Incremented when the round's working file is replaced (§5.4). Display only; not a state |
| `voided_at` / `voided_by` / `void_reason` | Nullable | Required together for `VOIDED`; nonblank reason |
| `created_at` / `updated_at` | DateTime | UTC instants |

Unique on `(phase_id, number)`. `SUPERSEDED` means the effective client answer
requests revision. `VOIDED` means the studio stopped an unanswered round; it
never implies client rejection or approval.

### 5.2 Label is derived, never stored

The label is exactly `<round_prefix><number>` with no separator — `MB1`,
`Layout2`, `D4`, `CD1` — and a phase whose template gives no prefix falls back to
its name. Because the prefix lives in the template, a phase the studio adds later
gets a working numbering scheme without a code change.

**Amended R7.55.** Earlier wording gave `MB 1` and `CD 1` beside `D4`, which is
two formats for one derived value; the naming template's own worked example
(§8.5, `20260908 Sociolla Funan D1.skp`) is the form the designer copies into
Save As, so the separator-free form is canonical. One exported helper derives it,
and every surface — round rows, "sent in" labels, and the `{round}` token —
consumes that helper. A second local formatting rule is the defect this amendment
removes; historical `SfFile.filename` values are stored, never recomputed, so no
existing record changes.

Working revisions within one round display as `D1.1`, `D1.2` (§5.4).

A stored label would be a second copy of `(phase, number)` and could disagree
with it. This follows the legacy B1 decision that document structure is
**virtual metadata, not a typed path** — the one legacy conclusion this
contract adopts wholesale.

### 5.3 One round-opening rule, independent of the trigger

Whenever work needs a round, the server resolves the phase's existing `DRAFT`;
if one exists, reuse it. Otherwise create the next number, starting at 1.
Never delete a numbered round or reuse its number. Allocate under the same
phase-level concurrency guard for every caller.

The triggers are **Start round** (`iteration.manage`), the first file recorded
into the phase (`iteration.manage`), and a recorded revision request
(`iteration.review`). Recording a file needs no upload (§8.1), so no trigger
waits on storage. They call this same rule. Start round
works before files exist; an upload into a draft does not create another number.
For a revision request, newly entered points join that draft, even if it already
contains work. Nothing already there is replaced or copied again.

Work may start while one earlier round is `SENT`. Its pending answer remains
visible and keeps the phase `WAITING_CLIENT`; the new draft cannot be sent until
that answer is recorded or the earlier round is explicitly voided. No queue of simultaneous
client reviews is introduced. Closed phases require explicit reopening first.
A failed upload does not leave a numbered empty round: for a stored file the
round opens only when the upload finalizes. A recorded file has no upload step
and opens the round immediately. Concurrent retries of
the same command must not create duplicate rounds, assets, or points.

### 5.4 Working revisions do not consume a round number

A round number is expensive: it marks something that left the studio. Updating
the working file inside an unsent round is cheap and must stay cheap.

Replacing the working file of a `DRAFT` round increments `working_revision`
and supersedes the previous working file (§8.6). The round keeps its number and
displays as `D1.1`, `D1.2`, and so on.

This is not a new rule. §5.3 already said an upload into an existing draft does
not create another number; `working_revision` only makes that visible, which is
what the studio previously expressed by hand as `versi6` in a filename.

`working_revision` never appears on a frozen round and is never editable.

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
| `state` | Enum | `DRAFT` / `EFFECTIVE`. A draft answer changes nothing until committed (§6.6) |
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
email or deliver files. Storage is not a prerequisite. Confirmation records the delivery
channel. A written note of what was sent is required only when no file is
attached to the send; when candidate files are attached (§8.3) they are that
record and no retyping is asked for. Even a round with no file at all can
therefore be recorded honestly. It does not turn all internal assets into externally delivered files.

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

### 6.6 An answer may be collected before it is committed

Client feedback rarely arrives as one clean review. It dribbles in over days —
"move the sofa" on Monday, "warmer lighting" on Wednesday, "not that carpet" on
Thursday. A model that accepts only a single instantaneous answer forces the
studio to either commit early and lose Wednesday's remark, or record nothing for
three days.

An answer may therefore be **saved as a draft and committed later**. While
`DRAFT`:

- the round stays `SENT` and the phase stays `WAITING_CLIENT` — which is the
  truth, because the client has not finished answering;
- points are added as they arrive, each with the date it was received;
- the outcome may still change (approval becomes revision, or the reverse);
- **nothing else happens.** No round opens, no phase moves, no point is copied.

Committing makes it `EFFECTIVE` and fires every consequence in §6.2 exactly as
before. One command, one transaction, unchanged.

At most one `DRAFT` answer per round. A draft is not an answer: it never
satisfies phase closure (§4.3), never ends `WAITING_CLIENT`, and its age keeps
counting. Discarding a draft is permitted and unaudited; it recorded nothing.

The correction chain (§6.5) applies only to `EFFECTIVE` answers. Editing a draft
is ordinary editing, not correction, and needs no reason. A **correction** may
likewise be composed as a draft, under the same rule: it changes nothing until
committed, and its reason is required only at commit.

Stopping a round (`VOIDED`) discards any draft answer on it — a draft recorded
nothing, so nothing is lost and nothing is audited. An `EFFECTIVE` answer is
never discarded this way; §6.2 already forbids answering a voided round.

### 6.7 Internal approval is a record, not a state

Sometimes work must be signed off inside the studio before it goes out, and the
owner needs to see that it was. Not always — but when it matters, it matters.

Legacy's error was not recording this. It was making it a **mandatory state**:
every round had to pass `ON_REVIEW_INTERNAL` → `APPROVED_INTERNAL` whether anyone
cared or not, which is the fatigue §4.2 removed.

So it returns as an optional record:

| Field | Type | Rule |
|---|---|---|
| `iteration_id` | FK → Iteration | At most one approval per round |
| `approved_by` / `approved_at` | User / DateTime | Actor and UTC instant |
| `note` | String? | Optional |

It requires `iteration.review`, which a drafter does not hold — so nobody signs
off their own work, using the split already in force. It **does not** change
round state, does not enter the four-state phase machine, and does not gate
anything by itself. Unused, it leaves no trace at all.

To make its absence meaningful where the studio wants it to be, the phase
template (§4.1) carries `requires_internal_approval`, default off. When on and
missing, **Send warns with that fact and still proceeds** — the same warn-never-
block rule as open points (§7.4), for the same reason.

An approval survives everything that happens to its round afterwards, including
voiding and answer correction. It records that a person looked at the work on a
date, which stays true regardless of what the round later became.

This is what the drafter/designer handoff needed, and it costs nothing on the
rounds that never need it.

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

### 7.1.1 Requirements are first-class StudioFlow domain behavior

Requirements state what a Project or one of its Phases must satisfy; they are
not work items hidden behind checklist wording. A **General Requirement** is
project-scoped. A **Phase Requirement** belongs to exactly one Phase. Both may
have a File as evidence, but a File never becomes the requirement itself; a
Task or subtask may decompose work needed to satisfy a requirement without
creating another requirement.

The legacy template-seeded project and phase requirements are retained as
recovery evidence for a later SF-A planning outcome. That outcome must define
template snapshotting for new projects, explicit satisfaction/evidence rules,
and how running projects remain unaffected by later template edits. This
contract records the domain boundary only: it authorizes no requirement schema,
template, route, or implementation now.

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

### 7.3 Task — project-owned work item

| Field | Type | Rule |
|---|---|---|
| `id` | UUID | Primary key |
| `project_id` | FK → Project | Required |
| `phase_scope` | Enum? | Nullable. A task remains project-owned and may point to one phase; null means project-level |
| `title` | String | Required |
| `status` | Enum | `OPEN` / `DONE` |
| `assignee_id` | FK → User? | Optional |
| `due_date` | DateTime? | Optional |
| `attachment_file_id` | FK → File? | Optional evidence that the task was done |
| `sort_order` | Int | Manual ordering |

A task attachment is **never** a deliverable. Only §8.3 makes a file something
that left the studio. Evidence of internal work and goods delivered to a client
are different claims and are not merged.

`phase_scope` is selected when a task is created from a project or phase
surface, and may be changed later by an explicit project action. The creation
flow must offer the current phase context without forcing the user to navigate
through a separate task type. A project-level task may remain unscoped, but a
task created while the user is working on a phase defaults to that phase.
`What’s Today` is only a read model over these project-owned tasks; it never
changes their project or phase ownership.

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

## 8. Files

### 8.0 MVP first: one unified intake

The first usable slice is deliberately small:

`What’s Today / Project / Phase → + or drag-drop → project + phase → current file`

If the intake starts from a project or phase, that context is prefilled. If it
starts from `What’s Today`, the user selects the project and phase in one
compact step. The system records the file, replaces the prior current bytes
according to §8.6, and preserves metadata/audit. It does not send the user to a
separate Deliverables page and does not require a sequence of internal-review,
external-review, approval, or rejection buttons.

The MVP may use a simple explicit choice of `working` or `sent` when the system
cannot infer it. Filename, extension, source folder, and current context may
preselect that choice, but heuristics never silently invent a project, phase, or
client response. Ambiguity produces one confirmation, not a new workflow.

Everything below this subsection is the technical contract behind that one
intake. It must not become extra MVP screens, extra task types, or extra user
decisions.

Every file carries **two facts that must stay separate**:

- **where it belongs** — a folder, by kind of work (§8.2);
- **whether it left the studio** — a link to the round it was sent in (§8.3).

Legacy answered the second question with a folder named `OUT`, inside a list
that otherwise answers the first. That single conflation produced the studio's
whole filing debt: exported renders and internal decks piled up in `OUT` without
ever being sent, while layout PDFs that genuinely were sent stayed in `Drawings`
and had to be copied to appear as deliverables at all. **`OUT` is PURGE**, and
so is this contract's earlier `audience` field, which stated the same fact a
second time.

**Every dropped file creates a permanent record.** The bytes may or may not be
kept (§8.1, §8.6); the record never disappears. That distinction is what makes
this a filing system rather than a file store — and a filing system is what the
studio actually lacks, because the NAS and Drive already store perfectly well.

### 8.1 Three treatments

| Treatment | Example | What the platform holds |
|---|---|---|
| `RECORDED` | `.skp`, large working `.dwg` | **Metadata only.** The file stays on the studio's own machines |
| `STORED` | delivered PDF, render sent out, client survey | The bytes |
| `LINKED` | archived final | An external URL; the bytes live elsewhere |

`RECORDED` is what makes the workflow independent of storage. Dropping a `.skp`
registers the round, advances the phase, and names the file **with no upload at
all** — the browser reads name, size and date without reading the contents. The
studio's own machines remain the archive for working files, which is where they
already are.

The folder template (§8.2) sets the default treatment per folder. The person
dropping a file may lower it (`STORED` → `RECORDED`) but never silently raise
it, because raising it uploads bytes.

First release ships `RECORDED` and `STORED`. `LINKED` is contracted here and
deferred with the Google Drive work ([`studioflow.md`](studioflow.md) §5), so
that activating it later changes no rule above.

### 8.2 Folders

Two kinds, from one template:

| Kind | Source |
|---|---|
| Project input folders | A fixed template list: `Data`, `References`, `IN` |
| Phase output folders | One per phase, from `folder_key` in the phase template (§4.1) |

Because output folders come from the phase template, adding a phase adds its
folder. Two gaps in the studio's current structure close by themselves:
Moodboard and Supervision had no folder, though supervision plainly produces
site photographs.

Ordering is a `sort_order` field, **never a numeric prefix inside the name**.
The studio's `1. Data … 7. CD` forces a rename of everything to insert a folder
in the middle — the same renumbering fault already purged from Schedule.

The displayed path is derived from metadata. No user types a path and no request
supplies one; the legacy upload endpoint that accepted a caller-selected folder
is PURGE on security grounds as well as structural ones.

### 8.3 Sending is a link, not a folder

A file that left the studio carries `sent_in_iteration_id`. That one link is the
whole mechanism:

| Question | Answered by |
|---|---|
| What kind of file is this? | `folder_key` |
| Did it leave the studio, and when? | `sent_in_iteration_id` |
| What did the client say about it? | that round's response (§6) |

**Marking a file as a send candidate never changes round state.** Only **Send to
client** (§6.2) does. Candidate files are attached to that send and receive the
link atomically with it.

This is deliberate. A drop that could close a round would create a second way to
close one, and two closers eventually disagree. Dropping a file may *open* a
round (§5.3); only sending closes one.

A file in an input folder cannot be a candidate — `IN` means it arrived from
outside. "Everything we sent" is a **view over this link**, never a place files
are copied to.

The same layout PDF therefore lives once, in `Drawings`, and is marked sent in
`Layout 1`. No copy, no `OUT`, and no contradiction between the two.

### 8.4 Fields

| Field | Type | Rule |
|---|---|---|
| `id` | UUID | Primary key |
| `project_id` | FK → Project | Required |
| `folder_key` | String? | Which folder (§8.2). A phase output folder implies its phase. **Null means unsorted** (§8.8) |
| `treatment` | Enum | `RECORDED` / `STORED` / `LINKED` |
| `filename` | String | Standard name from the naming template (§8.5) |
| `original_filename` | String | What the person actually dropped; kept so they recognise it |
| `bytes` | BigInt | Read from the drop; present for every treatment |
| `file_modified_at` | DateTime? | The dropped file's own timestamp, when the browser reports it |
| `dropped_by` / `dropped_at` | User / DateTime | Always recorded |
| `sent_in_iteration_id` | FK → Iteration? | Set only by a send (§8.3); immutable afterwards |
| `storage_key` | String? | `STORED` only. Server-generated, opaque, **never client-supplied** |
| `checksum` | String? | `STORED` only |
| `external_url` | String? | `LINKED` only |
| `superseded_at` | DateTime? | Set when a working file is replaced in the same round (§8.6) |
| `bytes_released_at` | DateTime? | Set when the bytes were released (§8.6). The record stays; the object is gone |

Invariants: `storage_key` is present exactly when `treatment = STORED`;
`external_url` exactly when `LINKED`; a file with `sent_in_iteration_id` is
never in an input folder, and its `folder_key` and `filename` are frozen.

### 8.5 Standard naming, and one honest limit

The studio keeps one naming template built from a **fixed token vocabulary**,
each token resolving to a named field. A template referring to anything else is
rejected when saved, not when a file is dropped.

| Token | Resolves to |
|---|---|
| `{date}` | The drop date, `YYYYMMDD`, in the platform's configured timezone |
| `{project}` | `Project.name` |
| `{location}` | `Project.location` — a short site label such as "Funan". Distinct from `address`, which is a postal string and unusable in a filename |
| `{round}` | The round label (§5.2), or empty for a file with no round |
| `{code}` | `Project.code` |

The studio's current convention is `{date} {project} {location} {round}`,
producing `20260908 Sociolla Funan D1.skp`. An empty optional token collapses
without leaving a double space.

`Project.location` is added by this rule (§3) precisely because the naming
convention needs it and `address` cannot serve.

It fills `filename` for **every** treatment, so the record reads consistently
even when the bytes were never uploaded. `original_filename` is kept beside it,
however untidy it was.

**The next name is offered before the file exists.** Each round shows the name
its next file should carry, with a copy control:
`20260908 Sociolla Funan D1.skp`. The designer saves from SketchUp under that
name directly.

This is the order designers actually work in — naming happens at Save As, not
after the fact. Requiring a file to be dropped in order to learn its name would
invert the sequence and produce a rename loop.

**A browser cannot rename a file on the studio's own disk.** That is a browser
limit, not a design choice. So for `RECORDED` files the app *shows* the standard
name for the person to copy, and never claims to have renamed anything. For
`STORED` and `LINKED` files the copy does carry the standard name, because the
app created that copy.

### 8.6 Retention — one current file, permanent metadata

**Owner decision 2026-09-09.** The studio's own machines remain the primary
archive. The application keeps at most one current file per project and phase.
An internal working file may be replaced by the next internal file, and the
current internal file may be replaced by the file marked external. The previous
file's application bytes are released or deleted; its metadata and audit record
remain permanently readable.

Per project and phase, at most one current file holds application bytes:

| Kept | Why |
|---|---|
| The current working or sent file | The latest representation of the phase |

Everything older has its bytes released. **Its record never is.** Name, standard
name, original name, size, date, who dropped it, which round, whether it was
sent, and the client's answer all remain readable forever.

This is the line that matters: releasing bytes is not deleting history. Six
months later the app still answers *"what was D2, when did it go out, and what
did the client say"* — it simply cannot hand back the file, which the studio and
the client both already have.

Evidence in a dispute is the response chain (§6), not the bytes. The client's
own words, the send record, and the date are what a disagreement turns on, and
none of them is ever released.

**Release happens on the event that displaces the file** — a new internal drop,
or a file marked external — inside that command's own transaction. There is **no scheduled
cleanup job and no reconciler.** Reintroducing one would restore exactly the
machinery this decision removed.

The record is authoritative: `bytes_released_at` is written in the transaction,
and the stored object is deleted **best-effort afterwards**. A failed object
delete never rolls back or blocks the send; it leaves an unreferenced object that
costs a little money and no correctness, and it is logged. Nothing in the
application reads an object whose record says released.

`RECORDED` files never held bytes, so release does not apply to them.

A task attachment (§7.3) is **not** covered by the one-current-file-per-phase rule. A General
task has no phase, and evidence of internal work is not a deliverable. Task
attachments are small by policy and are released only when the task is deleted.

### 8.7 Dropping files

**A file drop is the single filing action.** The user may mark the dropped file
as internal/working or external/sent in the same intake. A later internal drop
replaces the prior working bytes; an external drop replaces the working bytes
and links the current record to the iteration. Metadata and audit history are
never replaced. The folder template maps extensions, so `.skp` files can be
classified silently; a genuinely ambiguous PDF may receive one short purpose
question.

The folder template is an implementation mapping, not a second filing task.
Names such as `OUT`, `PDF`, `Presentation`, or `CD` may be produced by that
mapping when the configured template requires them, but none of them is a
workflow state and none may require the user to copy or move the file manually.

**Deliverables that already went out.** In practice a file is sent by WhatsApp or
email *before* the studio opens the app. The same drop intake therefore allows
the user to mark it external/sent and completes the send (§6.2) in one
interaction. One dialog, not two screens. An internal drop only replaces the
current working file; it never closes a round.

### 8.8 Bulk intake and the unsorted tray

Tidying filing is the reason this application exists. If incoming files are
harder to file here than to leave in a chat thread, the application has failed at
its own purpose, so intake is built for how administration actually gets done —
in one sitting, not per file as each arrives.

- **Many at once.** Drop fifteen files together and classify them on one screen,
  not through fifteen dialogs.
- **An unsorted tray.** A file whose folder is unclear lands in *unsorted* rather
  than being refused or forcing an immediate decision. Drop everything now, sort
  it later.

Files in the unsorted tray are already recorded — they have a name, a date, and
an owner — and count as present in the project. Sorting assigns a folder; it does
not create the record.

**An unsorted file has no phase, so it never opens a round** (§5.3). Sorting one
into a phase output folder is what triggers the round-opening rule, through the
same resolver every other trigger uses. Dropping a hundred unsorted files
therefore changes no workflow state at all — which is what makes dumping them
safe.

No chat or mail integration is contracted. Desktop WhatsApp already writes media
to a folder on disk, so the files are reachable; the expensive part was never
fetching them but sorting them one at a time, and §8.8 is the answer to that.

### 8.9 Agent implementation guardrails

The implementation must follow this order:

1. implement the one-intake MVP in §8.0 using existing Project, Phase,
   Iteration, and file primitives;
2. add only the smallest service/query needed to persist the current file and
   its metadata/audit replacement event;
3. activate folder-template mapping only after the MVP path works;
4. activate advanced treatment, bulk intake, and unsorted-tray behavior only
   when an approved work order names them.

An agent must not add a new task entity, review state, approval state, folder
entity, chat integration, external delivery integration, background reconciler,
or speculative generic abstraction to complete the MVP. If an existing schema
or shared port cannot support the MVP, the agent stops and reports the exact
contract/code mismatch instead of inventing a fallback.

## 9. Audit

Every transition writes one audit event through the platform audit contract,
with StudioFlow-owned, stable event metadata. Legacy compatibility readers and
schema-capability probes are **PURGE**.

Audited: project create/edit/archive/delete, phase start/close/reopen and
exception closure, iteration open/send/withdraw-send/stop, response and correction,
assignment changes, client-point reword/withdraw/restore, internal approval,
file drop, supersede and byte release, and studio template edits.
Reasons are required where the governing section specifies them.

Not audited: task create/complete, checklist point toggle, reordering, sorting a
file out of the unsorted tray, and saving or discarding a draft answer (§6.6) —
a draft records nothing. These
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

### 10.2 What is waiting on me — across projects

A designer runs several projects at once and does not think project by project.
The first question of the day is *"what do I have to do"*, and answering it by
opening eight project pages is how a person ends up keeping their own list
somewhere else — at which point the application has lost them.

One list, scoped to the signed-in person, ordered by what has been waiting
longest:

| Row | Source |
|---|---|
| Rounds assigned to me in `DRAFT` | my work now |
| Rounds I sent, still `WAITING_CLIENT`, with age | chase the client |
| `OPEN` tasks assigned to me | everything else |
| Open rounds and tasks with no assignee, or an unavailable one | §10.1 |

Archived projects are excluded. `ON_HOLD` projects are shown but visually
separated — the work is real and paused, not gone.

**This introduces no table and no field.** It is one read model over records that
already exist, which is why it belongs in the first release rather than a later
one: the data was always there, only the question was missing.

It is deliberately not legacy's Today's View. No saved filter sets, no auto-hide
after seven days, no feed of every event — those grew legacy past the point of
being readable. Mine, unfinished, oldest first.

It also answers the drafter handoff without any new lifecycle: the drafter
finishes and reassigns the round, and it appears here. Reassignment is the
handoff signal, so no internal-review state is needed to express one (§6.7 covers
the separate question of recording sign-off).

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
| `ProjectChecklist` + `ChecklistTemplate` | **MERGE** for in-round points (§7.2); project/phase template-seeded Requirements are a separate first-class recovery domain (§7.1.1), deferred to later SF-A planning |
| `assertNoPendingTasks` hard blocking | **PURGE** | Warn-only (§7.4) |
| Flat `File` under `Revision`; local disk writes; caller-selected folders | **PURGE** | §8 |
| B1 virtual folder structure from metadata | **KEEP** | §8.2 — the one legacy design conclusion adopted intact |
| `OUT` folder as the record of what was sent | **PURGE** | §8.3 — a link on the file, not a place to copy it to |
| Numeric prefixes inside folder names (`1. Data`) | **FIX** | §8.2 — ordering is a field |
| Studio filing every version of a working model | **FIX** | §8.6 — one current working file per round; sent files never released |
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
| Create Project | `project.manage` | Snapshots the phase template in the same transaction |
| Edit the studio phase, folder and naming templates | `project.manage` | Never rewrites a running project (§4.1, §8.2) |
| Add / remove a phase on one project | `project.manage` | Remove only while it holds no rounds |
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
| Save or discard a draft client answer | `iteration.review` | Changes no state until committed (§6.6) |
| Record internal approval | `iteration.review` | At most one per round; never gates by itself (§6.7) |
| Drop, classify and sort files | `iteration.manage` | Every drop is recorded permanently (§8) |

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
| Identity and current access | **REUSE** [Core auth](../../../src/platform/core/auth/request.ts), [RBAC](../../../src/platform/core/rbac/index.ts), and [app registrations](../../../src/app/app-registrations.ts) | Permission vocabulary, assignment eligibility and action/state guards; no new users, roles, sessions or authorization cache |
| Persistence and atomic changes | **REUSE** [shared DB runtime](../../../src/platform/core/db/index.ts) and [serializable transaction runner](../../../src/platform/core/db/transactions.ts) | StudioFlow tables, command transaction scope, numbering uniqueness and expected-version checks; no second pool or app retry framework |
| Audit | **REUSE** [audit envelope](../../../src/platform/core/audit/index.ts) and [existing persistence writer](../../../src/platform/core/audit/persistence.ts) | Event names, safe business metadata, response history and correction consequences; no second audit store or generic undo system |
| Action results and validation | **REUSE** [safe actions](../../../src/platform/core/actions/index.ts), [errors](../../../src/platform/core/errors/index.ts), [validation](../../../src/platform/core/validation/index.ts) | Input schemas and app error codes; authentication/permissions remain explicit because the safe wrapper does not perform them |
| Dates, numbers and list mechanics | **REUSE** existing `src/platform/utilities/{date,decimal,normalization,pagination}` and Core settings | Business date/area meaning, filter/query scope and sort order; no local formatter or alternative locale/timezone settings |
| Authenticated navigation and page frame | **REUSE** [authenticated shell](../../../src/platform/authenticated-shell/index.tsx) and [UI Engine public exports](../../../src/platform/ui_engine/index.ts) | App navigation entries and project content; no StudioFlow shell, account menu or separate design tokens |
| Forms, lists and user feedback | **REUSE** UI Engine `DirectoryShell`, `PageShell`, `PageHeader`, `DataTable`, `Field`, `Combobox`, `InlineEdit`, `DraftDialog`, `ConfirmDialog`, `RowActionMenu`, and standard states | Field meaning, columns, phase/round compositions, dialog copy and command callbacks |
| Stored file bytes | **DEFER**, then **REUSE** the activated shared `ObjectStorage` capability (§13.2), whose canonical self-hosted adapter is local filesystem storage | Folder and treatment rules, send links, naming, supersession; no direct-path or private-static-file access |

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

Owner decision 2026-09-08 removed the large private-object requirement from the
critical path. `RECORDED` files (§8.1) need no storage at all, so rounds, phases,
sending and the client exchange ship without it.

`STORED` files still need a shared capability. Verify what the port actually
offers when that work order activates; ADD the absent capability or EXTEND the
existing one, rather than assuming a roadmap means it is implemented. This is a
**shared-layer change**, proposed there, never built inside StudioFlow. Only the
`STORED` treatment waits on it; nothing else in §8 does.

### 13.3 UI Engine — reuse first

Routes consume existing UI Engine layouts, inputs, dialogs, and state components.
The iteration rows and send/response content are app-owned compositions, not new
shared business components. If an approved interaction proves a generic gap,
EXTEND or ADD that capability in UI Engine before consuming it (CORE §14 and
UI_ENGINE §16); do not build a private substitute or demand a second consumer
when a shared concern already proves the need. No speculative component is added.

### 13.4 Master Data

Read-only, through the Master Data public read port, only for StudioFlow Brands.
Brand discovery supports hashtag, brand, and category/brand-category. Product
Catalogue is independently owned by StudioFlow and reused across its projects;
it never reads Master Data SKU, unit, or pricing. A project Schedule copies a
catalogue specification into immutable plain-value history. No cross-schema
foreign key or cross-app write, ever.

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
| R7 | `RECORDED` files keep the studio's own machines as the archive. The platform holds a name, not the bytes | If a working file is moved or deleted locally, the record points at something no longer findable | Owner decision 2026-09-08: the local machines were always the real archive. The record's value is that the round happened, not that bytes are retrievable |
| R9 | Only one round per phase may be awaiting a client answer (§5.3), and draft answers (§6.6) hold a round in `SENT` for longer | A studio running CD area by area could be blocked from sending the bedroom set while the kitchen set is still being answered. Collecting feedback over days widens that window rather than narrowing it | Unproven, and knowingly widened by D32. The workaround is to commit the pending answer first. This is the first constraint to revisit if area-parallel review turns out to be routine |
| R8 | Derived participants (§10) means a new project shows nobody until something is assigned | May read as a bug rather than a fact | `lead_user_id` can be set at creation |

## 15. First-release scope correction

The rebuild scope includes first-class Requirements, project-owned Product
Catalogue/Schedule, and MOM, but their later recovery modules are not activated
by this contract. Brands is the only Master Data read. Product Catalogue belongs
to its Project; the historical R7 global reuse pool is discarded only in a
separately approved safe cutover. MOM and Schedule are reached from Project
detail under their own contracts. SketchUp exchange, global/general temporary
collaboration, client-facing links, the `LINKED` treatment and its Google Drive
archive, project archival with retention manifest, and legacy data migration
remain deferred. Activity Center is the one `Today` aggregate over
project-owned work; Upcoming is a separately deferred planning surface, not a
second task system.

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
| Drop `.skp` with no storage available | Round opens, phase advances, standard name shown for copying; nothing uploaded and no error |
| Replace the working file twice in one draft | Still one round; displays `D1.2`; previous working files superseded, none of them sent |
| Sent layout PDF | Lives once in the Layout folder, marked sent in `Layout 1`; appears under "sent" without being copied anywhere |
| Render export and internal deck | Filed in the 3D folder, never marked sent, never counted as a deliverable |
| Mark a candidate file but do not send | Round state unchanged; only Send closes a round |
| Studio adds a phase to the template | New projects get it with its folder and round prefix; running projects unchanged |
| Phase with `has_rounds = false` | Explicit start/finish/reopen only; no round, no numbering, no fictional review |
| Feedback arrives Monday, Wednesday, Thursday | Draft answer collects all three; round stays `SENT` and its age keeps counting; committing once opens exactly one next draft |
| Draft answer never committed | Phase stays `WAITING_CLIENT`; closure refused; no round opened |
| Internal approval required but missing | Send warns and proceeds; the round carries no approval record |
| Internal approval never used | No trace anywhere; no phase state changes |
| Designer with eight projects opens the app | One list answers what is waiting on them, without opening any project |
| D2 sent, then D3 sent | D1's bytes released, D2's kept as latest sent, D3 kept as current; all three records intact with their answers |
| Ask for a released file | The record, dates and client answer are shown; the app states plainly that the bytes live on the studio's machines |
| Fifteen files dropped at once | Classified on one screen; ambiguous ones land in the unsorted tray, already recorded |
| A hundred files dropped to unsorted | No round opens, no phase moves. Sorting one into a phase folder is what opens a round |
| Object delete fails during release | The send still succeeds; the record reads released; the orphan object is logged and never read |
| Naming template references an unknown token | Rejected when the template is saved, never at drop time |
| Draft answer on a round that is then stopped | Draft discarded silently; nothing audited, because nothing was recorded |

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
