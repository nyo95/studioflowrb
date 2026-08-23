# MASTER_DATA.md — MD-00 Master Data Contract

Status: **LOCK CANDIDATE — manager-complete, awaiting owner approval (2026-08-23)**  
Scope: the minimum product/domain contract required to make MD-01 through MD-09 deterministic.

Authority: this contract specializes `docs/00-SOFTWARE-SSOT.md`, `docs/03-MASTERDATA-PRD.md`, `docs/06-DATA-OWNERSHIP.md`, `docs/07-ENGINEERING-CONVENTIONS.md`, and `CORE.md`. Explicit current owner instructions remain higher authority. The legacy `../studioflow` repository is evidence only and is never a runtime dependency or implementation base.

## Locked Decisions

### 1. Ownership and aggregate relations

Master Data exclusively owns:

- `Party`, `PartyRole`, `PartyContact`, and `PartyLink`;
- `Brand`, `BrandLink`, `BrandSupplier`, `Category`, and `BrandCategory`;
- `Sku`, `SkuMedia`, and `SkuPrice`;
- `WorkPrice`;
- the canonical unit-code catalog and pricing records used by these entities.

The MVP unit catalog is an application-owned, versioned code/label dictionary, not a user-editable Prisma entity. Persisted records store its stable code. Adding unit conversion semantics or a unit-management table requires a later proven need.

The relation graph is:

```text
Party
├── PartyRole
├── PartyContact ── optional Brand scope
├── PartyLink
├── owns Brand (optional Brand.owner_party_id)
├── supplies Brand (BrandSupplier)
├── quotes SkuPrice (optional supplier_party_id)
└── quotes WorkPrice (optional vendor_party_id)

Brand
├── BrandCategory >── PRODUCT Category
├── BrandSupplier >── Party
├── BrandLink
└── Sku

Sku
├── optional Brand
├── optional direct PRODUCT Category
├── SkuMedia
└── temporal SkuPrice

WorkPrice
├── required WORK Category
└── optional vendor Party
```

`BrandSupplier` means that a Party is a known source for a Brand. It never contains `sku_id` and is not a price. SKU-specific commercial availability exists only through `SkuPrice`.

`BrandSupplier` contains `brand_id`, `party_id`, `is_authorized` (default false), and optional `notes`. Authorization here describes the commercial relationship; it does not grant software permissions.

`WorkPrice` has no relation to `Sku`. A `MATERIAL_LABOR` rate is one vendor quotation whose scope includes material and labor; it is not a BOM, component list, or sum of a material SKU price and a labor price. Its included-material meaning is recorded in `scope_note`/`spec`, not a fabricated SKU relation.

StudioFlow project references, BQ project references, BQ snapshots, sample workflows, and project-local candidates do not belong in Master Data.

### 2. Common lifecycle contract

- `Party`, `Brand`, `Category`, `Sku`, and `WorkPrice` use `deleted_at` for reversible soft deletion. They do not also use `is_active` as a competing lifecycle flag.
- Normal product workflows never hard-delete those records. Hard deletion is migration/test administration only and is not exposed as a use case.
- Default reads and all public reads exclude soft-deleted records.
- Restore is explicit. It revalidates live uniqueness and all required live relations; a conflict fails rather than renaming, merging, or guessing.
- Relationship removal is not entity deletion. Removing a role, contact, `BrandCategory`, or `BrandSupplier` row leaves its Party/Brand/Category intact.
- A record referenced only by downstream snapshots may still be soft-deleted because the snapshot preserves business meaning.
- `created_at` and `updated_at` are UTC instants. `updated_by_name` columns are not persisted; actor history comes from the canonical audit envelope.

Lifecycle-specific rules:

- Party and Brand have no separate status enum in MVP. Live versus deleted is sufficient.
- Category lifecycle is already locked in `docs/06-DATA-OWNERSHIP.md`.
- SKU has commercial status `DRAFT | ACTIVE | DISCONTINUED` in addition to soft deletion. New SKU defaults to `DRAFT`; only `DRAFT -> ACTIVE`, `ACTIVE -> DISCONTINUED`, and `DISCONTINUED -> ACTIVE` are valid transitions. Soft delete is separate from status.
- WorkPrice has no status enum in MVP. A live row is available; a deleted row is unavailable.
- A current `SkuPrice` is retired, never soft-deleted, when superseded.

### 3. Identity, uniqueness, and normalization

All IDs are UUIDs and are the only cross-file/import identities. Names and slugs are never used as foreign identities.

