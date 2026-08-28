# 05 — BQ PRD

Status: ACTIVE PRODUCT CONTRACT. Detailed contract: `apps/bq.md`.

## Role
Estimator workspace replacing spreadsheet-style BQ workflows while remaining simple and project-independent.

## Owns
- BQ Project
- Section (L0) and optional Sub Section (L1), with at most two grouping levels for new writes
- Works (L2), the only Qty × Unit Price layer
- material/service Sub-Work lines (L3), expressed as coefficient × frozen source price
- estimator overrides
- project snapshots of source pricing
- calculation rules
- reusable BQ recipe library

## Master Data integration
BQ reads current eligible source data from Master Data:
- material prices
- labor prices
- material+labor prices

When selected into a project, required values are snapshotted so later Master Data changes do not silently change an existing estimate.

Existing snapshots never refresh. There is no refresh-all, refresh-selected, drift replacement, or automatic upstream propagation. A deliberate new selection creates a new snapshot.

## Library rule
BQ Library stores recipe/structure, not stale project price snapshots. Applying a recipe resolves current Master Data and creates fresh project snapshots.

Where a SKU has multiple supplier prices, the estimator explicitly selects one; BQ never chooses cheapest/latest/preferred silently.

## MVP principle
BQ should feel closer to a powerful spreadsheet than to an ERP configuration module.

Calculations are pure and centralized. MVP excludes inferred waste/conversion/purchase-rounding and commercial markup/overhead/profit/tax/discount engines.
