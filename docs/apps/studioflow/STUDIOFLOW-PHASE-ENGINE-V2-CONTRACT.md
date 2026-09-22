# StudioFlow Phase Engine v2 — Contract

Status: ACTIVE — ratified by owner implementation (R8.87–R8.93, 2026-09-16/17);
fully implemented through V2-E in R8.105 (2026-09-22)
Revision: R8.87
Date: 2026-09-16
Author: berkah.rad@gmail.com
Supersedes clauses: STUDIOFLOW-REWORK-CONTRACT.md §2 (PURGE list items A/B/C), §5.1, §5.4, §6.1, §8 (main workspace), §9 (Requirements), RW-01 label format, RW-04 (Deliverables wave)

---

## 0. Authority

This document ratifies Owner decisions V2-D1 through V2-D9 collected 2026-09-16.
It supersedes the listed clauses of the 2026-09-15 rework contract.
All other clauses of STUDIOFLOW-REWORK-CONTRACT.md remain in force.
Executors must treat this document as co-equal authority alongside the rework contract,
with this document taking precedence where conflicts exist.

---

## 1. Superseded clauses — explicit list

| Rework contract clause | What it said | What replaces it |
|---|---|---|
| §2 PURGE item: "phase-template administration, per-project phase add/remove" | Purged forever | Restored: SfPhaseTemplate + SfPhaseDefinition (§4) |
| §5.1 "Phase set is app code, not an administered template" | Hardcoded PHASE_KEYS / PHASE_BLUEPRINT | Replaced by SfPhaseDefinition rows; PHASE_KEYS enum retained only for migration bridge |
| §5.4 "Label vMAJOR.MINOR" | revisionLabel → `vM.m` | Replaced by `{PREFIX}{major}.{minor}` where PREFIX comes from SfPhaseDefinition (§6) |
| §6.1 "Activity = revision work" | SfActivity owns revision work (TODO) | SfActivity restricted to FEEDBACK only; SfChecklistItem is the sole Todo SSOT (§3) |
| §8 "Phase page is the main workspace" | Phase page has all actions; project rail lists phases | Overview is the main workspace; phase page becomes detail/deep-link (§7) |
| §9 "Requirements are checklist templates" | SfChecklistTemplate with phase_key | Requirements are checklist items carrying `is_blocking = false` (§5, owner decision 2026-09-22; supersedes the V2-D2 separate model) |
| RW-01 "vMAJOR.MINOR format everywhere" | All labels use v prefix | Phase prefix from definition (§6) |
| RW-04 "Deliverables = wave 2" | Deliverables deferred | SfDeliverable is on the critical path, warning-only (§8) |
| §2 PURGE item: "Requirement templates/project requirements/evidence" | Purged with evidence | Re-introduced without evidence; lightweight warning model only (§5) |

---

## 2. Phase states (V2-D7) — retained enum, updated semantics

The stored `SfPhaseStatus` enum is **not renamed** (avoids destructive migration).
Presentation names and gate UX change; stored values stay identical.

| Stored value | V2 display name |
|---|---|
| PENDING | Not started |
| IN_PROGRESS | Working |
| ON_REVIEW_INTERNAL | Internal review |
| APPROVED_INTERNAL | Ready to send |
| ON_REVIEW_CLIENT | With client |
| READY_FOR_NEXT | Approved |
| COMPLETED | Done |

State machine changes (V2-D7):
- `rejectInternal` (minor bump) is **removed** from `ON_REVIEW_CLIENT` state.
  From client review, only `approveClient` (major approved) or `rejectClient` (major bump) are available.
- Direct `submitClient` from `IN_PROGRESS` is **allowed** (skip internal review path).
- `bypass` from `PENDING` is **allowed** (skip a non-applicable phase).

---

## 3. Todo SSOT — SfChecklistItem only (V2-D1)

`SfChecklistItem` is the single source of truth for all project work items (todos).
- `project_id` required; `phase_id` optional (null = project-wide).
- Todoist-like: priority 1–4, due, assignee, labels, subtasks (depth 1), reorder, saved filters.

`SfActivity` is **restricted to FEEDBACK mode only**.
- `SfActivityMode.TODO` is deprecated; no new TODO-mode activities may be created.
- Existing TODO-mode activities remain readable; migration to SfChecklistItem is wave 2.
- The feedback→todo conversion on `rejectPhase` **changes target**: instead of creating a new SfActivity(TODO), it creates a `SfChecklistItem` in the same project+phase.

The "General to-dos" section on the Overview that previously showed SfActivity(TODO) now shows SfChecklistItem with `phase_id IS NULL`.
The "General checklist" and "Phase checklist" are the same model (SfChecklistItem) — the distinction is `phase_id` only.

---

## 4. Phase Definition (V2-D3) — replaces hardcoded enum

### 4.1 Models

```
SfPhaseTemplate   — office-level set of phase definitions; one default template.
SfPhaseDefinition — one row per phase within a template.
                    Fields: name, prefix (≤4 chars), order_index, allow_parallel, seat.
```

### 4.2 Project bootstrap

When a project is created, the active default `SfPhaseTemplate` is snapshotted:
one `SfPhase` per `SfPhaseDefinition` row, storing `definition_id` as FK.
The phase inherits `name/prefix/order_index/allow_parallel/seat` from the definition at creation time.
**After creation, the project's phases are immutable** (V2-D3 decision: no per-project add/remove).