Whitespace is trimmed at the boundary. Empty optional strings normalize to `null`. Slugs are generated with the locked shared/category slug convention and may be explicitly changed only through the owning use case.

Race-safe database constraints must enforce:

- live Party: unique `lower(name)` and unique `slug` where `deleted_at IS NULL`;
- PartyRole: unique `(party_id, role)`;
- PartyLink: unique `(party_id, url)`;
- live Brand: unique `lower(name)` and unique `slug` where `deleted_at IS NULL`;
- BrandLink: unique `(brand_id, url)`;
- BrandSupplier: unique `(brand_id, party_id)`;
- BrandCategory: unique `(brand_id, category_id)`;
- Category: the already locked partial unique `(kind, slug)` where `deleted_at IS NULL`;
- live branded SKU: unique `(brand_id, lower(slug))`; live unbranded SKU: unique `lower(slug)`;
- non-null live SKU code: unique case-insensitively within its Brand, with an equivalent unbranded partial index;
- SkuMedia: unique `(sku_id, url)`;
- current SkuPrice: exactly at most one current row per `(sku_id, supplier_party_id)`, treating a null supplier as one stable partition;
- live WorkPrice: unique case-insensitive `code` where `deleted_at IS NULL`.

Application checks provide user-safe conflict messages; database constraints remain the race-safe authority. Soft-deleted names/codes/slugs may be reused by a new record. Restore then fails if the live identity has been reused.

### 4. Party / Supplier / Vendor semantics

There is one `Party`, not separate Supplier, Vendor, Company, and ServiceVendor tables.

Required Party fields are `name`, `slug`, `type`, timestamps, and at least one role. Optional fields are `legal_name`, `address`, `notes`, and `deleted_at`. `PartyType` is `COMPANY | INDIVIDUAL`.

The locked role vocabulary is:

```text
MANUFACTURER
DISTRIBUTOR
SUPPLIER
RETAIL
SUBCON
SERVICE_VENDOR
```

Roles are non-exclusive. The legacy distinction is preserved without adding a second “business nature” model: manufacturer/distributor/retail are represented by the same role relation until a proven workflow requires otherwise.

- Any live Party with at least one role may be a source for `SkuPrice`; this preserves the proven cases where a manufacturer, retail store, subcontractor, or service vendor also supplies an item.
- A WorkPrice vendor must have `SUBCON` or `SERVICE_VENDOR`.
- A `BrandSupplier` Party must be live and have at least one role.
- Pickers filter by eligibility, and every write use case repeats the check. No database trigger is introduced unless real bypass evidence appears.
- A Party cannot lose its final role while live.
- A Party cannot lose `SUBCON`/`SERVICE_VENDOR` while referenced by a live WorkPrice, unless another qualifying role remains.
- A Party with live owned Brands, live BrandSupplier links, current SkuPrices, or live WorkPrices cannot be soft-deleted. The user must reassign/retire/remove those live relationships first. Historical retired SkuPrices do not block deletion and retain a nullable supplier reference plus audit/snapshot evidence.

Party contacts support a general contact or an optional Brand scope. A brand-scoped contact is valid only when the Party owns that Brand or has a live `BrandSupplier` link to it. Multiple contacts are allowed; `is_primary` is a display preference, not a uniqueness guarantee. Contacts include `person_name` plus optional `job_title`, `phone`, `email`, `notes`, and `brand_id`.

Party and Brand links use the proven vocabulary `WEBSITE | INSTAGRAM | FACEBOOK | TIKTOK | YOUTUBE | LINKEDIN | WHATSAPP | MARKETPLACE | DRIVE | CATALOG | PRICE_LIST | OTHER`, with URL, optional archive URL/label, and sort order.

Quick entry never guesses roles, type, categories, unit, price, or zero values. It may create only the smallest record that already satisfies this contract; otherwise it returns a structured “more information required” result and the parent workflow remains open.

### 5. Brand and BrandCategory semantics

Brand fields are `name`, `slug`, timestamps, and `deleted_at`, with optional `owner_party_id` and `notes`. Brand links, suppliers, categories, and SKUs are relations, not fields embedded in Brand.

