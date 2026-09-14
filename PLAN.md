# Active Plan

Plan ID: F-E-PF-8-FOUNDATION-ACCEPTANCE-AND-FREEZE
Scope: Final Foundation verification, release receipt, and StudioFlow recovery gate
Status: READY
Priority: P1
Owner: Repository owner
Last updated: 2026-09-14

## Outcome

Produce an evidence-backed Foundation acceptance receipt for PF-8. Re-run the
complete repository gates against the approved kantor fixture, verify the
frozen Master Data and BQ application entries remain intact, and document the
candidate accepted Foundation baseline. No StudioFlow Recovery implementation
may begin until the post-commit Reviewer acceptance is recorded.

## Context and Evidence

- F-A through F-D are accepted. F-D was accepted in R8.59 after executable
  boundary checks, full-suite evidence, and browser confirmation of its
  user-facing date consumers.
- `docs/FOUNDATION-BASELINE-FREEZE.md` keeps R8.12 as the frozen StudioFlow RB
  reference and permits the Recovery gate to open only after PF-8 is documented
  and versioned.
- `docs/roadmap.md` defines PF-8 as complete repository gates plus Master Data
  and BQ browser smoke, followed by a documented Foundation baseline.

## Locked Decisions

- This is a verification and release-receipt slice, not a feature or cleanup
  opportunity. Do not change Master Data, BQ, StudioFlow, schema, migrations,
  dependencies, or permission behavior merely because a check exposes a
  pre-existing concern.
- Preserve the pinned R8.12 StudioFlow RB reference, all D-SF ratifications,
  and the recovery freeze. The Executor prepares a candidate acceptance record;
  only Reviewer PASS releases PF-8 and activates SF-A planning.
- Use only the approved disposable rebuild test database. Do not access any
  legacy checkout or database. Do not push, deploy, publish, or alter remote
  state.

## Acceptance Criteria

- A durable PF-8 candidate receipt names the exact Foundation baseline,
  accepted Foundation slices, check results, database scope, frozen StudioFlow
  reference, and the remaining Reviewer browser evidence without claiming an
  unrun result.
- `npm test`, typecheck, lint, boundary check, legacy-runtime check, production
  build, and whitespace review pass from a clean owned change set.
- No production behavior changes; any real verification failure is reported as
  a consolidated finding rather than hidden in acceptance documentation.

## Verification

- Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, this plan, the current Foundation
  baseline record, roadmap, and relevant test/build scripts before acting.
- Confirm the test target explicitly identifies the approved disposable
  `studioflow_rebuild` database before database-backed checks.
- Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run
  check:boundaries`, `npm run check:legacy-runtime`, `npm run build`, and
  `git diff --check`. Stage only the candidate acceptance receipt, required
  ledger changes, and other files directly needed to state the evidence.

## Reviewer Acceptance

After the Executor commit, use the authorized kantor browser fixture at desktop
and 375 px. Smoke `/masterdata` and `/bq`, their primary navigation, and one
representative existing read-only surface per app. Confirm the correct app
navigation and normal rendering; sign out and confirm both roots redirect to
`/login`. If that passes and the candidate receipt agrees with the committed
evidence, record PF-8 PASS, close F-E, and release SF-A planning. Do not turn
this browser smoke into feature testing or create/edit fixture data.

## Risks and Recovery

- A passing automated suite does not release Foundation alone; missing browser
  evidence keeps PF-8 in `docs/review.md` and the plan BLOCKED.
- Any finding that requires product, ownership, schema, or security decisions
  remains a blocker rather than being folded into a release receipt.

## Executor Prompt

You are the Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this `PLAN.md`, then complete the entire READY
F-E/PF-8 Foundation acceptance-and-freeze outcome. Preserve unrelated owner
work, run the required checks against only the approved disposable rebuild
database, prepare the candidate receipt and required ledgers, and create the
next local revision commit. Stop only for a material locked-decision conflict,
unsafe boundary, or failed mandatory evidence; otherwise report the commit,
checks, limitations, and remaining unrelated dirty files.
