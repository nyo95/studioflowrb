# Known Bugs

This is the audit queue for defects that are known but are not fixed in the
current change set. Every audit may add a reproducible bug here. When a bug is
fixed, remove it or strike it through and record the fix in `CHANGELOG.md`.

## Open

### KB-001 — Deliverable intake does not yet drive the full iteration lifecycle

- **Area:** StudioFlow phase/deliverable workflow
- **Observed:** The current UI can record file metadata or a link, but the
  complete deliverable-driven transition to current file, send state, and next
  revision is not end-to-end.
- **Expected:** A deliverable in a phase opens or links the appropriate
  iteration and becomes the phase current file without a separate round-first
  workflow.
- **Mitigation:** Use the existing project File page and explicit iteration
  controls until the workflow correction is implemented.
- **Status:** Open; not fixed in the current documentation-only change.

### KB-002 — Multiple file records remain instead of one current file per phase

- **Area:** StudioFlow file service
- **Observed:** Each record/link operation currently creates a new `SfFile` row;
  replacement and byte release semantics are not yet implemented.
- **Expected:** One current file per project-phase, with old metadata/audit
  retained and old application bytes releasable.
- **Mitigation:** Treat the newest non-superseded record as the working view and
  keep the PC as the primary archive.
- **Status:** Open; requires a service transaction and regression tests.

### KB-003 — MOM and Product Catalogue/FFNI are not integrated into project detail

- **Area:** StudioFlow project extensions
- **Observed:** The rebuild has no complete project-detail workflow for these
  legacy-proven capabilities.
- **Expected:** MOM and Product Catalogue/FFNI remain project-bound extensions
  with their domain behavior and permissions intact.
- **Mitigation:** Continue using their existing legacy/current application
  surfaces until their rebuild slice is activated.
- **Status:** Open.

### KB-004 — Shared image tools are not yet canonical across consumers

- **Area:** UI Engine / shared utilities
- **Observed:** The rebuild does not yet expose one approved image workspace for
  picker, crop, zoom, and annotation across MOM and schedule consumers.
- **Expected:** One public UI Engine capability with consumer-specific business
  configuration and cross-consumer regression evidence.
- **Mitigation:** Do not create app-local replacements; keep the capability
  unimplemented until an approved consumer slice is built.
- **Status:** Open.

### KB-005 — Add Project regresses the legacy client/modal workflow

- **Area:** StudioFlow project creation
- **Observed:** The rebuild does not yet match legacy behavior such as creating
  a client from the project modal; some interactions navigate away instead of
  opening an in-context modal.
- **Expected:** Audit the exact legacy flow first, then restore the minimum
  useful behavior with modal client creation and the same project/client
  relationship, using the rebuilt UI Engine.
- **Mitigation:** Create the client first from the Clients page, then create
  the project.
- **Status:** Open; legacy route, modal state, server action, and persistence
  path require read-only comparison before implementation.

### KB-006 — StudioFlow UI language is mixed

- **Area:** StudioFlow UI copy
- **Observed:** Some screens mix Indonesian and English labels.
- **Expected:** StudioFlow UI uses English consistently, including labels,
  actions, empty states, errors, and navigation.
- **Mitigation:** None; treat new copy as English until the correction lands.
- **Status:** Open.

### KB-007 — StudioFlow Settings structure does not match legacy

- **Area:** StudioFlow settings
- **Observed:** The rebuild settings surface is not yet aligned with the
  legacy settings structure.
- **Expected:** Audit legacy settings navigation and sections, then reproduce
  the useful structure with the rebuilt UI Engine and current permissions.
- **Mitigation:** Use the current General Settings route.
- **Status:** Open.

### KB-008 — BQ overridden prices have no Revert action

- **Area:** BQ price override
- **Observed:** An overridden price can be saved, but the UI does not expose a
  way to restore the inherited/base value.
- **Expected:** Provide a permission-checked, confirmed Revert action that
  removes the override and returns to the current inherited value.
- **Mitigation:** Manually restore the base value after checking the source.
- **Status:** Open.

### KB-009 — BQ Updated date is not functional or consistently placed

- **Area:** BQ tables and detail views
- **Observed:** Updated date is not behaving as a reliable visible field and
  is not presented in the same dedicated column pattern used by Master Data.
- **Expected:** Use the shared updated-date cell/pattern in a separate table
  column, with the correct timestamp and actor where available.
- **Mitigation:** Inspect audit/history details for recency.
- **Status:** Open.

### KB-010 — Library results redirect instead of opening resource links

- **Area:** StudioFlow Library
- **Observed:** Selecting a Library result redirects to Master Data.
- **Expected:** Open a UI Engine modal showing the resource's website,
  catalogue, and other links sourced from the Master Data link fields, while
  keeping Library read-only and one-way.
- **Mitigation:** Follow the existing Master Data link fields directly.
- **Status:** Open.

## Closed

No known bugs have been closed in this artifact revision.

## Audit protocol

1. Reproduce the issue and record the route, user action, expected behavior,
   actual behavior, and affected boundary.
2. Fix immediately when the change is safe, scoped, and verified.
3. Otherwise add or update an Open entry with a mitigation and exact owner
   surface.
4. When fixed, strike/remove the entry and add the fix to `CHANGELOG.md`.
