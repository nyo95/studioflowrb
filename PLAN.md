# Active Plan

Plan ID: F-C-PF-4-PF-5-SETTINGS-APPEARANCE-UI-ENGINE
Scope: Foundation settings ownership, typed appearance, and UI Engine solidification
Status: READY
Priority: P1
Owner: Repository owner
Last updated: 2026-09-14

## Outcome

Complete the F-C Foundation outcome: keep Platform General Settings narrowly
typed, add only approved global appearance behavior, make app-owned settings
boundaries explicit, and solidify the shared shell, layouts, primitives,
interactions, and token API against current Master Data, BQ, frozen StudioFlow,
and ratified D-SF evidence. The result must improve shared foundations without
activating StudioFlow recovery features.

## Context and Evidence

- R8.51 ratified D-SF-01 through D-SF-07. D-SF now informs F-C/F-D; F-E
  Foundation acceptance still gates all StudioFlow implementation.
- `CORE.md` §11 keeps Platform General Settings a narrow typed aggregate;
  `DESIGN.md` and `UI_ENGINE.md` govern shared appearance and reusable UI.
- The ratified settings boundary is Platform: profile/account, organization and
  general application settings, appearance/theme, and platform access/settings;
  StudioFlow: naming, phase/general/phase-requirement templates, project-engine
  defaults, Schedule configuration, and other workflow defaults. Database
  administration is not a StudioFlow feature.
- Current Master Data, BQ, frozen StudioFlow, and D-SF are evidence consumers;
  their business behavior must not be changed incidentally by Foundation work.

## Locked Decisions

- General Settings remains a small typed platform aggregate, never a generic
  key/value store and never a home for app workflow defaults.
- Appearance/theme is global and typed; UI Engine consumes canonical tokens and
  components. App-local visual substitutes are prohibited where a canonical
  surface exists.
- App settings remain app-owned. F-C may clarify their boundary and navigation,
  but may not implement StudioFlow project requirements, templates, Schedule,
  Product Catalogue cutover, Today, collaboration, SketchUp, or route aliases.
- Add or extend a shared UI surface only when evidence proves it is generic and
  has named consumers. Preserve Core purity and current cross-app boundaries.

## Boundaries and Non-goals

- Do not implement any StudioFlow workflow/domain capability or destructive
  migration/data disposition.
- Do not alter Master Data/BQ business semantics, create a parallel shell,
  duplicate UI primitive, or add an unapproved dependency.
- Do not turn appearance into per-app branding policy or route/local storage
  preferences outside the approved platform contract.

## Acceptance Criteria

- Platform settings, typed appearance, and UI Engine public surfaces have one
  clear ownership boundary and no app-workflow leakage.
- Existing three applications consume the stabilized shared shell/tokens and
  retain their established route, permission, and business behavior.
- Any necessary settings migration/persistence, validation, permissions, tests,
  documentation, and consumer follow-through is cohesive and locally committed
  as R8.52.

## Verification

- Run targeted tests plus typecheck, lint, boundary check, legacy-runtime check,
  and production build. Use an approved disposable rebuild database for any
  required migration/integration validation.
- Inspect changed consumer surfaces and run `git diff --check`. Record skipped
  checks honestly; no browser acceptance belongs in Executor verification unless
  needed to diagnose the implementation.

## Reviewer Acceptance

After the Executor commit, Reviewer runs browser acceptance using the approved
local fixture: authorized settings access, save/reload of typed global
appearance, narrow/desktop shell behavior, and smoke of Master Data, BQ, and
StudioFlow entry/navigation without visual or permission regressions.

## Risks and Recovery

- Shared changes can silently regress one of three app consumers. Keep consumer
  coverage and browser review proportionate to each altered public surface.
- A purported generic UI enhancement may encode an app workflow. Keep such
  policy app-owned and report a genuine contract conflict instead of guessing.

## Executor Prompt

You are the Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this READY `PLAN.md`, then implement the entire
F-C/PF-4+PF-5 Foundation outcome. Preserve ratified D-SF ownership boundaries,
protect Master Data/BQ/StudioFlow behavior, run the required checks, update
`CHANGELOG.md`, and create local revision R8.52. Do not start any StudioFlow
recovery feature, destructive migration, or remote action. Stop only for a
material locked-decision conflict or unsafe boundary; otherwise complete the
coherent outcome and report the commit, checks, limitations, and dirty files.
