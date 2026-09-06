# Master Data — Contract Index and Shared Rules

Status: **OWNER-APPROVED CONTRACT INDEX — executable work order activated by owner instruction 2026-08-31**

Master Data is the first application built on the shared platform. This file is
the active index for its approved domain slices and the cross-slice rules needed
to keep those contracts consistent. The individual Brand, Vendor, and Pricing
contracts remain the product authority for those slices. The owner has now
locked the Unit, Category, and SKU decisions recorded below and explicitly
activated implementation.

## 1.1 Application audience and promotion ownership

Master Data is restricted to **admin/staff** users. It owns catalog, Supplier,
pricing, lifecycle, and approval workflows. The BQ estimator does not enter the
Master Data application; BQ receives eligible commercial choices through the
Master Data public read contract.

Master Data also owns the approval side of the BQ Library promotion workflow:

- BQ estimators may submit eligible Library items as promotion requests.
- Master Data admin/staff see those requests in a Master Data approval queue.
- Master Data validates the request, creates the appropriate catalog/price entry
  through its normal pricing workflow, and returns the created record identity.
- Only that validated identity may be linked back to the BQ Library item and
  move it to `APPROVED`; rejection requires an auditable reason.
- BQ never writes Master Data tables and does not own an approval permission.

The cross-app promotion contract is the only allowed coordination boundary.
Master Data and BQ do not use cross-schema foreign keys or internal table reads.

## 1. Active owner-approved logic contracts

| Contract | Owns |
|---|---|
| [`brand-contract.md`](brand-contract.md) | Brand identity, discovery, Vendor relations, resources, lifecycle, permissions, audit, and Library-facing behavior |
| [`vendor-contract.md`](vendor-contract.md) | Vendor identity, VendorType capability model, contacts, links, Brand relations, lifecycle, permissions, and audit |
| [`pricing-contract.md`](pricing-contract.md) | Material, material-plus-labor, and labor-only prices; lifecycle; permissions; and BQ-facing reads |

These three contracts were reviewed together. R1.06 permanently removed the old
implementation and app data. Old names that remain in contract evidence ledgers
refer only to the R1.05 Git snapshot and define what must not be reintroduced.

## 2. Owner-locked Unit, Category, and SKU decisions

### Unit

- Unit is a dictionary table, never a plain string.
- Unit supports CRUD plus archive/restore. Permanent deletion uses the shared
  staff-request and explicit-approver workflow.
- Unit `code` is immutable after creation; only the display `name` may be
  edited later.
- The implementation seeds the units required by BQ, material pricing, and work
  pricing.
- Existing records retain their selected Unit snapshot when a Unit is deleted;
  new forms may select only live Units.

### Category

- Category has exactly two kinds: `PRODUCT` and `WORK`.
- Missing Categories may be created through the shared CreatableSearch flow.
- Category lifecycle is deactivate, merge, and permanent delete; it does not use
  archive/restore.
- Merge is allowed only within the same kind and only between two ACTIVE
  Categories. It transfers relations atomically before the source Category is
  deactivated and records `merged_into_id`.
- Staff holding `masterdata.dictionary.manage` may create, edit, merge, and
  deactivate Categories. Only permanent deletion goes through the shared
  staff-request and `masterdata.deletion.approve` workflow.

  *(R4.54: this paragraph previously said merge itself needed a request plus
  explicit approval and then, one line later, that staff may merge. Merge is
  reversible in effect — the source is deactivated, not destroyed, and its
  `merged_into_id` records where its relations went — so it is staff-level like
  deactivate. Permanent deletion remains the only approval-gated Category
  operation.)*

### SKU

- SKU belongs to exactly one Brand (`1`), never a Brand junction table.
- Live identity is `(brand_id, slug)`; creating or updating an unbranded SKU is
  rejected at the action, service, and database boundaries.
- `code` is retained and nullable as an external SKU/article identifier supplied
  by the Brand or Vendor; it is not the identity of a PriceMaterial row.
- Supplier is not stored on SKU; Supplier belongs on `PriceMaterial` (the
  persisted model and field names remain `Vendor` and `vendor_id`).
- SKU uses archive/restore and the shared permanent-deletion approval workflow.
- SKU creation is entered from Pricing → Material, not from the standalone SKU
  directory. The flow atomically creates the SKU and its first `PriceMaterial`.
- Create requires one active Brand, at least one of `code` or `name`, exactly one
  active PRODUCT `categoryId`, Unit, and at least one `PriceMaterial`; a live SKU must retain
  at least one live `PriceMaterial`.
