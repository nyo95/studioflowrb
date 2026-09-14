# Active Plan

Plan ID: D-SF-LEGACY-RECOVERY-DISCOVERY
Scope: Read-only StudioFlow legacy extraction and recovery contract
Status: READY
Priority: P1
Owner: Repository owner
Last updated: 2026-09-14

## Outcome

Produce a current, traceable D-SF recovery discovery package from the pinned
legacy source. It must ratify or correct the existing StudioFlow contracts with
an end-to-end capability, route, settings, permission, persistence/ownership,
shared-capability, and downstream-read matrix. Every meaningful retained
legacy behavior must be classified as KEEP, MERGE, ALREADY_REPLACED, REDESIGN,
PURGE, or DECISION_REQUIRED. This is documentation-only discovery: it creates
no app code, schema, route, dependency, test fixture, or legacy change.

## Context and Evidence

- Rebuild HEAD is `87681653cfaca6aaa14e736c5d51d41807077fc7` on
  `studioflow/contracts`; the next local revision is R8.48.
- The owner supplied legacy source at `D:\Misc\ProjectsHUB\studioflow`.
  Read-only Git verification found branch `main`, pinned HEAD
  `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`, and origin
  `https://github.com/nyo95/studioflow.git`.
- Legacy working tree has untracked `foldering/` and two recovery dumps under
  `tmp/`. They are working-tree-only evidence and are out of scope; do not
  read, open, copy, run, or otherwise access them.
- The pin contains project overview/phase/activity/deliverable/Product
  Catalogue/MOM/SketchUp routes, project live collaboration, schedule,
  settings (including database), actions/services/API routes, and focused
  schedule/checklist/task tests. Existing StudioFlow contracts and the
  historical audit are starting hypotheses, not proof for this pin.
- `docs/roadmap.md` sequences D-SF before F-C/F-D. D-SF completion is a
  recovery-discovery contract, not implementation of a StudioFlow feature.

## Locked Decisions

- Legacy is read-only evidence at the exact pin only. Use read-only Git
  commands scoped to that commit; do not read legacy working-tree files.
- Legacy PostgreSQL and all related database/service/container/volume/backup
  artifacts are forbidden, including the two untracked dumps.
- Canonical rebuild hierarchy remains `/studioflow/projects/...`; classify
  legacy route names as canonical, compatibility redirect, or purge evidence.
- StudioFlow owns project workflow and project-scoped catalogue selections;
  Master Data and BQ can only be public, read-only sources where the approved
  contracts say so. No cross-app internal import, write, or database foreign
  key is permitted.
- Do not silently choose product meaning for Upcoming, Database Settings,
  project live/chat, MOM, or treatment of existing global catalogue data. Give
  a bounded DECISION_REQUIRED record when the committed source and approved
  contracts do not resolve it.

## Boundaries and Non-goals

- Do not change production code, Prisma schema/migrations, routes, runtime
  configuration, dependencies, or the legacy checkout.
- Do not turn the output into a file-by-file transcription. Each matrix row
  must name the user workflow, source evidence, classification, rebuild owner,
  boundary, and next action or decision.
- Preserve existing approved contract decisions unless committed evidence at
  this pin proves an inconsistency; record the contradiction rather than
  weakening a security or ownership rule.

## Acceptance Criteria

- A durable D-SF recovery report (or a clearly updated existing discovery
  document) records the baseline above and links each substantive conclusion
  to exact pinned paths/symbols.
- It covers the full path from dashboard/navigation through UI states, action
  or API boundary, domain rule, persistence/transaction, permission/audit,
  downstream reads, and available tests for projects/phases, activity/tasks,
  deliverables, product catalogue/schedule, MOM, SketchUp, live collaboration,
  settings, and cross-app touchpoints.
- It contains the required matrices and a consolidated decision register for
  unresolved product choices. There are no invented permissions, schemas, or
  migration promises.
- Existing StudioFlow contracts/index are updated only where the discovery
  changes their factual status; `docs/roadmap.md` is updated only if this
  discovery outcome is truly complete.

## Verification

- Verify every cited legacy path exists at the exact pin and every cited
  behavior is derived from committed source rather than the dirty tree.
- Re-read the final report against the current StudioFlow contracts for route,
  ownership, permission, and shared-layer conflicts.
- Run documentation/link/whitespace checks available in this repository and
  `git diff --check`. No browser acceptance, database command, or production
  build is applicable to a documentation-only, read-only discovery change.

## Risks and Recovery

- A stale historical conclusion or undocumented legacy behavior could lead to
  a wrong later implementation. Resolve it with exact pinned source evidence,
  or retain it as DECISION_REQUIRED; never infer it from a dump or from current
  uncommitted legacy files.
- If source evidence contradicts a locked current contract, stop before making
  a policy change and report the exact conflict for Planner/Reviewer review.

## Executor Prompt

You are the Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this READY `PLAN.md`, then complete the entire
D-SF legacy recovery discovery outcome. Use only the pinned committed legacy
source as read-only evidence, preserve unrelated owner work, update the
necessary durable documentation and `CHANGELOG.md`, run the required
documentation checks, and create local revision R8.48. Do not access legacy
working-tree artifacts or any legacy database. Stop only for a material locked
decision conflict or unsafe boundary; otherwise finish and report the commit,
checks, limitations, and remaining unrelated dirty files.