- Brand creation, including inline creation, requires at least one live PRODUCT Category.
- A live Brand must always retain at least one live PRODUCT `BrandCategory`; removing its final category is rejected.
- `BrandCategory` is an explicit staff classification for discovery. It contains `brand_id`, `category_id`, `sort_order`, and `created_at`; it has no source/derived flag.
- BrandCategory accepts PRODUCT Categories only and is never created, removed, or refreshed from SKU assignments.
- A Brand does not require a supplier or SKU to be considered valid.
- Brand `tags` are not part of the rebuild contract. Discovery aliases belong to Category `search_synonyms`; introducing a second free-form authority is deferred.
- A Brand with a non-deleted SKU cannot be soft-deleted. Its SKUs must be reassigned or soft-deleted first.

### 6. Category rules

The complete Category contract in `docs/06-DATA-OWNERSHIP.md` remains unchanged:

- one table, `PRODUCT | WORK`;
- PRODUCT flat in MVP and `parent_id = null`, `path = null`;
- WORK hierarchical, with non-cyclic parentage and transactionally maintained materialized `path`;
- `search_synonyms` are discovery hints only;
- soft deletion and partial live uniqueness;
- BrandCategory and direct SKU Category are distinct relations;
- BQ freezes Category display values into its own snapshots.

Additionally, a Category cannot change kind after creation. A Category cannot be soft-deleted while referenced by a live BrandCategory, any non-deleted SKU, a live WorkPrice, or a live child Category. Rename/re-parent of WORK Category updates all descendant paths in one transaction. PRODUCT re-parent is rejected in MVP.

### 7. SKU / material contract

Required SKU fields are `name`, `slug`, `kind`, `status`, `base_unit`, and timestamps. Optional fields are `code`, `brand_id`, `category_id`, `spec`, dimensions, `dim_unit`, `dim_display`, commercial-unit defaults, notes, and `deleted_at`.

SkuMedia contains `sku_id`, `kind`, `url`, optional `label`, `sort_order`, and `created_at`. Its proven kind vocabulary is `IMAGE | THUMBNAIL | ORIGINAL | REFERENCE | FOLDER`; media storage/upload mechanics remain infrastructure concerns.

`SkuKind` is `MATERIAL | FURNITURE | FIXTURE`. The legacy `SERVICE` value is purged: canonical quoted work/service belongs to WorkPrice, not to a second service-price path on SKU.

- Brand is optional so generic materials remain representable.
- `category_id` is one direct nullable FK to a live PRODUCT Category. There is no `SkuCategory` join table.
- DRAFT may have no category. ACTIVE requires a live PRODUCT Category, a non-empty canonical `base_unit`, and a live Brand when `brand_id` is present.
- ACTIVE is the only SKU status exposed by normal Master Data public candidate searches. DISCONTINUED remains readable by ID for history but is not offered for new selections.
- A SKU with current or historical SkuPrices is soft-deleted rather than hard-deleted; price history remains.
- Changing Brand or Category on an ACTIVE SKU is allowed only through an explicit update use case and is audited. It never mutates existing BQ snapshots.

Canonical costing defaults owned with SKU are:

- `base_unit`: required usage unit;
- `purchase_unit`: optional purchasing unit;
- `conversion`: required and `> 0` when `purchase_unit` differs from `base_unit`; it means one purchase unit equals `conversion` base units;
- `default_waste_pct`: optional, `>= 0`;
- `minimum_order`: optional, `>= 0`, expressed in purchase units;
- `rounding_increment`: optional, `> 0`, expressed in purchase units.
- `preferred_supplier_party_id`: optional. When present it must identify a live eligible Party with a current SkuPrice for this SKU. It is a preference for candidate ordering, not an authorization rule and not a forced BQ choice.

All decimal values cross layers as canonical decimal strings. Master Data supplies defaults; BQ owns calculations, overrides, rounding policy, final candidate choice, and project snapshots.

### 8. SkuPrice history semantics

SkuPrice records the one actual commercial price used/quoted for an exact SKU and optional supplier. It does not store list/net pairs and never guesses a discount or zero.

Fields are `sku_id`, optional `supplier_party_id`, `amount`, `currency`, `unit`, `valid_from`, optional `valid_to`, `is_current`, optional `source_link_id`, optional `notes`, and timestamps. Public/application amount values are canonical decimal strings; persistence uses exact Decimal.