- `code` and `name` are stored separately and may both be present. When only
  `code` exists, it is the display fallback and the slug source; when only
  `name` exists, the name remains the slug source.
- SKU may store optional rectangular geometry as positive decimal length and
  width, optional thickness, and a required dimension Unit when geometry is
  present. Geometry is structured data, not Notes or display-only text.
- When live material prices exist on a SKU, its measurement layout and
  base/purchase Unit pairing are locked so price semantics do not shift
  silently.
- Dimension Unit, base Unit, and purchase Unit are distinct meanings. For a
  sheet measured in millimetres and consumed by area, `MM` is the dimension
  Unit, `M2` is the base/BQ Unit, and `SHEET` is the purchase Unit.
- When rectangular geometry is present, Master Data calculates and persists
  `purchase_to_base_factor` server-side with exact decimal arithmetic. The
  approved area rule is `length × width`, converted to square metres; thickness
  is descriptive and does not contribute to area.
- Each SKU has exactly one active PRODUCT category. The junction table remains
  the storage boundary for compatibility, but its database uniqueness constraint
  prevents a SKU from receiving a second category. Archiving a SKU archives its
  PriceMaterial rows; the category relation, Media, and Sample relations remain
  independent.
- All staff use one SKU management permission package.

These decisions supersede any earlier deferred wording in this index. If a
decision conflicts with Brand, Vendor, or Pricing, the owner-curated contract
for that entity remains authoritative.

## 3. Deferred Master Data scope

Master Data also owns media, physical Samples, import/export, and its public read
contracts. Those slices remain outside the active implementation work order.

The following remain deferred and must not be inferred during implementation:

- media/file storage mechanics;
- Samples behavior;
- workbook/import/export policy;
- the final BQ snapshot schema.

## 3. Product and dependency boundaries

### 3.1 Brand and Supplier ownership

- Brand owns its identity/profile, categories, catalog resources/links, SKUs,
  and all `BrandSupplier` mutations.
- Supplier owns only its identity/profile, Supplier Type capabilities, and sales
  contacts. Supplier has no catalog-resource or external-link mutation surface.
- A Supplier detail may show supplied Brands as a read-only projection. That
  projection does not transfer mutation authority from Brand.
- Persisted `Vendor`, `VendorType`, and `vendor_id` names remain unchanged; all
  user-facing language is Supplier and Supplier Type.

- Master Data may consume Core, Utilities, and UI Engine. It may not create a
  private substitute for a proven generic capability.
- StudioFlow and BQ read Master Data only through an explicit `public/` contract.
  Cross-app internal imports, implicit writes, and cross-schema foreign keys are
  forbidden.
- BQ snapshots the selected commercial facts at project time. A later Master Data
  edit, archive, restore, or permanent deletion must not rewrite historical BQ
  meaning.
- For material pricing, those commercial facts include base Unit, purchase Unit,
  and `purchase_to_base_factor`. BQ calculates price per base Unit as
  `purchase price / purchase_to_base_factor` and snapshots the factor it used.
- No cheapest, newest, preferred, or manufacturer fallback is inferred. When
  several eligible prices exist, the consumer selects one explicitly.

## 4. Shared lifecycle language

The active contracts use one vocabulary:

- **archive**: reversible operational removal; represented by `deleted_at` in the
  current design;
- **restore**: remove the applicable archive cause after revalidating identity and
  live dependencies;
- **request permanent deletion**: create a persisted approval request for an
  already archived record;
- **approve and execute permanent deletion**: an authorized approver validates the
  current graph and performs the hard deletion atomically;
- **reject deletion**: close the pending request without deleting the entity.

Calling archive `delete`, or using `*.deleted` for an archive audit event, is a
**FIX** in every activated slice.

### 4.1 Cascade provenance is mandatory

The approved Brand, Vendor, SKU, and Pricing lifecycles contain overlapping direct
and parent-driven archives. A single unqualified `deleted_at` timestamp is not
enough to restore them safely.

The implementation must persist archive-cause provenance with these semantics:

1. direct archive creates a direct cause;
2. parent archive creates a cause identifying that parent;
3. archive is effective while at least one cause remains;
4. restoring a parent removes only the cause created by that parent;
5. a child is made live only when no direct or parent cause remains;
6. a row archived independently before a parent archive is never revived by the
   parent restore;
7. overlapping Brand/SKU/Vendor causes are idempotent and transaction-safe.

The exact persisted table/field layout is locked in the implementation work order,
but audit history alone may not be queried as operational archive state. This is
**APP-OWNED** Master Data policy, not a Core audit feature.

