# Active Plan

Plan ID: WO-MD-SAMPLEPRICE-01
Scope: Master Data — put a sample request's quoted price into the material price list (server command, audit, tests). Backend only; the Lead builds the SKU picker and the "Add to price list" action afterwards.
Target revision: R8.234
Status: READY
Priority: P2
Owner: owner (Product Owner). Continuation of the sample-request workflow approved 2026-09-29 ("lanjut 2", 2026-09-30); details below are Lead defaults from legacy evidence and are open to the owner's veto.
Last updated: 2026-09-30

## Outcome

Master Data staff work a sample request: they record the supplier's quote (supplier, amount, currency) and, when the product exists in the catalogue, pick its SKU.
One command then writes that quote into the real material price list for that SKU and supplier, and links the request to the resulting price. Today the queue stores
the quote and the ids but never touches `PriceMaterial`; staff re-type the price by hand in Pricing.

## Context and Evidence

- Rebuild today: `SampleRequestIntake` already stores `vendor_id`, `quoted_amount`, `quoted_currency`, `sku_id`, `price_material_id`, `staff_note`; `recordSampleQuote`,
  `markSampleRequestPriced`, `declineSampleRequest` in `src/apps/masterdata/services/sample-request.service.ts`. `createPriceMaterial` / `updatePriceMaterial` in
  `services/pricing.service.ts` own price validation, the derived unit, permissions and audit (REUSE them, do not write `PriceMaterial` directly).
- Legacy (read-only, `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`): `src/subapps/master-data/actions/sample-request-actions.ts` `VendorFollowUpInput.syncToMaterialPrice` /
  `syncSkuPrice`: the price sync required an existing SKU (`SKU_REQUIRED` otherwise: "every price hangs off a SKU") and recorded the actor and a note; it never created a SKU.
- Boundary: Master Data only. StudioFlow is untouched (it only requests).

## Locked Decisions

- **Command:** `syncSampleQuoteToPrice({ grants, actor, intakeId })` on the Master Data service (module `sample-request.service.ts` or a small sibling), exposed through the existing
  service object. Allowed while the intake is `IN_PROGRESS` or `PRICED` (staff often mark priced first); a `DECLINED` intake is rejected (`SAMPLE_INTAKE_DECLINED`).
- **Permissions:** the caller must hold BOTH `masterdata.sample-request.manage` and the material-price manage permission (`priceMaterialManage`). Neither alone is enough.
- **Preconditions (all must be set on the intake, otherwise `SAMPLE_PRICE_SYNC_INCOMPLETE` with a plain message naming what is missing):** a supplier (`vendor_id`), a live SKU (`sku_id`),
  a quoted amount and currency. **It never creates a SKU or a supplier** (legacy parity, and the reference-data rule of the workbook import). No SKU means: create the SKU first, then link it.
- **Effect:** if a live `PriceMaterial` already exists for the same SKU and supplier, UPDATE it (amount, currency; unit stays the SKU's derived unit) through the existing update rules;
  otherwise CREATE one. Set `intake.price_material_id` to it. Price notes: `From sample request: <product name> (<project name>)`, appended without overwriting an existing note.
  Use the existing price services so their validation (supplier must be material-capable, SKU live, currency, amount) applies; suppress their own audit and write one combined event.
- **Idempotent:** if the intake is already linked to a live price whose amount and currency equal the quote, the command changes nothing and returns it.
- **Audit:** one event `masterdata.sample-request.price-synced`, entity `sample_request_intake`, changes `{ priceMaterialId, action: "created" | "updated", amount, currency }`, metadata `{ sourceRequestId, skuId, vendorId }`. No notification change.
- **Read model:** the intake read (`toRead`) already exposes `skuId`, `vendorId`, `priceMaterialId`; also expose the linked SKU's display name and code and the price's amount for the UI (small additive fields, no new query per row).
- **Errors** use `AppError` with plain messages; a mismatch such as an archived SKU or supplier surfaces the existing price-service errors.

## Business Rules and Architecture Constraints

- Master Data only; no StudioFlow, BQ or platform RBAC changes; no schema change (all needed columns exist — verify before starting; if a migration turns out to be needed, stop with BLOCKED / CONFLICT). No new dependency.
- Money as decimal strings through the existing helpers. One transaction. Follow the module's existing patterns (`openIntake`, `quoteData`, `writeAudit`).
- Keep the Master Data operational-override ledger in `docs/apps/masterdata/masterdata.md` section 4.3 accurate: if this command relaxes any locked rule, add an entry; if not, say so in the report.

## Boundaries and Non-goals

No UI (Lead). No SKU creation from a request. No bulk sync. No change to who receives notifications. No automatic sync on "Mark priced". No push.

## Acceptance Criteria

- With supplier + SKU + amount + currency set, the command creates the price when none exists, updates it when one exists, links the intake, and writes exactly one audit event; running it twice changes nothing the second time.
- Missing supplier, SKU, or amount each fail with `SAMPLE_PRICE_SYNC_INCOMPLETE`; a declined intake is rejected; an archived SKU or a non-material supplier is rejected by the existing price rules.
- A caller with only the sample-request permission, or only the price permission, is denied.
- The price appears in the normal Pricing list for that SKU and supplier and the update path keeps the previous notes.

## Verification

`npm test`, `npx tsc --noEmit`, `npm run check`, eslint, `npm run build`. Render `/masterdata/sample-requests` and `/masterdata/pricing` once in `next dev` (a dev server may already be running on port 3001, started by the owner or a previous agent; check its process before assuming you may restart it, and if a restart is needed for a Prisma change say so instead of killing it). STUDIOFLOW_LOCATION=kantor. Databases: only `studioflow_rebuild` (dev) and `studioflow_rebuild_test` on localhost:5433 (container `studioflowrb-gateb-test-db`); never any legacy database.

## Reviewer Acceptance

The Lead reviews the diff, then adds a SKU picker to the quote dialog and an "Add to price list" action, and checks the flow in the browser without changing the owner's real data.

## Regression Risks and Recovery

Low: one new command reusing tested price services. Recovery: revert the single commit (no migration).

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the entire READY backend
outcome and nothing beyond it. Inspect current repository evidence, preserve unrelated owner work, make sound in-scope implementation decisions, run the
required checks (including opening the touched routes in `next dev`), update `CHANGELOG.md`, and create the target local revision commit R8.234. Stop only for
a material locked-decision conflict or unsafe boundary, using the BLOCKED / CONFLICT report. Report the commit, checks, limitations, and remaining unrelated dirty files.
