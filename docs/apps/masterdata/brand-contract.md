# Brand Contract — Master Data

> **R5.05 owner amendment — 2026-09-06.** Brand is the exclusive owner of
> catalog and external product resources. `BrandSupplier` is edited only from
> Brand; the Supplier route presents the relationship read-only. UI says
> **Supplier**, while the persisted and route vocabulary remains `Vendor`.
>
> **R8.114 owner amendment — 2026-09-23 (narrows the rule above).** *Editing*
> an existing relation is still Brand-only. The Supplier **Create** dialog may
> now set an optional initial `BrandSupplier` relation for existing Brands at
> creation time (no inline Brand creation from that field) — see
> `vendor-contract.md`'s own R8.114 note for the full rule and the capability
> guard it shares with this screen's Suppliers field.

Status: **OWNER-APPROVED LOGIC CONTRACT — not yet an executable work order**

Authority: owner decisions locked in the Brand navigator session, reconciled
with the curated [`vendor-contract.md`](vendor-contract.md),
[`pricing-contract.md`](pricing-contract.md), and the shared rules in
[`masterdata.md`](masterdata.md). Current schema/code and legacy behavior are
implementation evidence only.

## 1. Domain identity

A Brand is a product/maker identity, not a company, Vendor, category, SKU, or
catalog file.

| Field | Type | Rule |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | String | Required; case-insensitive unique among live Brands |
| `slug` | String | Generated from `name`, unique among live Brands, stable and not manually editable |
| `owner_vendor_id` | FK → Vendor? | Optional; at most one owner company |
| `notes` | String? | Internal only |
| `created_at` | DateTime | UTC instant |
| `updated_at` | DateTime | UTC instant |
| `deleted_at` | DateTime? | Effective archive state; cause provenance follows `masterdata.md` §4.1 |

`name` is the only required profile field. A Brand may exist before SKUs,
catalogs, an owner company, suppliers, or categories are known. Logo/media upload
is outside the current scope.

## 2. Discovery: Category and hashtag are different

### 2.1 Brand Categories

A Brand may have zero or many live PRODUCT Categories. Categories are a controlled,
flat discovery vocabulary for material families. Staff select from the seeded
list and may create a missing Category through the approved creatable interaction.
Once created, that Category remains available to later records.

The current rule requiring every live Brand to retain at least one PRODUCT
Category is **PURGE**. Brand CRUD must not depend on an SKU or a Category.

### 2.2 Hashtags

Hashtags are additional discovery keywords, not URL slugs and not a hierarchy.
Examples include `#lantai`, `#dinding`, `#wallpanel`, `#wallfinish`, `#hpl`, and
`#laminated`.

Rules:

- display retains the canonical label while comparison uses normalized,
  case-insensitive text;
- duplicate normalized values on one Brand are blocked;
- `#` is presentation syntax, not part of identity storage;
- hashtags can be suggested from values already used by other Brands;
- near duplicates show a warning, but a confirmed distinct value may be kept;
- hashtags never replace Categories in Library filtering and do not grant any
  commercial capability.

The current removal of Brand tags in favor of `Category.search_synonyms` is
**FIX**: Category synonyms describe a Category; Brand hashtags describe one
Brand. Both may participate in search but remain separately owned facts.

## 3. Brand Category enrichment from SKU

Brand Categories have two approved entry paths:

1. explicit staff assignment on the Brand; and
2. persistent enrichment when an SKU assigned to that Brand uses a PRODUCT
   Category not yet linked to the Brand.

Example: AICA initially has `HPL`. Staff later records an AICA SKU classified as
`Toughtop`; `Toughtop` becomes a persistent AICA discovery Category and Library
search can find AICA through it.

Provenance is mandatory. One Brand–Category relation may have more than one
origin, and removing an SKU must not erase an independently confirmed manual
assignment. The persisted design must distinguish at least:

- `MANUAL`, with actor/time; and
- `SKU_ENRICHMENT`, with source SKU/time.

Changing or archiving an SKU removes only that SKU's active enrichment evidence.
The Brand–Category relation remains while another SKU origin or a manual origin
exists. This provenance and roll-up policy is **APP-OWNED**; a single enum field
that cannot represent both origins is insufficient.

