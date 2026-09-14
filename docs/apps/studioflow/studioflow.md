# StudioFlow — Contract Index and Shared Rules

Status: **ACTIVE CONTRACT INDEX — implemented project-workflow, Library, MOM
and Product Catalogue slices reconciled through R7.55; pinned recovery discovery
is complete in R8.48; remaining work is tracked in
[`../../roadmap.md`](../../roadmap.md)**

Authority: owner decisions locked in the StudioFlow contract sessions of
2026-09-07/08, reconciled with
[`STUDIOFLOW-LEGACY-AUDIT-ROADMAP.md`](STUDIOFLOW-LEGACY-AUDIT-ROADMAP.md)
and [`PLATFORM-ASSET-STORAGE-ROADMAP.md`](../platform/PLATFORM-ASSET-STORAGE-ROADMAP.md).
Legacy code at the recorded audit commit is behavioral evidence only. The
uncommitted StudioFlow scaffold in this checkout is owner work-in-progress and
is **superseded by these contracts**; it is not implementation authority.

The current pinned recovery evidence and decision register are in
[`D-SF-RECOVERY-DISCOVERY.md`](D-SF-RECOVERY-DISCOVERY.md). It completes the
read-only D-SF gate but does not activate an implementation slice.

This index began as Gate 0 of the legacy audit roadmap. It now governs the
implemented slices together with current owner instructions and the alignment
artifact; it does not activate roadmap-only features by itself.

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

### 1.1 Existing rebuild foundation is the implementation base

Owner direction, 2026-09-08: rebuild StudioFlow's aligned and optimized business
logic on the Core Foundation, Utilities, and UI Engine already built here.
Legacy is evidence for useful outcomes, never the source for a second shell,
identity system, DB runtime, audit system, or set of UI primitives.

The checked reuse/ownership map is in project contract §13.0. Every future work
order follows it: reuse existing mechanisms, keep business decisions app-owned,
and extend shared capabilities only for a proven gap. Master Data and BQ remain
protected existing consumers. This direction changes PRD alignment only and
activates neither app execution nor a new foundation build.

## 2. Active contracts

| Contract | Owns |
|---|---|
| [`studioflow-project-contract.md`](studioflow-project-contract.md) | Client, Project, Phase, Iteration, client review exchange, tasks, assets, and how people reach a project — one workflow contract |
| [`studioflow-schedule-contract.md`](studioflow-schedule-contract.md) | Owner-approved Brands, StudioFlow-owned Product Catalogue, and project Schedule contract; Product Catalogue is implemented in R7.53 and Schedule remains unactivated |
| [`studioflow-mom-contract.md`](studioflow-mom-contract.md) | Owner-approved project-owned Minutes of Meeting contract; executable work order remains deferred |

The R7.53 global Product Catalogue implementation is retained as historical
implementation evidence, not recovery authority: D-SF found project-scoped
legacy product/schedule records. Its existing-data treatment needs Planner
decision D-SF-04 before SF-C. Project Schedule/FFNI remains unactivated;
project-owned MOM is implemented in R7.52.

## 3. Permission vocabulary

This table is the registered vocabulary: the project-workflow grants, the
Product Catalogue write grant activated in R7.53, and the MOM grants activated
in R7.52. Schedule still proposes `studioflow.schedule.confirm`, which remains
unregistered until Project Schedule/FFNI is activated (KB-003).
StudioFlow owns its vocabulary and app-domain guards; Core owns grant mechanics. It declares no
business roles. There is no `DIC`, `DRIC`, `ESTIMATOR`, or `STAFF` enum
anywhere in StudioFlow — the legacy `Role` enum is **PURGE**. Which persisted
RBAC role holds which permission is configured in the platform, not in this
app.

| Permission | Grants |
|---|---|
| `studioflow.access` | Open the application |
| `studioflow.project.read` | See projects, phases, iterations, tasks, assets, and the Product Catalogue |
| `studioflow.project.manage` | Create and edit Clients and Projects |
| `studioflow.project-deletion.approve` | Reserved approval grant; destructive workflow deferred pending StudioFlow retention/deletion policy |
| `studioflow.iteration.manage` | Open an iteration, add and remove its assets, edit its checklist points under provenance rules |
| `studioflow.iteration.review` | Send/withdraw/stop rounds, record/correct answers, finish/reopen phases, operate Supervision |
| `studioflow.phase.override` | Close a phase by exception under project §4.5; no arbitrary state setter |
| `studioflow.task.manage` | Create, assign, complete, reorder, and delete tasks |
| `studioflow.schedule.manage` | Create, edit, archive, and restore StudioFlow Product Catalogue rows |
| `studioflow.mom.manage` | Create, edit, discard a MOM draft and manage its ordered content |
| `studioflow.mom.issue` | Issue a MOM, and open a correction that supersedes an issued one |

