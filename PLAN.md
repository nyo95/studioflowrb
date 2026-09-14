# Active Plan

Plan ID: F-D-PF-6-PF-7-UTILITY-CURATION-EXECUTABLE-BOUNDARIES
Scope: Shared utility curation and executable architectural boundaries
Status: BLOCKED
Priority: P1
Owner: Repository owner
Last updated: 2026-09-14

## Outcome

F-D/PF-6+PF-7 implementation is complete in R8.57 (`e1580f9`). Automated
evidence is accepted; the only remaining acceptance evidence is the required
browser smoke for the four user-facing date-cell consolidations. F-E remains
unplanned until this plan receives Reviewer PASS.

## Accepted Implementation Evidence

- R8.57 adds the evidence-backed utility inventory, consolidates four
  behavior-identical `Intl.DateTimeFormat` uses onto `formatInstant`, and
  makes the planned Core, UI Engine, cross-app, permission, route-ownership,
  and duplicate-primitive rules executable.
- Independent review reproduced: boundary fixtures, `check:boundaries`,
  typecheck, lint, legacy-runtime check, and all 353 tests against the
  approved disposable kantor test database. The working tree and whitespace
  check are clean.
- The date changes preserve each prior locale, timezone, and display style:
  Master Data Brands, Vendors, and Deletion Requests retain medium date plus
  short time; BQ Library retains medium date only.

## Remaining Reviewer Acceptance

- Use the approved local kantor browser fixture at desktop width and 375 px.
- For **Master Data**, sign in with its authorized grants; open a Brand and a
  Vendor edit dialog with an existing `updated_by_label`, then open the pending
  Deletion Requests directory. Confirm each date retains the expected locale,
  configured timezone, medium-date/short-time display, and the surface remains
  usable at both widths.
- For **BQ**, sign in with BQ access; open `/bq/library` and confirm an item
  shows the expected locale/timezone medium-date-only `Updated` value, with no
  navigation, permission, or visual regression at both widths.
- Sign out and confirm the affected app roots still redirect to `/login`.

## Unblock Result

On PASS, record browser evidence, close F-D in `docs/roadmap.md`, remove its
entry from `docs/review.md`, and replace this plan with the coherent F-E/PF-8
Foundation acceptance-and-freeze plan. On an observed defect, issue one
consolidated correction plan; do not start F-E.
