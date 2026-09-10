# StudioFlow — Decisions, Open Questions, and Work Order Sequence

Status: **HISTORICAL PLANNING/DECISION LEDGER — implemented-state and remaining
work are tracked in `CHANGELOG.md` and [`../roadmap.md`](../roadmap.md)**

The sequence below records the original slicing and decisions. It is not the
current completion tracker and does not reactivate finished or deferred work.

Branch: all StudioFlow work happens on `studioflow/contracts` and its
successors. `main` is the production source and is not touched.

**Owner decision 2026-09-08 — the navigator owns the work-order breakdown.**
[`studioflow-implementation-plan.md`](studioflow-implementation-plan.md) is now
the authority on execution rules, phase sequence and gates. The WO-0…WO-8 sketch
in §3 below is retained as **reference only**: it records one workable slicing,
not a mandate. Where the two disagree, the implementation plan wins.

What stays authoritative in this file: the locked decision ledger (§1), the open
questions (§2), and the deploy and merge gate (§5).

## 1. Locked decisions

Owner-confirmed across the contract sessions of 2026-09-07 and 2026-09-08.
Historical decisions below remain except where amended by the R7.07 navigator
PRD review in §1.1. This is a ledger, not a second source of truth.

| # | Decision | Recorded in |
|---|---|---|
| D1 | StudioFlow owns its own `Client`. It is never a Master Data Party and never references one | project §2 |
| D2 | StudioFlow and BQ have no relationship in either direction | index §4 |
| D3 | StudioFlow reads Master Data only for Brands through the public port. Product Catalogue is StudioFlow-owned and reusable across its projects; Schedule copies independent snapshots and never reads Master Data SKU, unit, or pricing | index §4, schedule §3 |
| D4 | No StudioFlow role enum. The app owns a permission vocabulary; persisted RBAC decides who holds it | index §3 |
| D5 | Phase states reduced from seven to four | project §4.2 |
| D6 | **Internal review is not tracked.** `ON_REVIEW_INTERNAL`, `APPROVED_INTERNAL`, `READY_FOR_NEXT` are PURGE. Designer/drafter handoff is expressed by iteration assignment | project §4.2 |
| D7 | Five phases. Legacy's sixth enum value `COMPLETED` is PURGE; completion is `Project.status` | project §4.1 |
| D8 | Phases are not sequentially locked. Ordering is presentation; override is permissioned and audited | project §4.5 |
| D9 | Iterations exist in Moodboard, Layout, Design 3D, and CD. Supervision has none | project §5 |
| D10 | Iteration numbers are server-assigned and never typed. A new file does not always open a new round | project §5.3 |
| D11 | A client revision request is an immutable record plus one contracted consequence: the next iteration opens in the same transaction | project §6 |
| D12 | Open checklist points **warn** on send and never block. Tasks never block anything | project §7.4 |
| D13 | Design work is not represented as a task. The empty next iteration is the queue item | project §7.1 |
| D14 | A task's phase is never asked for at creation. Null means General, and that is a correct value | project §7.3 |
| D15 | **No membership table.** Access is persisted RBAC role plus page access. `Project.lead_user_id` and the two `assignee_id` fields reference platform `User` directly | index §3.2, project §10 |
| D16 | Legacy `pic_drafter_id` is dropped. A drafter is whoever is assigned the CD iterations | project §10 |
| D17 | ~~Platform asset storage is completed first~~ — **superseded 2026-09-08 by D21.** Storage is no longer on the critical path | index §5 |
| D18 | Virtual folders derived from metadata; no client-supplied storage path, ever | project §8.2 |

### 1.1 Second decision block — 2026-09-08, later session

