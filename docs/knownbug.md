# Known Bugs by Application

Status: active defect ledger, reconciled through R7.40 on 2026-09-10.

Planned features belong in [`roadmap.md`](roadmap.md). When a bug is fixed, move
it to Closed, name the revision, and record the fix in `CHANGELOG.md`.

## Platform Foundation

No open Foundation bug is currently recorded.

## UI Engine and Shared Utilities

### KB-004 — Shared image tools are not canonical across consumers

- **Observed:** No approved rebuild image workspace provides picker, crop,
  zoom, and annotation across MOM and Schedule consumers.
- **Expected:** One public UI Engine capability with consumer-owned policy and
  cross-consumer regression evidence.
- **Mitigation:** Do not create app-local substitutes before activation.
- **Status:** Open.

### KB-011 — StudioFlow implements drag/drop outside the UI Engine

- **Observed:** `studioflow/[id]/files/file-controls.tsx` owns `onDragOver`,
  `onDrop`, and `dataTransfer`, while `UI_ENGINE.md` lists `FileDropZone` as
  deferred.
- **Expected:** One canonical `FileDropZone` imported by StudioFlow, with
  behavior/accessibility tests and no app-local copy.
- **Mitigation:** Keep the current narrow metadata-only drop surface and add no
  second local implementation.
- **Status:** Open; discovered during the R7.40 documentation audit.

## Master Data

No open Master Data bug is currently recorded. Deferred media, Samples, and
import/export capabilities are roadmap items, not defects.

## BQ

No open BQ bug is currently recorded.

## StudioFlow

### KB-002 — Storage-byte release is not implemented

- **Observed:** R7.40 replaces the unsent current metadata record, but no active
  storage consumer exists, so old stored bytes cannot be released.
- **Expected:** Retain metadata/audit and release bytes under approved retention.
- **Mitigation:** Use the newest non-superseded record and keep the studio PC as
  primary archive.
- **Status:** Open; blocked by storage activation and retention policy.

### KB-003 — MOM and Product Catalogue/FFNI are absent from project detail

- **Observed:** These legacy-proven extensions have no complete rebuild flow.
- **Expected:** Project-bound modules with approved permissions and lifecycle.
- **Mitigation:** Continue using existing operational surfaces.
- **Status:** Open.

### KB-005 — Add Project regresses legacy client/modal behavior

- **Observed:** Client creation is not available in context and some project
  creation interactions navigate away instead of opening a modal.
- **Expected:** Restore useful legacy behavior using UI Engine dialogs and the
  current project/client service boundary.
- **Mitigation:** Create the client first, then create the project.
- **Status:** Open; requires read-only legacy audit before implementation.

### KB-006 — StudioFlow UI language remains mixed

- **Observed:** R7.40 translated entry surfaces, but other routes/states remain
  mixed Indonesian and English.
- **Expected:** English-only StudioFlow UI copy.
- **Mitigation:** All new StudioFlow copy must be English.
- **Status:** Open.

### KB-007 — Settings structure does not match useful legacy behavior

- **Observed:** Rebuild Settings remains narrower than legacy.
- **Expected:** Reproduce useful legacy structure with current permissions and
  rebuilt UI Engine components.
- **Mitigation:** Use current General Settings.
- **Status:** Open; requires read-only legacy audit before implementation.

## Closed

### KB-001 — Deliverable intake did not drive iteration lifecycle

- **Closed:** R7.40. Intake opens/reuses the draft, replaces the prior unsent
  current file, and attaches it to the iteration when sent.

### KB-008 — BQ overridden prices had no Revert action

- **Closed:** R7.40. The permission-checked action restores the immutable source
  price snapshot.

### KB-009 — BQ Updated date was missing or inconsistently placed

- **Closed:** R7.40. BQ directories display persisted update values.

### KB-010 — Library redirected instead of exposing resource links

- **Closed:** R7.40. A read-only UI Engine dialog exposes Master Data resources.

## Audit protocol

1. Record route, action, expected/actual behavior, boundary, and reproduction.
2. Fix immediately only when safe, scoped, and verified.
3. Otherwise add/update the relevant app section with mitigation and status.
4. On fix, move the item to Closed and update `CHANGELOG.md` and the roadmap.
