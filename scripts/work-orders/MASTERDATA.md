# Master Data Implementation Work Order

Status: **ACTIVE — owner-authorized 2026-08-31**
Target revisions: `R3.05+`

## Authority

Implement from the active Master Data contracts. Brand, Vendor, and Pricing
contracts are authoritative over the index for their own product decisions. The
owner-locked Unit, Category, and SKU decisions in `docs/apps/masterdata/masterdata.md` are
authoritative for those slices.

## Scope

Implement the first Master Data application with isolated ownership under the
`master_data` PostgreSQL schema:

- Unit dictionary;
- Category dictionary with `PRODUCT` and `WORK` kinds;
- Vendor, VendorType, contacts, links, and Brand relations;
- Brand, Brand categories with provenance, hashtags, and external links;
- SKU with optional single Brand, category assignment, and required material
  price at creation;
- PriceMaterial, PriceMaterialLabor, and PriceLabor;
- persisted archive-cause provenance;
- permanent-deletion requests and explicit approval;
- app permissions, Core audit events, safe errors, and transactional mutations;
- public read DTO boundary only after internal behavior is covered;
- routes and UI using UI Engine shells and patterns.

## Non-goals

Do not implement StudioFlow, BQ, media/file storage, Samples behavior beyond the
locked independent relation boundary, workbook import/export, jobs, or
notifications. Do not connect to or modify the legacy repository or its
PostgreSQL resources.

## Migration and recovery

Create a new rebuild-only Prisma migration for `master_data`. Do not replay or
copy legacy data. The migration must use restrictive foreign keys for business
relations, partial unique indexes for live identities, and explicit tables for
archive causes and deletion requests. Existing database rows are not imported;
the application starts with empty Master Data plus approved dictionary seeds.

## Acceptance

- `npm run typecheck`, `npm run check`, `npm test`, Prisma validation, and the
  focused Master Data tests pass against the explicit rebuild PostgreSQL target.
- Brand, Vendor, Unit, Category, SKU, and all three Pricing tabs render through
  AppShell/PageShell and shared directory/detail/form patterns.
- Search, filters, sorting, pagination, selection, quick entry, detail/edit,
  unsaved changes, loading/empty/error/disabled/permission states, and narrow
  viewport behavior are browser-verified.
- Archive/restore and Category deactivate/merge behavior preserve independent
  relations and archive-cause provenance.
- Permanent deletion cannot bypass the persisted request/approval workflow.
- Every mutation writes its one primary audit event in the same transaction.
