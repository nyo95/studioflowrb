# Minutes of Meeting Contract — StudioFlow

Status: **OWNER-APPROVED LOGIC CONTRACT — not an executable work order**

Authority: owner confirmation that MoM belongs to StudioFlow and is tied to a
project, reconciled with the shared rules in [`studioflow.md`](studioflow.md) and
the conventions of the project contract. Legacy code at the recorded audit commit
is behavioral evidence only.

## 1. Business purpose and users

A MoM is the studio's written account of what was agreed in a meeting, in a form
that can be sent to the client and referred back to when a decision is later
disputed.

| User | Need |
|---|---|
| Designer / owner | Record decisions and actions during or right after a meeting |
| Client | Receive a clean, printable record of what was agreed |
| Drafter | See what was decided without having attended |

## 2. The governing principle

**Its value is evidentiary, and that single property drives every rule below.**

A record whose purpose is proof loses that purpose the moment it can be edited
after the fact. Legacy allowed editing after issue, so a legacy MoM proves only
what someone last typed — not what was agreed. That is **FIX**, and it is the one
substantive change this contract makes to legacy behaviour.

The same reasoning already governs client answers (project contract §6.1). MoM
follows it rather than inventing a second immutability model.

## 3. Lifecycle

```
DRAFT  ──issue──►  ISSUED  ──superseded by a later MoM──►  SUPERSEDED
```

| State | Rules |
|---|---|
| `DRAFT` | Freely editable. Not part of the record. Visible only inside the studio |
| `ISSUED` | **Immutable.** Sequence number assigned. This is the document |
| `SUPERSEDED` | Still readable, marked corrected, and pointing at the MoM that replaced it |

**Issuing is the only irreversible act.** Before it, the document is working
text; after it, nothing in it changes, ever.

A correction is a **new MoM that references the one it corrects**, exactly as a
corrected client answer is a new response rather than an edit (project contract
§6.5). The superseded document is never deleted or rewritten — a dispute is
usually about precisely the version someone would be tempted to tidy away.

A `DRAFT` may be discarded and is not audited: it recorded nothing.

### 3.1 Numbering

`sequence` is assigned by the server at issue, gapless per project, starting at
1. It is never typed, never reused, and never held by a draft — the same rule as
round numbering (project contract §5.3), for the same reason.

A draft that is never issued therefore consumes no number.

## 4. Fields

### 4.1 `MomDocument`

| Field | Type | Rule |
|---|---|---|
| `id` | UUID | Primary key |
| `project_id` | FK → Project | Required |
| `sequence` | Int? | Assigned at issue; null while `DRAFT`. Unique per project |
| `state` | Enum | `DRAFT` / `ISSUED` / `SUPERSEDED` |
| `meeting_at` | DateTime | When the meeting happened — not when the document was written |
| `location` | String? | Where, or the platform used |
| `title` | String | What the meeting was about |
| `iteration_id` | FK → Iteration? | Optional. The round this meeting reviewed (§6) |
| `supersedes_id` | FK → MomDocument? | Set when this document corrects an earlier one |
| `issued_by` / `issued_at` | User / DateTime | Set at issue; immutable |
| `created_by` / `created_at` / `updated_at` | | Standard |

`meeting_at` is separate from `issued_at` on purpose: minutes are routinely
written the next morning, and conflating the two would misdate the evidence.

### 4.2 `MomAttendee`

| Field | Type | Rule |
|---|---|---|
| `mom_id` | FK → MomDocument | Required |
| `user_id` | FK → User? | Set for studio staff |
| `external_name` | String? | Set for anyone else |
| `organisation` | String? | Optional, for external attendees |

Exactly one of `user_id` / `external_name` is set. Clients have no accounts
([`studioflow.md`](studioflow.md) §1), so they are always external names — this
is not a gap to be closed later by inviting them.

### 4.3 `MomPoint`

| Field | Type | Rule |
|---|---|---|
| `id` | UUID | Primary key |
| `mom_id` | FK → MomDocument | Required |
| `sort_order` | Int | Manual ordering |
| `text` | String | What was discussed |
| `decision` | String? | What was agreed, when anything was |
| `kind` | Enum | `INFO` / `DECISION` / `ACTION` |
| `owner_user_id` | FK → User? | For `ACTION`, who owes it |
| `owner_external` | String? | For `ACTION` owed by the client or a third party |
| `due_date` | DateTime? | For `ACTION` |
| `linked_task_id` | FK → Task? | Set when an action was turned into a task (§5) |

Legacy's four-level `ProjectMomDocument` → `ProjectMomItem` → `ProjectMomPoint`
→ `ProjectMomImage` hierarchy is **MERGE** to these two levels. The middle level
grouped points into sections, and the audit shows no evidence that a real meeting
record needed it. A third level returns only when a meeting cannot be written
without one.

Images attach to points and obey the file rules in project contract §8. MoM
images are small and are `STORED`; they are not a reason to wait for anything.

## 5. Action items become tasks — explicitly

An `ACTION` point may be turned into a StudioFlow `Task` with one action, which:

- creates the task with the point's text, owner and due date;
- sets `linked_task_id` on the point;
- changes nothing else.

