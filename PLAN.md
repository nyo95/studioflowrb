# Active Plan

Plan ID: SF-A-CORRECTION-PASS
Scope: Confirmed R8.69 regressions — five P1 corrections, one documentation correction, and one P2 scaffold
Status: READY
Priority: P1
Owner: Repository owner
Target revision: R8.72
Last updated: 2026-09-14
Depends on: R8.71 PASS (closed)

## Outcome

Correct the confirmed controller/UI regressions from the R8.69 review. Keep
StudioFlow's canonical project-detail route and document the deferred SF-0
design work without refactoring UI Engine.

## Locked decisions

- No schema, migration, database data, Requirements domain rule, authorization,
  or audit behavior changes.
- Activity Center is the UX-spec §2a workflow-state surface: **Menunggu Saya**,
  **Menunggu Klien**, and **Belum Ada Penanggung Jawab**. It is not a
  project-grouped Today surface.
- The canonical project-detail route is `/studioflow/projects/[projectId]`.
- Narrow-screen work may prevent page overflow only; it must not restructure
  the workspace.
- `TODO(SF-0)` comments are scaffolding only. Do not refactor UI Engine.

## Executor verification

1. Confirm named-client project creation retains `client_name` through the
   action input and revalidation.
2. Confirm archived Requirements render no mutation control, including evidence
   unlink.
3. Confirm Activity Center remains workflow-state grouped.
4. Audit Project List, Project Detail, and both Requirements routes at 375 px.
5. Run focused StudioFlow tests, `npm test`, typecheck, lint, boundary check,
   legacy-runtime check, production build, and whitespace checks.
6. Update `CHANGELOG.md`, stage owned files only, and commit R8.72 locally.

## Reviewer acceptance

After R8.72, independently exercise desktop and 375 px Requirement lifecycle,
evidence-link/unlink, permission denial, signed-out redirects, and revalidation.
