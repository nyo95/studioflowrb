# Active Plan

Plan ID: WO-BQ-SLICE3-UI-01 (BQ Slice 3 screen: select Cost Components, group them and move them, plus the contract nouns)
Scope: BQ project screen only — Slice 3 UI on the R9.03 backend, and the user-facing nouns back to the contract's terms
Module(s): bq (core)
Target revisions: Executor R9.20 (nouns) and R9.21 (Slice 3 UI), on branch `codex/bq-slice3` in its own worktree
Executor: Codex, with the UI included — owner 2026-10-14: "lanjutin jg si BQ - oper aja ke codex (termasuk ui nya - slice 3) jalan paralel". This overrides the usual Lead-owns-UI split for this Work Order only.
Status: READY

## Why

The Slice 3 backend landed and was reviewed PASS in R9.03 (`previewLineItemMove`, `moveLineItems`, `groupLineItems`). The estimator still cannot use it: the screen has no way to select Cost Components, group them or move them. The owner also decided to use the contract's nouns on the screen (BACKLOG BQ, "Terms"), and the new UI must use them from the start.

## Running in parallel with the Lead (owner decision)

The Lead keeps working on `main` in the main checkout (StudioFlow Workspace module, R9.08 onward) at the same time. To keep both safe:

- **Work only in the worktree** `D:\Misc\ProjectsHUB\studioflowrb-bq` on branch `codex/bq-slice3` (the Lead creates it from the commit that holds this plan). Never edit, stage, commit or check out anything in `D:\Misc\ProjectsHUB\studioflowrb`.
- **Touch only BQ files**: `src/app/(platform)/bq/**`, `src/apps/bq/**` (only if a test needs it; no service change is planned), `docs/apps/bq/**`, `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md` (append only), `CHANGELOG.md` (your own entries at the top), and the BQ section of `docs/BACKLOG.md`. Do not touch `PLAN.md`, StudioFlow, Platform, UI Engine, Prisma schema or migrations. If the outcome seems to need any of those, stop with BLOCKED / CONFLICT.
- **Revisions R9.20 and R9.21** are reserved for you, so your numbers never collide with the Lead's (R9.08–R9.19). The Lead merges the branch into `main` later, after review and the owner's OK.
- **Own test database.** Create (if missing) a disposable database `studioflow_rebuild_test_bq` in the rebuild-only container `studioflowrb-gateb-test-db` on `localhost:5433` (never the container `studioflow-db-1` on :5432, which is legacy and forbidden). Put its URL in the worktree's own, uncommitted `.env.test.local` (`DATABASE_URL` and `PLATFORM_TEST_DATABASE_URL`), derived from the credentials in the main checkout's `.env.test.local`; never print or commit them. Apply migrations to it with `prisma migrate deploy` before `npm test`. The shared `studioflow_rebuild_test` is the Lead's during this run: never point a test at it.
- **No dev server on :3001, no Playwright** (both would collide with the Lead's). `npm ci` in the worktree is fine. Browser checks go to `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md` for the Lead.
- **Production build** with `NEXT_DIST_DIR=.next-verify` and delete that folder afterwards; restore `tsconfig.json` and `next-env.d.ts` if the build rewrote them.

## Authority

- Owner-approved mockup (read already by the Lead; the essentials are below): https://claude.ai/artifact/JvC6p9CXuXmcrdYqcdmwwh
- `docs/apps/bq/bq-contract.md` §3 for the user-facing nouns; `docs/apps/bq/bq-ux-spec.md` for the screen.
- BACKLOG `## BQ`: the two `[PLANNED][P1]` items "Slice 3 UI wiring" and "Terms".
- Backend: `src/apps/bq/services/line-item-moves.ts`, actions `previewLineItemMoveAction`, `moveLineItemsAction`, `groupLineItemsAction` in `src/app/(platform)/bq/[id]/actions.ts`.
- UI Engine components only (`@/platform/ui_engine`): Checkbox, Button, Dialog, RowActionMenu or the existing menu component, Field/Input, InlineError, Notice, the existing toast/notice pattern on this screen. No raw legacy `ui-*` classes, no new dependency.

## R9.20 — nouns (one pass, no behavior change)

Revert the screen's nouns from the R8.545–R8.549 proposal to the contract's terms (bq-contract §3): Bagian → Section, Subbagian → Subsection, Pekerjaan → Work Item, Kelompok rincian → Component Group, Rincian biaya → Cost Component, Resep → Assembly; price modes TBC and By Owner ("Disediakan owner" → By Owner). Sentences stay in the screen's current language (mixed is acceptable); only the nouns change. Files: `bq/[id]/project-editor.tsx`, `new-work-item-dialog.tsx`, `save-as-assembly-dialog.tsx`, `add-section-dialog.tsx`, `page.tsx`, `assembly-picker-dialog.tsx`, and any other BQ screen string or test that names them. Update tests that assert the old nouns. Close the BACKLOG "Terms" item with the revision.

## R9.21 — Slice 3 UI (locked behavior)

Inside one Work Item's table (direct Cost Components and its Component Groups):

1. **Select.** A checkbox at the start of every Cost Component row (direct and inside groups), and a header checkbox "select all Cost Components of this Work Item". Selection is per Work Item: choosing rows in another Work Item clears the first selection. A selected row is tinted.
2. **Selection bar** above that Work Item's rows while anything is selected: "N dipilih", **Kelompokkan…**, **Pindahkan ke ▾**, **Batal pilih**.
3. **Pindahkan ke ▾** is a menu: "Langsung di Work Item" (direct), each existing Component Group of this Work Item with its quantity and markup shown small (e.g. "×2 · 10%"), a separator, "Component Group baru…" (opens the group dialog). If every selected row is already in the chosen place, show "Sudah di sana." and call nothing.
4. **Kelompokkan…** opens a dialog: name (default "Component Group baru", trimmed, required), quantity per Work Item (default 1, must be > 0), markup % (default 0, 0 to 999.9999, the existing markup rule). Hint: with ×1 and 0% the Work Item price does not change. "Lanjut" runs the preview.
5. **Every move or group first calls `previewLineItemMoveAction`** (target `{direct:true}`, `{subObjectId}`, or `{newGroup:{qtyPerL1,markupL2Pct}}`). The screen never computes prices itself.
   - Preview says nothing changes → apply at once (`moveLineItemsAction` or `groupLineItemsAction`), no dialog, then a short confirmation ("Selesai. Harga Work Item tidak berubah.").
   - Preview says it changes → a dialog "Harga Work Item akan berubah": a sentence naming how many rows go where, then a table Sebelum / Sesudah for unit rate and total, and the total difference. **Batal** changes nothing ("Dibatalkan. Tidak ada yang berubah."); **Pindahkan** applies.
6. **After apply** the screen shows the returned project tree (the actions return the reloaded `BqProjectDetail`), clears the selection, briefly highlights the moved rows, and keeps the Work Item and groups open as they were.
7. **Refused or stale.** A refusal shows in the screen's existing error place. A stale list (`bq.line-item.move-stale`) shows "Daftar berubah. Muat ulang untuk melihat yang terbaru." and refreshes the project; nothing is applied.
8. **Locked or archived** project: no checkboxes, no selection bar (the server refuses anyway).
9. **Empty groups stay**, shown as "Component Group kosong". No drag, no reordering inside a group, no move to another Work Item (owner 2026-10-14).
10. Keyboard: checkboxes and menu reachable by Tab; Escape closes the menu and dialogs; buttons show pending while a call runs and cannot be pressed twice.

## Executor verification (before each commit)

`npm test` (on `studioflow_rebuild_test_bq`), typecheck, lint, `check:boundaries`, `check:legacy-runtime`, production build (separate folder), `git diff --check` staged and unstaged. Add focused tests where the screen has pure logic (selection per Work Item, the menu's targets, the same-place no-op, building the action input), following the existing BQ UI tests. One local commit per revision on `codex/bq-slice3`, changelog entry per revision. No push, no merge.

## Reviewer acceptance (Lead, after the commits; browser)

Append these to `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md`: group two direct rows with the defaults (price unchanged, no dialog); move one row into a group with quantity 2 and markup 10 (dialog shows the new rate; Batal changes nothing; Pindahkan applies); move it back to direct; locked project shows no checkboxes; a second tab makes the first stale and shows the refresh message; the nouns read Section / Subsection / Work Item / Component Group / Cost Component / Assembly / TBC / By Owner everywhere on the project screen.

## Non-goals

Drag and drop; reordering Cost Components or Component Groups; moving to another Work Item; deleting empty groups automatically; changing the backend or the calculation; any StudioFlow or Platform change.

## Executor Prompt

```text
You are the BACKEND EXECUTOR (Codex) for StudioFlowRB, with the UI included for this Work Order by owner decision.
Location: kantor. Read AGENTS.md, docs/agent/EXECUTOR.md, then PLAN.md (WO-BQ-SLICE3-UI-01) in the worktree D:\Misc\ProjectsHUB\studioflowrb-bq, branch codex/bq-slice3.
The Lead works in parallel on main in D:\Misc\ProjectsHUB\studioflowrb: never touch that checkout, its dev server (:3001), Playwright, or the shared test database. Follow "Running in parallel with the Lead" in PLAN.md exactly (own test database studioflow_rebuild_test_bq in the rebuild-only container on :5433; never the legacy container on :5432).
Deliver R9.20 (contract nouns on the BQ screen) and R9.21 (Slice 3 select / group / move UI on the R9.03 backend) as two local commits on codex/bq-slice3, with the full commit gate passing. No push, no merge.
Stop with BLOCKED / CONFLICT if the outcome needs a file outside the BQ scope listed in PLAN.md.
End with one copy-ready Planner/Reviewer prompt: outcome, commits, exact check results, browser-backlog additions, limitations, dirty files.
```
