# StudioFlow — Contract Index and Shared Rules

Status: **PRD index revised under owner request, 2026-09-08 — not an executable work order**

Authority: owner decisions locked in the StudioFlow contract sessions of
2026-09-07/08, reconciled with
[`STUDIOFLOW-LEGACY-AUDIT-ROADMAP.md`](../STUDIOFLOW-LEGACY-AUDIT-ROADMAP.md)
and [`PLATFORM-ASSET-STORAGE-ROADMAP.md`](../PLATFORM-ASSET-STORAGE-ROADMAP.md).
Legacy code at the recorded audit commit is behavioral evidence only. The
uncommitted StudioFlow scaffold in this checkout is owner work-in-progress and
is **superseded by these contracts**; it is not implementation authority.

This index answers Gate 0 of the legacy audit roadmap. It does not authorize
code.

## 1. Application audience and purpose

StudioFlow is the studio's project workspace: a project moves through design
phases, each phase produces numbered iterations, and iterations are what the
client actually receives and responds to.

Its design goal is **the removal of duplicated bookkeeping**. Legacy required
the owner to restate facts the system could already observe — that a design had
been sent, that it was the third round, that a phase was now under review. In
this rebuild, workflow state is a consequence of work that already happened.
People record start, send, client answer, and scope completion. The service
maintains numbering and status summaries (project contract §4–6).

StudioFlow is restricted to studio staff. Clients have no account and no login;
they are records, not users.

## 2. Active contracts

| Contract | Owns |
|---|---|
| [`studioflow-project-contract.md`](studioflow-project-contract.md) | Client, Project, Phase, Iteration, client review exchange, tasks, assets, and how people reach a project — one workflow contract |
| [`studioflow-schedule-contract.md`](studioflow-schedule-contract.md) | Deferred Library and Product Schedule brief; decisions remain open |
| [`studioflow-mom-contract.md`](studioflow-mom-contract.md) | Deferred Minutes of Meeting brief; decisions remain open |

Schedule and MoM are owner-confirmed for the product, but neither has an approved executable contract
and neither enters the first release.

## 3. Permission vocabulary

This table is the eight-permission vocabulary for the project-workflow slice,
not an exhaustive list of future StudioFlow permissions. Schedule proposes
`studioflow.schedule.manage/confirm`; MoM proposes `studioflow.mom.manage/issue`.
Those four remain unregistered until their domains are approved and activated.
StudioFlow owns its vocabulary and app-domain guards; Core owns grant mechanics. It declares no
business roles. There is no `DIC`, `DRIC`, `ESTIMATOR`, or `STAFF` enum
anywhere in StudioFlow — the legacy `Role` enum is **PURGE**. Which persisted
RBAC role holds which permission is configured in the platform, not in this
app.

| Permission | Grants |
|---|---|
| `studioflow.access` | Open the application |
| `studioflow.project.read` | See projects, phases, iterations, tasks, and assets |
| `studioflow.project.manage` | Create and edit Clients and Projects |
| `studioflow.project-deletion.approve` | Reserved approval grant; destructive workflow deferred pending StudioFlow retention/deletion policy |
| `studioflow.iteration.manage` | Open an iteration, add and remove its assets, edit its checklist points under provenance rules |
| `studioflow.iteration.review` | Send/withdraw/stop rounds, record/correct answers, finish/reopen phases, operate Supervision |
| `studioflow.phase.override` | Close a phase by exception under project §4.5; no arbitrary state setter |
| `studioflow.task.manage` | Create, assign, complete, reorder, and delete tasks |

### 3.1 Owner-locked holder intent

Recorded so RBAC configuration can be verified against intent. This is
configuration guidance, not code:

- **Send to client** and **record the client's answer** are the same trust
  boundary — whoever owns the client relationship. Both live in
  `studioflow.iteration.review`, held by the designer and the owner.
- A drafter holds `studioflow.iteration.manage` and `studioflow.task.manage`
  but **not** `studioflow.iteration.review`. This is how the legacy DIC/DRIC
  split survives: as two permissions, not as a role enum.
- `studioflow.project.manage` is held by admin and by any role the owner
  grants it to.

### 3.2 There is no project-scoped authorization

Access is decided by two things only: the persisted RBAC role a user holds, and
the pages that role can reach. A user holding `studioflow.iteration.review` may
act on any project they can read. **StudioFlow stores no membership, team, or
per-project access table.** Owner decision 2026-09-08.

