# Minutes of Meeting Contract — StudioFlow

Status: **OWNER-APPROVED LOGIC CONTRACT — not an executable work order**

Authority: owner clarification of 2026-09-10, reconciled with committed legacy
evidence at `5fc605e304a12db6b5efe0a2c0271a2d9415b2da`. MOM belongs only to a
StudioFlow project. It has no phase, iteration, Task, or To-do relationship.

## 1. Business purpose and boundary

A MOM is the project's written meeting record. It is available from Project
detail regardless of the project's current phase. Supervision was its common
legacy use, but that usage is not a guard and does not narrow the domain.

The boundary is deliberately small:

- `Project` owns MOM documents;
- a MOM may be created and used during any phase, including before or after
  Supervision;
- MOM does not reference `ProjectPhase`, `Iteration`, `Task`, or a client
  response;
- Task/To-do does not reference MOM;
- “Write today's MOM” may be an ordinary project To-do, but completing that
  To-do neither creates, issues, links, nor changes a MOM.

No text classification, action extraction, automatic task creation, or
“convert point to task” action belongs in this feature.

## 2. Minimum capability and legacy evidence

Legacy is the minimum functional floor. Its committed implementation contains:

```text
Project
└─ ProjectMomDocument
   └─ ProjectMomItem (ordered block)
      ├─ ProjectMomPoint[] (ordered text points)
      └─ ProjectMomImage[] (ordered images, at most two per block)
```

The route is project-scoped, every service mutation checks `projectId`, and the
schema has no phase, iteration, task, or to-do key. The rebuild must preserve at
least these useful outcomes:

- list and open project MOM documents;
- create, edit, delete, and print a document;
- edit document topic, meeting date, venue, attendees, and preparer;
- create, delete, and reorder blocks and points;
- support text-only blocks, list style, point style, and up to two ordered
  images per block;
- enforce project scope, permissions, validation, and audit for material writes.

Flattening the hierarchy or omitting image blocks would fall below legacy and
is therefore a regression unless the owner later removes that capability.

## 3. Rebuild lifecycle

The rebuild adds a safer evidence lifecycle without changing MOM ownership:

```text
DRAFT  --issue-->  ISSUED  --correct with a new document-->  SUPERSEDED
```

| State | Rule |
|---|---|
| `DRAFT` | Editable and discardable; visible only inside the studio |
| `ISSUED` | Immutable, numbered, printable meeting record |
| `SUPERSEDED` | Immutable and readable; points to the correcting MOM |

Issue is a direct, confirmed action; there is no separate internal-approval
stage. A correction creates a new MOM and preserves the old record. Drafts do
not consume a sequence number. At issue, the server assigns the next sequence
number per project and records issuer and time.

## 4. Persisted shape

### 4.1 `MomDocument`

| Field | Rule |
|---|---|
| `id` | Internal identifier |
| `project_id` | Required StudioFlow Project FK; the only business parent |
| `topic` | Required meeting topic |
| `meeting_at` | Required meeting date/time |
| `venue` | Optional place or platform |
| `attendees_text` | Optional meeting attendee text; no client account implied |
| `prepared_by_name` | Required printable preparer name |
| `state` | `DRAFT`, `ISSUED`, or `SUPERSEDED` |
| `sequence` | Null in draft; server-assigned and unique per project at issue |
| `supersedes_id` | Optional same-project MOM corrected by this document |
| `created_by`, `created_at`, `updated_at` | Standard provenance |
| `issued_by`, `issued_at` | Set once at issue |

There is intentionally no `phase_id`, `iteration_id`, `task_id`, or
`linked_task_id`.

### 4.2 `MomItem`

An ordered content block belonging to one document. It stores `sort_order`,
`is_text_only`, and `list_style`. Identity is the internal id; ordering is not
an identity or uniqueness mechanism.

### 4.3 `MomPoint`