- Null supplier means the brand/manufacturer/general source price and forms its own current-price partition.
- Blank price means “do not create a price row.” It never becomes zero. Explicit zero is valid; negative is invalid.
- Currency is explicit uppercase ISO-4217. Unit is a canonical Master Data unit code and may differ from SKU `base_unit`.
- For each `(sku, supplier)` partition, normal writes allow one current row. A new commercial offer closes the prior row (`is_current=false`, `valid_to=new.valid_from`) and creates the new current row in the same transaction.
- `valid_to` must be later than `valid_from`; a current row has `valid_to=null`; a retired row has `valid_to!=null`. Normal writes do not create overlapping periods or backdate before the current row's `valid_from`.
- A change to amount, currency, unit, supplier partition, or commercial effective date creates a new history row. Notes/source-link/label corrections may update the current row without creating false price history, but are audited.
- `source_link_id`, when present, must reference a live link belonging to the SKU's Brand.
- SkuPrice is not hard-deleted through product workflows. Incorrect entries are retired/replaced, preserving evidence.

### 9. WorkPrice and the three pricing modes

The three user-facing commercial modes map to two persistence types:

| Mode | Persistence | Meaning |
|---|---|---|
| Material only | `SkuPrice` | exact SKU price, optionally supplier-specific |
| Material + labor | `WorkPrice(kind=MATERIAL_LABOR)` | one supply-and-install/bundled quotation |
| Labor/work only | `WorkPrice(kind=LABOR_ONLY)` | one work/service quotation without included material |

WorkPrice fields are `code`, `name`, `category_id`, optional `vendor_party_id`, optional `spec`, optional `dim_display`, `unit`, `amount`, `kind`, `currency`, optional `scope_note`, optional `notes`, `valid_from`, timestamps, and `deleted_at`.

- Code is immutable after creation; correcting identity creates a replacement row and soft-deletes the erroneous row.
- Category is required, live, and kind WORK.
- Vendor is optional, but when present must be live and eligible as a work vendor.
- Blank/invalid/negative amount is rejected. Intentional zero is valid.
- Unit and currency are explicit canonical codes.
- `MATERIAL_LABOR` is one indivisible commercial quote. `scope_note` must state what is included sufficiently for a selector/reviewer; no component SKU, material/labor split, generated total, or BOM is stored.
- `LABOR_ONLY` is database vocabulary; UI may display the clearer label “Work / labor only” without changing its semantics.
- WorkPrice is a mutable current master rate with audit history, not a temporal price-row series in MVP. A commercial edit sets `valid_from` to its new effective instant and records the before/after change. Existing BQ lines remain unchanged because BQ reads only at explicit selection/refresh and stores a snapshot.

### 10. Permission IDs and access boundaries

Master Data owns this exact permission vocabulary:

```text
masterdata.access
masterdata.party.read
masterdata.party.manage
masterdata.brand.read
masterdata.brand.manage
masterdata.category.read
masterdata.category.manage
masterdata.sku.read
masterdata.sku.manage
masterdata.price.read
masterdata.price.manage
masterdata.audit.read
masterdata.import.execute
masterdata.export.read
masterdata.discovery.read
```

`manage` includes create, update, lifecycle transition, soft delete, restore, and owned child/relation changes for that resource. Price manage covers SkuPrice and WorkPrice. Import requires both `masterdata.import.execute` and the manage permissions for every resource present in the workbook. Export requires `masterdata.export.read` plus each resource read permission; price sheets additionally require `masterdata.price.read`.

Every server use case checks permissions. UI hiding and route gates are not authorization. No legacy role matrix, admin bypass, fallback role, or permission alias is migrated. Role-to-permission grants remain identity/operations configuration and do not change these IDs.

The locked Core special app-entry permission `<app>.access` is currently rejected by the three-segment RBAC validator. MD-07 must include only the narrow conformance correction for exactly this locked special form; this is a concrete discovered blocker, not a new Foundation abstraction.

Cross-app public reads authenticate a current principal/service identity and require the relevant Master Data read permission. StudioFlow and BQ receive no direct database grants and never import Master Data domain/application/infrastructure/UI modules.

### 11. Audit persistence contract

One platform-owned append-only `AuditEvent` table persists the locked Core envelope for all apps; Master Data does not recreate `MasterDataAudit` or reuse StudioFlow `AuditLog`.

Required columns are `id`, `app_id`, `action`, `entity_type`, `entity_id`, `actor_kind`, nullable `actor_user_id`, `actor_label`, `occurred_at`, nullable `request_id`, nullable JSON `changes`, and nullable JSON `metadata`. There are no foreign keys from polymorphic entity/actor references. Indexes support `(app_id, entity_type, entity_id, occurred_at)`, `(actor_user_id, occurred_at)`, and `occurred_at`.

Master Data uses `appId=masterdata` and `<entity>.<past-tense-verb>` action names. Locked actions are:

