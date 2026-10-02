# Active Plan

Plan ID: WO-BQ-INTEGRITY-01
Scope: BQ — four minimal integrity fixes from the external audit (Rupiah only, lock readiness, Master Data price permission, no self-approval of deletion). Backend and the thinnest wiring only. No new features.
Target revision: the next unused revision in `CHANGELOG.md` (expected R8.295; confirm). One local commit.
Status: READY
Priority: P0
Owner: owner (Product Owner). Decisions answered 2026-10-02: follow the Lead's recommendation on all points, minimal fixes only; BQ enhancements wait for the estimator's feedback.
Last updated: 2026-10-02

## Outcome

After this plan BQ cannot silently produce a wrong total or leak prices:
1. Every amount in BQ is Rupiah. A line, library item, or assembly line in another currency is refused with a clear message.
2. A project cannot be locked while it is empty. It cannot be locked while rows still have a price of Rp0 unless the caller explicitly confirms.
3. Pulling a price from Master Data into a BQ line requires the matching Master Data read permission, on the server, not only in the picker.
4. The person who asked for a project deletion cannot approve that same request.

## Read first

- `docs/apps/bq/bq-contract.md` (find the sections on lock/unlock, currency, and permanent deletion).
- `src/apps/bq/services/projects.ts` (`lockProject`, `approveProjectDeletion`).
- `src/apps/bq/services/project-tree.ts` (`addLineItem`, `updateLineItem`).
- `src/apps/bq/services/library-items.ts`, `src/apps/bq/services/assemblies.ts`.
- `src/app/(platform)/bq/[id]/actions.ts` (`addLineItemAction` around line 349, `lockProjectAction` around line 486) and `src/app/(platform)/bq/[id]/source-actions.ts` (the picker).
- `src/apps/bq/service.integration.test.ts` for how tests are written here.

## Locked Decisions

1. **Rupiah only.** The only accepted currency code in BQ is `IDR` (compare case-insensitively after trimming; store `IDR`). No exchange rates, no schema change, no data rewrite.
2. **Lock gate.** Locking requires: (a) the project has at least one item (a BqItem), and (b) no zero-price rows, unless the caller passes `acknowledgeZeroPrices: true`. A "zero-price row" is either a standalone item (an item with no sub-objects and no direct line items) whose `harga_snapshot` is null or 0, or any line item (under a sub-object or directly under an item) whose `harga_snapshot` is 0. Rows are counted; nothing is changed.
3. **Permission.** Material imports need `MASTERDATA_PERMISSIONS.priceMaterialRead`; labor and material-labor imports need `MASTERDATA_PERMISSIONS.priceWorkRead`. Without it the import fails with a permission-denied error.
4. **Deletion approval.** `approveProjectDeletion` is refused when the request's `requester_user_id` equals the approving user's id. Rejecting your own request stays allowed (it works as a cancel). There is no exception for a single-approver studio; the project then needs a second approver. Mention this in the changelog.

## Steps (do them in this order)

### Step 1 — Rupiah only

1. Create `src/apps/bq/lib/currency.ts` exporting `requireRupiah(value: string): "IDR"`. If `value.trim().toUpperCase() !== "IDR"` throw `new AppError("VALIDATION", "bq.currency.rupiah-only", "BQ works in Rupiah only for now.")`; otherwise return `"IDR"`.
2. Call `requireRupiah` wherever a currency is accepted from a caller:
   - `addLineItem` and `updateLineItem` in `project-tree.ts` (`currencySnapshot`; in the update, only when it is not `undefined`).
   - All four create and four update functions in `library-items.ts` (`currency`; in updates only when not `undefined`).
   - In `assemblies.ts`, any create or update of an assembly line that takes a currency. If none takes one, say so in your report and change nothing there.
3. In `src/app/(platform)/bq/[id]/source-actions.ts`, exclude Master Data options whose `currency` is not `IDR` from the picker result (BQ Library options are IDR already).
4. Read-only check (do not change data): count rows with `currency_snapshot <> 'IDR'` in `bq.bq_line_item` and `bq.bq_assembly_line`, and rows with `currency <> 'IDR'` in the four library tables, against `studioflow_rebuild` only. Put the numbers in your report. If any number is above 0, still finish the plan and mention it as a limitation.

### Step 2 — Lock gate

1. In `projects.ts`, change the `lockProject` input to `{ grants, actor, id, acknowledgeZeroPrices?: boolean }`.
2. After the existing status checks and before `transitionProjectStatus`, load the project's items (one query with relations; follow the model names in `prisma/schema/bq.prisma`: section, subsection, item, sub-object, line item).
3. If there are no items, throw `new AppError("CONFLICT", "bq.project.lock-empty", "Add at least one item before locking the project.")`.
4. Count zero-price rows per Locked Decision 2. If the count is above 0 and `acknowledgeZeroPrices` is not `true`, throw an `AppError("CONFLICT", "bq.project.lock-zero-prices", ...)` whose message reads "N row(s) have a price of Rp0. Fill them in, or confirm to lock anyway." and which carries `details: { count }`. Check how `details` is passed in other `AppError` calls in this repository and use the same form.
5. When the project is locked with acknowledged zero prices, record the count (`zeroPriceRows`) in the existing `bq.project.locked` audit event the same way other BQ audit calls add metadata.
6. In `actions.ts`, `lockProjectAction` passes `acknowledgeZeroPrices` from the form data (`formData.get("acknowledgeZeroPrices") === "true"`). Make no other UI change; the Lead builds the confirmation dialog afterwards.

