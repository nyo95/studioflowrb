# Active Plan

Plan ID: WO-PLAT-TOUR-01 (first-use guided tour, all apps, Indonesian / English)
Scope: Platform backend for a per-person first-use tour: a chosen guide language and a per-tour "already seen" record, stored on the account. The Lead builds the tour component, the language pick on the first screen, the Help entry, and the StudioFlow tour text and anchors in the next revision.
Target revisions: R8.396 (this plan), R8.397 (Executor: backend), R8.398 (Lead review + UI + StudioFlow tour).
Status: READY
Priority: P2
Owner: Product Owner. Decisions confirmed by the owner in chat on 2026-10-07 (kantor).
Last updated: 2026-10-07

Previous plan WO-SF-NOTE-IMG-01 is BUILT (R8.393–R8.395); its open browser walk is in BACKLOG.

## Outcome

A person opening an app for the first time sees a short guided tour (at most 4
steps) that points at real parts of the screen, can be closed at any moment, and
does not come back on its own. It can be opened again from Help in the account
menu. The tour speaks Indonesian or English, chosen by the person at the very
first screen and remembered on the account. The mechanism belongs to the
platform so every app (StudioFlow, Master Data, BQ, later ones) registers its
own steps instead of building its own tour.

## Locked Decisions (owner 2026-10-07)

1. **Two guide languages: `id` and `en`**, picked by the person on the first
   screen of their first tour and kept on the account. Not set yet = `null`
   (the tour then asks). The language only drives guide text for now; it is
   **not** the date/number `locale` preference ("Date and number format" stays
   as is) and it does not translate the rest of the app (non-goal).
2. **One shared mechanism for all apps.** Platform owns the storage, the
   service and (Lead) the component. Each app owns its own steps, wording and
   anchors and registers them through a public contract. Platform never knows an
   app's steps.
3. **Seen-state is per person, per tour, on the server** (not the browser), so a
   new computer does not replay it. States: `completed` or `dismissed`; both
   mean "do not show again automatically". A `version` number is stored so an
   app may later choose to re-show a materially changed tour; this work order
   never re-shows on its own.
4. **Same tour for every role; steps follow access.** A step may require a
   permission and a screen anchor; a step whose permission the person lacks, or
   whose anchor is not on screen (hidden for the role, or a phone layout), is
   skipped. That filtering is Lead/UI work; the backend only has to expose the
   person's grants as it already does.
5. **Screen markers only.** The tour never forces an action and never changes
   data. Help in the account menu reopens it (Lead).

## Business Rules and Architecture Constraints

- Capability: **EXTEND** `platform/core/preferences` (add `language`); **ADD**
  a small domain-neutral "tutorial progress" record in the platform schema. App
  step content is **APP-OWNED**. REUSE the existing authenticated-shell, action
  wrapper, audit and error conventions; add no dependency.
- Platform must not import app code. Tour keys are plain strings
  (`^[a-z][a-z0-9-]{0,39}$`, e.g. `studioflow`, `masterdata`, `bq`); the platform
  does not validate them against an app list.
- A person can read and write only their own rows. No role grants extra reach;
  no cross-person read.

## Backend Contract

- **Preference `language`**: new nullable column on `platform.user_preference`;
  allowed values `id` | `en` | null (invalid value gets its own plain code, in
  the style of `PREFERENCE_LOCALE`). Exposed through the existing preferences
  `get` / `update` view and `updateMyPreferencesAction`; the account page form
  is not changed in this work order.
- **Table `platform.user_tutorial`** (additive migration; apply to the rebuild
  dev and test databases only): `user_id` (FK to user, `onDelete: Cascade`),
  `tour_key`, `version` (positive int), `state` (`completed` | `dismissed`, SQL
  CHECK), `updated_at`; unique on (`user_id`, `tour_key`).
- **Service** (beside preferences, same style): `list({ userId })` returns the
  person's rows; `record({ userId, tourKey, version, state })` upserts one row
  (a later call overwrites state/version); `clear({ userId, tourKey })` removes
  the row (so a person can reset a tour). Validation for key shape, version,
  state with plain error codes.