The registered set is eleven permissions. `src/app/app-registrations.ts` is the
authority; this table must be kept equal to it.

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

- **Master Data.** StudioFlow reads only Brands through the Master Data public
  read port, read-only. The R7.53 global Product Catalogue premise is
  superseded for recovery planning by the project-scoped evidence recorded in
  `D-SF-RECOVERY-DISCOVERY.md`; the data disposition remains D-SF-04. Neither
  form reads Master Data SKU, unit, or pricing. A future schedule must copy its
  chosen specification into a project snapshot so later changes cannot rewrite
  project history.
- **BQ.** No relationship in either direction. BQ reads Master Data pricing on
  its own. A StudioFlow project and a BQ project are unrelated records and are
  not linked, joined, or synchronized.
- **Client is StudioFlow-owned.** A StudioFlow `Client` is not a Master Data
  Party and never references one. Master Data Party models supply and vendor
  relationships; the two vocabularies are not merged.

## 5. Storage — no longer on the critical path

**Owner decision, 2026-09-08.** The studio's own machines were always the real
archive for working files, and finals belong in Google Drive. The platform was
therefore never going to be the document store, and building one for files that
only pass through would be work paid for by nothing.

The project contract §8.1 splits files into three treatments:

| Treatment | Needs platform storage? |
|---|---|
| `RECORDED` — working `.skp`, `.dwg`; metadata only | **No.** Nothing is uploaded |
| `STORED` — delivered PDF, render, client survey | Yes, but only small files |
| `LINKED` — archived final on Drive | No. An external URL |

This removes the expensive requirement. Earlier drafts of this section demanded
a private large-object capability able to stream hundreds of megabytes; the
`RECORDED` treatment deletes that need, because a working model is never
uploaded at all. Rounds, phases, sending, and the whole client exchange ship
with **no StudioFlow storage whatsoever**.

What `STORED` still needs, when its work order activates, is modest and must be
verified against the port that actually exists rather than assumed from a
roadmap:

| Need | Brand mark today | `STORED` requirement |
|---|---|---|
| Visibility | Public anonymous read | **Private.** Short-lived server-issued signed URLs, authorized per request |
| Formats | PNG only | PDF and common image formats; small `.dwg` |
| Size | ≤ 2 MB after preparation | Tens of megabytes. No streaming or resumable upload needed |
| Preparation | Browser crop and compress | **None.** A drawing must arrive byte-identical; checksum recorded |

This is the declaration the storage roadmap asks every future consumer to make:
*"Future consumers must declare their allowed formats, dimensions, retention,
access model, and lifecycle separately."*

Local filesystem storage is now the approved self-hosted deployment provider,
but StudioFlow must use the shared `ObjectStorage` boundary and opaque storage
keys. Domain code must never construct absolute paths, and private project
assets must never be exposed as static/public files. A future Vercel/cloud
profile remains optional and does not change this domain contract.

### 5.1 Google Drive — contracted, deferred

Finals belong on Drive, and the `LINKED` treatment exists so that activating it
later changes no rule in §8. Two properties make Drive the natural home rather
than a workaround: it is where the studio already archives, and it is a real
filesystem, so the app can create the standard folders and write a
standard-named copy — which a browser can never do to a local disk.

Deferred, with its costs recorded honestly: one studio account rather than
personal accounts, a token that can expire, links that a person can move or
delete, and **an egress question that must be answered before it is committed** —
whether the production runtime may call Google's API at all. If it may not, the
integration has to run from the browser instead, which is a different design.

## 6. Deferred, with reasons

Documented deferral is routing memory, not scope. No code, folder, dependency,
or placeholder export is created for anything below.

| Deferred | Reason |
|---|---|
| Project Schedule / FFNI | Historical R7 schedule contract §4–§5 and the R7.53 global reuse-pool implementation are superseded for recovery scope by D-SF's project-scoped evidence. No data or schema change is authorized until D-SF-04; then a project-scoped entry/option/template work order may be written (KB-003). |
| SketchUp plugin exchange | An authenticated, idempotent integration with retry and reconciliation. No plugin endpoint enters the first release |
| Checklist templates and template-seeded requirements | Legacy root checklists were template requirements users could not create. Reintroduce only if a confirmed workflow needs them |
| Legacy's Today's View feature set — saved filters, auto-hide, event feed | The one list that replaces it ships in the first release (project contract §10.2). What stays deferred is the accumulation that made legacy's version unreadable |
| Google Drive archive (`LINKED` files) | Contracted in §5.1 so nothing must be redesigned later. Needs an egress answer and a studio account first |
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
