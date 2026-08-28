# 03 — Master Data PRD

Status: ACTIVE. Detailed contract: `apps/masterdata.md`.

## Role
Global business-data SSOT for the entire platform.

## Owns
- Brand
- Product / SKU
- Category
- Supplier / Party
- Material definitions
- Labor/service definitions
- Material pricing
- Labor pricing
- Material+labor pricing
- canonical units required by these domains

## Consumers
### StudioFlow
Consumes Brand Catalog/product references for the Library extension.

### BQ
Consumes pricing candidates for material, labor, and material+labor.

## Rules
- consumers never mutate Master Data implicitly
- project data never silently promotes itself into Master Data
- Master Data does not store BQ project snapshots
- Master Data does not know StudioFlow project workflow
- public read/write use cases are exposed from `src/apps/masterdata/public`
- SKU price is current state per SKU × supplier pair; a SKU may expose several eligible supplier prices
- price history is generic audit history, not temporal offer rows
- BQ explicitly selects one price option and snapshots it

## MVP question checklist
Each entity must answer: identity, uniqueness, owner, lifecycle, soft delete, pricing relationship, audit, permission, import/export need.

## Former implementation gap — resolved 2026-08-28

The rebuild previously implemented a singular global SKU price and singular public `price`. Gate B corrected this (migration `20260828000000_master_data_sku_pair_pricing`): the schema, pricing service, workbook import/export, UI, tests, and public DTO now converge on supplier-pair pricing and `prices[]`. BQ implementation may proceed against this contract.