This contract does not decide whether every SKU must have a Brand. That cardinality
belongs to the future SKU contract.

## 4. Vendor relations

### 4.1 Owner company

`Brand.owner_vendor_id` is optional and points to one live Vendor. No new
`owner_company` entity is created.

- a Brand may have no owner Vendor;
- ownership does not mean authorized distributor or seller;
- an owner-only Vendor needs no material/labor capability merely to own a Brand;
- a Vendor may own many Brands;
- archiving either side does not archive the other.

The FK uses `onDelete: SetNull` as a database safety behavior, while permanent
Vendor deletion remains blocked by a live/archived ownership reference until the
relationship is deliberately cleared.

### 4.2 Suppliers

`BrandSupplier` is the independent many-to-many statement “this Vendor supplies
this Brand”. It is not a price, SKU availability record, software permission, or
ownership relation.

| Field | Type | Rule |
|---|---|---|
| `id` | UUID | Primary key |
| `brand_id` | FK → Brand | Required; `onDelete: Restrict` |
| `vendor_id` | FK → Vendor | Required; `onDelete: Restrict` |
| `is_authorized` | Boolean | Explicit official/authorized status; default false |
| `notes` | String? | Internal relationship note |

The pair `(brand_id, vendor_id)` is unique. A linked Vendor must be live and have
at least one live VendorType with `can_supply_material = true`. Owner and supplier
relations may point to the same Vendor, but neither relation implies the other.

## 5. External resources

A Brand may have many ordered external resources. They attach directly to the
Brand, never to a Brand Category.

The initial implementation reuses `BrandLink` and the approved `LinkKind`
vocabulary. It supports HTTP(S) URLs for official websites, social pages, catalog
pages, marketplace pages, Google Drive PDFs, price lists, and other external
references. URLs are unique per Brand.

Catalogs are consumed later by StudioFlow Library. Internal file storage, upload,
malware/type/size policy, and internally hosted PDFs remain **DEFERRED** until the
Library/media contract activates them. BrandLink deletion sets an optional
PriceMaterial `source_link_id` to null; it does not delete a price.

## 6. Lifecycle

Brand and Vendor are independent roots. Brand lifecycle affects Brand-owned
catalog data; it never archives an owner or supplier Vendor.

| Operation | Authority | Result |
|---|---|---|
| Read/list | `masterdata.brand.read` | View active/authorized archived states |
| Create/update | `masterdata.brand.manage` | Mutate profile, discovery, resources, and relationships |
| Archive/restore | `masterdata.brand.manage` | Reversible operation with persisted causes |
| Permanent deletion | `masterdata.brand.manage` requests; `masterdata.deletion.approve` may execute directly | Archived Brand; direct execution creates no request |

### 6.1 Archive

In one transaction:

1. add the Brand's direct archive cause;
2. add a Brand-parent cause to every SKU whose `brand_id` references the Brand;
3. make those SKUs effectively archived and add their SKU-parent cause to every
   `PriceMaterial` row they own;
4. preserve Categories/origins, hashtags, resources, owner, BrandSupplier, and
   scoped contacts;
5. write one `brand.archived` primary AuditEvent.

**Lifecycle eligibility:** Brand archive cascades a persisted parent archive
cause to every branded SKU and its Material Prices. The entities may still exist
independently, but are excluded from operational pickers while the Brand cause
remains. Restoring the Brand removes only its own causes; independently archived
SKUs or prices remain archived. Archived Brand records, branded SKUs, and their
Material Prices are excluded from operational pickers and public reads.

### 6.2 Restore

Restore makes the Brand live again. Before the Brand becomes live, validate:

- Brand name/slug has no live conflict;
- owner Vendor, when retained, is live;
- BrandSupplier Vendors are live and materially eligible;
- Category/resource relations still satisfy their live-target rules.

Restore removes only the parent causes created through this Brand lifecycle.
A branded SKU becomes active only when no other cause remains and its normal
restore invariants pass. Its Material Prices become active only when their SKU
is restored, no other cause remains, and normal price restore invariants pass.
A directly archived SKU or Price therefore remains archived.

