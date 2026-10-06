# Active Plan

Plan ID: WO-SF-SCHED-RELAYOUT-01
Scope: Re-layout of the StudioFlow Product Schedule screen (`projects/[projectId]/schedule/schedule-board.tsx`) so the daily flow — add items per category, fill product and photo, compare options, choose the final, follow samples — takes fewer steps. UI only: no schema, migration, service, server action, permission or rule change.
Target revisions: R8.350 (this plan, Lead), R8.351 (implementation, Executor), R8.352 (Lead review and visual polish).
Status: READY
Priority: P1
Owner: Product Owner.
Last updated: 2026-10-06

## Lane note (owner, 2026-10-06)

Same arrangement as WO-SF-RELAYOUT-01: the owner assigned this UI work to the Executor ("oper ke codex dengan aturan yg sama seperti tadi"). The Executor builds the structure and wiring with UI Engine components; the Lead does visual polish in R8.352. If anything in this plan contradicts the repository or a recorded owner decision, stop with `BLOCKED / CONFLICT` and send a prompt back to the Lead (UI/UX) instead of guessing.

## Outcome

A designer opens the schedule, sees how many items are final and which still need a decision or a sample, adds an item straight into its category, and edits any item in one side editor without stacked windows.

Reference mockup (approved direction, not a pixel spec): https://claude.ai/artifact/8RPAmbTV8JvmwbvV13qS9S (owner-private; the Lead can show it). Use the app's own typography and tokens, not the mockup's.

## Problems being fixed (owner-reviewed)

- Nine toolbar controls of different styles; one-time setup actions look as important as Add item.
- No way to see "needs a decision" / "sample waiting" / "no product yet".
- Category name written vertically with its count glued on ("PAINT1").
- Every board card carries its own sample links (Request sample / Mark received / Cancel), and those are `role="button"` spans nested inside the card `<button>`.
- The item dialog has three columns (Card slots, the card, "Your hand"); a field cannot be filled until its slot is switched on; the fanned "hand" makes options B/C hard to read and click; the "Card filled in" meter adds nothing.
- Three editors for the same data (Add item form, the card editor, `OptionDialog`) and stacked dialogs (Add option, From past project, Request sample over the item dialog).

## Locked Decisions