**It is never automatic.** A meeting produces many sentences that sound like
actions and are not, and silently generating tasks from them would fill the
project with work nobody committed to.

The link is one-directional and informational: completing the task does not
alter the MoM, and it must not — the MoM records what was agreed, not what later
happened. Issuing a MoM does not require its actions to have tasks.

This is the only write path from MoM into the project core, and it exists
because retyping an agreed action is exactly the duplicated bookkeeping this
rebuild removes.

## 6. A meeting is where client feedback usually happens

When a MoM is linked to a round (`iteration_id`), its points may be **offered**
as that round's client answer, opening the draft-answer flow (project contract
§6.6) pre-filled with the selected points.

The person chooses which points are feedback, and the outcome — approval or
revision request. Nothing is inferred from the text.

The response chain remains the sole authority on what the client answered. A MoM
does not become a response, and a response does not edit a MoM. They are two
records of one conversation, deliberately kept separate: the MoM is what the
meeting was, and the response is what the studio must now do about it.

Without this, a designer who runs a client meeting types the same five points
twice.

## 7. Print and send

An issued MoM has a print view: project identity, meeting date, attendees,
numbered points with decisions, and the issue stamp.

The studio sends it by whatever channel it already uses. If the studio wants to
record that it went out as a project deliverable, the exported PDF is dropped
like any other file and marked sent on a round (project contract §8.3). MoM
itself has no separate delivery mechanism and no client-facing link.

## 8. Access

| Action | Permission |
|---|---|
| Read | `studioflow.project.read` (reuse) |
| Create and edit a draft, discard a draft | `studioflow.mom.manage` |
| Issue — make immutable | `studioflow.mom.issue` |
| Turn an action point into a task | `studioflow.task.manage` |
| Offer points as a client answer | `studioflow.iteration.review` |

`mom.issue` is separate from `mom.manage` because issuing is irreversible and
client-facing — the same trust boundary as `iteration.review` and
`schedule.confirm`. A studio may grant all three to the same people; that is
RBAC's decision, not this contract's.

Both permissions are **deferred** and are not registered with the first release
([`studioflow.md`](studioflow.md) §3).

## 9. Dependencies

Core and UI Engine only. No Master Data read, no BQ relationship, and no new
shared capability: a print view is presentation, and MoM images fit the existing
`STORED` treatment.

Audited: issue, supersede, and turning a point into a task. Not audited: draft
edits, reordering, and discarding a draft — a draft records nothing.

## 10. Legacy classification

| Legacy behavior | Disposition | Destination |
|---|---|---|
| MoM as an ordered document belonging to a project | **KEEP** | §4 |
| Four-level document → item → point → image hierarchy | **MERGE** | Two levels (§4.3) |
| Editable after issue | **FIX** | Immutable once issued; corrections are new documents (§3) |
| Print view | **KEEP** | §7 |
| Action items inside MoM points | **FIX** | Explicit, never automatic, task creation (§5) |
| Separate MoM numbering conventions | **MERGE** | Server-assigned at issue, gapless per project (§3.1) |

## 11. Risks and unproven assumptions

| # | Risk or assumption | Exposure | Trigger to revisit |
|---|---|---|---|
| M1 | Immutability is assumed to be worth the friction | A typo in an issued MoM requires a whole new document | Deliberate. If corrections become frequent, the problem is that people issue too early — address that before weakening immutability |
| M2 | Two levels are assumed sufficient | A long meeting becomes a flat list of thirty points | Add sections only when a real meeting cannot be recorded without them |
| M3 | Actions are assumed to be worth linking to tasks | If nobody uses it, MoM is an island and the actions are retyped | Measure how many `ACTION` points ever gain a `linked_task_id` |
| M4 | MoM is assumed to be written soon after the meeting | Minutes written a week later misremember, and `meeting_at` makes that visible rather than hidden | Intentional: the field exposes the delay instead of disguising it |

## 12. Acceptance scenarios

| Scenario | Required observable result |
|---|---|
| Issue a MoM | Sequence assigned, document immutable, issue stamp recorded |
| Edit an issued MoM | Refused. The only path is a new correcting document |
| Correct an issued MoM | New document references the old; the old stays readable and is marked superseded |
| Draft never issued | Consumes no sequence number; discarding it is silent and unaudited |
| Action point turned into a task | Task created with text, owner and due date; point links to it; completing the task leaves the MoM untouched |
| Meeting reviewing D3 | Selected points offered as a draft answer for D3; the MoM is not itself the response, and the response does not edit the MoM |
| Client attendee | Recorded as an external name; no account is created or implied |
| Minutes written the next morning | `meeting_at` shows the meeting date, `issued_at` the writing date; both visible |
| Print an issued MoM | Renders identity, attendees, numbered points and the issue stamp |

## 13. Remaining owner decisions

1. **Does a MoM ever need studio approval before issue** — a second person
   confirming the record before it goes to the client? If yes, the optional
   internal approval pattern from project contract §6.7 applies unchanged rather
   than a new mechanism.
2. **Are MoM images common enough to matter?** If most meetings produce none,
   image support ships later and MoM has no file dependency at all.

Neither blocks the model above.
