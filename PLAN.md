# Active Plan

Plan ID: F-D-PF-6-PF-7-UTILITY-CURATION-EXECUTABLE-BOUNDARIES
Scope: Shared utility curation and executable architectural boundaries
Status: READY
Priority: P1
Owner: Repository owner
Last updated: 2026-09-14

## Outcome

Complete the F-D Foundation outcome: establish the small, evidence-backed set
of domain-neutral shared utilities that genuinely serve multiple consumers,
then make the repository's ownership rules executable. Core purity, public
cross-app reads, permission single sources of truth, app route ownership, UI
Engine ownership, and the prohibition on duplicate primitives must be checked
reliably without changing Master Data, BQ, or frozen StudioFlow business
behavior.

## Context and Evidence

- F-C is accepted in R8.56. `CORE.md` defines Core as domain-neutral
  mechanics, forbids direct cross-app data access, and keeps app policy and
  permission vocabularies app-owned.
- `UI_ENGINE.md` and `DESIGN.md` require canonical tokens/components rather
  than app-local substitutes when a generic surface exists.
- `docs/roadmap.md` defines F-D/PF-6+PF-7 as the next Foundation outcome. The
  ratified D-SF recovery matrix permits a shared task-feed utility only if this
  slice proves a real second consumer; otherwise it remains app-owned.
- `docs/FOUNDATION-BASELINE-FREEZE.md` keeps Master Data and BQ behavior
  stable and prevents StudioFlow recovery work before F-E.

## Locked Decisions

- Consolidate a utility only when the repository proves identical,
  domain-neutral meaning and at least two named consumers. Give each accepted
  utility one canonical implementation, public export, consumer matrix, and
  boundary evidence.
- Preserve app ownership of workflow rules, calculations, settings policy,
  role/grant vocabulary, route content, persistence policy, and historical
  data meaning. Do not make an app capability generic by renaming it.
- Cross-app reads use only the owning app's public contract; no cross-app
  internal imports, implicit writes, database foreign keys, or direct model
  access are introduced.
- The registered permission vocabulary remains the single source of truth;
  UI visibility is never authorization. UI Engine owns a generic primitive or
  token only when its named consumers prove it generic.
- Do not add dependencies, StudioFlow features/routes/schema, destructive
  migrations, or legacy-runtime/database access.

## Boundaries and Non-goals

- This is not a refactor-for-uniformity exercise. Record stable Master
  Data/BQ convergence candidates when their semantics differ or consumer
  evidence is insufficient; do not silently alter their behavior.
- Retain the frozen StudioFlow compatibility surface. In particular, do not
  promote the StudioFlow task feed or a project/catalogue/Schedule mechanism
  without the proof and later plan required by D-SF.
- Improve an existing canonical shared API once when that is warranted; do not
  create private app substitutes or broad generic repositories/frameworks.

## Acceptance Criteria

- An evidence-backed utility/duplicate inventory distinguishes REUSE, EXTEND,
  ADD, APP-OWNED, and PURGE outcomes, names current consumers, and records
  deferred convergence candidates in the appropriate durable document.
- Every accepted shared utility has a canonical public surface and its actual
  consumers use it; no app-local duplicate remains where equivalent generic
  meaning and consumers are proven.
- Executable checks cover Core purity, public cross-app boundaries, permission
  SSOT, route ownership, UI Engine ownership, and prohibited duplicate
  primitives sufficiently to prevent the demonstrated regressions.
- Master Data, BQ, and frozen StudioFlow preserve their established route,
  permission, persistence, and business behavior. No unapproved dependency or
  data/schema change is introduced.

## Verification

- Inspect the current implementation, public exports, app consumers, existing
  boundary checks, and relevant contract evidence before choosing a utility
  outcome. Test both accepted consolidations and newly enforced violations.
- Run targeted tests plus `npm run typecheck`, `npm run lint`,
  `npm run check:boundaries`, `npm run check:legacy-runtime`, the full test
  suite, production build, and `git diff --check`.
- Use an approved disposable rebuild-only database only if an affected test or
  integration check requires one. Never access legacy databases.

## Reviewer Acceptance

If any accepted consolidation changes a user-facing shared UI consumer, run
desktop and 375 px browser smoke for every affected app entry plus the changed
surface, checking navigation, permissions, interaction, and visual regression.
If the committed outcome is purely non-user-facing, record why browser review
is not applicable and review the public-boundary evidence instead.

## Risks and Recovery

- Apparent duplication may encode a different app rule. Preserve it as
  app-owned and record the candidate rather than merging it.
- A boundary rule can be too broad and reject valid public composition. Keep a
  focused regression fixture for every rule and correct the canonical public
  surface instead of allowing an exception by hidden import.
- Shared refactors can regress an otherwise unchanged app. Keep consumer
  coverage proportionate and revert the single F-D revision if a boundary or
  consumer outcome cannot be preserved.

## Executor Prompt

You are the Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the entire READY
F-D/PF-6+PF-7 outcome. Inspect current repository evidence, preserve unrelated
owner work, make sound in-scope implementation decisions, run the required
checks, update `CHANGELOG.md`, and create the target local revision commit.
Stop only for a material locked-decision conflict or unsafe boundary; otherwise
finish the coherent outcome and report the commit, checks, limitations, and
remaining unrelated dirty files.
