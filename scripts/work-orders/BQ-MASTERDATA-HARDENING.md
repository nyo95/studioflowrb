# BQ and Master Data hardening — R5.05

**Status:** active owner-authorized work order

## Locked decisions

1. Brand exclusively owns catalog resources; Supplier owns no external links.
   Delete `VendorLink` and its data. Persisted `Vendor` and `/masterdata/vendors`
   remain; all visible copy is Supplier. Brand is the only writer of
   `BrandSupplier`; Supplier renders it read-only.
2. Each imported BQ L3 keeps immutable `source_harga_snapshot` and
   `source_currency_snapshot`. Override changes the active snapshot only;
   revert restores the immutable imported snapshot. Existing sourced rows use
   their current snapshot as their migration baseline.
3. BQ Project gains reversible archive, deletion request, and explicit-permission
   hard-delete approval. Only ACTIVE projects can be archived; restoring an
   ARCHIVED project always returns it to ACTIVE. BQ owns its
   deletion-request persistence and audit; it does not reuse Master Data tables.
4. BQ Library matches Master Data interaction and validation shape but remains
   BQ-owned. Units are selected through Master Data public reads and stored as
   snapshots/plain values; no cross-app FK. Default coefficient is persisted as
   `1` and hidden from ordinary Library CRUD.
5. Promotion is coordinated through explicit public boundaries. Master Data
   owns approval and canonical entry creation; BQ owns request state and never
   accepts an arbitrary Master Data ID. Approval is idempotent and audited.

## Execution order and acceptance

1. Apply Supplier/Brand ownership cleanup and migration.
2. Add BQ schema/migrations, service invariants, permissions, actions, and
   public DTOs for snapshot/revert and lifecycle.
3. Replace internal cross-app promotion imports with public coordinator ports.
4. Align Library/Project UI with UI Engine; remove color-only status and avoid
   unnecessary horizontal scrolling.
5. Add unit/integration coverage for transitions, audit atomicity, permission
   denial, archived/locked guards, snapshot revert, and promotion races.
6. Run typecheck, lint, boundary checks, migration validation, isolated
   integration tests, and browser acceptance only against proven rebuild-only
   infrastructure.
