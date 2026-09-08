# StudioFlow — Decisions, Open Questions, and Work Order Sequence

Status: **PLANNING ARTIFACT — no work order below is activated**

A work order becomes executable only when the owner says so explicitly, and only
after every blocking question in §2 that it depends on has been answered. Until
then this file is a plan, not an authorization.

Branch: all StudioFlow work happens on `studioflow/contracts` and its
successors. `main` is the production source and is not touched.

## 1. Locked decisions

Owner-confirmed across the contract sessions of 2026-09-07 and 2026-09-08.
Historical decisions below remain except where amended by the R7.07 navigator
PRD review in §1.1. This is a ledger, not a second source of truth.

| # | Decision | Recorded in |
|---|---|---|
| D1 | StudioFlow owns its own `Client`. It is never a Master Data Party and never references one | project §2 |
| D2 | StudioFlow and BQ have no relationship in either direction | index §4 |
| D3 | Library/Schedule reads the Master Data brand catalog read-only through the public port, snapshotting facts at selection | index §4, schedule §3 |
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
| D17 | Platform asset storage is completed first, including a private large-object capability. No StudioFlow upload code begins before it | index §5 |
| D18 | Virtual folders derived from metadata; no client-supplied storage path, ever | project §8.2 |

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

### 2.1 Blocking — nothing starts without these

| # | Question | Blocks |
|---|---|---|
| Q1 | **What is the migration target database?** The brief requires development and preview to run on a database isolated from production Master Data. Does one exist, or must it be provisioned? | WO-0, and therefore every WO that migrates |
| Q2 | **Resolved by R7.07 PRD:** explicit Start round uses the same draft resolver as upload/revision | No longer a product blocker; work-order activation still required |

### 2.2 Needed before the domain they govern

| # | Question | Blocks |
|---|---|---|
| Q3 | Project archival and retention. Legacy specified a `FINAL` flag with a destructive manifest. What is kept, what is purged, and after how long? | Assets (WO-7) |
| Q4 | Is an `EXTERNAL` asset ever exposed through a link a client can open, or do files always leave the studio by other means? Decides the storage access model | Platform storage extension |
| Q5 | **Resolved by R7.07 PRD:** Supervision uses explicit start/finish/reopen, never task-derived state | No longer a product blocker |
| Q6 | Schedule: entry scoped to phase or project; whether clients genuinely choose among options; what a position's identity is | Schedule domain entirely |
| Q7 | MoM: does an action item become a StudioFlow `Task`? If yes, MoM gains a write path into the project core | MoM domain entirely |

### 2.3 Process

| # | Question |
|---|---|
| Q8 | Do these contracts land on `main` as documentation (the R7.05 precedent for the legacy audit), or stay on the StudioFlow branch until the app merges? |

## 3. Work order sequence

Each work order is a vertical slice: schema, service, route, and tests together.
Each is independently reviewable and safe to merge. None may exceed its scope.

---

### WO-0 — Database target and isolated environment

**Scope.** No application code. Confirm or provision the development/preview
database, confirm the migration target, and record both. Verify the StudioFlow
branch's preview deployment points at the isolated database and never at
production Master Data.

**Files.** Environment configuration and `docs/apps/studioflow-work-orders.md`
(record the answer to Q1). No source change.

**Acceptance.** A named development database exists, is reachable from the
StudioFlow branch preview, and is demonstrably not the production database.
Master Data and BQ production data are untouched and unreachable from it.

**Test plan.** Connection check against the dev database. Confirm the production
connection string appears in no StudioFlow branch configuration.

**Migration impact.** None. This work order exists precisely so that the first
migration has an approved destination.

**Blocked by.** Q1.

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

**Scope.** `SfIteration` per project contract §5. The numbering rule (§5.3), the
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
number. Projection and closure invariants after every transition; review
permission for ordinary closure, override permission for exception closure.
Include applicable project §16 scenarios and disabled-user assignment recovery;
client-exchange scenarios run in WO-4, Task scenarios in WO-5/6.

**Migration impact.** Additive: Iteration table; Phase state/closure were introduced in WO-2.

**PRD decision.** Q2 resolved in §1.1; activation still requires an explicit work order.

---

### WO-4 — The client review exchange

**Scope.** `SfIterationResponse` and `SfIterationPoint` per project contract §6
and §7.2. Send, record approval, record revision request, withdraw send, stop round (`VOIDED`), correct answer. Warn-on-send
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

**Scope.** The single project page: General tasks pinned at top and visible
under any phase filter; phases with their iterations; phase as filter rather
than as a separate page. Empty, loading, error, and permission states. Apply the Supervision actions resolved in §1.1 and the Needs assignment view.

**Files.** StudioFlow routes and StudioFlow-local components only. Reuse UI Engine; any proven generic gap needs a scoped shared extension ([`studioflow-project-contract.md`](studioflow-project-contract.md)
§13.3).

**Acceptance.** Every piece of work in a project is reachable from one page.
Filtering by phase never hides General tasks. Opening a phase shows the same
items the project page showed for it. `WAITING_CLIENT` displays its age (risk
R2).

**Test plan.** Browser checks at desktop, collapsed rail, and narrow viewport.
Filter consistency between project and phase views.

**Migration impact.** None.

---

### WO-7 — Assets *(blocked)*

**Scope.** Project contract §8. Cannot start.

**Blocked by.** D17 and Q3, Q4. The platform storage port and its private
large-object extension must land first, as platform work, not StudioFlow work.

---

### PLAT-WO-A — Storage port: private large-object extension *(platform, not StudioFlow)*

**Scope.** Extend the platform storage capability per
[`studioflow.md`](studioflow.md) §5: private objects with short-lived
server-issued signed URLs, large binaries without in-memory buffering,
checksum recorded at upload, and no image preparation. Owned by the platform,
proposed as a shared-layer change, never built inside StudioFlow.

**Sequencing.** Owner decision D17 places this before WO-7 and independent of
WO-1 through WO-6. It should be contracted as an amendment to
`PLATFORM-ASSET-STORAGE-ROADMAP.md`, which is currently written for one public
2 MB PNG consumer.

**Blocked by.** Q4.

## 4. Merge order and parallelism

```
WO-0 ──► WO-1 ──► WO-2 ──► WO-3 ──► WO-4 ──► WO-5 ──► WO-6
                                                        │
PLAT-WO-A (platform, parallel) ─────────────────────────┴──► WO-7
```

WO-1 needs no database and can merge while Q1 is still open. Everything from
WO-2 onward is strictly sequential — each depends on the tables the previous one
created. `PLAT-WO-A` runs in parallel on the platform side and joins only at
WO-7.

## 5. What is deliberately not planned

No event system, no workflow engine, no abstraction layer, no notification jobs,
no invitation flow, no integration adapter, and no upload service beyond the
shared platform port. Each would be an abstraction without a second consumer,
which the audit roadmap names as the failure mode that produced legacy's
overlapping patterns.

Schedule ([`studioflow-schedule-contract.md`](studioflow-schedule-contract.md))
and MoM ([`studioflow-mom-contract.md`](studioflow-mom-contract.md)) have no
work orders because their contracts are not approved. They enter this sequence
only after §2.2 Q6 and Q7 are answered.
