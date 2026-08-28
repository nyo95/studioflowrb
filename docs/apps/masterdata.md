# Master Data — Product, Data, and UI Contract

Status: ACTIVE PRODUCT CONTRACT
Evidence basis: current owner direction, final legacy domain contract, reference schema/workflows, and rebuild implementation audit through 2026-08-28.

## Purpose and ownership

Master Data is the platform SSOT for reusable commercial and catalog facts. It owns Party, Party roles and contacts, Brand, Category, SKU, supplier-specific material prices, work/service prices, media, samples, controlled dictionaries, and their audit trail.

It does not own StudioFlow projects, BQ estimates, project snapshots, project workflow, or estimator overrides. Consumers never mutate Master Data implicitly.

## Domain map

```text
Party --< PartyRole
  |--< BrandSupplier >-- Brand --< Sku --< SkuPrice
  |                         |        |        |
  |                         |        |        +-- supplier Party (optional provenance)
  |                         |        +-- Category(PRODUCT)
  |                         |        +-- SkuMedia
  |                         |        +-- Sample --< SampleMovement
  |                         +--< BrandCategory >-- Category(PRODUCT)
  +--< WorkPrice >--------------------------- Category(WORK)
```

Relations are not interchangeable:

- Party is a business identity; roles describe what that identity may do.
- Brand is a product identity; a vendor is not a Brand.
- `BrandCategory` supports discovery; SKU category is the exact product classification.
- `BrandSupplier` says a Party can source a Brand; it is not a price.
- `SkuPrice` is current commercial truth per SKU and supplier pair.
- `WorkPrice` is the current price for a service/package code and has explicit `LABOR_ONLY` or `MATERIAL_LABOR` kind.

## Canonical rules

### Identity and lifecycle

- Party and Brand use live-row, case-insensitive uniqueness and soft delete.
- Category is one controlled table with `PRODUCT` and `WORK` kinds; every lookup filters kind.
- PRODUCT categories are flat in the current MVP. WORK categories may be hierarchical and maintain descendant paths when moved.
- SKU code and Brand are nullable facts, not database identity.
- New SKU intake starts as `DRAFT`; edit preserves status unless an authorized status transition is requested.
- An `ACTIVE` SKU requires its canonical identity/unit fields and a live PRODUCT category. Price availability is evaluated separately by consuming use cases; a missing price must not be converted to zero.
- Soft-deleting a SKU preserves prices for provenance; normal active readers exclude the deleted SKU.

### Pricing

- `SkuPrice` is current state per `(sku_id, supplier_party_id)`; the database must enforce one row per pair, including a deterministic representation of `NULL` supplier.
- A SKU can therefore expose several current supplier choices. BQ must select one explicitly before snapshotting.
- Price edits update the same pair in place. Historical changes live in the generic audit log, not temporal price rows.
- Blank material price means “do not create a row”; explicit zero is valid; negative is invalid.
- The price unit must equal the SKU purchase unit at write time. A coordinated unit change updates both consistently in one transaction.
- A price supplier must satisfy the canonical price-source role rules; consumers must not invent their own role filters.
- `WorkPrice.code` is one live global identity. WorkPrice is updated in place and does not become a temporal offer table.
- WorkPrice quantity is not a domain field. Every amount is per one declared unit.

### Audit and transaction

- Every Master Data mutation records a generic platform audit event inside the same transaction.
- Use the transaction supplied by the application boundary. No global client writes or nested independent transactions inside a use case.
- Cross-app database foreign keys to StudioFlow/BQ identities are forbidden. External actor/project references are plain values or snapshots.

## Main workflows

### Party and sourcing

1. Create or find a Party.
2. Assign explicit operational roles.
3. Add contacts/links/business classifications as owned children.
4. Associate the Party with Brands through `BrandSupplier` when applicable.
5. Create SKU price rows only for eligible suppliers.
6. Audit each mutation and prevent role removal/deletion while live dependencies require it.

### Brand and catalog

