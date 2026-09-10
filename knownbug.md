# Known Bugs

This is the audit queue for defects that are known but are not fixed in the
current change set. Every audit may add a reproducible bug here. When a bug is
fixed, remove it or strike it through and record the fix in `CHANGELOG.md`.

## Open

### KB-001 — Deliverable intake does not yet drive the full iteration lifecycle

**Closed in R7.40.** Phase deliverables now open/reuse the draft iteration,
replace the previous unsent current file, and are attached to the iteration
when it is sent. Revision requests continue through the existing successor
draft flow.

### KB-002 — Multiple file records remain instead of one current file per phase

- **Area:** StudioFlow file service
- **Observed:** Metadata rows are retained and replacement is now automatic for
  the unsent current file, but storage-byte release is not implemented because
  this rebuild still has no active file-storage consumer.
- **Expected:** One current file per project-phase, with old metadata/audit
  retained and old application bytes releasable.
- **Mitigation:** Treat the newest non-superseded record as the working view and
  keep the PC as the primary archive.
- **Status:** Open; byte-release policy remains deferred until an approved
  storage consumer exists.

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

**Closed in R7.40.** The project editor exposes a permission-checked Revert
action for imported lines and restores `harga_snapshot` from the immutable
`source_price_snapshot` through the service boundary.

### KB-009 — BQ Updated date is not functional or consistently placed

**Closed in R7.40.** BQ project and Library directories render their persisted
`updatedAt` values, while Master Data pricing uses the shared Updated cell with
the actor label.

### KB-010 — Library results redirect instead of opening resource links

**Closed in R7.40.** StudioFlow Library now opens a UI Engine `Dialog` with
the Brand's published Master Data links. The Library remains read-only and
does not navigate to Master Data for link discovery.

## Closed

No known bugs have been closed in this artifact revision.

## Audit protocol

1. Reproduce the issue and record the route, user action, expected behavior,
   actual behavior, and affected boundary.
2. Fix immediately when the change is safe, scoped, and verified.
3. Otherwise add or update an Open entry with a mitigation and exact owner
   surface.
4. When fixed, strike/remove the entry and add the fix to `CHANGELOG.md`.
