# Active Plan

Plan ID: WO-SF-RELAYOUT-01
Scope: Re-layout of StudioFlow Home (project cards) and the project page (phase view) to remove duplicated information, using UI Engine components. No change to phase/iteration rules, commands, permissions or data.
Target revisions: R8.345 (this plan, Lead), R8.346 (correction: no project code, Lead), R8.347 (implementation, Executor), R8.348 (Lead review and visual polish).
Status: READY
Priority: P1
Owner: Product Owner.
Last updated: 2026-10-06

## Correction 2026-10-06 (Lead verdict on the Executor's BLOCKED report): option A

Projects have no code since R8.213: the name is free text and a studio habit such as `2026-536 Sociolla …` is part of the name. The project header and the Home card show the name as stored, with **no eyebrow and no separate code line** (an eyebrow such as "Project" would add exactly the kind of repeated, low-information label this Work Order removes). Do not parse a code out of the name. The stale contract §4.1–4.2 was corrected in R8.346. Implementation is now R8.347; the Lead's polish is R8.348.

## Lane note (owner, 2026-10-06)

The owner assigned this UI work to the Executor ("biar codex yg kerjakan aja, nanti km polished aja"). The Executor builds the structure and wiring below with UI Engine components; the Lead does the visual polish in R8.348. Do not spend effort on fine visual tuning (spacing tweaks, colours, copy polish) beyond what is stated here.

## Outcome

Each fact appears once on screen. A designer sees on Home, per project, what each phase is doing and which phase needs them, and on the project page works the current round of one phase without a side rail.

Reference mockup (approved direction, not a pixel spec): https://claude.ai/artifact/32uuUt4Hm1jhtWorMCMxyv (owner-private; the Lead can show it). The typography in the mockup (serif titles) is **not** adopted: headings use `Heading`/`PageHeader` exactly as the UI Engine defines them (R8.148 moved H1/H2 to Schibsted Grotesk). No global token, font or radius change.

## Redundancies being removed (owner-reviewed audit)