- **Server actions** for the signed-in person only (never take a user id from
  the client): `recordTutorialAction({ tourKey, version, state })` and
  `clearTutorialAction({ tourKey })`; language goes through the existing
  `updateMyPreferencesAction`.
- **Read for the shell**: the shell layout must be able to get, in one call, the
  person's `language` and tutorial rows. Expose it from the platform runtime the
  way preferences already are; the Lead wires it into the shell.
- **Registration contract (types only)**: a public platform type for an app's
  tour: `{ key, version, steps: [{ id, anchor, requires?: permission code,
  title: { id, en }, body: { id, en } }] }`, with a check that every step has
  both languages, a non-empty title and body, and that there are at most 4
  steps. Pure types plus a validator, no registry state, no app content.

## UI Contract

The Lead owns the tour component, the language pick, the Help menu item, the
anchors, all wording and responsive behavior. The Executor may add only what is
needed to exercise the backend (no visible UI is required). Do not touch the
account menu, the shell layout rendering, or any app screen.

## Boundaries and Non-goals

- No translation of the rest of the interface; no change to `locale`,
  `timezone` or the "Date and number format" form.
- No tour content for any app, no anchors, no component, no Help item.
- No automatic re-show on version change; no analytics of who finished a tour.
- No admin-wide reset; no push, tag, PR or release.

## Acceptance Criteria

1. A person can save `language` as `id`, `en` or clear it; any other value is
   refused with a plain error; it is returned by the preferences read.
2. `record` creates then overwrites the single row per (person, tour); `list`
   returns only that person's rows; `clear` removes it; a second person never
   sees or changes the first person's rows.
3. Bad key shape, version below 1 or non-integer, and unknown state are refused
   with plain errors; no row is written.
4. Deleting a user removes their tutorial rows.
5. The tour definition validator accepts a valid tour and refuses: more than 4
   steps, a missing language, an empty title or body.
6. The actions work only for the signed-in person and reject anonymous calls
   like the neighbouring account actions.

## Verification

Executor, before commit: `tsc --noEmit`, `npm run lint -- --quiet`,
`check:boundaries`, `check:legacy-runtime`, `npm test` (full, report
failed/skipped/cancelled), `npm run build`; migration applied to dev and test
databases and recorded; new integration tests for criteria 1–4 and 6 and unit
tests for criterion 5, in the existing preferences test style. Verify the
database target is the rebuild-only database before any database command.
Browser not required.

## Reviewer Acceptance

After the Lead's UI revision (R8.398), in the browser with a fresh test account
on the separate test data:

1. First sign-in: the language pick appears first; choosing Indonesian or
   English changes the tour text; closing at step 1 and at step 4 both work and
   the tour does not return after reload or on another browser.
2. Help in the account menu reopens it; a role without Files access skips the
   files part; a phone-width layout skips steps whose anchor is hidden and
   nothing covers the screen.
3. The two Playwright full sessions that stalled in the review of this idea must
   be re-run to completion; a stalled session is not a pass. The 13 phone
   layout checks stay green with the tour added.

## Regression Risks and Recovery

- `user_preference` gains a column: existing preference tests and the account
  page keep working with `language` null. Additive migration only; recovery is
  dropping the new column and table.
- Applying the migration to the wrong database: stop if the target is not the
  rebuild-only dev or test database.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the entire READY
backend outcome (WO-PLAT-TOUR-01, target revision R8.397) and nothing beyond it.
Inspect current repository evidence, preserve unrelated owner work (`next-env.d.ts`
is dirty and not yours), make sound in-scope implementation decisions, run the
required checks, update `CHANGELOG.md`, and create the local revision commit.
Stop only for a material locked-decision conflict or unsafe boundary, using the
BLOCKED / CONFLICT report; otherwise finish the coherent outcome and report the
commit, checks, limitations, and remaining unrelated dirty files.
