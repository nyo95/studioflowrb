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

- [ ] Add one canonical UI Engine image workspace when the first approved
  consumer is activated: picker, preview, crop, zoom/pan, annotation,
  validation, progress, and error states.
- [ ] Connect the canonical rich-text editor to MOM.
- [ ] Audit and connect canonical date/time and project/client lookup controls
  across activated consumers.

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