| # | Decision | Recorded in |
|---|---|---|
| D19 | **Phases are not hardcoded.** A studio phase template is snapshotted per project; editing it never rewrites a running project | project §4.1 |
| D20 | `has_rounds` on the template replaces the hardcoded Supervision exception. A phase without rounds is an ordinary template choice, not a special case in code | project §4.1, §4.4 |
| D21 | **Three file treatments.** `RECORDED` holds metadata only and needs no storage, so the entire workflow ships without any platform storage. This supersedes D17 | project §8.1, index §5 |
| D22 | **The `OUT` folder is PURGE.** Whether a file left the studio is a link to the round it was sent in, not a place it is copied to | project §8.3 |
| D23 | The `audience` field is PURGE — it stated the same fact as the send link | project §8.3 |
| D24 | **A drop never closes a round; only Send does.** A drop may open one. Two closers would eventually disagree | project §8.3 |
| D25 | Working revisions (`D1.1`, `D1.2`) do not consume a round number. One current working file per round; sent files are never superseded or released | project §5.4, §8.6 |
| D26 | A browser cannot rename a file on the studio's disk. For `RECORDED` files the app shows the standard name to copy and never claims to have renamed anything | project §8.5 |
| D27 | **A schedule template carries the studio's actually chosen products**, not empty category rows. Legacy's row skeleton is why the feature went unused | schedule §2 |
| D28 | Google Drive is the archive for finals, contracted as the `LINKED` treatment and deferred. Its egress question must be answered before it is committed | index §5.1 |
| D29 | Ordering is a `sort_order` field, never a numeric prefix inside a folder name | project §8.2 |
| D30 | A task may carry an attachment as evidence of internal work. It is never a deliverable; only a send makes a file something that left the studio | project §7.3 |

### 1.2 Third decision block — 2026-09-08, user-testimony review

Written after walking the contract as the designer who must use it daily.

| # | Decision | Recorded in |
|---|---|---|
| D31 | **"What is waiting on me" across projects ships in the first release.** One read model, no new table or field. Legacy's Today's View feature set stays deferred | project §10.2 |
| D32 | **A client answer may be collected as a draft and committed later.** Feedback arrives over days; a model accepting only one instantaneous answer forces early commitment or silence | project §6.6 |
| D33 | **Internal approval returns as an optional record, never a state.** Legacy's error was making it mandatory, not recording it. `requires_internal_approval` per phase makes its absence meaningful only where the studio wants it to be | project §6.7, §4.1 |
| D34 | The next file's standard name is offered **before the file exists**. Designers name at Save As; requiring a drop to learn the name inverts the order | project §8.5 |
| D35 | **No drop asks "internal or external".** The answer already follows from §5.3. A drop of an already-sent deliverable may complete the send in the same dialog | project §8.7 |
| D36 | **Bulk intake and an unsorted tray.** Tidying filing is why the app exists; if filing here is harder than leaving files in a chat thread, it has failed | project §8.8 |
| D37 | **Bytes are released; records never are.** At most two files per phase hold bytes — the current one and the latest sent. Evidence in a dispute is the response chain, not the bytes. Supersedes the earlier rule that sent files are never released | project §8.6 |
| D38 | Every dropped file creates a permanent record. This is a filing system, not a file store | project §8 |

### 1.1 R7.07 navigator PRD amendments — requested 2026-09-08

The owner requested logic review and PRD updates only. No implementation order
is activated; these amendments supersede conflicting wording in D5/D6/D8/D11/D12.

| Concern | Current decision |
|---|---|
| L1 | Immutable replacement answers with reasons; retain all successor work (§6.5), never delete a response through unsend |
| L2 | Four phase states plus explicit scope closure; normal Supervision actions; replace arbitrary override with exceptional closure |
| L3 / Q2 | Start/upload/revision share one draft resolver; at most one draft and one pending client send |
| L4 | Approval belongs to the round; finish belongs to the phase; optional explicit finish in approval dialog, no extra phase enum |
| L5 | Active and app-readable users only for new assignments; unavailable existing assignments remain visible in Needs assignment |
| L6 | Work items warn, never block; state, access, lifecycle, and concurrency guards still apply |
| L7 | Immutable client-point source and original wording; reasoned withdrawal, no hard delete |
| L8 | Project commercial status and phase completion have distinct labels |
| L9 | Eight first-slice permissions; four Schedule/MoM proposals remain deferred |

The interpretation of legacy `READY_FOR_NEXT` is not proven by its name.
Preserve its possible useful scope distinction via the current model, rather
than asserting equivalence to internal approval. Recorded audit only was read;
no legacy checkout or database was accessed in this PRD session.