| Fact | Today | After |
|---|---|---|
| Phase list | project rail "Phases" + strip on the page | strip only |
| Current round name ("Moodboard 2") | strip, status row, client-notes title, Iterations list | current-round card only |
| Round status ("Not sent") | status row + Iterations list | current-round card |
| Client notes | Client notes card + under each iteration | inside its round (current round shows the previous round's notes as the brief) |
| Project name | rail header + breadcrumb | page header (breadcrumb stays: it is the global sticky locator) |
| Requirements | own page + Home count + rail counts per phase | aside of the open phase only |
| Phase progress | "0/5 phases done" + coloured left borders | the strip's step markers |
| Supervision not started | "Not started" + "Waits for the previous phase" | one line "Starts after <previous phase>" |
| No files | red "No deliverable" badge + sentence | one neutral empty upload area |
| "Active" under every phase | every tab | removed |

## Locked Decisions

1. **Project rail removed.** The secondary rail in `projects/[projectId]/layout.tsx` (identity, Overview, Requirements, Phases, Documents) is deleted. The layout instead renders, above every project sub-page, one project header: `PageHeader` with no `eyebrow`, the project name exactly as stored as `title`, client and PIC designer/drafter as `meta` (`MetaList`), and as `actions` a compact horizontal nav: **Phases** (the overview), **MOM**, **Schedule**, **Presentation**, **History**, each with its count where one exists today, the current one marked `aria-current="page"`, plus the existing project actions menu if one exists. Archived/completed notices stay as they are. At phone width the nav wraps or scrolls horizontally inside itself.
2. **Requirements page removed** (`/projects/[projectId]/requirements`, its nav link and `STUDIOFLOW_ROUTES.projectRequirements`). Its behaviour moves into the phase aside (decision 6). The same permissions apply (tick/dismiss for anyone who works on the project, rename/subtask need `studioflow.task.manage`; read-only when completed/archived). Reuse `RequirementList`; move it to `_components/` if needed.
3. **`/projects/[projectId]/phases/[phaseId]` redirects** to `/projects/[projectId]?phase=<phaseId>` so old links keep working; nothing links to it any more. `STUDIOFLOW_ROUTES.projectPhase` returns the `?phase=` form, or is removed if it has no remaining consumer.
4. **One stepper for both screens: EXTEND `PipelineStrip`** (UI Engine Pattern, `components/sections.tsx`) — do not build a private StudioFlow stepper.
   - Add `variant?: "band" | "track"` (default `"band"`, current rendering unchanged). `"track"`: a round marker per step joined to the next by a line; label under the marker; `note` under the label; no hairline band background.
   - Extend `PipelineStepState` domain-neutrally to `done | current | waiting | attention | upcoming | blocked`: `done` success marker with a check and a success line to the next step; `current` ink ring; `waiting` warning ring and warning note text ("waiting on someone else"); `attention` filled ink marker and semibold note ("needs this user's decision"); `upcoming` hollow muted marker with tertiary label; `blocked` keeps danger. State is never colour alone: `aria-current="step"` on current/attention, and the note text states the state.
   - Add an optional per-step `action?: ReactNode`, rendered under the note, bottom-aligned across steps.
   - With `selected`, the track variant underlines the selected step (as the band does today). `href` stays.
   - `accentClass` is no longer passed by StudioFlow (the per-phase coloured dots and orange titles go); keep the prop for other consumers.
   - Update `src/app/ui-engine/ui-engine-showcase.tsx` with a track example and add a test in `ui-engine.test.ts` (track renders markers, `aria-current` on current/attention, action slot rendered). At narrow widths the strip scrolls horizontally inside itself (min step width about 8rem).
5. **Home card** (`_components/project-card.tsx`, `page.tsx`):
   - Card is a `SectionCard`-like surface (UI Engine surface; no left-border phase columns). Header: the project name exactly as stored as the link to the project, client underneath (no separate code line); on the right the pinned-notes icon (keep its dot) and the actions menu. Remove "N/5 phases done" and the "N requirements waiting" text. Keep the On hold / Completed / Check later phases badges.
   - Body: `PipelineStrip variant="track"` with one step per phase. Step label = phase name; note and state per the table in decision 7; `action` = `IterationButtons` for that phase (unchanged permission logic, `canAct` as today).
   - Keep the collapse chevron and `defaultExpanded` behaviour; keep `UndoBar`, errors, `VisitDialog`, `PhaseNotesDialog`, completion dialog.
   - Filters: keep the two `FilterChip` groups but make them read as two separate questions: the scope group first labelled by its options **Mine / Everyone's** (same `scope` query values), then the status group **Running (n) / Completed (n)**, with visible separation between groups (gap and a thin divider, not one continuous row). Drop `divider` on `PageHeader` so there is no double rule above the first card.
   - If `requirements_waiting` has no other consumer after this, remove it from `listProjectCards` and its test; otherwise leave it.
6. **Project page (overview) layout** (`projects/[projectId]/page.tsx`, `_components/phase-canvas.tsx`, `phase-panel.tsx`, `client-notes.tsx`):
   - Top: `SectionCard padded={false}` holding `PipelineStrip variant="track"` with `href=?phase=`, `selected` on the open phase, same step note/state rules as Home, no actions on the steps here.
   - Below, two columns (main about 1.6fr, aside about 1fr; single column under ~1100px).
   - **Main, card 1 — current round.** Title "Round N" (decision 7 naming) with a `Badge` for its state; one sentence for the next step; on the right the `IterationButtons` and a `ButtonMenu "More"` holding Rename round, Delete (only when never sent), Edit client notes, Skip this phase (PENDING only), Admin: reset iterations (override only) — the same commands and dialogs as today. `UndoBar` and the error under it. Body by state:
     - NOT_SENT with a previous round: the previous round's client notes as a "Brief from Round N-1" block (`Notice`/surface-muted block); if that round had no notes, one muted line saying so. No notes textarea on a round that has not been sent.
     - SENT: one muted line that the client's notes go here once they reply; "Client answered" keeps opening the existing `ClientAnswerDialog` (notes + Revision / OK / Save, decide later).
     - ANSWERED (decided later): the recorded notes, with the outcome buttons from `choices` in the header.
     - Phase PENDING: the existing start/blocked reason (`startBlockedReason`) and the Start action. Phase DONE: "Done in N rounds" and no current-round body.
   - **Main, card 2 — Earlier rounds** (`SectionCard`, hidden when there are none): every round except the open one, newest first: "Round N", outcome label (Approved / Revision asked / Closed; supervision: visit date), sent/answered dates (`FormattedInstant`), the client notes in full, and a `RowActionMenu` with Edit client notes and Rename. This replaces the Iterations list and the separate Client notes card; delete `client-notes.tsx` if nothing else uses it.
   - **Main, card 3 (CD phase only)** — Drawing list, unchanged.
   - **Aside, card 1 — Pinned note**: shows the note as text; an Edit control switches to the textarea with Save/Discard (same `setPhaseNote` command). Empty: one muted line. Prefer the UI Engine `InlineEdit` pattern if it fits multi-line text; otherwise keep the current Textarea + buttons.
   - **Aside, card 2 — Requirements**: `RequirementList` for this phase's requirements with a "n of m" count; below it a collapsed `<details>`-style disclosure "Project-wide · n open" with the general (no-phase) requirements. One muted line: reminders, never block a step.
   - **Aside, card 3 — Files** (`DeliverablesPanel`): MISSING renders no danger badge — a neutral empty state with the Upload button (use `FileDropZone` if it fits the existing upload flow; otherwise the existing button). The long retention sentence becomes one short hint line with the full text in `title`. CURRENT/OUTDATED badges and file rows unchanged.
7. **Step and round wording** (one app-owned helper, unit-tested):
   - Round name: if the iteration name is exactly `<phase name> <n>` (the generated default), show `Round <n>`; any other name (CD Mall, CD Final, renamed, supervision visits) is shown as stored.
   - Step note by state: phase DONE → `Done` (Home and strip may add `in N rounds` when more than 1); PENDING and cannot start → `Starts after <previous phase name>`; PENDING and can start → `Not started`; NOT_SENT → `<round> · in progress` (supervision: `Visit planned`); SENT → `<round> · with client` + ` today` / ` Nd`; ANSWERED → `<round> · client answered`.
   - Step state mapping: DONE → `done`; PENDING → `upcoming`; NOT_SENT/REVISED → `current`; SENT → `waiting`; ANSWERED → `attention`.
   - Button emphasis in `IterationButtons`: `send`, `record_answer`, `next_visit` and start/add/new visit are `secondary`; only the post-answer outcomes (`done`, `continue_cd_final`) are `primary` and `revision` is `secondary`. On Home use `size="sm"` as today.

## Business Rules and Architecture Constraints

- No phase, iteration, requirement, deliverable, note or permission rule changes. Every action keeps calling the same server action/command; which buttons appear still comes from the server's `choices`/`answerChoices`.
- Undo (one per person, five minutes), the explicit "Mark as completed", archived/completed read-only behaviour and the read-only notices are unchanged.
- REUSE: `PageHeader`, `MetaList`, `SectionCard`, `Badge`, `Button`, `ButtonMenu`, `RowActionMenu`, `FilterChip`/`filterChipClasses`, `FormattedInstant`, `Notice`, `Text`, `Heading`, `InlineEdit`/`FileDropZone` where they fit. EXTEND: `PipelineStrip` only. ADD in UI Engine: nothing else; if a needed generic piece is missing, stop and report rather than writing it privately in StudioFlow. APP-OWNED: round naming/state-note helper.
- No raw legacy `ui-*` classes. No new dependency. No global token/typography/radius change.

## Boundaries and Non-goals

- No schema, migration, service or command change (removing the unused `requirements_waiting` read field is the only read-model edit allowed).
- Not touched: MOM, Schedule, Presentation, History page contents (they only lose the rail and gain the shared project header), BQ, Master Data, the header search, Projects/Clients/Timeline/Library directories.
- No browser acceptance by the Executor (owner tests in the browser; the Lead reviews).

## Contract updates (same commit)

`docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md`: §6.2 "Screen" — requirements are worked in the aside of each phase on the project page, general ones under "Project-wide"; the Requirements page is removed. §7 — the card shows the phase strip, the current round and its actions, the pinned-notes marker (no requirements count). Route table: requirements route removed, phase route is a redirect. `UI_ENGINE.md` §3.5 `PipelineStrip` row: mention the `track` variant, the six states and the action slot.

## Acceptance Criteria

- Project pages (overview, MOM, Schedule, Presentation, History) have no side rail; the shared project header with the document nav is present on each, and the current section is marked.
- `/projects/[id]/requirements` no longer exists; `/projects/[id]/phases/[phaseId]` redirects to `?phase=`.
- Home card and project page both use `PipelineStrip variant="track"`; no "N/5 phases done", no requirements count on the card, no "Active" step notes, no per-phase accent colours.
- An unsent round shows no client-notes textarea; its brief is the previous round's notes. Client notes appear only inside their round (current card or Earlier rounds), and the round name appears once per round.
- The current-round header, `ClientAnswerDialog`, Revision/OK, CD Mall → CD Final, supervision New visit / Next visit / Done (handover), Skip phase, Admin reset, rename/delete-unsent and Undo all still work through the same commands.
- Requirements of the open phase and the project-wide ones can be ticked/dismissed/renamed/sub-tasked from the aside with today's permissions.
- MISSING deliverables show no danger badge.

## Verification

`npm run typecheck`, `npm run lint`, `npm run check:boundaries`, `npm run check:legacy-runtime`, full `npm test`. New tests: `PipelineStrip` track variant (UI Engine test) and the round-name/step-note helper (unit). Update or delete tests that asserted removed UI (requirements page, rail). Report the test count before and after.

## Reviewer Acceptance (Lead, R8.348)

Browser pass of Home and of one project through: send → client answered with notes → Revision (next round shows the brief) → OK; CD Mall → CD Final; a supervision visit; requirements tick in the aside; MOM/Schedule pages without the rail; phone width. Then visual polish.

## Regression Risks and Recovery

- Losing an action that only the rail or the Requirements page exposed: compare the old rail and page against the new header/aside before deleting.
- `PipelineStrip` default `band` must render exactly as before for other consumers.
- Server components vs client components: the project header with counts was streamed via Suspense in the rail; keep counts streaming (fallback with real hrefs) so the header does not block the page.

## Executor Prompt

You are the Backend Executor, assigned this UI Work Order by the owner. Location: ask the owner "rumah atau kantor?" if not stated, load the matching `.env` file, set `STUDIOFLOW_LOCATION`, and verify the test database target belongs only to studioflow-rebuild before running `npm test`. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, `UI_ENGINE.md` (§3.1, §3.5, §15–17), `DESIGN.md` and this `PLAN.md` (WO-SF-RELAYOUT-01), then implement the whole plan, including the "Correction 2026-10-06" section (no project code), as revision R8.347 and nothing beyond it: remove the project rail and the Requirements page, add the shared project header, extend `PipelineStrip` with the track variant, rebuild the Home card and the phase view as specified, keep every command and permission unchanged. Reuse UI Engine components; if a generic piece is missing, stop with BLOCKED / CONFLICT instead of building it privately. Do not polish visuals beyond the plan; the Lead does that in R8.348. Run the checks in `## Verification`, update the contract docs and `CHANGELOG.md`, commit locally once, and reply with a Planner/Reviewer prompt containing outcome, commit, checks (test counts before/after), limitations and dirty files.
