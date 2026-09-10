# UI Engine Audit — Canonical Date/Time and Project/Client Lookup Controls

Status: audit performed 2026-09-10, per roadmap.md "Audit canonical date/time
and project/client lookup controls across activated consumers." This is an
audit record with a recommendation, not an approved contract — it needs owner
sign-off before the consolidation it recommends is executed.

## Scope and method

Read the shared mechanism (`platform/utilities/date`, `DisplaySettingsProvider`)
and one representative date-rendering and one lookup-control site per
activated consumer (Master Data, BQ, StudioFlow). This is a sample, not an
exhaustive line-by-line sweep of every route.

## Finding 1 — no single canonical date/time display control exists

`src/platform/utilities/date/index.ts` exports `formatInstant` and
`formatDateOnly`: pure, locale/timezone-parameterized formatters meant to be
the one shared way to render a date. In the three consumers sampled, **none
of them call it**. Each hand-rolls its own `Intl.DateTimeFormat` call instead:

- `src/app/(platform)/masterdata/updated-cell.tsx` (`UpdatedCell`): reads
  `locale`/`timezone` from `useDisplaySettings()`, then builds its own
  `new Intl.DateTimeFormat(locale, { timeZone: timezone, dateStyle: "medium",
  timeStyle: "short" })`.
- `src/app/(platform)/bq/page.tsx`: builds its own
  `new Intl.DateTimeFormat(settings.locale, { timeZone: settings.timezone,
  dateStyle: "medium" })`, called twice inline (once for "Updated", once for
  "Created").
- `src/app/(platform)/studioflow/projects/page.tsx`: builds its own
  `new Intl.DateTimeFormat(settings.locale, { ... })` (a third, separately
  configured options object) plus a hand-rolled relative "age" calculation
  (`ageLabel`, `Math.floor((Date.now() - since.getTime()) / 86_400_000)`).

All three correctly source `locale`/`timezone` from the shared settings
(context or the settings singleton), so the *input* is consistent. What is
not consistent is the *formatting call and its options* — three separate
`Intl.DateTimeFormat` configurations for what is visually "when was this
updated," with no shared component a fourth consumer could reach for. This is
exactly the roadmap concern: "canonical date/time... controls" — plural
concept, no canonical control.

**Recommendation (not yet executed):** add one UI Engine display component
(e.g. `<FormattedInstant value locale timeZone style="date"|"datetime"|"age">`)
built on top of `platform/utilities/date`'s existing pure formatters, and
migrate the three sampled call sites to it. This is additive to UI Engine
(new component, no existing API removed) and does not touch app-owned
business logic — it should not need a design-artifact-blocked visual redesign
to proceed, unlike Finding 2 below.

## Finding 2 — project/client lookup is canonical where it applies, absent where it structurally can't be

- `src/app/(platform)/studioflow/new/project-form.tsx` **correctly uses the
  canonical `CreatableSearch`** UI Engine pattern for its Client picker
  (select-existing-or-create-inline), matching the pattern `masterdata-handoff.md`
  already names as the target for Vendor quick-entry. No gap here.
- `src/app/(platform)/bq/project-form.tsx` has **no lookup at all** — client
  is a plain free-text `Input name="clientName"`. This is very likely correct
  as-is rather than a defect: BQ is not permitted to read StudioFlow's Client
  table directly (Dependency law: no cross-app internal reads; StudioFlow's
  public boundary exposes no client-lookup port today), and a BQ estimate
  commonly predates a matching StudioFlow project. Flagging this explicitly so
  it is not "fixed" into a boundary violation later — if BQ-to-StudioFlow
  client linking is ever wanted, it needs its own public-port contract
  decision, not a UI Engine change.

**No consolidation action recommended for this finding** — it documents an
intentional boundary, not a gap.

## What this audit does not cover

- The top-header/sidebar boundary redesign (roadmap, same UI Engine section)
  is a separate, larger item blocked on "the approved Claude design artifact
  for direction," which was not available during this pass. Not attempted
  here.
- Every route was not read; a fourth or fifth consumer could still surface a
  fourth date-formatting variant. Treat Finding 1 as sufficient evidence to
  act on, not as a complete inventory.