Before activating implementation, lock persistence details, dependency versions,
and a target revision against the actual repository. The outline below is not
that executable work order. Project §16 supplies required acceptance scenarios.

### 1.2 R7.08 owner direction — foundation consumption

This is an app rebuild on the existing Core/Utilities/UI Engine, not another
foundation project. Project contract §13.0 names the checked existing surfaces.
All outlines below inherit that map. Before execution, each work order includes:

1. exact existing shared imports and their consuming app paths;
2. aligned app rules and retained legacy outcomes to verify;
3. REUSE / EXTEND / ADD / APP-OWNED / PURGE for each required capability;
4. a narrow shared delta only when a proven gap prevents the approved workflow;
5. app scenario checks, applicable shared/consumer regression checks, and real
   UI acceptance under the existing design and shell.

WO-1 means registration/navigation integration into the existing shell, not
building auth, access administration or another app frame. WO-2 onward uses the
existing DB, transaction, audit, errors, validation and UI surfaces. Revisit the
outline against actual code at activation; do not create placeholder service
layers simply because a path appears in the outline. Storage remains separately
blocked. No foundation reimplementation, dependency upgrade, or executor work
is authorized by this amendment.

## 2. Open questions

### 2.1 Formerly blocking — both now answered

**Nothing in this section blocks work any more.** Kept as a record of what was
asked and how it was settled.

| # | Question | Blocks |
|---|---|---|
| Q1 | **Answered 2026-09-08: the local database is the target.** Work proceeds locally; nothing is blocked. The remaining question — which database a Vercel preview of this branch points at — belongs to the deploy gate (§5) and is not needed to build | Nothing |
| Q2 | **Resolved by R7.07 PRD:** explicit Start round uses the same draft resolver as upload/revision | No longer a product blocker; work-order activation still required |

### 2.2 Needed before the domain they govern

| # | Question | Blocks |
|---|---|---|
| Q3 | Project archival and retention. Much reduced by the file decision — `RECORDED` files hold no bytes to purge. What remains is `STORED` files and how long a closed project keeps them | `STORED` files only |
| Q4 | **Reshaped by the 2026-09-08 file decision.** Files leave the studio by the channels the studio already uses; the app records that they did. What remains is whether the Google Drive archive (`LINKED`) is activated, and whether production egress may reach Google's API at all | Drive work only; nothing in the core |
| Q5 | **Resolved by R7.07 PRD:** Supervision uses explicit start/finish/reopen, never task-derived state | No longer a product blocker |
| Q6 | Schedule: entry scoped to phase or project; whether clients genuinely choose among options; what a position's identity is | Schedule domain entirely |
| Q7 | **Resolved 2026-09-10:** MOM is project-owned and has no relationship to Task/To-do, phase, or iteration. “Write today's MOM” is only an ordinary independent To-do | No longer a product blocker; shared image/storage dependencies still apply |

### 2.3 Process

| # | Question |
|---|---|
| Q8 | Do these contracts land on `main` as documentation (the R7.05 precedent for the legacy audit), or stay on the StudioFlow branch until the app merges? |

## 3. Work order sequence *(reference sketch — the navigator decides the real slicing)*

Each work order is a vertical slice: schema, service, route, and tests together.
Each is independently reviewable and safe to merge. None may exceed its scope.

---

### WO-0 — Confirm the local target *(answered; no work pending)*

**Owner decision 2026-09-08: build locally first.** Deployment and merge are a
later gate (§5), not a precondition.

**State, checked at rebuild commit `db79fe6`.** Development runs against a local
PostgreSQL — `localhost:5433/studioflow_rebuild` — holding the `platform`,
`master_data` and `bq` schemas. The owner keeps one such database at home and
another at the office; their contents differ and neither is production.

StudioFlow adds a **fourth schema**, `studioflow`, exactly as `bq` was added.
Purely additive: no object in another schema is created, altered or dropped, and
the dependency law already forbids a foreign key crossing between them.

