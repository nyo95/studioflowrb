# Active Plan

Plan ID: WO-SF-NOTES-ONLY-01
Scope: Remove the personal to-do / My Tasks concept from StudioFlow, including its data. Phase notes replace it. Requirements stay as one general checklist per project.
Target revisions: R8.342 (backend + data, Executor), R8.343 (UI, Lead). R8.341 is this plan.
Status: READY (owner decision 2026-10-06: "hapus tampilan dan datanya")
Priority: P1
Owner: Product Owner.

## Product model (owner, 2026-10-06)

- **Projects**: two views only — *My projects* (projects where the signed-in user is a PIC) and *All projects* (no filter).
- **Inside a project**: Requirements (the whole general checklist), MOM, Project Schedule, Phase system.
- **Phase system**: send -> approved / rejected. A phase carries notes; the notes replace Todoist / task / to-do.
- There is no personal to-do, no My Tasks, no Quick add, no task assignment, no task labels, no saved task filters.

## Replaced earlier decisions

R8.331 "My Today follows assigned tasks", R8.335-R8.339 My Tasks / to-do surfaces and the 2026-10-05 "My Tasks = ad-hoc to-dos" rule are superseded. `STUDIOFLOW-REWORK-CONTRACT.md` §7 (Today) and the checklist notes in §12 must be rewritten to the model above.

## What is removed

Data (destructive migration, owner approved; rebuild-only database, verify target first):
- Every `sf_checklist_item` row with `template_id IS NULL` (ad-hoc to-dos, their subtasks). Rows with `template_id IS NOT NULL` are requirements and stay, with their own subtasks.
- Tables `sf_checklist_item_label`, `sf_checklist_label`, `sf_checklist_filter_view`.
- Columns `priority`, `due_at`, `assigned_to_id` on `sf_checklist_item` and the `[assigned_to_id, is_checked]` index. (A requirement is just a label that is ticked or not.)
- Keep `is_blocking`; its fate is a separate decision (requirements already never block a phase or project completion; do not touch).

Backend (`src/apps/studioflow`):
- Delete `today/` (service + `myTasksSummary`), `domain/feed.ts`, `domain/checklist.ts` filter/priority/due parts, label and filter-view commands in `tasks/service.ts`, `createItem` with `phaseId: null` for non-template rows, assignee/priority/due on `updateItem`, the assignee tick exception in `setItemChecked`, and the matching public exports.
- Requirement commands that remain: list, tick/untick, dismiss, rename, create-from-template sync, subtask on a requirement, reorder, template CRUD. Keep their RBAC and project-status guards.
- Add a project-level requirements read (all general + phase requirements of one project) if `listChecklist` does not already return it.

## What the Lead does afterwards (R8.343, not the Executor)

Home / Projects UI: remove `today-view.tsx`, My Tasks dialog, per-project task area, `due-label` task use; expose My projects / All projects; project page gets a Requirements section; phase notes stay as built. Contract doc rewrite. Browser acceptance only if the owner asks.

## Locked boundaries

- Do not touch phase notes, iteration notes, MOM, schedule, phase commands, BQ or Master Data.
- Migration must be written by hand as SQL: delete ad-hoc rows first (children cascade), drop label/filter tables, then drop columns. Never `prisma migrate reset`: it wipes all users. Apply to the dev and test databases only.
- Before the migration, report the counts to be deleted (ad-hoc root rows, subtasks, labels, filter views, rows with an assignee) in the changelog entry.
- No dependency, no new abstraction, no remote action. One local commit, changelog entry R8.342, proportionate checks (typecheck, lint, boundaries, legacy-runtime, full `npm test`). Tests for removed behavior are deleted, not skipped; add one test that requirements and their subtasks survive and that an ad-hoc row cannot be created.
- If the plan contradicts the repository or UI wiring needed to keep typecheck green exceeds minimal stubs, stop with `BLOCKED / CONFLICT`.

## Executor Prompt

You are the Backend Executor. Location: kantor (load `.env.kantor`, set `STUDIOFLOW_LOCATION=kantor`). Implement WO-SF-NOTES-ONLY-01 exactly as written in PLAN.md as revision R8.342, preserving unrelated work. Verify the explicit database target belongs only to studioflow-rebuild before any database command. Remove the to-do/My Tasks backend and data as listed, keep requirements and their subtasks, keep the minimal UI wiring needed for typecheck to pass (the Lead finishes the UI as R8.343). Commit locally once and reply with a Planner/Reviewer prompt containing outcome, commit, checks, deleted-row counts, limitations and dirty files.
