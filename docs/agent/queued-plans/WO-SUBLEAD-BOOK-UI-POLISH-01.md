# WO-SUBLEAD-BOOK-UI-POLISH-01 — To-dos and My tasks polish (queued)

Status: QUEUED (Lead, 2026-10-24). Lane: SUB-LEAD (`docs/agent/SUB-LEAD.md`). Tier: medium (UI inside one module,
existing UI Engine components, no new pattern or token, no data or permission change).
Branch: `sublead/book-ui-polish`, cut from `feat/project-book`. Changelog ids `S-20261024-<n>`.
Source: `docs/UIUX-CRITIQUE-2026-10-24.md`, section (a), items A1-A9.

## Scope

Fix exactly A1-A9 of the critique, nothing else. Files expected: `projects/[projectId]/_book-todos/book-todos-panel.tsx`,
`_components/my-tasks.tsx`, `_components/read-only-notice.tsx` (copy only), the manager's notes empty state
(`_notes-stream/notes-chat.tsx`, copy only), `studioflow/page.tsx` (grouping only), and, for A9 only, the shared
`StatGrid` in `src/platform/ui_engine/components/stats.tsx`.

## Locked

- Do not change who sees or may do what (the panel's `canWrite` rule, server guards), server code, schema, actions.
- Do not move the panel, reorder the page, or move My tasks beside the project cards: those are owner decisions
  B1 and B2 and are not part of this task.
- A7 grouping: Late (due before today in the platform zone), This week (due within the next 7 days), Later (the
  rest, including no date). Late is decided in the client against `today` already passed in. No "Mentions" yet.
- A9 changes a shared component: keep its API, update its test, and list it under "Lead check".
- If any item needs a new token, a new shared pattern, or a change to `DESIGN.md`/`UI_ENGINE.md`: stop and report it.

## Done when

1. A1-A9 each fixed as the critique's "smallest fix" says (or reported as not possible, with why).
2. `npm run lint`, `npm run typecheck`, `npm run check:boundaries`, and the tests for `stats.tsx` pass.
3. Screens checked at 1440, 1280, 840 and 390 px, light and dark, as designer PIC, member and manager (disposable
   rebuild database only); screenshots not committed. If the browser walk is deferred, say so under "Lead check".
4. One `(Sub-Lead)` changelog entry per commit with a `**Lead check:**` line.