**Acceptance.** The first migration creates only `studioflow` objects.
`git diff` on the migration shows no `platform`, `master_data` or `bq` identifier
outside a comment.

**Migration impact.** The first StudioFlow migration lands here, in the local
database. That is approved.

**Blocked by.** Nothing. Local isolation already exists because it is a different
machine from production.

---

### WO-1 — App registration and shell

**Scope.** Register `studioflow` with its eight project-workflow permissions
([`studioflow.md`](studioflow.md) §3). Add the route group, nav, and a project
list page that renders empty state and enforces `studioflow.access`. No domain
tables.

**Files.** `src/app/app-registrations.ts` (additive entry only),
`src/app/(platform)/layout.tsx` (one conditional nav line),
`src/app/(platform)/studioflow/*`, `src/apps/studioflow/{service,runtime,public}`.

**Acceptance.** A user without `studioflow.access` cannot reach `/studioflow`. A
user with it sees an empty project list. Master Data and BQ navigation and
behavior are unchanged. The eight permissions appear in the platform registry
and are assignable to a role.

**Test plan.** Permission-denied and permitted route tests. Registry
registration test. Regression: existing Master Data and BQ route tests pass
unchanged.

**Migration impact.** None — the permission registry is seeded through the
existing platform mechanism, not a StudioFlow schema change.

---

### WO-2 — Client and Project

**Scope.** `SfClient` and `SfProject` per project contract §2 and §3. Client
CRUD, project create/list/detail. Creating a project seeds its five phases in
the same transaction. Server-generated immutable project `code`.

**Files.** `prisma/schema.prisma` (additive, `studioflow` schema only), first
StudioFlow migration, `src/apps/studioflow/*`, project and client routes.

**Acceptance.** Creating a project yields exactly five phases in contract order,
all `NOT_STARTED`. `code` is unique, server-generated, and rejected if supplied
by the client. A Client with live Projects cannot be archived. Audit events are
written for project create and edit.

**Test plan.** Phase seeding invariant. Code uniqueness under concurrent create.
Client archive guard. Permission tests per access matrix (project §12).
Boundary test: no foreign key from `studioflow` into `master_data` or `bq`.

**Migration impact.** **First migration.** Creates the `studioflow` schema and
Client, Project, and Phase tables (including state and closure metadata). Purely additive; touches no Master Data or BQ object. Requires WO-0.

**Blocked by.** Q1 (via WO-0).

---

### WO-3 — Iteration and derived phase state

**Scope.** `SfIteration` per project contract §5, **plus `RECORDED` files**
(§8.1–8.7): folder template, drag-drop registration, standard naming, working
revisions (`D1.1`), and supersession. Recording needs no storage, so it belongs
here rather than in a blocked later slice. The numbering rule (§5.3), the
explicit open action (§5.3), and service-maintained phase state (§4.3). Supervision actions, reopening, and
exceptional closure with reason and audit (§4.3–4.5). Normal deliverable-phase
closure ships in WO-4 with real client approval; do not fabricate an approval
endpoint or persisted response in this slice.

**Files.** Schema (additive), migration, `src/apps/studioflow/*`, phase and
iteration routes.

**Acceptance.** Numbers are gapless per phase and rejected when client-supplied.
Phase summary follows §4.3 for states reachable in this slice. Pending-send
precedence and approval closure are accepted with the real exchange in WO-4.
Supervision follows §4.4.
Exception closure obeys §4.5. Labels render per §5.2.

**Test plan.** Numbering under concurrent opens on the same phase. The rule's
negative property: repeated opens against a `DRAFT` iteration do not advance the
number. Dropping a `.skp` with no storage configured opens the round and records
the file without error; replacing a working file twice yields `D1.2` and one
current file; a drop never changes round state (§8.3).
Projection and closure invariants after every transition; review
permission for ordinary closure, override permission for exception closure.
Include applicable project §16 scenarios and disabled-user assignment recovery;
client-exchange scenarios run in WO-4, Task scenarios in WO-5/6.

**Migration impact.** Additive: Iteration table; Phase state/closure were introduced in WO-2.

**PRD decision.** Q2 resolved in §1.1; activation still requires an explicit work order.

