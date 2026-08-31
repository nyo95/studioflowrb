# StudioFlow Rebuild

A reusable platform foundation from which Master Data, StudioFlow, and BQ will be
rebuilt under explicit contracts.

Current delivery scope is foundation-first:

1. retain the implemented login/session, persisted RBAC, Platform General
   Settings, Core, Utilities, Design, and UI Engine foundation;
2. keep application source and persistence absent until an approved work order
   activates a contract slice;
3. bring UI Engine through UI-F1 before building the first Master Data workflow;
4. rebuild Master Data from its approved contracts; StudioFlow and BQ remain
   deferred.

## Start here

Read [`docs/README.md`](docs/README.md) and [`CHANGELOG.md`](CHANGELOG.md), then the shared contract relevant to the change (`CORE.md`, `DESIGN.md`, or `UI_ENGINE.md`). Read an approved app contract only for an activated planning slice, followed by `prisma/schema.prisma` and the real implementation path when one exists.

The local `../studioflow` repository is stale behavioral evidence, not source of truth and never a runtime/build dependency. Inspect committed code at an exact recorded commit, preserve useful workflows, fix defects, merge duplicated shared capabilities, and purge contradicted behavior.

## Architecture rule

Apps may depend on Platform and another app's explicit `public` surface. Platform never depends on an app, and apps never import another app's internals. Domain-neutral gaps are implemented once in Core, Utilities, or UI Engine before app code consumes them.

## Current execution

Foundation F0 is implemented; its historical locked scope remains in
[`scripts/work-orders/FOUNDATION.md`](scripts/work-orders/FOUNDATION.md). The
repository is currently Foundation-only: no application is registered and no app
schema is active. The next executable work is UI-F1 review/correction, followed
by a separately approved Master Data work order. Nothing is pushed or published
without a separate explicit owner instruction.