### 4.3 Migration bridge — closed by V2-E (R8.105)

`SfPhaseKey` enum and the `key` column on `SfPhase` were **retained** until a dedicated migration
(V2-E) replaced them with `definition_id`. That migration shipped in R8.105: `SfPhaseKey` and the
`key`/`phase_key` columns no longer exist; `SfPhase.definition_id` (required) and
`SfChecklistTemplate.definition_id` are the sole runtime phase identity. The five legacy phases are
identified only by the fixed definition ids in `LEGACY_PHASE_DEFINITION_IDS`
(`src/apps/studioflow/domain/phase.ts`), never by name or by a `key` column. This section is kept as
a record of the bridge that existed between R8.87 and R8.105.

---

## 5. Requirements — merged into the checklist (owner decision 2026-09-22)

**This section supersedes V2-D2.** `SfRequirement` no longer exists at runtime.

A requirement was structurally a subset of a checklist item — `title`/`label`, `is_met`/`is_checked`,
`met_at`/`checked_at` — and the only real difference was one policy bit: a root checklist item blocks
approval, a requirement only warns. Keeping a second model, table, service and panel to carry one
boolean cost more than it explained, and made requirements *less* visible than ordinary to-dos (no
assignee, no due date, absent from Today) despite being the thing a phase is supposed to satisfy.

That bit now lives on the item: `SfChecklistItem.is_blocking`.

Rules:
- `is_blocking = true` (default) — an unticked **root** item blocks approval (§6.4 unchanged in spirit).
- `is_blocking = false` — warning-only. It is counted in `warnings.optionalOpen` and never in `blockers`.
- **Subtasks never block.** They are stored with `is_blocking = false`, and making a subtask blocking
  is refused (`CHECKLIST_SUBTASK_NEVER_BLOCKS`) rather than silently ignored.
- A warning-only item may be project-wide (`phase_id IS NULL`) or phase-specific, exactly as a
  requirement could.
- Warning-only items are ordinary checklist items in every other respect: assignee, due date,
  priority, labels, subtasks, Today visibility, template seeding.

Migration `20260922010000_sf_checklist_blocking_merge` copies every `sf_requirement` row into
`sf_checklist_item` with `is_blocking = false`, keeping the original id; `description` folds into the
label. `sf_requirement` is retained as a rollback copy and read by nothing — it is dropped in a
separate migration once this merge is accepted.

---

## 6. Revision label format (V2-D5)

The label format changes from `vM.m` to `{PREFIX}{major}.{minor}`.
- `PREFIX` comes from `SfPhaseDefinition.prefix` (e.g. "MB", "D", "CD").
- Example: Moodboard prefix "MB" → `MB1.0`, `MB2.0`; Design 3D prefix "D" → `D3.1`.
- `revisionLabel(revision, prefix)` gains a `prefix` parameter (defaults to "v" for backward compat).
- The `{major}` counter is the revision-within-phase counter; it does **not** carry the phase order index
  (so Design 3D's first revision is `D1.0`, not `D3.0`).

---

## 7. Override — forward-only (V2-D6)

`overrideRevision` is restricted: the requested `major.minor` must be strictly greater than
the latest existing revision for that phase. Backward resets are no longer allowed.

---

## 8. Deliverables — warning-only (V2-D8)

`SfDeliverable` is a new model per phase: `project_id`, `phase_id`, `revision_id` (nullable), `name`, `storage_key`, `file_size_bytes`, `content_type`.

Computed status:
- `MISSING` — no deliverable for this phase.
- `CURRENT` — at least one deliverable; uploaded in the current (active) revision.
- `OUTDATED` — at least one deliverable; all uploads are from a prior (closed) revision.

Deliverable status **does not block approval** (warning-only).

---

## 9. Overview as main workspace (V2-D9)

The project Overview page (`/projects/[projectId]`) becomes the primary workspace:
- Phase cards: one per phase, showing status badge, iteration label, inline action buttons (primary command), per-phase todo count.
- Active revision label shown in each phase card.
- Blockers and warnings shown inline (Requirements warnings, Deliverable warnings).
- The `PipelineStrip` nav strip is demoted to a visual indicator; primary actions live in phase cards.

The phase detail page (`/projects/[projectId]/phases/[phaseId]`) becomes a detail/deep-link view:
- Full `PhaseActions` block.
- Revision work (SfActivity FEEDBACK + deferred items).
- Phase checklist (SfChecklistItem).
- Revision history.

---

## 10. Implementation waves

| Wave | Scope | Schema? |
|---|---|---|
| V2-C0 | This contract (doc only) | No |
| V2-A | State machine fixes (V2-D4/D6/D7), Todo SSOT domain update (V2-D1), label format function (V2-D5) | No |
| V2-B | Prisma schema additions: SfPhaseTemplate, SfPhaseDefinition, SfRequirement, SfDeliverable; migration | Yes |
| V2-C | Overview v2 page rewrite (V2-D9); phase cards with inline actions | No (uses existing data + new schema from V2-B) |
| V2-D | Admin UI: phase template editor (SfPhaseTemplate/SfPhaseDefinition CRUD) | Depends on V2-B |
| V2-E | Full enum-to-definition migration: drop SfPhaseKey, make definition_id required | Yes (destructive) — **implemented R8.105**, migration `20260920000000_sf_v2e_definition_migration` |

