# StudioFlow Rebuild Alignment

Status: owner alignment artifact, reconciled through R7.55 on 2026-09-10
Scope: minimum production-daily StudioFlow rebuild, with legacy behavior as the
minimum baseline and the owner's workflow simplifications as the active correction.

## 1. What the new contract is meant to do

The new contract is not a request to copy the legacy screens or to replace the
legacy domain. It is a technical contract for a smaller, data-driven workflow:

- keep the proven project, phase, deliverable, revision, to-do, and audit
  concepts;
- remove duplicated task representations and repeated review clicks;
- make phase definitions data-driven (database/configuration), so adding a phase
  does not require a code change;
- make the first user action a deliverable/file action, not a separate iteration
  setup action;
- keep detailed status and history in the backend while presenting a short user
  path in the UI;
- centralize reusable utilities and UI Engine capabilities so all apps consume
  one implementation.

The contract may describe folder templates, output types, internal/external
filing, iteration metadata, and audit rules in detail. Those details are
implementation rules behind the workflow, not extra screens or mandatory clicks.

## 2. What is preserved from legacy

Classification of the legacy baseline:

| Legacy concept | Rebuild treatment |
|---|---|
| Project and client | KEEP |
| Project phases and phase detail | KEEP, with data-driven phase templates |
| Phase deliverables and revisions | KEEP, but merge the user experience |
| Project-level to-dos | KEEP |
| Phase-level duplicate task carrier | MERGE into project-owned to-do with optional phase/revision context |
| Internal/external review intent | KEEP |
| Repeated review/upload clicks | FIX by making deliverable intake the trigger |
| File/folder filing metadata | KEEP as technical filing metadata |
| Explorer-style folder viewer | PURGE from current scope |
| MOM and Product Catalogue/FFNI | KEEP as project extensions; MOM is project-only with no Task/phase/iteration link, while Product Catalogue is StudioFlow-owned and reusable across its projects |
| Global Library | KEEP as a global read/discovery surface |

“No regression” means preserving useful legacy outcomes, permissions, audit,
relations, and downstream meaning. It does not mean preserving redundant data
entry or legacy click order.

## 3. Target information structure

```text
StudioFlow
├─ My Activity / What's Today
│  └─ project-owned to-dos and deliverable/iteration items needing action
├─ Projects
│  └─ Project detail
│     ├─ project facts and team
│     ├─ phases (from the project phase snapshot)
│     │  ├─ phase to-dos (filtered view of project to-dos)
│     │  ├─ current deliverable
│     │  └─ review/revision history
│     ├─ MOM
│     └─ Product Catalogue / FFNI / project schedule
└─ Brands (global Master Data read) + Product Catalogue (StudioFlow-owned reuse pool)
```

There is one to-do collection per project. A phase screen filters that
collection by `phase_scope`; it does not create another task table. My Activity
is an aggregate/read view, not a place where ownership is moved.

## 4. Target workflow

1. Open StudioFlow on My Activity / What's Today.
2. Create or open a project.
3. Open the project detail and choose a phase.
4. Add a to-do at project level, optionally connected to that phase and the
   relevant revision.
5. Start work in the phase and drag-drop or register the deliverable in the
   phase. From a global view, the system asks for project and phase; from a
   project/phase view, context is prefilled.
6. The system classifies the file using context and filename/type hints, with
   confirmation when ambiguous. Folder/template mapping is automatic.
7. The phase has one current working deliverable. A new internal file replaces
   the previous working bytes. Metadata and audit history remain.
8. When the file is sent externally, the current file becomes the deliverable
   for that iteration and the send/iteration metadata is recorded. The user
   does not repeat an internal-review/upload/external-review sequence.
9. Client approval closes the current iteration when the normal phase rules are
   satisfied.
10. A client rejection/revision request records the response and opens the next
    working iteration. The new current file is then produced through the same
    deliverable action.
11. My Activity reflects the resulting to-do and iteration state across
    projects.
12. When a project is complete, the application retains the final current file
    per phase plus permanent metadata/audit history. The original working bytes
    may be released because the primary archive remains on the studio PC.

Approval, rejection, send, and iteration are still persisted domain facts. They
are not supposed to be the user's primary navigation path.