1. Create Brand and assign at least one PRODUCT discovery category.
2. Add safe public links and optional owner Party.
3. Create DRAFT SKUs under the Brand or as generic unbranded products.
4. Classify each SKU directly; never derive Brand categories from SKU categories.
5. Add media and supplier-specific prices.
6. Activate only after readiness checks pass.

### Pricing

1. Open a SKU and view all current supplier price options.
2. Add or update one price for the selected supplier pair.
3. Validate supplier role, amount, currency, provenance, and unit.
4. Persist price and audit atomically.
5. Consumers receive the full eligible option list; they choose and snapshot one option.

### Import/export

1. Export a versioned whole-domain workbook with stable IDs and relationship sheets.
2. Preflight the entire workbook: version, columns, IDs/codes, live uniqueness, dictionary references, price-pair uniqueness, and stale-row conflicts.
3. Show row-level errors without partial writes.
4. Apply atomically in dependency order and audit changed rows under one batch/request ID.
5. Missing workbook rows never imply deletion.

### Sample custody

Samples are physical items and point to exactly one SKU. Their five states are `AVAILABLE`, `BORROWED`, `SENT_TO_CLIENT`, `LOST`, and `DISCARDED`. Lost/discarded are terminal and do not require a borrower. This workflow is a later rebuild slice; dummy samples are forbidden.

## Public contract

Only `src/apps/masterdata/public` may be imported by other apps. It exposes explicit immutable DTOs and use cases, never Prisma shapes or repositories.

Required reads include:

- Brand/category discovery for StudioFlow;
- active material/SKU candidates for BQ;
- `prices[]` containing every eligible current supplier price with stable price ID, decimal amount as string, currency, unit code, supplier/source display provenance, updater metadata, and source update time;
- WorkPrice candidates with explicit kind, category path, amount, unit, vendor provenance, and readiness reasons;
- explicit historical resolution by ID only when an existing snapshot needs provenance display.

No cross-app mutation is part of the default contract.

## UI/UX contract

Master Data is a dense operator catalog, not a marketing site.

- Use the shared `AppShell`, catalog/directory templates, table, toolbar, filters, dialogs, drawers, status, feedback, and unsaved-change patterns from UI Engine.
- Navigation groups work by operator intent: Catalog, Parties & Sourcing, Pricing, Samples, and Settings/Import/Audit.
- Lists support search, deterministic filters, sorting, pagination, compact actions, and explicit empty/error states.
- Editors open directly editable for permitted users; read-only follows permission, not an extra “Modify” mode.
- Destructive actions use the shared app confirmation pattern; mass actions require typed confirmation.
- SKU pricing presents multiple supplier rows. It must not collapse them to “latest”, “cheapest”, or a hidden preferred price.
- Relationship labels must use domain language: Brand, Supplier, Service Vendor, and Party are not synonyms.
- User-facing text is English; internal design and migration documentation may be Indonesian.

App code may configure columns, fields, filters, and domain copy. It may not fork shared primitives or hardcode a second token system.

## Permissions

The rebuild currently has a granular `masterdata.*` vocabulary. Before identity productionization, map it to persisted principals and grants without weakening server-side checks. At minimum keep separate access/read/manage gates for dictionary, Party, Brand, Category, SKU, price, audit, import, export, and discovery.

## Rebuild state and migration gaps

- `IMPLEMENTED`: Party/Brand/Category/SKU/price/work-price foundations, UI Engine surfaces, audit, workbook, and public reads exist.
- `IMPLEMENTED` (Gate B, 2026-08-28): current price per SKU × supplier pair with race-safe pair uniqueness including a deterministic NULL-supplier partition; pricing UI, workbook import/export, and the public `prices[]` DTO converge on this contract. No preferred/cheapest/latest fallback exists; BQ must select one option explicitly.
- `OPEN`: production identity and persisted grants.
- `OPEN`: Samples UI/application slice.
- `PURGE`: temporal price offers, inferred vendor/Brand equivalence, legacy v1 candidate tables, dummy samples, and implicit project-to-master promotion.