---

### WO-4 — The client review exchange

**Scope.** `SfIterationResponse` (including draft answers, §6.6),
`SfIterationPoint`, and the optional internal approval record (§6.7) per project
contract §6 and §7.2. Send, record approval, record revision request, withdraw send, stop round (`VOIDED`), correct answer. Warn-on-send
(§7.4). Revision points carried to the next iteration with
`source = CLIENT_REVISION`.

**Files.** Schema (additive), migration, service, send/response UI.

**Acceptance.** Recording a revision writes the response and resolves/opens the next
draft **in one transaction**; failure of either rolls back both. A response
cannot be edited or deleted. `SENT`, `APPROVED`, `SUPERSEDED`, and `VOIDED` iterations
reject asset and checklist mutation. Withdraw send requires a reason and no successor or response. Correction
appends a replacement answer, preserves successors, and follows project §6.5.
Stopping an unanswered round retains its number/content and permits progress
without fabricating approval. Client-point withdrawal retains source and
original text (§7.2). Sending with open points warns with the count and
proceeds when confirmed.

**Test plan.** Approval-without-closure, explicit final closure, draft work
alongside a pending send, all correction/void scenarios in project §16.
Transaction rollback on induced failure at each step. Immutability
of responses. Content immutability on non-`DRAFT` iterations, with
explicit response-correction and assignment exceptions. Provenance
survives: a carried point still resolves to the response that produced it.
Concurrency: two simultaneous responses on one iteration — exactly one wins.

**Migration impact.** Additive: two tables.

---

### WO-5 — Tasks

**Scope.** `SfTask` per project contract §7.3. Create, assign, complete,
reorder, delete. Creation never asks for a phase. Drag onto a phase to scope.

**Files.** Schema (additive), migration, service, task UI.

**Acceptance.** A task created from the General box has null `phase_scope`. A
task created inside a phase view inherits it. No task blocks any transition
(§7.4). Assignment changes are audited; routine completion is not (§9).

**Test plan.** Default-null on general creation. Inheritance on in-phase
creation. Blocker projection test: an open task never prevents a send.

**Migration impact.** Additive: one table.

---

### WO-6 — Project surface consolidation

**Scope.** The cross-project "waiting on me" list (§10.2) — one read model, no
schema — and the single project page: General tasks pinned at top and visible
under any phase filter; phases with their iterations; phase as filter rather
than as a separate page. Empty, loading, error, and permission states. Apply the Supervision actions resolved in §1.1 and the Needs assignment view.

**Files.** StudioFlow routes and StudioFlow-local components only. Reuse UI Engine; any proven generic gap needs a scoped shared extension ([`studioflow-project-contract.md`](studioflow-project-contract.md)
§13.3).

**Acceptance.** A designer with several projects sees what is waiting on them
without opening any project, oldest first, including unassigned and
unavailable-assignee work. Every piece of work in a project is reachable from one
page. Filtering by phase never hides General tasks. Opening a phase shows the same
items the project page showed for it. `WAITING_CLIENT` displays its age (risk
R2).

**Test plan.** Browser checks at desktop, collapsed rail, and narrow viewport.
Filter consistency between project and phase views.

**Migration impact.** None.

---

### WO-7 — `STORED` files

**Scope.** Only the `STORED` treatment of project contract §8.1 — holding bytes
for delivered PDFs, renders and client surveys. `RECORDED` files shipped with
WO-3 and need nothing here.

**Files.** Schema (nullable `storage_key`, `checksum`), service, upload UI.

**Acceptance.** A `STORED` file uploads, downloads through a short-lived signed
URL, and is refused to a user without `project.read`. A superseded working file's
bytes are released; a **sent** file's bytes are never released. A failed upload
leaves no numbered empty round (§5.3).

**Migration impact.** Additive columns only.

**Blocked by.** The shared storage capability (PLAT-WO-A) and Q3.

---

### WO-8 — Google Drive archive (`LINKED`) *(deferred)*

**Scope.** [`studioflow.md`](studioflow.md) §5.1. Contracted so that activating
it changes no rule in §8; not planned.

