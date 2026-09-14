# Active Plan

Plan ID: SF-A-REQUIREMENTS-DEV-RUNTIME-CORRECTION
Scope: Prisma generated-client freshness and runtime availability of Project Requirement routes
Status: READY
Priority: P1
Owner: Repository owner
Target revision: R8.71
Last updated: 2026-09-14

## Outcome

Correct the R8.69 local runtime failure: a normal `npm run dev` startup must
generate and load a Prisma client that includes the committed
`SfProjectRequirement` model. Both General and Phase Requirement routes must
render an existing authorized project instead of failing before their workflow
loads.

## Evidence

- Browser review of R8.69, while authenticated as the existing local fixture,
  opened `/studioflow/60aa751c-1240-4789-98c8-bcc5c377d837/requirements`.
  It rendered the application error state, not Requirements.
- Browser console showed `TypeError: Cannot read properties of undefined
  (reading 'findMany')` inside `listProjectRequirements`.
- The schema contains `SfProjectRequirement`, but the ignored generated Prisma
  client under `src/generated/prisma` did not contain that delegate. `npm run
  dev` starts Next directly, while `npm run build` runs `prisma generate`
  first.

## Locked decisions

- Keep Prisma generated output ignored; do not commit generated client files.
- A normal local development startup must generate the client from the committed
  schema before Next loads server routes. Choose the smallest durable npm-script
  mechanism; do not add dependencies or a development-only data bypass.
- No schema, migration, database contents, Requirements domain rule,
  authorization, audit, or route URL change is authorized unless fresh evidence
  proves an independent defect.
- Keep canonical Requirement routes unchanged:
  `/studioflow/[projectId]/requirements` and
  `/studioflow/[projectId]/phases/[phaseId]/requirements`.
- Do not touch legacy or production data. Use the selected local rebuild
  environment only.

## Executor Verification

1. From a stale or absent ignored generated client state, run the documented
   normal development startup and prove it regenerates the Prisma client before
   route evaluation.
2. Prove `SfProjectRequirement` is present in the generated client and both
   authorized General and Phase Requirement routes return application content,
   not an error boundary.
3. Run focused Requirements tests, `npm test`, typecheck, lint, boundary check,
   legacy-runtime check, production build, and whitespace checks.
4. Update `CHANGELOG.md`, stage only owned files, and create local revision
   R8.71.

## Reviewer Acceptance

After the correction commit, use the approved local authenticated fixture to
run the R8.69 desktop and 375 px acceptance: General and Phase create/edit/
satisfy/reopen/archive/restore, same-project evidence link, unlink reason,
permission denial, and signed-out redirects. Browser mutations must be visible
after revalidation. The Reviewer, not Executor, records PASS.

## Risks

Do not mistake a generated-client mismatch for a migration failure. If the
fresh client then reports a missing database relation, stop and report the
explicit rebuild-only migration state rather than improvising data repair.

## Executor Prompt

You are the Executor. Location: rumah. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this `PLAN.md`. Implement the complete R8.69
local Prisma-development runtime correction within the locked scope, verify it,
update the changelog, and create local revision R8.71. Do not alter legacy,
production data, Requirements behavior, or route URLs. Report the commit,
checks, limitations, and unrelated dirty files.