## 5. Shared foundation alignment

Shared mechanisms must have one canonical implementation and public export.
Consumers must not create local copies.

Required shared consumers include StudioFlow, Master Data, and BQ where the
capability applies:

- UI shell, page/detail layouts, cards, dialogs, drawers, buttons, fields,
  validation, loading, empty, error, and disabled states;
- tables, sorting, filtering, pagination, search, and row actions;
- rich-text editor used by Notes and eventually MOM;
- date/time input and formatting utilities;
- image picker workspace where activated: preview, crop, zoom/pan, annotation,
  validation, progress, and error states;
- project/client and Master Data lookup mechanisms where the domain permits;
- shared audit, file metadata validation, and stable utility mechanics.

Business policy remains app-owned: phase meaning, iteration transitions,
catalogue snapshot rules, MOM semantics, and project authorization.

## 6. Current rebuild alignment status

Reconciled through R7.55. Active work and defects are tracked in
[`roadmap.md`](roadmap.md) and [`knownbug.md`](knownbug.md).

| Alignment concern | Current status |
|---|---|
| Deliverable intake opens/reuses the draft iteration | **Aligned in R7.40** |
| One unsent current metadata record per project-phase/iteration | **Aligned in R7.40**; actual storage-byte release remains deferred |
| File attaches to the iteration when sent | **Aligned in R7.40** |
| Drag/drop uses the canonical UI Engine boundary | **Aligned in R7.43 (KB-011)** |
| Current deliverable and intake appear directly in phase detail | **Aligned in R7.48** |
| Start Round/internal approval/send are contextual rather than the primary phase UX | **Aligned in R7.50** |
| To-dos and deliverables form one coherent phase work surface | **Aligned in R7.50** |
| Shared image picker/crop/zoom/annotation exists for approved consumers | **Aligned in R7.52**; local storage provider activation is tracked in PF-1 |
| MOM is integrated into project detail | **Aligned in R7.52**; correcting an issued MOM is defective (KB-012) |
| Product Catalogue is a StudioFlow-wide reuse pool | **Aligned in R7.53** |
| Project Schedule/FFNI is integrated into project detail | **Open** (KB-003) |
| A recorded client answer can be corrected, drafted, or its send withdrawn | **Open** (KB-013/KB-014/KB-015) — the largest remaining gap against §6 |
| A project can be archived and restored | **Open** (KB-016) |
| Phases are data-driven end to end: the studio can add one without a code change | **Open** (KB-017) — phases are snapshotted from the template, but the template itself is seed-only |

## 7. Explicit non-scope

- No Windows Explorer-style viewer.
- No speculative folder navigation UI.
- No second task entity to mirror phase to-dos.
- No hidden background workflow that changes business state without an audit
  event.
- No change to Master Data or BQ business logic unless a proven shared-layer
  regression requires a narrowly scoped fix with cross-app tests.

## 8. Completion bar

StudioFlow is aligned only when the minimum daily workflow works end-to-end:
project creation/opening, phase management, project to-dos, My Activity
aggregation, deliverable intake, current-file replacement, iteration/review
state, permissions, audit, loading/empty/error states, and the legacy-minimum
project surface. MOM and Product Catalogue/FFNI are required project extensions
before claiming full legacy-minimum coverage.

**Where the bar actually sits, R7.55.** The deviation from legacy is meant to be
confined to three things — the phase flow, deliverables, and the single to-do
collection. Everything else is a KEEP that must reach legacy's level. Measured
that way, three KEEPs are still short and are tracked as defects rather than as
simplifications:

- **the client exchange** is thinner than legacy, not simpler: legacy could
  correct a recorded answer and this cannot (KB-013/KB-014/KB-015);
- **project lifecycle** is thinner than legacy: a project cannot be archived or
  restored (KB-016);
- **project Schedule/FFNI** is absent (KB-003), and MOM's correction path does
  not correct (KB-012).

Phase administration (KB-017) is the one case where the rebuild aimed *above*
legacy — data-driven phases instead of an enum — and has so far only reached
half of it: projects snapshot a template that nobody can edit. None of these is
an approved simplification; each is unfinished work.
