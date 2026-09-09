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

## Closed

No known bugs have been closed in this artifact revision.

## Audit protocol

1. Reproduce the issue and record the route, user action, expected behavior,
   actual behavior, and affected boundary.
2. Fix immediately when the change is safe, scoped, and verified.
3. Otherwise add or update an Open entry with a mitigation and exact owner
   surface.
4. When fixed, strike/remove the entry and add the fix to `CHANGELOG.md`.