### 6.3 Permanent deletion

Permanent deletion requires an archived Brand. A Brand manager may submit a
request; a holder of `masterdata.deletion.approve` may execute directly without
a request. It is blocked while any branded SKU is active, or while BrandSupplier
or Brand-scoped VendorContact references remain.
Owner linkage is a field on the Brand and is removed with it.

In the same approved transaction the service:

1. identifies every SKU whose `brand_id` references this Brand;
2. deletes their Material Prices and corresponding archive causes;
3. deletes their SKU Category/enrichment rows, archive causes, and SKU rows;
4. deletes Brand-owned Categories/origins/hashtags/resources;
5. deletes the Brand itself.

Restrict FKs require this explicit order; database Cascade is not used to hide
the business operation. One `brand.deleted` AuditEvent survives in Core.
BQ historical snapshots remain independent and are never cascaded or linked by FK.

## 7. Permissions and audit

Permissions:

```text
masterdata.access
masterdata.brand.read
masterdata.brand.manage
masterdata.deletion.approve
```

Audit actions:

```text
brand.created
brand.updated
brand.archived
brand.restored
brand.deletion-requested
brand.deletion-rejected
brand.deleted
```

Category, hashtag, resource, owner, and supplier changes made in one Brand save
are safe deltas inside one `brand.updated` event. No-op updates emit nothing.
Approved permanent deletion is represented by `brand.deleted` with request and
approver metadata as defined by `masterdata.md` §4.2.

## 8. Duplicate detection and search

- hard authority: partial unique indexes on `lower(name)` and `slug` where the
  Brand is live;
- create/update/restore repeat the friendly application check before relying on
  the race-safe database constraint;
- normalized near-duplicate search warns but does not block a confirmed distinct
  Brand (for example `TOTOY` beside `TOTO`);
- search is case-insensitive and typo-tolerant across Brand name, Categories, and
  hashtags;
- Library primarily filters by Category, while name and hashtag improve discovery
  and explain why a Brand matched.

## 9. UI/UX

The primary view is a `DirectoryShell` + `DataTable`.

Recommended visible columns are Brand name, Categories, hashtags/discovery hints,
owner Vendor, supplier count, resource count, and Status. Status uses the shared
marker-style `StatusBadge`; category/hashtag values may use tags. Rows are not
generic navigation targets. A trailing `RowActionMenu` provides edit, archive,
restore, and deletion-request actions according to permission/state.

Create/edit uses the shared Dialog form pattern. Category and hashtag entry use
the activated accessible multi-value searchable/creatable UI Engine control;
persistence, normalization, provenance, and permissions remain in Master Data.
Archive/restore/deletion use shared confirmation mechanics and display cascade
impact. The edit dialog footer displays "Updated by [actor] · [relative time]"
drawn from the most recent `brand.*` AuditEvent for that Brand; actor identity
is stored in AuditEvent, not denormalized onto the Brand row.
Unsaved, pending, success, validation, conflict, permission-denied,
loading, empty, error, archived, long-content, narrow-viewport, and horizontal-
overflow states are required.

Bulk action and Excel/import-export behavior remain outside this contract.

## 10. Public read behavior

StudioFlow Library receives an explicit read-only DTO containing only live,
authorized fields needed for discovery: Brand identity, Categories, hashtags,
allowed external resources, and later sample availability when its contract is
active. Vendor contacts, internal notes, authorization notes, and prices are not
exposed merely because they are related.

BQ obtains prices from Pricing's public contract, not by reading Brand internals.
Consumers never write Brand tables directly.

## 11. Capability placement

| Disposition | Decision |
|---|---|
| **REUSE Core** | identity/grants, transaction, audit, safe error/action, validation convention |
| **REUSE Utilities** | normalization and slug generation |
| **EXTEND Utilities** | pure similarity scorer; Brand owns threshold and confirmation policy |
| **REUSE/ACTIVATE UI Engine** | Directory/DataTable/Dialog/RowActionMenu/StatusBadge/confirm/unsaved plus generic multi-value creatable interaction |
| **APP-OWNED** | Brand identity, Category/hashtag semantics, SKU enrichment provenance, Vendor relationship rules, archive/delete cascade, Library DTO |
| **DEFER** | logo/media upload, internal catalog storage, freshness notification, import/export, sample DTO details |

