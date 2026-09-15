# Active Plan

Plan ID: SF-RF-WAVE1-PARITY-ACCEPTANCE
Scope: Final browser acceptance and freeze for StudioFlow wave 1 parity
Status: ACCEPTED — R8.75 (2026-09-15)
Priority: P1
Owner: Repository owner
Last updated: 2026-09-15

## Outcome

StudioFlow wave 1 is accepted end to end on the kantor rebuild database: SF-R1
project backbone, SF-R2 MOM, and SF-R3 Product Schedule all pass desktop and
mobile browser walkthroughs with owner and drafter-only permissions. When the
walkthrough passes, temporary legacy redirects are removed and the roadmap,
review ledger, changelog, and local revision commit record the accepted baseline.

## Context and Evidence

- Authority: `docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md`, especially
  permissions, archive read-only behavior, phases/revisions/tasks, Today, MOM,
  Product Schedule, centralization, and UI sections.
- Implementation baseline: R8.71 through R8.74, including R8.74 review
  corrections for SF-R1...SF-R3.
- Work order: `scripts/work-orders/R8.74-and-SF-RF-prompt.md` Part B.
- Owner decisions for this acceptance: MOM "Plain" notes intentionally render
  without numbering; the phase accent palette remains a good idea/proposal, not
  a blocking approved requirement.

## Locked Decisions

- Use only the kantor rebuild database and set `STUDIOFLOW_LOCATION=kantor`
  before repository tooling.
- Do not touch any legacy database or legacy runtime. Legacy redirects may be
  removed only after the acceptance walkthrough passes.
- Do not change schema or add dependencies for SF-RF.
- Small obvious UI or ledger fixes discovered during acceptance may be included
  in R8.75; material behavior defects must be recorded in `docs/knownbug.md`
  rather than silently redesigned.

## Boundaries and Non-goals

No push, pull request, deployment, release, legacy code import, legacy database
access, or broad product redesign. SF-RF verifies and freezes wave 1 parity; it
does not start SF-R4/SF-R5.

## Acceptance Criteria

- Each Part B checklist line in the work order is walked at 1440 px and 375 px
  with a real owner account and a drafter-only account.
- `docs/review.md` contains a new SF-RF section with pass/fail evidence per
  checklist line and notes the two owner decisions above.
- Any accepted open defect is recorded in `docs/knownbug.md`; no unrecorded
  in-scope acceptance failure remains.
- When the checklist passes, temporary redirects in `next.config.ts` for
  `/projects...`, `/upcoming`, `/settings/studio`, and `/settings/clients` are
  removed.
- `docs/roadmap.md` marks SF-R1, SF-R2, SF-R3, and SF-RF complete, and
  `CHANGELOG.md` records R8.75.

## Verification

Run proportionate full checks after any SF-RF edits:

- `npx prisma generate`
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run check:boundaries`
- `npm run check:legacy-runtime`
- `npm run build`
- `npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` with a rebuild-only shadow database

## Reviewer Acceptance

Browser acceptance is the main work of this plan. It covers Projects & clients,
Phases & revisions, Checklist & Today, MOM, Product Schedule, permission/read-only
states, archived project read-only states, History evidence, and desktop/mobile
layout at 1440 px and 375 px.

## Risks and Recovery

- If the kantor database lacks suitable users or fixture data, create only
  rebuild-local acceptance fixtures with non-secret temporary credentials and
  do not print secrets.
- If a workflow failure is material, record it in `docs/knownbug.md` and stop
  short of PASS unless the fix is small and clearly inside this plan.
- If browser automation cannot run, record exactly which acceptance evidence is
  missing; do not claim PASS.

## Executor Prompt

You are the Executor and Reviewer for the final acceptance pass. Location:
kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, `docs/agent/REVIEWER.md`,
and this `PLAN.md`, then complete the entire READY outcome. Walk the SF-RF
browser acceptance checklist from `scripts/work-orders/R8.74-and-SF-RF-prompt.md`
on the kantor rebuild database at 1440 px and 375 px using owner and
drafter-only accounts, record evidence in `docs/review.md`, remove the temporary
legacy redirects only after acceptance passes, update `docs/roadmap.md` and
`CHANGELOG.md`, run the required checks, inspect the staged diff, and create the
target local revision commit `R8.75 | chore(studioflow): wave-1 parity acceptance
(SF-RF)`. Stop only for a material acceptance failure or unsafe boundary; otherwise
finish and report the commit, checks, limitations, and remaining unrelated dirty
files.