```text
party.created|updated|deleted|restored
brand.created|updated|deleted|restored
category.created|updated|deleted|restored
sku.created|updated|activated|discontinued|deleted|restored
sku-price.recorded|corrected
work-price.created|updated|deleted|restored
import.applied
export.generated
```

Owned child/relation changes are aggregated into the parent entity's `changes` instead of producing duplicate primary events. Recording a new SkuPrice is one `sku-price.recorded` event whose metadata may identify the superseded row. No-op updates produce no event. Import writes one entity event per changed row with a shared request/batch ID; no duplicate summary event is added. Export writes one metadata-only event containing scope/counts, never exported business data.

All mutations and their events share one transaction. Audit rows are immutable, have no revert/delete product use case, and are retained indefinitely in MVP. Audit payloads follow Core serialization/redaction and exclude contact values unless the changed field is necessary; secrets, raw files, and large blobs are forbidden.

### 12. Brand Discovery contract

Brand Discovery is a read-only Master Data use case, not StudioFlow logic. Its authoritative inputs are:

- normalized free-text query;
- optional PRODUCT Category slug/ID filter;
- live Brand `name`;
- explicit live BrandCategory assignments;
- live PRODUCT Category `name`, `slug`, and `search_synonyms`.
- ACTIVE/live SKU `name` and `code` as secondary evidence for its own Brand.

SKU evidence may explain why an existing product matched, but it never creates or implies a BrandCategory assignment. Discovery does not use retired PRODUCT hierarchy fragments, Brand free-form tags, supplier/price/contact data, or StudioFlow data.

Matching is case-insensitive and accent/whitespace normalized. Ranking is deterministic by the first applicable tier, then distinct reason count descending, normalized Brand name ascending, and Brand ID ascending:

1. exact Brand name;
2. Brand name prefix;
3. exact Category name or slug through BrandCategory;
4. exact Category synonym through BrandCategory;
5. Category name/synonym prefix or substring through BrandCategory;
6. exact or prefix ACTIVE SKU code/name;
7. remaining substring Brand or ACTIVE SKU name match.

Every result includes explicit deduplicated match reasons; no opaque relevance score is a public contract. Empty-query suggestions rank live PRODUCT Categories by live BrandCategory count descending, then category sort order/name/ID. Pagination and a hard result limit are mandatory.

Discovery summary output contains Brand ID/name, PRODUCT Category ID/name/slug, match reasons, and allowlisted public Brand links (`WEBSITE`, `INSTAGRAM`, `FACEBOOK`, `TIKTOK`, `YOUTUBE`, `LINKEDIN`, `CATALOG`, `DRIVE`, `MARKETPLACE`). Brand detail may additionally include ACTIVE/live SKU summaries and public media/links, but never contacts, suppliers, price-list links, prices, notes, audit data, or internal Prisma shapes.

### 13. Master Data public-read contract

`src/apps/masterdata/public` is the only supported cross-app surface. It exports explicit input/output types and use-case ports; it never exports Prisma models, infrastructure adapters, unrestricted repositories, or mutation internals.

StudioFlow requires:

- Brand Discovery search and category suggestions;
- Brand catalog detail;
- ACTIVE SKU summaries needed to select a product reference.

BQ requires:

- ACTIVE material/SKU candidate search and lookup;
- current SkuPrice candidate reads with provenance, unit, currency, and effective date;
- live WorkPrice candidate search and lookup with WORK Category path, kind, scope, vendor display snapshot source, unit, currency, and effective date;
- readiness output that states missing canonical data explicitly rather than filling defaults.

Material price candidates identify the SKU's preferred eligible supplier when configured. Default ordering places that current offer first, then orders remaining current offers by `valid_from` descending with a stable ID tie-break; it never silently chooses the cheapest offer. BQ or the user owns the final selection.

Public decimals are strings and instants are UTC ISO strings. DTOs are minimal, immutable values. A returned Master Data ID is a reference, not a cross-schema FK requirement. BQ explicitly copies the fields it needs into its own snapshot and does not auto-refresh or write back. Discontinued/deleted records are unavailable for new candidate searches but may be resolved by ID only through an explicit historical-reference use case when needed for existing records.

No cross-app write contract is included in MD-00. Future explicit Master Data writes, if any, remain owner-gated and can only be implemented in `masterdata/public`.

### 14. Import/export boundary and ownership

Master Data owns workbook generation, parsing, validation, conflict detection, and application. Excel is an offline representation, never a second SSOT. StudioFlow and BQ neither import nor export Master Data tables themselves.