### 4.2 Permanent-deletion approval

The approval workflow is persisted inside Master Data, not inferred from a Role
name and not added to Core. It records the target type/ID, requester snapshot,
request time, pending/executed/rejected status, approver snapshot, decision time,
and safe reason/notes when supplied. At most one pending request may exist for the
same target.

Resource `*.manage` permissions may request deletion. Approval and execution
require the explicit app permission:

```text
masterdata.deletion.approve
```

An initial Admin Role may be seeded with this permission, but code must never use
the string `Admin` as an authorization bypass. A deletion request produces one
`<entity>.deletion-requested` audit event. Rejection produces
`<entity>.deletion-rejected`. Successful approval and hard deletion are one atomic
business operation represented by `<entity>.deleted`, with request and approver
metadata. This preserves Core's one-operation/one-primary-event rule.

## 5. Shared capability inventory

| Disposition | Capability |
|---|---|
| **REUSE — Core** | request identity/live grants, permission evaluation, transaction boundary, audit envelope, safe errors/actions, Zod boundary convention |
| **REUSE — Utilities** | text normalization, slug generation, canonical decimal/money/date/unit representation, pagination |
| **REUSE — UI Engine** | App/Page/Directory shells, DataTable, sortable headers, StatusBadge, RowActionMenu, Dialog, ConfirmDialog, form/state patterns, Combobox/CreatableSearch, debounce, option overlay, unsaved guard |
| **EXTEND — Utilities** | domain-neutral normalized similarity scoring; each app domain owns thresholds, warning copy, and the final allow/block decision |
| **ACTIVATE — UI Engine** | generic accessible multi-value searchable/creatable input, proven by Brand Category/hashtag and VendorType assignments; it owns interaction only |
| **APP-OWNED** | Vendor capability policy, Brand discovery/enrichment, price identity, lifecycle cascades/provenance, deletion requests, restore validation, public DTO composition |
| **DEFER** | file storage/upload, internal catalog files, import/export codecs, BQ snapshot persistence, jobs/notifications |

### 5.4 Choice-control scale rule

Use the UI Engine control that matches both the contract and the cardinality of
the candidate set. This is interaction policy only; each app keeps query,
permission, validation, and persistence policy.

| Candidate | Required interaction | Reason |
|---|---|---|
| Brand, Vendor, SKU, Product Category, Work Category | searchable `Combobox` when choosing one existing record | These are live application dictionaries and can grow beyond a usable native dropdown. |
| Brand Category/hashtag assignment | `CreatableMultiSelect` | The Brand contract permits multiple values and Category creation through its approved flow. |
| Category required by SKU or Pricing | searchable `CreatableSearch` only where that contract authorizes inline Category creation; otherwise `Combobox` | SKU has exactly one PRODUCT Category; creation authority remains app-owned. |
| VendorType assignment | searchable existing-only multi-select | The Vendor contract forbids inline VendorType creation outside dictionary administration. |
| Status, Category kind, LinkKind, fixed capability, currency, and short unit vocabulary | native `Select` | These are bounded controlled vocabularies; search would add friction without solving scale. |

An application must not render an unbounded Brand, Vendor, SKU, or Category
list as a native dropdown merely because the current seed data is short.

## 6. Evidence and activation gate

Legacy behavior evidence comes only from the exact checkout path and commit the
owner identifies for the current home or office computer. The agent must ask for
that path before access and follow the strict read-only repository and PostgreSQL
isolation rules in `AGENTS.md`; no path or commit previously observed elsewhere
is an active default. The active contracts record **KEEP**, **FIX**, **MERGE**,
and **PURGE** destinations. The retired rebuild implementation is recoverable at
Git revision R1.05. Its historical migrations remain immutable replay evidence,
but the active Prisma schema is platform-only and the R1.06 reset migration
permanently drops all app schemas and app grants. New implementation starts from
the isolated rebuild contract and schema, never by copying legacy code or data.

The owner instruction on 2026-08-31 satisfies the previous implementation gate:

- Foundation F0 remains green and UI-F1 is audited, corrected, and verified
  against the shared contracts and useful legacy StudioFlow interaction quality;
- no Master Data route or app-private replacement for a missing UI Engine pattern
  is created before that UI-F1 gate;
- the remaining consumer slice needed by the work order (SKU, Category, and Unit)
  now has its required cardinalities and lifecycle locked;
- this revision activates the rebuild-only migration plan and acceptance tests
  defined by the Master Data work order.
