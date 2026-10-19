# Active Plan

Plan ID: WO-SF-ROLE-CD-01
Scope: StudioFlow role matrix, project-detail privacy, and Construction Drawing workspace ownership
Module(s): StudioFlow; platform role editor and authenticated navigation
Target revision: R9.137
Risk: high — RBAC, project-confidential reads, shared app navigation, and phase write authority
Status: IMPLEMENTED — final verification and publication in progress
Priority: P1
Owner: Product Owner
Last updated: 2026-10-19

## Outcome

StudioFlow exposes a small business-facing hierarchy without treating technical override as a job title: Designers get Home/My Projects, the read-only project directory, Library, and assigned project work; Studio Managers get the operational directories and portfolio visibility; Platform Owners additionally hold cross-project override authority. Unassigned Designers cannot open project detail. Construction Drawing opens a CD List surface instead of Notes/Workspace, with assigned Drafter write authority and assigned Designer read-only visibility.

## Locked Decisions and Reuse

- REUSE the existing grants: `project.manage` represents Studio Manager operations and `project.manage + project.override` represents Platform Owner cross-project authority. Do not add a new role enum or infer authority from a role name.
- Designers may see the project directory but cannot create, edit, archive, assign PIC, open Clients/portfolio Timeline/StudioFlow Settings, or open an unassigned project's detail.
- Clients and portfolio Timeline require `project.manage`; Timeline mutation controls require the existing cross-project override combination. Platform Owner remains the only manual scheduling override authority.
- The role editor keeps job positions (Designer/Drafter) separate from authority and presents `project.manage` as studio operations, not assigned-project editing.
- On the Construction Drawing phase, the primary content is CD List. The assigned Drafter may mutate it when the phase/project is writable; the assigned Designer and Studio Manager may only read it. A Drafter-only PIC sees only Drafter-seat phase content and no Notes/Workspace surface.
- REUSE the existing CD List domain/service/UI, project access facts, and module-safe Server/Client component boundaries.
- Deliverables and automatic Timeline behavior are documentation-only in this revision. Record owner decisions and exact legacy evidence in KB; do not change their runtime model until the remaining contract is resolved.

## Execution

1. Tighten StudioFlow navigation, direct routes, client reads/search, project-detail entry, and Timeline edit affordances to the locked grant matrix; fix the platform shell's access-only count call.
2. Enforce Drafter-only CD List mutations in the service and render CD List as the Construction Drawing phase surface, with Designer/manager read-only behavior and Drafter-only phase filtering.
3. Inspect the documented legacy repository only at commit `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`; write a KB evidence/decision note and backlog entries for Deliverables and automatic Timeline.
4. Add focused RBAC/service/component regressions, run the exact affected tests, full test/build gates, and browser acceptance against a disposable migrated database.
5. Update `CHANGELOG.md`, inspect the final diff, commit R9.137, fetch `origin/main`, verify fast-forward safety, and push `main`.

## Acceptance and Recovery

- Designer navigation shows Home, Projects, Library and permitted optional modules; direct Clients/portfolio Timeline access is denied. Studio Manager can view those operational pages; only override authority sees Timeline mutation controls.
- An unassigned Designer is rejected before project-confidential detail is rendered; assigned PICs and Studio Managers retain appropriate visibility.
- Construction Drawing never renders Notes/Workspace. Assigned Drafter CRUD succeeds; Designer and Studio Manager CD mutations fail at the service boundary while reads remain available to permitted project viewers.
- Deliverables/Timeline KB cites the legacy URL/commit and clearly separates observed legacy behavior, owner decisions, open contract questions, and deferred runtime work.
- Revert R9.137 to recover; no schema migration or data rewrite is planned.

## Verification Evidence

- Focused permission/navigation tests: 12/12 passed; StudioFlow disposable-database integration: 226/226 passed.
- Focused browser acceptance: role matrix and CD List 2/2; non-PIC/Notes/Master Data regression 3/3; updated Role Matrix and five desktop CD workspace cases 6/6.
- High gate before the browser expectation-only corrections passed boundaries, legacy-runtime, whitespace, typecheck, full lint, all 1,239 tests, Prisma generation, and production build. The full browser matrix exposed six stale assertions caused by the intentional CD/permission-copy contract change; after correction, their exact six-case rerun passed. Three unrelated order-sensitive browser failures and five intentionally skipped workbook scenarios remain recorded, not called green.

## Executor Prompt

Implement the locked RBAC and CD List changes using the existing permission vocabulary and installed Next.js guidance. Keep Deliverables and Timeline automation out of runtime scope, document their evidence in KB, run high verification plus focused browser acceptance on an isolated database, update the changelog, then push a fast-forward R9.137 to main.
