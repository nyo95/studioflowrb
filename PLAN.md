# Active Plan

Plan ID: WO-SF-12-13-01
Scope: StudioFlow Today scope accessibility and document print route resilience
Target revision: R8.196
Status: IMPLEMENTED - browser evidence partial
Priority: P2
Owner: owner (Product Owner)
Last updated: 2026-09-29

## Outcome

StudioFlow's Today scope choices are valid links with an understandable selected state, and authenticated StudioFlow
print routes show the product's normal loading and recovery states rather than a blank or unstyled failure page.

## Locked Decisions

- Fix only backlog bugs SF-12 and SF-13; do not change Today filtering behavior, print data, permissions, or print layout.
- Scope controls navigate through their existing URLs. They are links, not toggle buttons; the current scope is exposed with
  `aria-current` and the existing shared filter-chip visual classes.
- A single `(document)` route-segment loading and error boundary covers the existing StudioFlow Schedule, MOM, and
  Presentation print pages. The error boundary uses the existing UI Engine recovery pattern and remains authenticated
  through the existing document layout.
- Browser acceptance is authorized by the owner for these two fixes only. It does not close the unrelated sample-request
  or Presentation acceptance items.

## Implementation Contract

- Replace the nested `Link > FilterChip(button)` structure in the StudioFlow Today page with links styled by
  `filterChipClasses` and the appropriate `aria-current` state.
- Add `(document)/loading.tsx` and `(document)/error.tsx`; error must be a client boundary and provide retry through the
  existing `EmptyState` and `Button` components.
- Close the SF-12 `[BUG]` record after browser verification. Convert SF-13 to `[UNVERIFIED]` if normal print behavior is
  verified but a generic unexpected-error state cannot be safely induced. Record the revision, browser evidence,
  automated checks, and remaining unrelated dirty files in `CHANGELOG.md`.

## Verification

- Run the mandatory automated suite: `npm test`, typecheck, lint, boundary check, legacy-runtime check, production build,
  and staged/unstaged whitespace checks.
- Browser: authenticated user with access to multiple StudioFlow projects opens Today, verifies each scope link navigates
  and selected state changes; opens an authorized Schedule print page and verifies document rendering. An invalid print
  target is expected to be 404; induce the generic recovery boundary only through a safe dedicated test trigger.

## Boundaries and Non-goals

- Do not modify StudioFlow Schedule implementation, Master Data, BQ, notification behavior, fixture data beyond what the
  browser acceptance requires, or existing sample-request / Presentation acceptance records.
- No visual redesign or new shared UI component.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this `PLAN.md`, then
implemented SF-12 and SF-13. Preserve unrelated owner changes in the StudioFlow Schedule files. The automated suite and
normal browser paths passed; the unexpected-error print fallback needs a dedicated safe browser trigger before it can be
accepted. Create local revision R8.196. Do not close sample-request or Presentation acceptance.