The MVP workbook is versioned and contains a manifest (`format_version`, `exported_at`, scope) plus separate sheets for Party, PartyRole, PartyContact, PartyLink, Brand, BrandLink, BrandSupplier, Category, BrandCategory, Sku, SkuMedia, SkuPrice, and WorkPrice. AuditEvent is exportable only through a separate audit export and is never importable.

- Every entity/relationship row carries stable ID and `updated_at` (or equivalent exported version). Human-readable names are helpers, never identity.
- Known ID means update; blank ID means create; a database row absent from the workbook means no action. Import never infers deletion.
- Foreign keys use IDs. Import never silently creates a missing Party, Brand, Category, role, SKU, or unit from a display name.
- Import runs validate/preview before apply, reports row/sheet/field errors, and rejects unknown format versions or columns.
- Apply is atomic for the workbook in MVP. Any invalid row or stale version writes nothing. Automatic merge and last-write-wins are forbidden.
- The dependency order is Party/Category, Party children, Brand, Brand relations, SKU, SKU children, SkuPrice, WorkPrice; inputs may appear in any sheet order because the importer owns ordering.
- Generated/computed/audit timestamps other than accepted identity/version fields are read-only. Soft delete/restore is not available through the workbook in MVP.
- Decimal/date/unit rules are identical to API boundaries. Import is permission checked and auditable; exported sensitive price/audit sheets require their dedicated permissions.

## Legacy Evidence

| Major area | Classification | Evidence retained / rejected |
|---|---|---|
| Party, roles, contacts, links | **MIGRATE + MERGE** | Migrate one multi-role Party, company/individual type, contacts/links, brand-scoped contacts, live name uniqueness, and delete guards from `prisma/schema.prisma`, `services/party-role-rules.ts`, `party-role-service.ts`, and `party-delete-service.ts`. Merge duplicate Company/ServiceVendor entry paths. |
| Legacy Party role matrix/auth wrappers | **PURGE + REWRITE** | Purge legacy role-to-route/permission assumptions. Rewrite authorization using locked Core RBAC and the exact Master Data permission IDs. |
| Brand | **MIGRATE + REWRITE** | Migrate identity, owner Party, links, suppliers, soft delete, and live uniqueness from the legacy schema/actions. Rewrite creation so every path, including quick entry, enforces at least one PRODUCT Category. |
| Brand completeness and tags | **PURGE** | Purge `isBrandComplete` rules that require a supplier/SKU and purge Brand free-form tags as a discovery authority. Neither belongs to the locked rebuild contract. |
| BrandCategory | **REWRITE** | Preserve the relation's discovery meaning, but remove `CategorySource`, `DERIVED_FROM_SKU`, SKU-derived refresh, and PRODUCT hierarchy assumptions. Staff assignment is the only source. |
| Category | **KEEP + MIGRATE + PURGE** | Keep/migrate only the approved slug/path/split behavior and WORK descendant propagation. Purge `PRODUCT_LEVEL1`, `PRODUCT_PARENT_BY_LEAF`, `SkuCategory`, derived source flags, and composite-category inference. |
| SKU/material | **MIGRATE + MERGE + REWRITE** | Migrate DRAFT/ACTIVE/DISCONTINUED, optional Brand, exact units/dimensions/spec, costing defaults, soft delete, and truthful quick entry from `sku-core-service.ts`, `sku-delete-service.ts`, and schema. Merge duplicate creation flows. Rewrite to direct `category_id`, decimal strings, and ACTIVE requirements. Purge SERVICE SKU. |
| SkuPrice | **KEEP + MIGRATE + REWRITE** | Keep the proven single actual price, blank-not-zero, intentional zero, supplier partition, close-current/history, and annotation-only correction rules from `sku-price-rules.ts`, `sku-price-service.ts`, tests, and partial index migration. Rewrite Prisma/action coupling and JavaScript-number boundaries. |
| WorkPrice | **KEEP + MIGRATE + PURGE** | Keep one price, explicit `MATERIAL_LABOR | LABOR_ONLY`, required WORK Category, optional eligible vendor, scope, and blank/negative checks from schema/actions/docs. Purge split material/labor totals, project references, quantity with unknown meaning, and `WorkPrice -> Sku`. |
| Material + labor UX proposal requiring a material SKU | **PURGE** | `docs/MASTERDATA_UIUX_REVISION.md` requested a base-material relation, but the later comprehensive `PRD_MASTER_DATA_REDESIGN.md` explicitly locks one commercial quotation and forbids adding WorkPrice-to-SKU merely for included material. The latter is also consistent with the rebuild ownership/snapshot model. |
| Audit | **KEEP + REWRITE + PURGE** | Keep same-transaction writes, actor snapshots, meaningful diffs, no-op omission, and one primary event from `services/audit-service.ts`. Rewrite into the Core envelope and one platform persistence adapter. Purge legacy `MasterDataAudit`, StudioFlow `AuditLog` reuse, global enum coupling, and undo semantics. |
| Brand Discovery | **MIGRATE + REWRITE + PURGE** | Migrate brand-first search, explicit Brand/Category/active-SKU match reasons, stable ranking, safe link allowlist, and category suggestions from `extensions/library/services/brand-library-service.ts`. Rewrite inside Master Data/public. Purge direct internal DB access, repeated-letter heuristics, Brand tags, SkuCategory-derived classification, and price/contact leakage. |
| Public consumers | **REWRITE** | Legacy StudioFlow Library and BQ readers query Master Data internals. Replace them with typed `masterdata/public` use cases and explicit BQ snapshots; no legacy imports survive. |
| Excel import/export | **MIGRATE + REWRITE** | Migrate whole-schema round trip, stable IDs, non-deleting missing rows, conflict detection, relationship integrity, and row errors from `PRD_MASTER_DATA_REDESIGN.md`. Rewrite for the rebuild schema, validation, permissions, and audit contract. |

