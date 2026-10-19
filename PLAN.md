# Active Plan

Plan ID: WO-SF-ROLE-PROFILES-01
Scope: Replace StudioFlow's ad-hoc role grants with the owner-approved four-role operating matrix.
Module(s): StudioFlow (app-owned policy) reusing Platform Core RBAC role and grant storage.
Target revision: R9.160
Risk: high - this changes live authorization grants and role data. Escalate if a listed grant is unregistered, a canonical role is system-owned, or a local target is not explicitly rebuild-only.
Status: READY
Priority: P1
Owner: Product Owner
Last updated: 2026-10-19

## Outcome

StudioFlow operates through Platform Owner, Designer (shared by Junior and Mid), Drafter, and Manager. Designer is narrowed to its job; Drafter and Manager are available without automatic user-assignment changes.

## Context and Evidence

- `STUDIOFLOW_PERMISSIONS` is the app vocabulary; StudioFlow evaluates access from grants plus PIC facts, never role names.
- Platform Owner receives enabled non-position capabilities but never Designer/Drafter PIC positions automatically. An owner who is also a Designer retains that separate role.
- The validated kantor rebuild database has an overly broad custom `designer` role. Master Data's role is outside this scope.

## Locked Decisions

- Junior/Mid are staffing levels within Designer, not separate permissions.
- Manager contains the entire Designer profile plus `project.manage`; it is Designer-PIC eligible and manages Clients, projects, and PIC assignment.
- Designer/Drafter receive their PIC position plus work, review, requirements, MOM, schedule, and presentation. Neither gets project management, settings, Ideas, or recovery override.
- `project.override` and `phase.override` are Platform Owner recovery authority only.
- Migrate only canonical `designer`, `drafter`, and `studio-manager`: create/revive them, replace only their StudioFlow grants, and keep user assignments, Platform Owner, and unrelated app roles intact.

## Business Rules and Architecture Constraints

- REUSE Platform Core RBAC storage and existing StudioFlow vocabulary. StudioFlow owns the profile policy; Platform Core cannot import it.
- Use a forward-only, idempotent Prisma SQL data migration with deterministic IDs. No schema change.
- Keep generic Platform Access administration; add no role-name authorization or platform-to-app profile registry.

## Backend Contract

- Expose a testable StudioFlow definition of the three custom profile codes, labels, descriptions, and exact permission sets.
- Normalize role names/descriptions, replace old StudioFlow grants only on profile roles, and insert exactly the locked sets.
- Correct permission-directory wording for Manager operations and Platform Owner-only recovery.

## UI Contract

The existing Platform Access Roles directory stays the management surface. No new settings workflow or visual redesign is in scope.

## Boundaries and Non-goals

- No Master Data/BQ/Developer-module/user-assignment/project-PIC/workflow changes.
- No arbitrary custom-role migration, hierarchy engine, recovery delegation, or Ideas enablement.

## Acceptance Criteria

- Designer, Drafter, and Manager have exactly their approved StudioFlow grants after migration.
- Manager has Designer's permissions plus `project.manage`, never either override.
- Designer/Drafter remain separately PIC eligible; Platform Owner remains non-positioned unless separately assigned.
- No unrelated role grant or user-role assignment changes.
- Directory wording no longer says Manager has recovery override authority.

## Verification

High tier. Verify every development/test target used is explicitly `studioflow_rebuild` before database work. Apply only to those targets. Run `node scripts/verify.mjs --tier high --timeout-minutes 15` after edits: full tests, typecheck, lint, boundaries, legacy-runtime, build, whitespace. Add direct profile-composition coverage; full suite covers existing RBAC and StudioFlow consumers. Record target identity/migration state without credentials.

## Reviewer Acceptance

Review the Platform Access Roles list: Designer/Drafter/Manager labels and grants match this matrix; Platform Owner stays separate. Browser acceptance is owner-deferred and must enter the browser backlog, not Executor PASS.

## Regression Risks and Recovery

Bad grants may broaden staff access or block existing Designer work. This migration is idempotent; recovery is a later audited corrective migration, never a manual broad grant replacement. Owner + Designer assignments preserve owner PIC eligibility.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the entire READY backend outcome and nothing beyond it. Inspect current repository evidence, preserve unrelated owner work, run the required checks, update `CHANGELOG.md`, and create the target local revision commit. Stop only for a material locked-decision conflict or unsafe boundary; otherwise report the commit, checks, limitations, and remaining unrelated dirty files.
