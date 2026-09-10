# StudioFlow R7.53 — Product Catalogue Reuse Pool

## Status

Active executable work order. Execute after R7.52 MOM acceptance.

## Objective

Implement the independent StudioFlow-owned Product Catalogue reuse pool shared
across StudioFlow projects, without importing Master Data SKU, unit, or pricing
logic.

## Locked rules

- Catalogue rows are reusable StudioFlow specifications, not Master Data SKUs.
- StudioFlow may read Master Data only through the public Brands boundary.
- A catalogue row may retain an opaque brand id plus frozen brand name; no
  cross-app foreign key and no Master Data write/read for SKU, unit, or price.
- Specification fields are explicit columns: brand, product name, colour,
  finishing, dimension text, unit, notes, and derived normalized search key.
- Project selection copies a snapshot; later catalogue edits never rewrite a
  project. Project schedule/FFNI is a later slice, not this work order.
- Use internal identity plus sort order; never use a visible code as identity
  or uniqueness mechanism.

## In scope

- Catalogue schema/migration, project-independent service boundary, permissions,
  audited create/edit/archive or restore behavior as supported by the contract.
- Search/filter/list/detail/edit UI with loading, empty, error, permission,
  archived, long-content, and narrow viewport states.
- Brand picker through the existing public Brand read port only.
- Focused integration/UI tests, boundary tests, browser smoke evidence, and
  documentation updates after verification.

## Out of scope

- No Master Data SKU/unit/pricing reads or writes; no BQ link.
- No project schedule entries, FFNI snapshots, templates, product requests,
  vendor follow-up, price promotion, images, SketchUp, or storage expansion.
- Do not invent a generic shared catalogue in Core; ownership is StudioFlow.

## Required evidence and gates

Read all mandatory docs, this contract, schema, current StudioFlow code, and
legacy catalogue/schedule evidence read-only. Record HEAD/branch/dirty state.
Run Prisma validate, typecheck, lint, boundaries, legacy-runtime, focused/full
tests, build, and populated browser smoke at desktop/collapsed/narrow widths.
Unavailable checks are not pass; do not claim zero gap without end-to-end
project snapshot evidence in the later schedule slice.

## Delivery

Update `CHANGELOG.md`, stage only owned files, inspect the staged diff, and make
exactly one local commit:

`R7.53 | feat(studioflow): add product catalogue reuse pool`

Never push or alter remote state.
