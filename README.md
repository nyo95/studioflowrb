# StudioFlow Rebuild

A reusable modular core with application modules for Master Data, StudioFlow, and BQ.

Current delivery scope is foundation-first:

1. lock and implement real login/session, persisted RBAC, Platform General Settings, Core/Utilities, Design, and the activated UI Engine stage;
2. record likely future shared capabilities without prebuilding speculative helpers;
3. use Master Data as the first consumer only after its full code-derived contract is approved;
4. defer StudioFlow and BQ until the owner activates them.

## Start here

Read [`docs/README.md`](docs/README.md) and [`CHANGELOG.md`](CHANGELOG.md), then the shared contract relevant to the change (`CORE.md`, `DESIGN.md`, or `UI_ENGINE.md`). Read an app contract only when that app is active, followed by `prisma/schema.prisma` and the real implementation path.

The local `../studioflow` repository is stale behavioral evidence, not source of truth and never a runtime/build dependency. Inspect committed code at an exact recorded commit, preserve useful workflows, fix defects, merge duplicated shared capabilities, and purge contradicted behavior.

## Architecture rule

Apps may depend on Platform and another app's explicit `public` surface. Platform never depends on an app, and apps never import another app's internals. Domain-neutral gaps are implemented once in Core, Utilities, or UI Engine before app code consumes them.

## Current execution

Foundation F0 is locked in [`scripts/work-orders/FOUNDATION.md`](scripts/work-orders/FOUNDATION.md). OpenCode executes that work order; Codex remains navigator/reviewer. Every completed change updates the changelog and receives a revisioned local commit. Nothing is pushed or published without a separate explicit owner instruction.