**Blocked by.** Q4 — a studio account, and confirmation that production egress
may reach Google's API. If it may not, the integration must run from the browser,
which is a different design and a different work order.

---

### PLAT-WO-A — Storage port: private small-object access *(platform, not StudioFlow)*

**Scope, much reduced by the 2026-09-08 file decision.** StudioFlow no longer
needs streaming of hundreds of megabytes, because working models are never
uploaded (`RECORDED`). What remains is private objects with short-lived
server-issued signed URLs, tens of megabytes, checksum at upload, and no image
preparation.

**Sequencing.** No longer on the critical path. WO-1 through WO-6 ship without
it. Verify what the port actually provides when this activates rather than
assuming the roadmap describes something implemented.

**Blocked by.** Nothing in StudioFlow.

## 4. Merge order and parallelism

```
WO-0 ──► WO-1 ──► WO-2 ──► WO-3 ──► WO-4 ──► WO-5 ──► WO-6
                            (RECORDED files ship here)
PLAT-WO-A (platform, whenever) ─────────────────────► WO-7 ──► WO-8 (deferred)
```

WO-1 needs no database at all. Everything from
WO-2 onward is strictly sequential — each depends on the tables the previous one
created.

The 2026-09-08 file decision took storage off the critical path entirely. The
whole workflow — rounds, numbering, sending, the client exchange, and the files
that evidence it — reaches the studio through WO-6 with **no platform storage at
all**. WO-7 adds held bytes for the small files that benefit from them; WO-8 adds
the Drive archive. Both are improvements to a working app, not prerequisites.

## 5. The deploy and merge gate — later, not now

Owner decision 2026-09-08: build and test locally; work out a non-destructive
merge afterwards. This section records what that will require, so the answer is
not improvised under pressure on the day.

### 5.1 Why a StudioFlow migration can hurt other apps

Not by touching their data. StudioFlow's migrations only create objects inside
its own schema, and no foreign key crosses a schema boundary.

The shared thing is the **migration ledger**: one ordered record of applied
migrations per database, covering every schema. A migration that fails halfway
leaves the ledger stopped on a failed entry, and Prisma then refuses to apply
anything after it — including a Master Data or BQ migration that has nothing to
do with StudioFlow.

The blast radius is therefore *shipping*, not data. That is smaller than it
sounds and worth stating precisely, because a vague fear leads to the wrong
precautions.

### 5.2 What makes the merge non-destructive

| Requirement | Why |
|---|---|
| The migration is additive only: `CREATE SCHEMA`, `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX` | Nothing existing is altered, so nothing existing can break |
| No `ALTER` or `DROP` on `platform`, `master_data` or `bq` | A StudioFlow slice never edits another app's objects |
| No foreign key crossing a schema boundary | Already the platform dependency law |
| Applied against a copy of production first, and the ledger verified clean | A failure is discovered where it costs nothing |
| Master Data and BQ regression checks pass after it is applied | Proves the additive claim rather than asserting it |
| `prisma migrate deploy` stays out of the build script | Structure changes remain a deliberate human act; this is why the present risk is small |

### 5.3 The one thing to settle before a preview deployment

A Vercel project has one `DATABASE_URL` per environment by default, so a preview
build of this branch may point at **production**. That is not a migration risk —
it is a usage risk: a test project created in a preview would be written into the
real database.

So before this branch is ever deployed, Preview must carry its own
`DATABASE_URL`, separate from Production. Until the branch is deployed, this
costs nothing and blocks nothing.

## 6. What is deliberately not planned

No event system, no workflow engine, no abstraction layer, no notification jobs,
no invitation flow, no integration adapter, and no upload service beyond the
shared platform port. Each would be an abstraction without a second consumer,
which the audit roadmap names as the failure mode that produced legacy's
overlapping patterns.

Schedule ([`studioflow-schedule-contract.md`](studioflow-schedule-contract.md))
and MoM ([`studioflow-mom-contract.md`](studioflow-mom-contract.md)) have no
work orders because their contracts are not approved. They enter this sequence
only after §2.2 Q6 and Q7 are answered.
