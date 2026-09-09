# Product Roadmap

This file is the working list of StudioFlow features that are planned but not
yet complete. A completed item is struck through or removed here, and must
still be recorded in `CHANGELOG.md`.

## StudioFlow — minimum daily product

- [ ] Make deliverable intake the primary trigger for opening/linking an
  iteration.
- [ ] Implement one current deliverable per project-phase with controlled
  replacement of working bytes and permanent metadata/audit history.
- [ ] Show the current deliverable and intake action directly inside phase
  detail.
- [ ] Present to-dos and deliverables as one coherent phase work surface while
  retaining project-owned to-do persistence.
- [ ] Demote internal approval/send controls to contextual actions after a
  deliverable exists.
- [ ] Integrate MOM into project detail.
- [ ] Integrate Product Catalogue/FFNI into project detail.

## Shared foundation

- [ ] Add configurable main-route settings: route users to the selected main
  app (initially potentially StudioFlow) and redirect users without access to
  an allowed landing page.
- [ ] Redesign the UI Engine boundary between the top header and sidebar,
  using the approved Claude design artifact for direction while preserving the
  current semantic color system only where explicitly aligned.
- [ ] Add one canonical UI Engine image workspace when the first approved
  consumer is activated: picker, preview, crop, zoom/pan, annotation,
  validation, progress, and error states.
- [ ] Connect the canonical rich-text editor to MOM.
- [ ] Audit and connect canonical date/time and project/client lookup controls
  across activated consumers.

## Product and operations

- [ ] Revamp the Overview / Operational Catalog surface after its information
  hierarchy and daily workflow are locked.
- [ ] Explore a safe Library crawler: given an approved Master Data website,
  fetch representative logo/image metadata where technically and legally
  possible, show results as catalog cards, and retain a reliable fallback when
  crawling fails.
- [ ] Explore optional AI assistance for organizing StudioFlow files; it must
  be opt-in, auditable, reversible, and never silently change filing state.

## BQ productivity

- [ ] Add a safe calculator expression input for BQ values, such as
  `=15000*3` or `0.5*80000`, with strict parsing and no arbitrary code
  execution.

## Completed and removed from active work

- ~~Global Library MVP with hashtag, brand, and category search.~~
- ~~My Activity / What's Today aggregation.~~
- ~~Project list, project detail, add task, phase management, and phase-scoped
  to-dos.~~
- ~~Explorer-style folder viewer.~~ Explicitly removed from scope, not deferred
  implementation.

## Rules

- Do not add speculative features, screens, entities, or dependencies merely to
  reserve a roadmap item.
- Each completed item gets a changelog entry before it is removed or crossed
  out here.
- Shared capabilities must have one canonical implementation, public export,
  named consumers, and cross-consumer regression evidence.