Rationale: a membership row would carry no authorization meaning, and the audit
roadmap warns that per-context guard exceptions accumulate into exactly the
coupling this rebuild removes. If the studio later needs project-scoped
restriction, it is added as one documented policy in the application service,
never as scattered guards.

"Whose desk is this on" is a different question, and the work already answers
it through assignment:

| Question | Answered by |
|---|---|
| Who is accountable for the project? | `Project.lead_user_id` |
| Who is holding this round? | `Iteration.assignee_id` |
| Who owes this task? | `Task.assignee_id` |

All three are plain references to the platform `User` table. Nothing further is
stored, so nothing can drift out of step with the work itself.

This is also how the legacy DIC/DRIC split survives without a role enum: a
drafter is whoever is assigned a CD iteration.

## 4. Cross-application boundaries

StudioFlow follows the platform dependency law: `app -> platform` and
`app -> other-app/public` only. No cross-schema foreign key ever crosses an app
boundary.

- **Master Data.** StudioFlow reads the brand catalog through the Master Data
  public read port, read-only. This is used by Library/Schedule only, and is
  therefore inactive until the Schedule contract exists. Any catalog fact whose
  later edit must not rewrite project history is snapshotted as a plain value
  at the moment of selection.
- **BQ.** No relationship in either direction. BQ reads Master Data pricing on
  its own. A StudioFlow project and a BQ project are unrelated records and are
  not linked, joined, or synchronized.
- **Client is StudioFlow-owned.** A StudioFlow `Client` is not a Master Data
  Party and never references one. Master Data Party models supply and vendor
  relationships; the two vocabularies are not merged.

## 5. Storage dependency — blocking

StudioFlow assets cannot be implemented until the platform storage capability
exists **and is extended**. The current
[`PLATFORM-ASSET-STORAGE-ROADMAP.md`](../PLATFORM-ASSET-STORAGE-ROADMAP.md) is
written for exactly one consumer, the public Brand mark: PNG only, at most
2 MB, anonymous read. Every one of those properties is wrong for StudioFlow.

StudioFlow requires, and the storage roadmap must be amended to provide:

| Need | Brand mark today | StudioFlow requirement |
|---|---|---|
| Visibility | Public anonymous read | **Private.** Access only through short-lived server-issued signed URLs, authorized per request |
| Formats | PNG only | `.skp`, `.dwg`, `.dxf`, PDF, and common image formats |
| Size | ≤ 2 MB after preparation | Large binaries; a working SketchUp model is routinely in the hundreds of MB. Needs a resumable or direct-to-storage upload path, not an in-memory request body |
| Preparation | Browser crop and compress | **None.** A CAD or model file must arrive byte-identical; checksum is recorded at upload |
| Lifecycle | Replace and delete | Retention tied to project archival, per the project contract |

This matches the storage roadmap's own rule: *"Future consumers must declare
their allowed formats, dimensions, retention, access model, and lifecycle
separately."* Section 5 is that declaration.

**Owner sequencing decision (2026-09-08):** platform asset storage is completed
first, including the private-object capability above. StudioFlow contracts are
written in parallel and do not wait. No StudioFlow upload code begins before
the storage port exists. Local filesystem upload is **PURGE** and is never
reintroduced — the production runtime is Vercel and its filesystem is not
durable.

## 6. Deferred, with reasons

Documented deferral is routing memory, not scope. No code, folder, dependency,
or placeholder export is created for anything below.

| Deferred | Reason |
|---|---|
| Library and Product Schedule | Needs its own contract per the audit roadmap: stable item identity, ordering, option approval, and immutable catalog snapshots |
| Minutes of Meeting | Its own module once the project surface is proven in real use |
| SketchUp plugin exchange | An authenticated, idempotent integration with retry and reconciliation. No plugin endpoint enters the first release |
| Checklist templates and template-seeded requirements | Legacy root checklists were template requirements users could not create. Reintroduce only if a confirmed workflow needs them |
| Cross-project Today / Upcoming feeds | Built on the same read model once the single project surface is proven |
| Legacy data migration | The rebuild starts from zero. No connection to legacy PostgreSQL, ever |

## 7. Remaining open decisions

1. **Project archival and retention.** Legacy specified a `FINAL` flag with a
   destructive manifest step. Not yet decided for the rebuild, and required
   before assets ship.
2. **Client-facing delivery.** Whether an asset marked `EXTERNAL` is ever
   exposed through a link the client can open, or whether files always leave
   the studio by other means. Affects the storage access model.
3. **Supervision:** resolved for this PRD in project §4.4: explicit start,
   finish, and reopen; tasks do not derive state. Revisit only with evidence.
