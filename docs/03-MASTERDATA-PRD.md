# 03 — Master Data PRD

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

## MVP question checklist
Each entity must answer: identity, uniqueness, owner, lifecycle, soft delete, pricing relationship, audit, permission, import/export need.
