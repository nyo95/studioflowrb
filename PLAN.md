# Active Plan

Plan ID: WO-RBAC-UX-01 (Owner authority and task-based role matrix)
Scope: Platform RBAC resolution, Role commands, Roles & Access UI, compatibility migration
Module(s): platform (composition UI labels StudioFlow/BQ/Master Data permissions)
Target revision: R8.508
Status: IMPLEMENTED — AWAITING REVIEW
Priority: P1
Owner: direct decision 2026-10-11
Last updated: 2026-10-12 (Executor; R8.508 corrects the local anonymous `/system` proxy path found during integration verification)

## Outcome

1. Platform Owner always receives every non-position permission currently allowed by the Developer module ceiling. Its grants cannot be edited and its role row explains this instead of showing raw permission ids.
2. Platform settings, users, roles, audit and integration authority are Platform Owner-only. They do not appear in custom-role creation or editing, and crafted requests cannot grant them.
3. Custom roles use a task-oriented matrix with plain labels and short consequences. Technical app-access permissions are hidden and added automatically when a selected task needs them.
4. StudioFlow `project.override` is presented as **Manage every project**, with an explicit warning that it bypasses PIC assignment. Designer and Drafter remain positions, not administrative authority.
5. Existing role design is preserved except for two owner-approved legacy cleanups: Platform permissions are removed from non-system roles, and only the exact `project.override` rows auto-created by the 2026-09-30 compatibility migration are removed from non-system roles. A manually re-added override has a different id and remains.
6. MOM and Product Schedule remain StudioFlow core. Ideas and Presentation remain the only current optional StudioFlow modules. Their Developer switch stays installation-wide, not per project/user.

## Locked Rules

- The exact system role code `platform-owner` is the only RBAC role with implicit owner authority. An active owner role assignment is required before compatibility cleanup on an installation that already has active users; migration must fail rather than silently lock out the office.
- Effective Platform Owner grants are the Developer-enabled registry vocabulary minus app positions. Positions describe job eligibility and are never implied by ownership.
- Disabled optional-module permissions remain outside effective grants and outside the matrix. Dormant stored custom-role grants remain preserved by the existing module mechanism.
- System-role grants cannot be replaced through the service, not merely hidden in the UI.
- Custom roles may contain app permissions only. New or replacement requests containing any `platform.*` id are refused server-side.
- Selecting an app task automatically adds its `<app>.access` dependency. Manage capabilities also add their corresponding read capability where the current routes require it. Positions alone add no app access.
- The UI may translate and group permission ids but must not invent a second authorization engine; persisted/effective authority remains the existing permission vocabulary.
- Compatibility cleanup is additive migration history, never a destructive reset of roles or users.

## UI Contract

- Platform Owner row: “All Developer-enabled access”; no Permissions/Edit/Archive action.
- Custom role summary shows friendly capability names, never raw ids.
- Matrix has app headings, a separate Position row, and human task labels. At minimum:
  - `studioflow.project.override` → “Manage every project”, warning “Can change projects even when the user is not assigned as PIC.”
  - project, phase, MOM, Product Schedule, Ideas and Presentation labels state the work they enable.
  - BQ and Master Data read/manage labels use business names rather than identifier fragments.
- Platform permissions and technical app `access` rows are absent.
- Copy states that Developer-disabled modules are absent and necessary access dependencies are added automatically.
- Use existing UI Engine components and retain keyboard/accessibility behavior.

## Verification

- Pure UI-model tests: owner-only/platform and technical access permissions hidden; positions separate; friendly labels; override warning; dependency expansion.
- RBAC integration: owner gets every enabled non-position permission even when stored grants are stale; disabled module grant stays absent; ordinary roles do not gain implicit permissions; custom-role Platform grants and system-role grant replacement are refused.
- Migration on disposable PostgreSQL: all migrations apply; non-system Platform grants and only legacy-generated override rows are removed; system/manual override grants remain.
- Browser: owner row has no permission editor; new custom role matrix has no Platform/access checkboxes; “Manage every project” warning is visible; Ideas disappears when Developer disables it; role save persists expanded dependencies.
- Mandatory repository gates: `npm test`, typecheck, lint, boundary check, legacy-runtime check, production build, staged and unstaged whitespace checks.

## Non-goals

No new role hierarchy or hardcoded Manager role; no per-project module switch; no MOM/Schedule modularization; no change to PIC rules; no new permission ids; no Ideas/Presentation extraction; no deployment or push.

## Executor Prompt

You are the Backend Executor working in cloud on the same checkout. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, `PLAN.md`, and `docs/apps/platform/MODULES-DECISION.md` D4/D5. Implement WO-RBAC-UX-01 exactly as R8.507: implicit Developer-enabled non-position authority for the locked Platform Owner role, owner-only Platform permissions, system-role immutability, safe compatibility cleanup, automatic app dependency expansion, tests and minimal functional UI wiring. Do not modularize MOM/Schedule or introduce per-project module state. Use only a verified disposable rebuild database for migrations, run mandatory gates, update the changelog, and commit locally without pushing.