### Step 3 — Master Data permission

1. Create `src/apps/bq/lib/master-data-source.ts` exporting `async function snapshotFromMasterData(input: { grants; sourceKind: "material" | "labor" | "material-labor"; sourceRefId: string; read: Pick<typeof masterDataRead, "getMaterialPriceOption" | "listWorkPricesRead"> })` that returns the same snapshot object the action builds today, using `snapshotFromMaterialPrice` / `snapshotFromWorkPrice` from `snapshot.ts`.
2. Inside it, before any read: `requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialRead)` for `material`, and `requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceWorkRead)` for the other two kinds. Keep the existing "not found" errors exactly as they are in the action today.
3. Replace the Master Data branch in `addLineItemAction` with a call to this function. Behavior for permitted users must not change.

### Step 4 — Deletion approval

1. In `approveProjectDeletion` (`projects.ts`), right after the request is loaded and found pending, add: if `request.requester_user_id === input.actor.userId` throw `new AppError("CONFLICT", "bq.project.deletion-self-approval", "The person who asked for the deletion cannot approve it.")`.
2. Do not change `rejectProjectDeletion`.

### Step 5 — Documentation

1. In `docs/apps/bq/bq-contract.md` add one short paragraph per decision (1 to 4), in the section that fits best, using the wording of the Locked Decisions. Do not rewrite other text.
2. Add the changelog entry. In `docs/BACKLOG.md` (CRLF-aware edits) only tick or remove an item that this plan truly fixes. The Lead has already recorded the parked audit items; do not edit that entry.

## Tests required (real assertions; each listed case must exist)

Put them in `src/apps/bq/service.integration.test.ts`, plus a small unit test file next to each new `lib` file.

- `requireRupiah`: `IDR`, ` idr `, `Idr` accepted; `USD`, empty string, `RP` refused with code `bq.currency.rupiah-only`.
- `addLineItem` and `updateLineItem` refuse `USD`; library create and update refuse `USD` (test one kind directly and the other three through a loop over the kinds).
- Lock: an empty project is refused with `bq.project.lock-empty`; a project with one standalone item priced 0 is refused with `bq.project.lock-zero-prices` and `details.count === 1`; the same project locks when `acknowledgeZeroPrices: true`; a fully priced project locks without the flag; a line item priced 0 under a sub-object is counted; a standalone item with a null price is counted. Update existing tests that lock an empty project so they first add one priced item.
- `snapshotFromMasterData`: with fake read ports, a user without `priceMaterialRead` is refused for `material`; without `priceWorkRead` refused for `labor`; with the permission it returns the snapshot; the fake ports must NOT be called when the permission is missing (assert call count 0).
- Deletion: request made by user A; approval by user A refused with `bq.project.deletion-self-approval` and the project still exists; approval by user B succeeds. Update existing deletion tests that used one user for both so they use two.

## Non-goals (do not do these)

Exchange rates or multi-currency; any UI change except the one form-data line in Step 2.6; changing Master Data code; schema changes or migrations; the other audit items (pagination, PDF, reorder, performance, splitting files); editing StudioFlow files; refactoring.

## Regression risks

- Existing BQ tests may create items with price 0 and then lock; fix the tests, not the rule.
- Do not break picking a Library item: Library options are IDR.
- `acknowledgeZeroPrices` must default to false everywhere.

## Verification

`npm test` (report counts before and after; baseline 797 pass, 0 fail), `npm run check`, `npm run lint`, `git diff --cached --check`. Do not run `npm run build` (or restore `next-env.d.ts` before staging). Do not describe a skipped check as passed.

## Reviewer Acceptance

The Lead re-runs the suite, probes each of the four rules with a temporary test, then builds the lock confirmation dialog and the Rupiah-only picker note, and checks them in the browser.

## Executor Prompt

You are the BACKEND EXECUTOR for D:\Misc\ProjectsHUB\studioflowrb (office computer, `STUDIOFLOW_LOCATION=kantor`). Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and the root `PLAN.md` (WO-BQ-INTEGRITY-01, READY). Start from a clean committed tree and record HEAD and dirty files. Do the five steps in order, in one run, without progress stops. Every test listed under "Tests required" must exist with real assertions; a previous correction pass was rejected for adding none. Make one local commit with the next unused revision, `feat(bq): rupiah only, lock readiness, price permission, no self-approval`. Use only the rebuild databases (`studioflow_rebuild`, `studioflow_rebuild_test` on localhost), never the legacy database, and run read-only SQL only. Re-run `npm test`, `npm run check`, and `npm run lint` yourself and report the real counts. Do not run `npm run build`. No push, PR, or merge. Stop with a `BLOCKED / CONFLICT` report only if a locked decision cannot be met. Finish with one Planner/Reviewer prompt only: outcome per step, commit hash, checks with real counts, the non-IDR row counts, limitations, dirty files, and a request for the verdict.