1. **Toolbar.** Left: section `FilterChip`s Material (n) / Fixture (n), then Board / List. Right: "Print / PDF" link (unchanged), a `ButtonMenu` "Set up" holding Apply studio templates, Import CSV, and Schedule templates (link, only with `settings.manage`), then the primary "+ Add item" (only with edit rights).
2. **Progress and filters** under the toolbar, client-side over the current section: "N of M final" with the UI Engine `ProgressBar`, and `FilterChip`s **All**, **Needs a decision** (has options, none final), **Sample waiting** (any option with a `REQUESTED` sample), **No product yet** (zero options), each with its count. Filters apply to Board and List. Replaces `StatBar`.
3. **Board groups.** Each category uses the UI Engine `GroupHeader` (title = category, count, and the code prefix as quiet text) instead of the vertical rail. Drag-to-reorder within a group stays.
4. **Quick add per category** (edit rights, only when the filter is All): a tile at the end of each group with one input ("Type, or leave empty to reserve") and a button labelled with the next code. It calls the existing `createScheduleEntryAction` with that category and section, `snapshot: { productName }` when typed, `null` when empty (reserve code). Location/qty are filled later in the editor. "+ New category" after the last group opens the editor in new-item mode.
5. **Board card.** Photo (4:5), code chip, up to two status badges (Final / N options or Not final / Sample waiting / Sample received), Type (or "Reserved, no product yet"), then the card fields as today. **No sample actions on the card.** No interactive element nested in another: the card is an element with two sibling buttons — the photo area (opens the editor with that option's photo editor active, as `initialPhotoOptionId` does today, R8.141) and the body (opens the editor).
6. **One editor: a right-side UI Engine `Drawer`** (size lg) replaces `EntryDialog`, `AddItemDialog` and `OptionDialog`. The board stays visible behind it.
   - Header: `CODE · Category`, section and state (Final chosen / Needs a decision / No product yet); ‹ › to the previous/next item of the current section and filter; a `RowActionMenu` with Move to category…, Save as template item (settings permission, when a template source exists), Delete; close.
   - **Options row**: one compact button per option (thumbnail, label, "Final" or "Not used" when another option is final, Type shortened), then "+ Option X" (a new unsaved draft, as the `"new"` draft key already works) and "From past project". Clicking selects the option for the form below.
   - **Form for the selected option**: photo on the left (click opens the inline photo editor in place of the form, as today); Type; then one row per field — Brand (`CreatableSearch`, unchanged rules), Color, Pattern, Finishing, Size, Location, Qty + Unit (Fixture only), each extra spec line, and "+ Spec line". **Every field is always editable.** Each row ends with an eye toggle that adds or removes that field from the card (`cardFields`); a short legend says what the eye means, with "Use default" when a custom set is active. Notes uses `SimpleTextEditor` below the rows (its eye toggle sits on its label).
   - **Option actions** in one strip under the form: Set as final (or a "Final" badge), Request sample / Sample received, and a menu (Remove photo, Cancel sample request, Delete option). **Request sample opens an inline form in the drawer** (requested from, note), not a dialog. **From past project opens inline in the drawer** (search + results), not a dialog.
   - **New-item mode** ("+ Add item", "+ New category"): the same drawer with Category (`CreatableSearch` over the current section's categories, new allowed), Location, Qty/Unit for Fixture, then the same option form. Leaving Type and all product fields empty reserves the code; product fields without a Type show "Enter a Type, or clear the product fields to only reserve the code". Saving calls `createScheduleEntryAction`.
   - **Save / Discard** in the drawer footer (owner decision 2026-09-24): nothing is written until Save; Save writes every touched option, the item fields and the card fields exactly as `saveAll` does now. Closing, pressing ‹ ›, or switching section with unsaved edits asks "Discard changes? / Keep editing" (existing `useConfirm`).
   - Small confirmations (delete item, delete option, cancel sample, move to category) may use the existing confirm/Move dialog over the drawer; nothing else stacks.
   - Remove the "Card slots" column, the fanned "Your hand", the "Card filled in" meter, `OptionDialog`, `AddItemDialog`, `ReuseDialog`'s dialog wrapper and `SampleRequestDialog`'s dialog wrapper (reuse their logic inline).
7. **List view** keeps its columns and row menu; it follows the section and filter, shows the same status badges as the board, and opens the same drawer.
8. **Narrow screens** (< 768 px): the drawer is full width; the board shows two cards per row; every action stays reachable.

## Business Rules (unchanged — keep exactly)

Codes from category prefix and gapless renumbering; one prefix per category; Qty/Unit Fixture-only; Type required for a saved option and always shown; Brand free text or a Master Data brand and never a Master Data write; marking final sets siblings `NOT_USED`, deleting the final promotes the next; one open sample request per option; card fields `null` = default set, empty array allowed; extra spec lines ≤ 12; photos 4:5 through `ImageWorkspace`; explicit Save/Discard; all permission gates as today (`schedule.manage` for edits, `settings.manage` for templates); completed or archived project is read-only. Contract `STUDIOFLOW-REWORK-CONTRACT.md` §11 is the authority for these.

## Boundaries and Non-goals

- No change under `src/apps/**`, `prisma/**` or `actions.ts`. If a needed behaviour has no existing action, stop and report.
- Not touched: the print view, Schedule templates page, CSV import logic, Master Data.
- No new UI Engine component. A segmented control is not added: use `FilterChip`. If a needed generic piece is missing, stop and report.
- No browser acceptance by the Executor; the Lead reviews in R8.352.

## Contract update (same commit)

`STUDIOFLOW-REWORK-CONTRACT.md` §11.10 "The entry editor": replace the dialog/checklist description with the drawer described in decision 6 (keep every rule paragraph; drop the superseded R8.112/R8.136 layout narration, keeping their decisions). Add one line to §11 about the board toolbar, progress, filters and quick add.

## Acceptance Criteria

- Toolbar, progress bar and filters behave as decisions 1–2; counts match the data.
- Quick add creates `PREFIX-NN` in the right category (with product or reserved) without opening a dialog.
- Board cards have no nested interactive elements and no sample links; status badges are correct.
- One drawer handles add item, edit item, add option, photo, sample request and reuse from a past project; no dialog stacks except small confirmations and Move to category.
- Every field can be filled while hidden from the card; the eye toggles change only `cardFields`.
- Save/Discard and the unsaved-changes prompt work on close, ‹ ›, and section switch.
- List view opens the same drawer and follows the filter.

## Verification

`npm run typecheck`, `npm run lint`, `npm run check:boundaries`, `npm run check:legacy-runtime`, full `npm test` (baseline 829). Rewrite the source-check tests in `src/apps/studioflow/schedule.regression.test.ts` that pin the old markup so they pin the same rules on the new structure (Qty Fixture-only, Type always shown, Brand never writes Master Data, no auto-save, no stacked option/sample/reuse dialog). Add a small pure test for the filter/progress counting if it is extracted to a helper. Report test counts before and after.

## Reviewer Acceptance (Lead, R8.352)

Browser pass: filters and counts; quick add with and without a Type; open an item, edit a hidden field, toggle eyes, Save; add option B, set final (A becomes Not used); request a sample inline and mark it received; from past project; photo from the card; ‹ › with unsaved edits; new category through "+ Add item"; List view; phone width. Then visual polish.

## Regression Risks and Recovery

- Losing a per-option draft when switching options or items: keep the current `drafts` / `optionBaseline` model.
- `initialPhotoOptionId` consumption (R8.141) must still fire once per open.
- Drag reorder must still post one `reorderScheduleEntriesAction` per group.

## Executor Prompt

You are the Backend Executor, assigned the UI Work Order WO-SF-SCHED-RELAYOUT-01 by the owner (same rules as WO-SF-RELAYOUT-01). Location: kantor unless the owner says otherwise; load the matching .env file, set STUDIOFLOW_LOCATION, and verify the test database target belongs only to studioflow-rebuild before running npm test. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, `UI_ENGINE.md` (§3.1, §3.5, §9, §15–17), `DESIGN.md`, `docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md` §11 and this `PLAN.md`, then implement the whole plan as revision R8.351 and nothing beyond it: UI only, no schema, service, action or permission change. Reuse UI Engine components; if you find an inconsistency, a missing action or a missing generic piece, stop with BLOCKED / CONFLICT and send it back to the Lead. Do not polish visuals beyond the plan; the Lead does that in R8.352. Run the checks in `## Verification` (baseline 829 pass), update the contract and `CHANGELOG.md`, commit locally once, and reply with a Planner/Reviewer prompt containing outcome, commit, checks (test counts before/after), limitations and dirty files.