## 12. Implemented-state migration ledger

### KEEP

- Brand root identity, optional owner relation, notes, timestamps, soft-archive
  field, live name/slug indexes;
- `BrandLink`, `BrandSupplier`, and Brand–Category many-to-many intent;
- case-insensitive exact search, transaction + audit pattern, public read boundary;
- legacy Brand-first Library outcome: search a material/category and return Brands.

### FIX

- rename `owner_party_id` to `owner_vendor_id` and all Party references to the
  curated Vendor vocabulary;
- restore Brand hashtags as a separate discovery fact;
- allow Brand without Category;
- replace explicit-only BrandCategory with multi-origin manual/SKU enrichment;
- replace role-based supplier eligibility with VendorType capability checks;
- rename archive action/audit from `softDelete`/`brand.deleted` to
  archive/`brand.archived`;
- add provenance-safe cascade archive/restore and approved permanent deletion;
- change both BrandSupplier FKs to Restrict and make destructive graph changes
  explicit;
- expand delete guards to BrandSupplier and scoped-contact references.

### MERGE

- merge duplicate legacy Brand/library search paths behind one Master Data public
  contract while retaining app-specific presentation in StudioFlow;
- use one shared multi-value creatable interaction instead of private category
  and hashtag controls.

### PURGE

- Brand tags being collapsed into Category synonyms;
- the invariant that a live Brand must have at least one Category;
- archive being blocked by live SKUs rather than cascading;
- implicit DB cascades that erase independent Vendor relationships;
- raw legacy UI classes or private generic search/confirm/unsaved components.

## 13. Evidence ledger

Committed legacy evidence at `6377ac0971e7a7cc0fd8fb58a8360c069675f9a5`
includes:

- routes/navigation: `src/app/masterdata/materials/**`,
  `src/subapps/master-data/components/MasterDataNavOuter.tsx`;
- UI state: `MasterDataBrandDialog.tsx`, `BrandDetailClient.tsx`,
  `MasterDataBrandPicker.tsx`;
- actions/services: `src/extensions/library/actions/brand-library-actions.ts`,
  `services/library-service.ts`, `brand-library-service.ts`, and
  `src/subapps/master-data/actions/masterdata-actions.ts`;
- persistence: legacy `Brand`, `BrandCategory`, `BrandLink`, `BrandSupplier`,
  `PartyContact`, `Sku`, and `SkuPrice` schema/migrations;
- downstream reads: `src/extensions/library/services/brand-library-service.ts`
  and BQ Master Data services.

Retired rebuild evidence is recoverable at Git revision R1.05, including
`brand-rules.ts`, `brand-service.ts`, `brand-repository-prisma.ts`, Brand tests,
the former Prisma models, and their historical migrations. R1.06 removed that
implementation and all app data. The ledger above remains classification
evidence only; it does not authorize code changes.

## Locked decisions summary

| Decision | Locked answer |
|---|---|
| Brand identity | Brand name; optional owner Vendor; stable generated slug |
| Required profile fields | Name only |
| Categories | Zero-to-many flat PRODUCT Categories; staff creatable |
| SKU enrichment | Persistent and provenance-tracked |
| Hashtags | Separate normalized discovery keywords |
| Owner vs supplier | Independent relations; neither implies the other |
| Resources | Many external URLs directly on Brand; internal storage deferred |
| Archive | Staff; parent-causes every branded SKU and Material Price |
| Restore | Staff; removes only Brand-created causes and restores only eligible SKU/Prices |
| Permanent delete | Staff request or direct execution by `masterdata.deletion.approve`; purges the archived Brand, branded SKUs, and their Material Prices atomically |
| Historical BQ | Protected by consumer snapshots |
| UI | Directory table, trailing action menu, Dialog edit, explicit confirmations |
| Import/export | Deferred |
