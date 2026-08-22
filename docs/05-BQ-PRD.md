# 05 — BQ PRD

## Role
Estimator workspace replacing spreadsheet-style BQ workflows while remaining simple and project-independent.

## Owns
- BQ Project
- Object (L1)
- Sub-object (L2)
- breakdown lines (L3)
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

## Library rule
BQ Library stores recipe/structure, not stale project price snapshots. Applying a recipe resolves current Master Data and creates fresh project snapshots.

## MVP principle
BQ should feel closer to a powerful spreadsheet than to an ERP configuration module.
