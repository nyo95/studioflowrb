# Master Data — Contract Index and Shared Rules

Status: **OWNER-APPROVED CONTRACT INDEX — executable work order activated by owner instruction 2026-08-31**

Master Data is the first application built on the shared platform. This file is
the active index for its approved domain slices and the cross-slice rules needed
to keep those contracts consistent. The individual Brand, Vendor, and Pricing
contracts remain the product authority for those slices. The owner has now
locked the Unit, Category, and SKU decisions recorded below and explicitly
activated implementation.

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
- The implementation seeds the units required by BQ, material pricing, and work
  pricing.
- Existing records retain their selected Unit snapshot when a Unit is deleted;
  new forms may select only live Units.

### Category

- Category has exactly two kinds: `PRODUCT` and `WORK`.
- Missing Categories may be created through the shared CreatableSearch flow.
- Category lifecycle is deactivate, merge, and permanent delete; it does not use
  archive/restore.
- Merge is allowed only within the same kind and requires a staff request plus
  explicit approval. It transfers approved relations atomically before the
  source Category is deactivated.
- Staff may create, edit, merge, and deactivate Categories. Permanent deletion
  requires the shared approval permission.

### SKU

- SKU has an optional single Brand (`0..1`), never a Brand junction table.
- Live identity is `(brand_id, slug)`; Brand-less SKUs use the corresponding
  partial unique rule for `brand_id IS NULL`.
- `code` is retained and nullable.
- Vendor is not stored on SKU; Vendor belongs on `PriceMaterial`.
- SKU uses archive/restore and the shared permanent-deletion approval workflow.
- Create requires name, Unit, Category, and at least one PriceMaterial.
- Archiving a SKU archives its PriceMaterial rows. SkuCategory, Media, and Sample
  relations remain independent.
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

- Master Data may consume Core, Utilities, and UI Engine. It may not create a
  private substitute for a proven generic capability.
- StudioFlow and BQ read Master Data only through an explicit `public/` contract.
  Cross-app internal imports, implicit writes, and cross-schema foreign keys are
  forbidden.
- BQ snapshots the selected commercial facts at project time. A later Master Data
  edit, archive, restore, or permanent deletion must not rewrite historical BQ
  meaning.
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
