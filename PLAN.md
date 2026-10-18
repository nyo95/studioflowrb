# Active Plan

Plan ID: WO-UI-SHELL-HYDRATION-01
Scope: authenticated AppShell hydration at the 840px boundary
Module(s): UI Engine shell; platform route integration
Target revision: R9.136
Risk: medium — shared authenticated shell and route transitions
Status: IMPLEMENTED — target browser and medium gates pass
Priority: P2
Owner: Product Owner
Last updated: 2026-10-18

## Outcome

Direct loads and route history transitions into `/account` at exactly 840px hydrate without React server/client mismatch, including the sequence that previously surfaced after `/masterdata/settings/units`. Desktop/mobile rail and account placement remain unchanged.

## Locked Decisions and Reuse

- Preserve the 840px contract: CSS and JavaScript both treat exactly 840px as desktop; below 840px is narrow.
- Do not suppress hydration warnings or hide a mismatch. Server and first client render must have the same AppShell tree.
- REUSE the existing AppShell, route rules and hydration-safe external-store pattern where applicable. No dependency or visual redesign.
- Add a focused browser regression that listens to console and page errors before navigation and exercises direct load, back and forward at 840px.

## Execution

1. Extend the existing shell hydration browser probe with the captured `/masterdata/settings/units` → `/account` sequence at 840px and repeat it to establish reproduction.
2. Trace the mismatched boundary to the smallest shell/route source and implement a deterministic first render.
3. Run focused component/unit checks, focused browser regression with repetitions, `npm run test:e2e` because the shared shell changes, and a medium gate with production build and exact affected tests. Escalate to high only if evidence crosses auth/data boundaries.
4. Remove the hydration backlog item only after the browser reproduction remains clean and the full screen-size matrix passes.

## Acceptance and Recovery

- No hydration/server-render mismatch is captured on `/account` at 840px through direct load and history navigation.
- Rail exists and stays desktop-collapsed at 840px; topbar account remains hidden. At 839px the rail is horizontal and topbar account visible.
- No sideways overflow or regression across the screen-size route matrix.
- Revert R9.136 to recover; no schema/data change, push, publication or deployment.

## Execution Evidence

- Shell/UI Engine unit regressions passed 64/64.
- The focused 840px hydration/history regression passed 10/10 repeated runs; the complete screen-size matrix passed 80/80, including 839px, 840px and 841px account/rail contracts.
- The full browser suite completed with 179 passed, 5 intentionally skipped workbook scenarios and 6 failures outside the shell slice. The hydration regression and every screen-size scenario passed in that same run. The relevant Notes sender scenario also passed when rerun from a fresh global setup, confirming its full-suite failure was order-dependent fixture state rather than the shell change.
- The final medium gate includes exact affected unit files and a production build. Its evidence path is recorded in `CHANGELOG.md`.

## Executor Prompt

Reproduce and repair the captured AppShell hydration mismatch using the installed Next 16 documentation and the existing shell contracts. Add deterministic browser coverage, run the shell unit/e2e/build gates, update ledgers, inspect the staged diff and create local R9.136. Do not suppress errors or redesign the shell; do not push.
