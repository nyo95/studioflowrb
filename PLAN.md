# Active Plan

Plan ID: WO-MD-SKU-INFORMATION-01
Scope: SKU dimensions as information and independently quoted material-price units
Module(s): masterdata; BQ read-only consumption of its public price contract
Target revision: R9.99
Status: READY
Priority: P1
Owner: Product Owner; Codex implements the explicitly approved workflow
Last updated: 2026-10-15

## Outcome

A SKU describes the product, optionally including rectangular dimensions. Each supplier's material price states its own required purchase unit. Creating an HPL SKU with 1220 × 2440 × 12 mm and prices per sheet and per box is valid. The dimensions never automatically produce m², a BQ base unit, or a price conversion. A sample-shelf SKU can exist without any price or purchase unit.

## Locked Decisions

- SKU owns identity, brand, category and optional dimensions; it owns no new base/BQ or purchase unit. Length and width require a dimension unit; thickness is optional. These fields describe size only.
- `PriceMaterial.unit_id` is the unit of that supplier's quote. It is required, active, independently selected per supplier, and may be changed with the audited price. No alignment to another supplier or to the SKU.
- SKU creation from Pricing still requires its first price. The sample-shelf exception remains price-less and requires no unit.
- BQ imports the quoted price and its actual unit as a historical snapshot; its own quantity/coefficient controls calculation. It neither calculates nor displays a dimensions-to-m² conversion.
- Preserve historical SKU unit/factor values and existing BQ snapshots without rewriting them. Legacy columns may remain nullable/inert for compatibility; new writes do not populate or consume them.
- Keep the existing pure rectangle-area utility disconnected from runtime business flows, documented as available only if a future owner decision needs it. Do not add a new futureproof framework or module.

## Backend Contract

Update schema constraints and service/action/workbook contracts so all new material-price entry paths require a unit at the price row, and SKU dimensions validate only positive structured values. Import/export must represent price unit per row and preserve correct supplier-specific units. Existing rows remain readable. Maintain permissions, audits, archive rules and module boundaries.

## UI Contract

Pricing offers a unit selector per material price row, including new SKU rows and edit. SKU and shelf dialogs cease asking for SKU base/purchase units. Size remains optional, informational. Remove conversion language/hints from Pricing, SKU and BQ user flows. Keep existing UI Engine components.

## Verification

Focused service and workbook regressions: dimensioned SKU without conversion; sample SKU without unit; two supplier units for one SKU; price-unit update; BQ snapshot; import/export. Then full tests, typecheck, boundaries, legacy-runtime, lint and build. Browser acceptance for Pricing → Add SKU and sample shelf after commit; if unavailable, mark unverified explicitly. Verify rebuild-only office database target before any migration/test database command.

## Boundaries and Non-goals

No legacy DB, no root `test/`, no remote push, no new automated BQ conversion, no historical data purge, no unrelated UI redesign. Do not compare price amounts with unlike units as if directly comparable.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the READY outcome and nothing beyond it. Preserve unrelated owner work, run the required checks, update `CHANGELOG.md`, and create the target local revision commit. Stop for a material locked-decision conflict or unsafe boundary; otherwise report commit, checks, limitations, and remaining unrelated dirty files.
