# Active Plan

Plan ID: WO-BQ-ASSEMBLY-SOURCE-01
Scope: one Cost Component form for Library items, Assembly lines and project Cost Components; Assembly lines can be picked from Master Data prices and BQ Library items (not only typed by hand); a Custom line can optionally be saved to the BQ Library; an applied Assembly takes the current source price.
Module(s): BQ (`src/apps/bq/**`, BQ Library screen). Reads Master Data only through `@/apps/masterdata/public`.
Target revision: R9.170 (this plan is R9.169). Re-check `CHANGELOG.md` and all branches; use the next unused number if taken.
Risk: medium - changes how an existing feature prices projects (apply now re-reads source prices) and adds a cross-module read port to the BQ service; no schema change. Escalate (BLOCKED / CONFLICT) if a migration turns out to be required, if Master Data's public read cannot resolve a price by id for both material and work prices, or if the BQ Library read cannot resolve an item by id across its four item types.
Status: DONE in R9.170 — browser acceptance pending (BACKLOG [UNVERIFIED]). Executed by the Lead (owner, 2026-10-22: "kerjakan langsung").
Priority: P1, after the P0 Schedule Assistant
Owner: Product Owner (decisions 2026-10-22)
Last updated: 2026-10-22

Plan reconciliation: `WO-SCHEDULE-ASSISTANT-01` is DONE in R9.167 (four-client walk owed,
BACKLOG [UNVERIFIED]); `WO-REL-READINESS-01` stays parked in `docs/agent/queued-plans/`.

## Outcome

On BQ Library → Assemblies, adding a line offers the same sources as a project's Cost
Component: Master Data material price, Master Data labor / material+labor price, BQ
Library item, or Custom (typed by hand, as today). A sourced line is filled from the
source (title, unit, price, kategori, default koefisien for Library items) and stays
editable like every snapshot field (K-05). When the Assembly is applied to a project
Work Item, each Master Data / BQ Library line takes the source's **current** price;
when the current price cannot be used, the line keeps the price stored in the Assembly
and the user is told which lines kept it and why.

## Context and Evidence

- `src/apps/bq/services/assemblies.ts`: `addAssemblyCustomLine` creates only
  `source_type: "CUSTOM"` lines; `saveItemAsAssembly` copies a Work Item's lines with
  their `source_type`/`source_ref_id` (so MASTERDATA / BQ_LIBRARY assembly lines already
  exist in data); `applyAssemblyTemplate` (placement `group` or `direct`) copies the
  stored `harga_snapshot` and sets `source_price_snapshot` to it for non-custom lines.
- `BqAssemblyLine` already has `source_type`, `source_ref_id` and all snapshot columns;
  no source kind column. Master Data ids are unique cuids, so a price can be resolved
  by id by trying the material price read and then the work price reads.
- Snapshot builders: `src/apps/bq/lib/snapshot.ts` (`snapshotFromMaterialPrice`,
  `snapshotFromWorkPrice`, `snapshotFromLibrary`) and
  `src/apps/bq/lib/master-data-source.ts` (`snapshotFromMasterData`, which also
  enforces `masterdata.price.material.read` / `price.work.read`). Today they are called
  from the app action layer (`src/app/(platform)/bq/[id]/actions.ts`
  `addLineItemAction`), not from the BQ service; `BqServiceContext` has no Master Data
  read port.
- Project source picker (K-21): tabs All / Material / Labor / Material+Labor / BQ
  Library, plus Custom with a required Type; lives in
  `src/app/(platform)/bq/[id]/project-editor.tsx`.
- Contract: `docs/apps/bq/bq-contract.md` §15 (K-05 overrideable snapshot, K-13 no
  writes to Master Data, K-18 `source_price_snapshot` baseline and Revert, K-21
  picker, K-22 live pointer in templates vs snapshot on insert).

## Locked Decisions

1. (Owner, 2026-10-22) Assembly lines can come from Master Data prices and BQ Library
   items, in addition to Custom.
2. (Owner, 2026-10-22) **Price at use.** Applying an Assembly gives each MASTERDATA /
   BQ_LIBRARY line the source's current price. Example: added at Rp 65.000, Master
   Data later Rp 70.000 → the project gets Rp 70.000. This also applies to existing
   sourced lines that came from "Save as Assembly".
3. (Lead) Only the **price** is refreshed at apply (`harga_snapshot`, its currency, and
   the project line's `source_price_snapshot` baseline, set to the refreshed price so
   Revert restores it). Title, unit, kategori, qty, koefisien and notes come from the
   Assembly line, so an estimator's edits in the Assembly survive.