An ordered text point belonging to one item. It stores `sort_order`, `text`,
and the supported presentation `style`. It does not carry action kind, owner,
due date, decision state, or task linkage.

### 4.4 `MomImage`

An ordered image belonging to one item. Each item supports at most two images,
matching legacy. Images use the canonical shared image workspace and the
approved `STORED` file treatment; do not create a MOM-local crop, annotation,
upload, or storage implementation.

## 5. Project surface and interactions

Project detail exposes a MOM section and document list. It is not nested under
Supervision or any other phase. A document editor supports the complete ordered
content structure, autosave or explicit save with clear pending/error state,
destructive confirmation, and unsaved-input protection.

An issued MOM has a print view containing project identity, topic, meeting
date, venue, attendees, preparer, ordered content and images, sequence, and
issue stamp. Sending remains outside the app: the studio may print or export
and use its normal channel. MOM is not silently converted into a deliverable or
client response.

## 6. Access and audit

| Action | Permission |
|---|---|
| Read and print | `studioflow.project.read` |
| Create/edit/discard a draft and manage ordered content | `studioflow.mom.manage` |
| Issue or supersede | `studioflow.mom.issue` |

Both MOM-specific permissions remain deferred until an executable MOM work
order activates them. Material document, block, point, image, issue, supersede,
and delete actions are audited. Project scope is checked on every read and
mutation; child ids are never trusted without resolving their owning project.

## 7. Dependencies and isolation

MOM consumes Core identity/audit and canonical UI Engine controls. Image work
depends on the shared image workspace tracked by KB-004. It has no Master Data,
BQ, Product Catalogue, Schedule, phase, iteration, or task dependency.

## 8. Legacy classification

| Legacy behavior | Disposition | Rebuild destination |
|---|---|---|
| Project-owned MOM route and service scope | **KEEP** | §1, §5–6 |
| Document → ordered item → ordered point/image hierarchy | **KEEP** | §2, §4 |
| Text-only/list/point styles and two images per item | **KEEP** | §2, §4 |
| Create, edit, delete, reorder, and print | **KEEP** | §2, §5 |
| Common use during Supervision | **KEEP as usage, PURGE as guard** | Available at every project phase (§1) |
| Editable historical record | **FIX** | Issue/supersede lifecycle (§3) |
| Local MOM-specific image implementation | **MERGE** | Canonical shared image workspace (§4.4) |
| MOM-to-Task or MOM-to-Iteration behavior | **PURGE as invented scope** | No such legacy relation and no owner requirement (§1) |

## 9. Acceptance scenarios

| Scenario | Required observable result |
|---|---|
| Open MOM in any project phase | Same project MOM surface is available; no phase or Supervision guard |
| Create a MOM | Project-scoped draft starts with an editable ordered block and point |
| Reorder rich content | Blocks, points, and up to two images per block retain the chosen order |
| Cross-project child id is submitted | Mutation is refused before any write |
| Issue a MOM | Sequence and issue stamp are assigned atomically; document becomes immutable |
| Correct an issued MOM | New document references the old; old document remains readable and superseded |
| Print an issued MOM | Complete project and meeting record, ordered content, images, and issue stamp render |
| Create To-do “Write today's MOM” | Ordinary independent To-do is created; no MOM relation or side effect exists |
| Search schema and service boundaries | No phase, iteration, task, client-response, Master Data, or BQ dependency exists |

## 10. Locked owner decisions

1. MOM is project-owned and usable during every phase; Supervision is not a
   guard.
2. MOM and Task/To-do are independent. No conversion, link, or automatic write
   exists in either direction.
3. The legacy ordered document/block/point/image capability is the minimum.
4. Image support is required and reuses the shared image workspace.
5. Issue is direct with confirmation; no separate approval stage is added.

No product decision remains open before a navigator writes the executable MOM
work order. Storage activation for `STORED` images and KB-004 still remain
technical dependencies and must not be reported as passed before verification.
