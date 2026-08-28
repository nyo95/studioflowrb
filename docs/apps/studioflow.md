# StudioFlow — Product, Data, and UI Contract

Status: ACTIVE MIGRATION CONTRACT
Evidence basis: current owner direction, reference application workflows/schema, and `STUDIOFLOW_DESIGNER_VISION.md`. Items not explicitly decided are labelled.

## Purpose and ownership

StudioFlow manages interior-design project delivery from intake through completion. It owns clients, projects, project access, phase workflow, revisions/reviews, activity/tasks/checklists, deliverables/files, schedules, project product requests, meeting/minutes records, and project-specific extensions.

It does not own canonical Brand/SKU/Supplier/pricing or BQ estimate state.

## Product flow

```text
Client + Project
  -> Moodboard
  -> Layout
  -> 3D Design
  -> Construction Drawing (CD)
  -> Supervision
  -> Completed
```

The phase names are the product pipeline, but the workflow engine should model transitions rather than scatter status assignments through UI code.

Core phase transitions evidenced in the reference app:

1. Work in progress.
2. Submit for internal review.
3. Approve internally or return for revision.
4. Submit for client review.
5. Client approves or rejects with a revision loop.
6. Activate/advance the next phase only through the transition policy.
7. CD handoff and supervision have their own completion evidence.

`DECIDED`: CD work belongs to the drafter role (DRIC); the design phases belong primarily to the designer role (DIC). Role-tailored home screens should expose the next work requiring that user rather than one generic dashboard.

## Conceptual schema

```text
Client --< Project --< Phase --< Revision --< File
                    |       |--< Activity / Comment
                    |       +--< CDList
                    |--< ProjectChecklist --< child checklist items / labels
                    |--< ProjectScheduleEntry --< ProjectScheduleOption
                    |--< ProjectProductRequest
                    |--< ProjectMomDocument --< items --< points/images
                    |--< SketchupProject --< materials / FFE / merge actions
                    +--< RenderBoard --< annotations
```

This is a capability map, not permission to copy the legacy schema unchanged. Each migration slice must prove which fields, constraints, snapshots, and lifecycle rules remain needed.

## Main workflows

### Project intake and assignment

1. Create/select Client.
2. Create Project using `[Year]-[Number] Project Name`.
3. Assign project roles and access.
4. Establish phase records and current phase deterministically.
5. Surface ownership, priority, dates, and next action.

### Review and revision

1. Contributor uploads/links deliverable evidence.
2. Submit transition validates required evidence and permission.
3. Internal reviewer approves or returns with actionable feedback.
4. Approved work is submitted to client review.
5. Client rejection creates a traceable revision loop; approval advances through the workflow policy.
6. Audit captures actor, transition, before/after, and relevant metadata atomically.

### Tasks and checklists

- Project activities cover operational TODO/feedback work.
- Project checklists may be created from templates or manually, support hierarchy, assignee, priority, due state, labels, and personal saved filters.
- Manually checked checklist items follow the approved retention rule; template-linked items are not auto-purged.
- Read models may aggregate for dashboards, but mutation rules remain in StudioFlow application services.

### Schedule and product selection

- StudioFlow owns project schedule entries and options as project snapshots.
- Catalog selection reads Master Data through its public contract.
- Local project facts never silently promote into Master Data.
- Promotion, when later enabled, is a visible permission-gated Master Data request with validation and audit.
- A schedule option stores enough display/provenance data to survive later catalog changes.

### MOM, SketchUp, and render review

These are project extensions, not Core modules:

- MOM records meeting documents, structured items, points, and images.
- SketchUp sync tracks project-specific material/FFE observations and merge decisions.
- Render boards support visual annotations and review evidence.

They may reuse Core files/audit/validation and UI Engine layouts, but their business policies remain inside StudioFlow.

## Public boundary

StudioFlow imports Master Data only from `masterdata/public`. Other apps do not import StudioFlow internals. If BQ and StudioFlow are linked later, they retain separate project identities and lifecycles; linkage must be explicit and cannot be inferred from names.

Possible future `studioflow/public` reads should be minimal: project identity/display lookup and authorized project context. They must not expose workflow repositories or mutation internals.

## UI/UX contract

StudioFlow should feel like a clear delivery workspace, not an admin database.

- Shared shell, navigation, fields, tables, dialogs, prompts, file patterns, feedback, and tokens come from UI Engine.
- Role-tailored landing pages show owned projects, pending reviews, overdue work, and next actions.
- Project detail uses a stable workspace layout. Phase navigation remains visually simple; the status model can be detailed without displaying every internal state as equal-weight tabs.
- Each phase emphasizes deliverables, review state, feedback, and the primary transition.
- Client review is a visible loop, not a status dropdown.
- CD handoff clearly distinguishes designer and drafter responsibility.
- Catalog/product selection is visual and library-first, with search/filter and explicit project snapshots.
- Supervision and MOM prioritize field evidence, decisions, owners, and follow-up.
- Existing layout patterns are preserved unless an approved product change replaces them.

UI code never owns permission or transition truth. Disabled/hidden affordances support comprehension; the server still enforces every mutation.

## Permissions

Exact persisted grant design remains `OPEN`. The migration must at least distinguish platform access, client/project management, project read, phase contribution, internal approval, client-review submission, task/checklist management, schedule/catalog management, CD responsibility, supervision/MOM, and extension-specific writes.

## Migration classification

- `KEEP + REWRITE`: project/client identity, phase/review semantics, tasks/checklists, deliverables, schedules, MOM, and role ownership.
- `MERGE`: repeated review, attachment, comment, confirmation, audit, and transaction plumbing into Core/UI Engine patterns.
- `REWRITE`: transition logic into explicit application policies; direct Master Data access into public-contract calls.
- `LEGACY/REVIEW`: backup UI, older settings utilities, heuristic SketchUp automation, and any status/display behavior not supported by current product intent.
- `PURGE`: duplicate canonical catalog/pricing ownership, implicit Master Data promotion, `window.location.reload`, native confirm dialogs, and obsolete Modify-first forms.

## Open decisions before implementation slices

1. Production identity, membership, and grant matrix.
2. Exact MVP boundary among schedule, MOM, SketchUp, and render-board extensions.
3. Data migration/cutover policy for uploaded files and legacy operational history.
4. Which legacy dashboards remain useful after role-tailored home screens are defined.
