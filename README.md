# StudioFlow Rebuild

A reusable platform with implemented Master Data, BQ, and StudioFlow project
workflow slices, rebuilt under explicit contracts.

Current delivery state through R7.40:

1. retain the implemented login/session, persisted RBAC, Platform General
   Settings, Core, Utilities, Design, and UI Engine foundation;
2. Master Data and BQ are implemented applications protected against regression;
3. StudioFlow project/client, phases, tasks, My Activity, file metadata, and
   Library slices are implemented;
4. remaining product work and defects are tracked by application in
   [`docs/roadmap.md`](docs/roadmap.md) and
   [`docs/knownbug.md`](docs/knownbug.md).

## Start here

Read [`docs/README.md`](docs/README.md) and [`CHANGELOG.md`](CHANGELOG.md), then the shared contract relevant to the change (`CORE.md`, `DESIGN.md`, or `UI_ENGINE.md`). Read an approved app contract only for an activated planning slice, followed by `prisma/schema.prisma` and the real implementation path when one exists.

StudioFlow legacy is behavioral evidence only, never an implementation base or
runtime/build dependency. Its location differs between the owner's computers;
before any access, ask for the exact current-computer path and follow the strict
read-only repository and PostgreSQL isolation rules in `AGENTS.md`. Preserve
useful workflows, fix defects, merge duplicated shared capabilities, and purge
contradicted behavior while rebuilding isolated code and persistence from zero.

## Architecture rule

Apps may depend on Platform and another app's explicit `public` surface. Platform never depends on an app, and apps never import another app's internals. Domain-neutral gaps are implemented once in Core, Utilities, or UI Engine before app code consumes them.

## Current execution

Foundation F0 and multiple application slices are implemented; historical work
orders remain under [`scripts/work-orders`](scripts/work-orders). Use
[`docs/README.md`](docs/README.md) for the active documentation map and
`CHANGELOG.md` for exact revision evidence. Nothing is pushed or published
without a separate explicit owner instruction.