Legacy UI components and monolithic server actions are evidence of workflows only. They are not copied wholesale; UI implementation must follow locked `DESIGN.md` and `UI_ENGINE.md`.

## Remaining Owner Decisions

No product/domain decision remains that blocks MD-01 through MD-09.

The following operational choices remain owner-owned but do not alter this contract and must not be guessed by an executor:

1. Which persisted roles receive each locked permission ID, and which users receive those roles.
2. Production audit retention beyond the locked indefinite MVP default, if legal/operational policy later requires a finite period or archive.
3. The initial curated unit dictionary contents and initial Category/Party/Brand seed data. Executors may implement schema and validation, but may not invent business seed rows.

## Implementation Invariants

1. No runtime import, generated client import, data copy, or database dependency points to `../studioflow`.
2. Master Data domain code is pure; Prisma stays in `masterdata/infrastructure`; transactions start in application use cases.
3. Other apps import only `masterdata/public`; Platform imports no app.
4. No entity or relation outside the locked graph is added without a manager correction to MD-00.
5. `deleted_at` is the sole active/deleted flag; only SKU also has its explicit commercial status.
6. Every live uniqueness rule has a matching race-safe database constraint, including nullable-key partitions.
7. PRODUCT Category remains flat; WORK Category remains the only hierarchy.
8. BrandCategory is explicit and never derived. SKU has one direct PRODUCT Category and no category join table.
9. A live Brand always has at least one live PRODUCT Category; ACTIVE SKU always has a live PRODUCT Category and canonical base unit.
10. Party eligibility is checked on every BrandSupplier/SkuPrice/WorkPrice write; quick entry never guesses roles.
11. Blank money creates no SkuPrice and is rejected for WorkPrice; zero is preserved; negative values fail.
12. SkuPrice commercial changes create history and retire the previous partition row atomically. Annotation-only corrections do not invent price history.
13. WorkPrice has one amount and no SKU/BOM/project relation or hidden component split.
14. All public/import decimals are strings, currencies/units explicit, timestamps UTC, and BQ calculations remain BQ-owned.
15. Each successful mutation and its audit event commit or roll back together. No-op writes create no audit event.
16. Permission checks occur in every protected server use case. UI state cannot authorize a command.
17. Discovery uses only live explicit BrandCategory plus Category name/slug/synonyms and Brand name, with deterministic explainable ranking.
18. StudioFlow/BQ receive minimal DTOs, never Prisma models or Master Data repositories. BQ snapshots explicitly and never writes back.
19. Import is previewed, conflict-safe, atomic, non-deleting, ID-based, and auditable. Unknown columns/versions fail closed.
20. No deterministic executor may reinterpret a conflict. It stops and reports the exact contract/code discrepancy to PM/TL.

## MD-01–MD-09 Dependency Plan

### MD-01 — Persisted shape and migration invariants

Depends on: MD-00 owner approval.  
Delivers: exact Prisma models/enums/relations/indexes for the locked graph, manual partial/expression indexes, canonical platform AuditEvent persistence, migration verification, and fixtures only where needed to prove constraints.  
May run in parallel: no. This is the schema gate for all later slices.