4. (Lead) The stored Assembly price is used, and the line is reported as kept, when:
   the source no longer exists or is archived/unavailable; the caller lacks the Master
   Data price-read permission for that kind; the source's current unit differs from the
   Assembly line's unit (a price per another unit would be wrong); the current price is
   not IDR. The Assembly itself is never rewritten by an apply.
5. (Lead) Adding a sourced line snapshots the source at that moment (same builders as
   a project Cost Component). Adding requires `bq.library.manage` plus the Master Data
   read permission of the chosen kind (as in the project path). A non-IDR source is
   refused at add, like the project path.
6. (Lead) No schema change and no migration. No write to Master Data (K-13). Templates
   (K-22) are unchanged.
7. (Owner, 2026-10-22) **One Cost Component form.** Library item, Assembly line and
   project Cost Component use the same form: the same source choice (Master Data
   Material / Labor / Material+Labor, BQ Library, Custom) and the same fields (name,
   unit, harga, koefisien, kategori, notes), plus Qty only where the row is used (Assembly
   line, project Cost Component). The data stays separate: an Assembly line and a project
   Cost Component are snapshots, a Library item is the reusable source.
8. (Owner, 2026-10-22) **"Simpan juga ke BQ Library".** A Custom Assembly line or a
   Custom project Cost Component offers an unticked "Save to BQ Library" choice. Ticked,
   the same transaction creates the Library item of the type its kategori maps to (K-19:
   MATERIAL → Material, UPAH → Labor, MATERIAL_UPAH → Material+Labor, BIAYA_UMUM /
   TRANSPORTASI_AKOMODASI / ALAT → Custom item; harga, unit, default koefisien = the
   row's koefisien, notes) and the row is stored as `BQ_LIBRARY` pointing at it, so later
   Assembly applies take its current price (decision 2). Unticked, the row stays Custom
   exactly as today. Never automatic.
9. (Lead) The Save-to-Library choice is shown and accepted only for a caller with
   `bq.library.manage`; otherwise the row is saved as Custom and the choice is absent.
   A new Library item starts as `DRAFT` promotion status. No duplicate-name check in this
   plan (same as the Items tab today).

## Business Rules and Architecture Constraints

- REUSE the snapshot builders and `snapshotFromMasterData`; do not write a second
  snapshot mapping. EXTEND `BqServiceDeps`/`BqServiceContext` with a Master Data read
  port (the `masterDataRead` public read already built in `src/apps/bq/runtime.ts`), so
  source resolution happens in the BQ service, server-side, from an id; the client
  never sends a price, title or unit for a sourced line.
- One source resolver in `src/apps/bq/` used by both "add line to Assembly" and
  "apply Assembly" (resolve by `source_type` + `source_ref_id`; Master Data tries
  material price, then labor, then material+labor work prices; BQ Library tries its
  item types). The project `addLineItemAction` may move onto it if that is a plain
  substitution; otherwise leave it as is.
- Apply reads all sources **before** its transaction (one Master Data work-price list
  per kind, not one call per line), then writes in the existing transaction; placement
  `group`/`direct` behaviour, sort order and audit stay as today. The audit metadata of
  `bq.assembly.applied` adds `{ refreshed, kept }` counts.
- Line ordering for a new Assembly line: existing MAX+1 rule under
  `runAutomaticSortTransaction`.

## Backend Contract

- `addAssemblySourcedLine({ grants, actor, assemblyId, sourceType: "MASTERDATA" |
  "BQ_LIBRARY", sourceRefId, qty?, koefisien? })` → the created line. Refuses unknown
  assembly (404), unknown/unavailable source (404 `bq.source.not-found`), missing
  permission (403), non-IDR (validation). Audit `bq.assembly-line.created` with
  `{ sourceType }`.
- `applyAssemblyTemplate` keeps its signature and return value and additionally
  returns `priceRefresh: { refreshed: number, kept: Array<{ title, reason:
  "source-missing" | "no-permission" | "unit-changed" | "currency" }> }` so the UI can
  say which lines kept the Assembly price. Custom lines are not counted.
- `addItemAndApplyAssemblyAction` and `applyAssemblyAction` pass that summary through.
- Server action `addAssemblySourcedLineAction(assemblyId, sourceType, sourceRefId)` on
  the Library page actions, revalidating `/bq/library`.
- Custom add with `saveToLibrary: true` on both `addAssemblyCustomLine` and the project
  `addLineItem` path: requires `bq.library.manage`, creates the Library item and the row in
  one transaction (audit `bq.library-item.created` + the row's existing audit), stores the
  row as `BQ_LIBRARY` with `source_ref_id` and, for a project row, `source_price_snapshot`.
  A failure creates neither.

## UI Contract

Minimal wiring only: in the Assembly line add form, a way to choose Master Data price /
BQ Library item / Custom and pick a source, the "Save to BQ Library" checkbox on Custom
(Assembly and project), and after apply a plain message listing lines that kept the
Assembly price. The Lead then builds the one shared Cost Component form (decision 7) from
the project source picker (K-21) for all three places and finishes layout and copy.

## Boundaries and Non-goals

- No change to Templates, to the project Cost Component picker behaviour, or to price
  refresh of lines already in a project (no "refresh all prices" button).
- No new column (e.g. a stored "source kind" or "price kept" flag), no migration.
- No Assembly duplicate-name check, no Component Group support in "Save as Assembly"
  (still BACKLOG P3).

## Acceptance Criteria

1. Add from Master Data material price, labor price, material+labor price and BQ
   Library item: line created with `source_type`/`source_ref_id`, title/unit/price/
   kategori from the source (Library: its default koefisien); Custom unchanged.
2. Add refusals: missing `bq.library.manage`; missing the Master Data read permission
   of that kind; unknown or archived source; non-IDR price.
3. Apply after the source price changed (65.000 → 70.000): project line
   `harga_snapshot` and `source_price_snapshot` = 70.000; Assembly line still 65.000;
   title/qty/koefisien edited in the Assembly are kept; Revert on the project line
   restores 70.000. Both placements (`group`, `direct`) and add-Work-Item-and-apply.
4. Apply fallbacks, each reported in `priceRefresh.kept` with its reason and using the
   stored price: source deleted/archived; caller without Master Data read permission;
   source unit changed; non-IDR source.
5. A "Save as Assembly" line with a Master Data source refreshes on apply like a line
   added directly.
6. Custom lines are copied exactly as today and not counted.
7. Apply stays atomic: a failure writes no group and no lines.
8. Custom + "Save to BQ Library" (Assembly line and project Cost Component), for each
   kategori: the Library item of the mapped type exists with the row's name, unit, harga,
   koefisien and notes, status `DRAFT`; the row is `BQ_LIBRARY` pointing at it; raising
   that Library item's price then applying the Assembly gives the new price.
9. Save to Library refused without `bq.library.manage` (nothing created); unticked keeps
   today's Custom behaviour; a failing row write leaves no orphan Library item.

## Verification

Medium tier per `docs/agent/VERIFICATION.md` (BQ module, cross-module read):
boundaries, legacy-runtime, whitespace, typecheck, lint, full `npm test` against the
rebuild test DB (BQ integration suite `src/apps/bq/service.integration.test.ts` gains
the criteria above; snapshot/master-data-source unit tests if the resolver is added
there), production build. e2e: run the BQ specs that cover assemblies and the
"+ Work Item from an Assembly" flow. Per-command timeout 15 min. No migration, so no
DB migrate step beyond confirming both DBs are at head.

## Reviewer Acceptance

Lead walk on :3001: add one line of each source type to an Assembly; raise that Master
Data price; apply the Assembly to a Work Item (both placements) and see the new price
with Revert available; archive a source and apply again → the line keeps the Assembly
price and the message names it.

## Regression Risks and Recovery

- Existing Assemblies saved from Work Items now refresh prices on apply (owner
  decision 2); the kept-price report makes any fallback visible.
- A slow Master Data read would lengthen apply; reads happen once per kind before the
  transaction.
- Recovery: revert the revision; no data shape changed.

## Executor Prompt

You are the Backend Executor. Location: ask the owner (rumah or kantor) and load that
env file. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and the active `PLAN.md`
(WO-BQ-ASSEMBLY-SOURCE-01), then implement the entire READY outcome and nothing beyond
it: Assembly lines sourced from Master Data prices and BQ Library items through one
server-side source resolver, price-at-use refresh on Assembly apply with the reported
fallbacks, the minimal Library-page wiring, and all listed tests. Inspect current
repository evidence, preserve unrelated owner work, run the medium-tier gate, update
`CHANGELOG.md`, and create the target local revision commit. Stop only for a material
locked-decision conflict or unsafe boundary, using the BLOCKED / CONFLICT report;
otherwise report the commit, checks, limitations, and remaining unrelated dirty files.
No push.