### MD-02 — Category + BrandCategory vertical slice

Depends on: MD-01.  
Delivers: Category domain/application/infrastructure/UI workflows, WORK tree propagation, soft-delete blockers, synonyms, and BrandCategory relation primitives. Reuses WO-002 pure rules.  
May run in parallel: after MD-01, alongside MD-03's Party-only work, but BrandCategory integration waits for MD-04.

### MD-03 — Party vertical slice

Depends on: MD-01.  
Delivers: Party/roles/contacts/links domain rules, CRUD/lifecycle application workflows, eligibility queries, permissions/audit, and UI using the locked UI Engine.  
May run in parallel: with MD-02 after MD-01.

### MD-04 — Brand vertical slice

Depends on: MD-02 and MD-03.  
Delivers: Brand/links/owner/BrandSupplier/BrandCategory workflows, category-required creation, delete/restore blockers, permissions/audit, and usable Brand management UI.  
May run in parallel: no; it is the convergence point for Party and Category.

### MD-05 — SKU/material vertical slice

Depends on: MD-04.  
Delivers: SKU identity/status/category/unit/costing-default rules, media, CRUD/lifecycle workflows, explicit transitions, permissions/audit, and usable SKU management/inline selection UI.  
May run in parallel: no before MD-04; after its domain contract is stable, independent MD-08 workbook scaffolding may begin without apply logic.

### MD-06 — Pricing vertical slice

Depends on: MD-03, MD-05, and MD-02 WORK Category.  
Delivers: SkuPrice temporal behavior, WorkPrice behavior, material/material+labor/work-only workflows, vendor eligibility, permissions/audit, and usable pricing UI.  
May run in parallel: SkuPrice and WorkPrice internals may be separate executor commits inside this WO, but PM/TL reviews them as one pricing convergence slice.

### MD-07 — Security and audit convergence

Depends on: MD-02 through MD-06.  
Delivers: exact permission catalog exports/check coverage, persisted AuditWriter adapter/read query, narrow `<app>.access` validator conformance fix, mutation-to-audit coverage matrix, and negative-boundary tests.  
May run in parallel: no; it reviews every mutation surface and is a gate.

### MD-08 — Whole-schema import/export

Depends on: MD-07 and stable CRUD/application ports from MD-02 through MD-06.  
Delivers: versioned workbook, export, validate/preview, atomic apply, conflict/relationship handling, row-level results, permissions/audit, and round-trip tests.  
May run in parallel: read-only workbook format scaffolding may start after MD-05, but apply/audit cannot complete before MD-07.

### MD-09 — Brand Discovery + Master Data public reads

Depends on: MD-04, MD-05, MD-06, and MD-07.  
Delivers: deterministic Brand Discovery, suggestions/detail, StudioFlow catalog reads, BQ material/price/work candidate reads, minimal DTOs, permission gates, public-boundary tests, and forbidden-internal-import tests.  
May run in parallel: Discovery implementation and BQ candidate read implementation may run in parallel after dependencies; the final public contract is one PM/TL convergence review. MD-08 may run in parallel because neither owns the other's write surface.

After MD-09, PM/TL performs one Master Data convergence review. Only an approved `masterdata/public` then becomes the input to BQ contract/migration work.

## Explicitly Deferred

- persisted role catalog, user administration, and role-to-permission grant UI;
- cross-app Master Data mutation APIs;
- PRODUCT Category hierarchy;
- multiple categories per SKU or reintroduction of SkuCategory;
- Brand free-form tags or ML/fuzzy/behavioral discovery ranking;
- `WorkPrice -> Sku`, BOMs, component breakdowns, or material/labor allocation;
- temporal WorkPrice version rows beyond audit history and BQ snapshots;
- currency conversion, tax, markup, and BQ calculation/rounding rules;
- automatic Master Data refresh of BQ snapshots or BQ write-back;
- Excel-driven delete/restore, automatic conflict merge, partial best-effort apply, formulas/macros, and arbitrary custom columns;
- sample inventory/request workflows and legacy curation queues;
- broad StudioFlow migration beyond the public Brand Discovery/catalog consumer;
- BQ UI/calculation migration, which starts only after Master Data and its public contract pass convergence.

MD-00 ends here. No schema, migration, CRUD, UI, or product implementation is authorized by this contract file until owner approval and issuance of a separate deterministic work order.
