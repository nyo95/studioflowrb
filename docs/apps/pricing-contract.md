# Pricing Contract — Master Data

Status: **OWNER-APPROVED LOGIC CONTRACT — not yet an executable work order**

Authority: Owner decisions locked in navigator session. This contract covers all three pricing models within Master Data. All references to CORE.md §4 (RBAC) and §5 (Audit) use the foundation contracts at repository root. Depends on the Vendor Contract (vendor-contract.md) for Vendor model and capability-based eligibility.

---

## 1. Domain Identity

**Three distinct pricing categories**, each with its own database table, UI tab, and business rules:

| # | Category | Table name | What it prices | Example |
|---|---|---|---|---|
| 1 | **Material Prices** | `PriceMaterial` | Harga barang per SKU per vendor | HPL TACO 1mm, Rp 350.000/lembar dari IMAM |
| 2 | **Material + Labor** | `PriceMaterialLabor` | Paket jasa + material (supply-and-install) | Pasang keramik 60x60 termasuk material, Rp 150.000/m² dari IMAM |
| 3 | **Labor Only** | `PriceLabor` | Jasa murni (upah kerja saja) | Upah pasang pipa, Rp 50.000/titik dari IMAM |

**Legacy mapping:** `SkuPrice` → `PriceMaterial`. `WorkPrice (kind=MATERIAL_LABOR)` → `PriceMaterialLabor`. `WorkPrice (kind=LABOR_ONLY)` → `PriceLabor`. The single `WorkPrice` table is split into two separate tables; the `kind` discriminator field is eliminated.

**UI label:** "Pricing" as the section, with 3 tabs: Material Prices, Material + Labor, Labor Only.

---

## 2. PriceMaterial — Material Prices

Material Prices are the primary entry point for material catalog CRUD. The
create flow supports both adding an offer to an existing SKU and creating a
new SKU together with its first `PriceMaterial` in one transaction. A new SKU
cannot be created without that initial offer, and a live SKU cannot lose its
last live material price. Subsequent Vendors add additional `PriceMaterial`
offers to the existing SKU; they do not create another SKU.

SKU code and SKU name are separate fields. Each is optional individually, but
at least one must be supplied. Code-only products are valid; the UI displays
the code as the fallback label and the service derives the slug from it.

### 2.1 Identity

One price per **SKU × Vendor** pair. No separate `code` field — the pair itself is the identity.

### 2.2 Fields

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `sku_id` | FK → Sku | Required. The material being priced |
| `supplier_vendor_id` | FK → Vendor | **Required (NOT NULL)**. Who is selling. Factory/manufacturer is registered as a Vendor |
| `amount` | Decimal(16,2) | Price amount. Must be non-negative |
| `currency` | String | Required. Uppercase 3-letter code (e.g. IDR, USD) |
| `unit_id` | FK → Unit | Required. Must match SKU's purchase unit (or base unit when no purchase unit set) |
| `source_link_id` | FK → BrandLink? | Optional. Provenance link; must belong to the SKU's Brand when set |
| `notes` | String? | Optional notes |
| `created_at` | DateTime | |
| `updated_at` | DateTime | |
| `deleted_at` | DateTime? | Effective archive state; cause provenance follows `masterdata.md` §4.1 |
| `updated_by_user_id` | String? | |
| `updated_by_label` | String | Who last updated |

### 2.3 Price behavior

- **Update in-place** — no price history. Old values captured in audit log only.
- **No `code`** — identity is the SKU × Vendor pair.
- **No `is_current` / `valid_from` / `valid_to`** — one live row per pair at any time.
- **Vendor required** — manufacturer's own list price is recorded by registering the manufacturer as a Vendor.

### 2.3.1 SKU measurement and BQ conversion

Material pricing distinguishes three unit meanings:

- **dimension Unit** measures structured geometry, for example `MM`;
- **base Unit** is the normalized consumption/comparison Unit, for example `M2`;
- **purchase Unit** is the Unit quoted by the supplier, for example `SHEET`.

An area-based sheet SKU may store positive decimal `dimension_length` and
`dimension_width`, optional `dimension_thickness`, `dimension_unit_id`, and a
derived `purchase_to_base_factor`. The server derives the factor with exact
decimal arithmetic. Example: `1200 × 2400 MM`, base `M2`, purchase `SHEET`
produces `1 SHEET = 2.88 M2`. Thickness may be displayed as part of the SKU
specification but is excluded from area calculation.

Geometry is optional for materials that do not have meaningful rectangular
dimensions. When geometry is supplied, length, width, and dimension Unit are
all required; base Unit must be `M2`; and purchase Unit must be explicit. The
browser preview is advisory only and the service always recalculates the
persisted factor. When a live material price already exists for the SKU, the
measurement layout is locked so later edits cannot silently change the meaning
of recorded prices.

### 2.4 Vendor eligibility

Supplier must be a live Vendor with `can_supply_material = true` on at least one assigned VendorType (capability-based, per Vendor contract §2.3).

### 2.5 Validation rules

- `amount` must be a valid decimal, non-negative, max 14 whole digits + 2 decimal places
- `currency` must be uppercase 3-letter code
- `unit_id` must match SKU's purchase unit (or base unit when no purchase unit is set)
- `source_link_id` when set must reference a live BrandLink belonging to the SKU's own Brand
- `source_link_id` cannot be set when the SKU has no Brand
- When a live PriceMaterial exists for the SKU, the SKU's measurement layout is locked; base unit, purchase unit, dimension unit, and rectangular dimensions cannot be changed until the live price is cleared
- SKU must not be archived
- exact live SKU × Vendor match opens/targets the existing row for update; creating
  a second live row is blocked by the pair constraint

### 2.6 Indexes

- Partial unique: `(sku_id, supplier_vendor_id) WHERE deleted_at IS NULL` — one live price per pair
- Index on `sku_id`
- Index on `supplier_vendor_id`

---

## 3. PriceMaterialLabor — Material + Labor Prices

### 3.1 Identity

`name` (display name) + auto-generated `slug`. Same pattern as Vendor/Brand.

### 3.2 Fields

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `name` | String | Required. Name of the work item (e.g. "Pasang Keramik 60x60 + Material") |
| `slug` | String | Auto-generated from name. Unique among this Vendor's live records |
| `category_id` | FK → Category | Required. Must be a live Category with kind = WORK |
| `vendor_id` | FK → Vendor | **Required (NOT NULL)**. The vendor providing this service |
| `unit_id` | FK → Unit | Required. Must be live |
| `amount` | Decimal(16,2) | Price amount. Must be non-negative |
| `currency` | String | Required. Uppercase 3-letter code |
| `scope_note` | String? | **Optional.** Describes what material is included (e.g. "material: semen, sika, pasir, sirtu") |
| `spec` | Json? | Optional specification data |
| `dim_display` | String? | Optional dimension display (e.g. "1200 × 2400 mm") |
| `notes` | String? | Optional notes |
| `created_at` | DateTime | |
| `updated_at` | DateTime | |
| `deleted_at` | DateTime? | Effective archive state; cause provenance follows `masterdata.md` §4.1 |
| `updated_by_user_id` | String? | |
| `updated_by_label` | String | Who last updated |

### 3.3 Vendor eligibility

Vendor must be live with `can_supply_labor = true` on at least one assigned VendorType (capability-based, per Vendor contract §2.3).

### 3.4 Validation rules

- `name` required, non-empty after normalization
- `amount` must be valid decimal, non-negative
- `currency` must be uppercase 3-letter code
- `category_id` must reference a live Category with kind = WORK
- `unit_id` must reference a live Unit
- `vendor_id` must reference a live Vendor with `can_supply_labor` capability
- Near-duplicate warning: if a price with similar name from the same vendor exists, warn user (confirmation, not block)

### 3.5 Indexes

- Partial unique on `(vendor_id, slug) WHERE deleted_at IS NULL`
- Partial unique on `(vendor_id, lower(name)) WHERE deleted_at IS NULL`
- Index on `category_id`
- Index on `vendor_id`

---

## 4. PriceLabor — Labor Only Prices

### 4.1 Identity

Same as PriceMaterialLabor: `name` + auto-generated `slug`.

### 4.2 Fields

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `name` | String | Required. Name of the work item (e.g. "Pasang Pipa Air Bersih") |
| `slug` | String | Auto-generated from name. Unique among this Vendor's live records |
| `category_id` | FK → Category | Required. Must be a live Category with kind = WORK |
| `vendor_id` | FK → Vendor | **Required (NOT NULL)**. The vendor providing this service |
| `unit_id` | FK → Unit | Required. Must be live |
| `amount` | Decimal(16,2) | Price amount. Must be non-negative |
| `currency` | String | Required. Uppercase 3-letter code |
| `spec` | Json? | Optional specification data |
| `dim_display` | String? | Optional dimension display |
| `notes` | String? | Optional notes |
| `created_at` | DateTime | |
| `updated_at` | DateTime | |
| `deleted_at` | DateTime? | Effective archive state; cause provenance follows `masterdata.md` §4.1 |
| `updated_by_user_id` | String? | |
| `updated_by_label` | String | Who last updated |

### 4.3 Vendor eligibility

Same as PriceMaterialLabor: Vendor must be live with `can_supply_labor = true`.

### 4.4 Validation rules

Same as PriceMaterialLabor (§3.4), minus scope_note (PriceLabor has no scope_note field).

### 4.5 Indexes

Same as PriceMaterialLabor (§3.5), scoped to the PriceLabor table.

---

## 5. Lifecycle — All Three Pricing Tables

All three pricing tables follow the **same lifecycle pattern**, aligned with Vendor/Brand.

| Operation | Who | Notes |
|---|---|---|
| **Read / List** | Staff with appropriate `read` permission | |
| **Create** | Staff with appropriate `manage` permission | |
| **Update** | Staff with appropriate `manage` permission | |
| **Archive** | Staff with appropriate `manage` permission | Set `deleted_at`. Price excluded from pickers |
| **Restore** | Staff with appropriate `manage` permission | Clear `deleted_at`. Validates integrity (see §5.2) |
| **Request permanent delete** | Staff with appropriate `manage` permission | Only for already-archived records |
| **Approve/reject and execute permanent delete** | Staff with `masterdata.deletion.approve` | The seeded Admin Role may receive this grant; code never authorizes by Role name |

### 5.1 Archive behavior

Archiving a price:
- adds a direct archive cause and sets the effective `deleted_at` state
- Price disappears from pickers and active price lists
- No cascade to other entities — prices are leaf entities, nothing depends on them

**Prices can be archived directly** by staff — this is independent of whether the parent (Vendor, Brand, SKU) is archived.

**Cascade from parent entities:** When a parent is archived, its prices cascade:
- Archive **Vendor** → all PriceMaterial (where supplier), PriceMaterialLabor, PriceLabor tied to that vendor → archived
- Archive **Brand** → SKUs of that brand → PriceMaterial of those SKUs → archived
- Archive **SKU** → PriceMaterial of that SKU → archived

### 5.2 Restore validation

- **PriceMaterial**: SKU must be live, Vendor must be live with `can_supply_material` capability, Unit must be live
- **PriceMaterialLabor / PriceLabor**: Vendor must be live with `can_supply_labor` capability, Category must be live (kind = WORK), Unit must be live

### 5.3 Cascade restore

Parent restore removes only the archive cause created by that parent. A price
archived directly, or still carrying another Vendor/SKU/Brand cause, remains
archived. The persisted provenance semantics are defined by
[`masterdata.md`](masterdata.md) §4.1.

Before becoming live, PriceMaterial also checks that no live row already occupies
its SKU × Vendor pair. PriceMaterialLabor/PriceLabor check the exact live
Vendor × normalized-name identity in their own table. A conflict blocks restore;
records are never silently merged or overwritten.

### 5.4 Delete guard

Prices are leaf entities, so there is no downstream business reference guard in
Master Data. They must already be archived; staff request deletion and a holder of
`masterdata.deletion.approve` approves/rejects it. BQ references are snapshots,
not foreign keys.

---

## 6. FK Behavior

### 6.1 PriceMaterial

| FK | Target | onDelete | Rationale |
|---|---|---|---|
| `sku_id` → Sku | Required | **Restrict** | Delete guard: SKU must clear prices first |
| `supplier_vendor_id` → Vendor | Required | **Restrict** | Delete guard: Vendor must clear prices first |
| `unit_id` → Unit | Required | **Restrict** | Cannot delete Unit while prices reference it |
| `source_link_id` → BrandLink | Optional | **SetNull** | Link removed = provenance cleared, price survives |

### 6.2 PriceMaterialLabor / PriceLabor

| FK | Target | onDelete | Rationale |
|---|---|---|---|
| `category_id` → Category | Required | **Restrict** | Cannot delete Category while prices reference it |
| `vendor_id` → Vendor | Required | **Restrict** | Delete guard: Vendor must clear prices first |
| `unit_id` → Unit | Required | **Restrict** | Cannot delete Unit while prices reference it |

All required FKs use **Restrict** for defense-in-depth, consistent with the Vendor contract pattern. Application-layer delete guards are the primary protection.

---

## 7. Permissions

Split into two groups: material prices (for staff managing procurement) and work prices (for staff + estimators managing labor costs).

| Permission ID | Grants |
|---|---|
| `masterdata.access` | App entry (shared across Master Data) |
| `masterdata.price-material.read` | View material prices |
| `masterdata.price-material.manage` | Create, update, archive, restore material prices. Request permanent delete |
| `masterdata.price-work.read` | View material+labor prices AND labor-only prices |
| `masterdata.price-work.manage` | Create, update, archive, restore material+labor AND labor-only prices. Request permanent delete |

Permanent delete approval/execution uses the shared
`masterdata.deletion.approve` permission. An initial Admin Role may be seeded with
that grant, but Role names are never authorization checks.

**Use case:** Estimators can be given `price-work.read` + `price-work.manage` without access to material pricing. Staff managing procurement gets both.

---

## 8. Audit

All operations follow CORE.md §5 `AuditEventInput` envelope. One real operation →
one audit event in the same transaction. Direct price mutations use the actions
below; a parent-driven archive/restore is represented by the parent operation's
single audit event and its affected-price metadata rather than synthetic child
events.

### 8.1 PriceMaterial audit actions

- `price-material.created` — Price set for a SKU × Vendor pair
- `price-material.updated` — Price amount, currency, unit, source, or notes changed
- `price-material.archived` — Price archived directly
- `price-material.restored` — Price restored
- `price-material.deletion-requested` — Permanent deletion requested
- `price-material.deletion-rejected` — Permanent deletion request rejected
- `price-material.deleted` — Approval and permanent deletion completed atomically

### 8.2 PriceMaterialLabor audit actions

- `price-material-labor.created`
- `price-material-labor.updated`
- `price-material-labor.archived`
- `price-material-labor.restored`
- `price-material-labor.deletion-requested`
- `price-material-labor.deletion-rejected`
- `price-material-labor.deleted`

### 8.3 PriceLabor audit actions

- `price-labor.created`
- `price-labor.updated`
- `price-labor.archived`
- `price-labor.restored`
- `price-labor.deletion-requested`
- `price-labor.deletion-rejected`
- `price-labor.deleted`

No-op updates produce no audit event. Each final `*.deleted` event contains the
request and approver metadata required by [`masterdata.md`](masterdata.md) §4.2.

---

## 9. Duplicate Detection

### 9.1 PriceMaterial

**Hard constraint:** Partial unique index on `(sku_id, supplier_vendor_id) WHERE deleted_at IS NULL`. One live price per SKU × Vendor pair. Attempting to create a second price for the same pair is blocked.

### 9.2 PriceMaterialLabor / PriceLabor

**Near-duplicate warning** (not hard constraint): If a price with a similar name from the same vendor already exists, show a confirmation warning: _"Harga serupa dari vendor ini sudah ada: [nama]. Yakin mau lanjut?"_ User may proceed — valid use case: same vendor, different scope or spec.

**Slug uniqueness:** Partial unique on `(vendor_id, slug)` among live records.

**Name uniqueness:** Case-insensitive partial unique on
`(vendor_id, lower(name)) WHERE deleted_at IS NULL` per table. An exact match for
the same Vendor targets the existing row; similar but distinct names may proceed
after confirmation.

---

## 10. Search & Filter

### 10.1 Text search (all three tabs)

- Price name (PriceMaterialLabor / PriceLabor) or SKU name (PriceMaterial)
- Vendor name

### 10.2 Filters

| Filter | Applies to | Type | Notes |
|---|---|---|---|
| Vendor | All | Select | Filter by vendor |
| Category | ML + Labor | Select | Filter by WORK category |
| Status | All | Select | Active / Archived |
| Amount range | All | Min-Max | Filter by price range |
| Brand | Material | Select | Filter by SKU's brand |
| Unit | All | Select | Filter by price unit |

---

## 11. UI / UX

### 11.1 Navigation

Three tabs under Pricing section: **Material Prices**, **Material + Labor**, **Labor Only**.

### 11.2 Table columns per tab

**Material Prices:**

| Column | Content |
|---|---|
| SKU | SKU name + code/slug |
| Brand | SKU's brand name |
| Vendor | Supplier vendor name |
| Price | Formatted amount + currency |
| Unit | Unit label |
| Status | Active / Archived |

**Material + Labor:**

| Column | Content |
|---|---|
| Name | Price name |
| Category | WORK category name |
| Vendor | Vendor name |
| Price | Formatted amount + currency |
| Unit | Unit label |
| Scope | scope_note preview (if set) |
| Status | Active / Archived |

**Labor Only:**

| Column | Content |
|---|---|
| Name | Price name |
| Category | WORK category name |
| Vendor | Vendor name |
| Price | Formatted amount + currency |
| Unit | Unit label |
| Status | Active / Archived |

### 11.3 Detail / Edit view

**Pattern:** Popup modal, same as Vendor/Brand.

**Material Price modal:** either an existing-SKU offer form (SKU selector,
vendor selector, amount, currency, source link, notes) or a new-SKU form (the
SKU fields from the Master Data contract plus the first capability-filtered
vendor offer). Both paths create a `PriceMaterial`; the new-SKU path is
atomic. The new-SKU path also provides optional structured rectangular
dimensions and shows `1 <purchase unit> = <factor> <base unit>` before save.

**Material+Labor / Labor modal:** Name, category selector (WORK categories only), vendor selector (capability-filtered: `can_supply_labor`), amount, currency, unit, scope note (ML only), spec, dimension display, notes.

All three tabs use `DirectoryShell`, `DataTable`, sortable headers, pagination,
the shared marker-style `StatusBadge`, a trailing `RowActionMenu`, shared
`Dialog` forms, `ConfirmDialog`, unsaved-change guards, and permission-aware
actions. Acceptance covers loading, empty, error, denied, pending, validation,
duplicate/restore conflict, archived, disabled, long-content, collapsed-rail,
narrow-viewport, and horizontal-overflow states.

---

## 12. Public Read Contract (BQ Integration)

Pricing exposes a **read-only public contract** for downstream apps (BQ, StudioFlow). No readiness check — downstream apps read prices that exist and handle missing prices in their own logic.

### 12.1 MaterialPriceOption

Per-supplier price for a SKU. All live prices for a given SKU are returned as an array — BQ must select explicitly, no automatic fallback.

Each option also exposes the SKU measurement snapshot source: base Unit,
purchase Unit, structured dimensions, dimension Unit, and nullable
`purchaseToBaseFactor`. A downstream BQ consumer that uses normalized base-unit
costing computes `amount / purchaseToBaseFactor` and persists the selected
amount, Units, and factor in its own snapshot. It must not reread current Master
Data values for an existing BQ line.

### 12.2 PriceWorkRead

Returns live PriceMaterialLabor and PriceLabor records with category, unit, and vendor info for downstream consumption.

---

## 13. Retired R1.05 implementation ledger

The source artifacts below were permanently removed from the active tree in
R1.06 and are recoverable only through Git history. The ledger preserves
KEEP/FIX/MERGE/PURGE intent for the clean rebuild; it is not a data-migration
instruction.

### 13.1 PURGE

| Current artifact | Action | Reason |
|---|---|---|
| `WorkPriceKind` enum | Drop | No longer needed — two separate tables replace the discriminator |
| `WorkPrice.kind` field | Drop | Replaced by table identity |
| `WorkPrice.code` field | Drop | Replaced by `name` + auto-generated `slug` |
| `SkuPrice.is_current` field | Drop | No history — one live row per pair |
| `SkuPrice.valid_from` field | Drop | No history |
| `SkuPrice.valid_to` field | Drop | No history |
| `SkuPrice_current_uniq` index | Drop | Replaced by pair partial unique index |
| `NO_SUPPLIER_SENTINEL` constant | Drop | Vendor now required (NOT NULL) |
| `closeCurrentSkuPrice()` | Drop | No history — update in place |
| `recordSkuPrice()` | Drop | Replaced by upsert-by-pair |
| `isOfferChange()` | Drop | No history — always update in place |
| `hasPriceContent()` | Drop | Amount always required |
| `resolvePrice()` | Drop | Amount always required (validated by `normalizePriceAmount`) |
| `checkWorkPrice()` | Retain logic | Validation still needed, but applied in normalizePriceAmount |
| `assertPartyEligibleForRole()` calls | Drop | Replaced by capability-based checks |
| `PRICE_SOURCE_ROLES` constant | Drop | Replaced by `can_supply_material` capability |
| `WORK_VENDOR_ROLES` constant | Drop | Replaced by `can_supply_labor` capability |
| `canBePriceSource()` | Drop | Replaced by capability check |
| `canBeWorkVendor()` | Drop | Replaced by capability check |
| BQ readiness check | Drop | Downstream handles missing prices |

### 13.2 RENAME / SPLIT

| Current artifact | Target | Notes |
|---|---|---|
| `SkuPrice` model | **PriceMaterial** | Rename. Remove history fields. Add `deleted_at`. Make `supplier_vendor_id` NOT NULL |
| `WorkPrice` model (kind=MATERIAL_LABOR) | **PriceMaterialLabor** | Split into own table. Remove `kind`, `code`. Add `name`, `slug`. Make `vendor_id` NOT NULL. `scope_note` optional |
| `WorkPrice` model (kind=LABOR_ONLY) | **PriceLabor** | Split into own table. Remove `kind`, `code`. Add `name`, `slug`. Make `vendor_id` NOT NULL. No `scope_note` |
| `supplier_party_id` | **`supplier_vendor_id`** | FK rename (Party → Vendor) |
| `vendor_party_id` | **`vendor_id`** | FK rename (Party → Vendor) |
| `MASTERDATA_PRICE_READ` | **`MASTERDATA_PRICE_MATERIAL_READ`** + **`MASTERDATA_PRICE_WORK_READ`** | Permission split |
| `MASTERDATA_PRICE_MANAGE` | **`MASTERDATA_PRICE_MATERIAL_MANAGE`** + **`MASTERDATA_PRICE_WORK_MANAGE`** | Permission split |

### 13.3 KEEP

| Current artifact | Notes |
|---|---|
| `normalizePriceAmount()` | Retained — shared validation |
| `assertCurrency()` | Retained — shared validation |
| `assertSkuPriceContext()` | Retained — updated to use capability check instead of role check |
| `assertWorkPriceContext()` | Retained — updated for both ML and Labor tables, capability check |
| `PricingService` | Retained — split into methods per table, updated references |
| `PricingRepository` | Retained — extended for 3-table model |
| Public read contract | Retained — updated types, removed readiness check |
| Audit event pattern | Retained and aligned to shared request/reject/final-delete workflow |

### 13.4 FIX

| Current artifact | Fix |
|---|---|
| `SkuPrice` FK `supplier_party_id` | Rename to `supplier_vendor_id`, change to NOT NULL, onDelete: Restrict |
| `SkuPrice` FK `sku_id` | Change onDelete from Cascade to **Restrict** |
| `WorkPrice` FK `vendor_party_id` | Rename to `vendor_id`, change to NOT NULL, onDelete: Restrict |
| `WorkPrice` FK `category_id` | onDelete: Restrict (already correct) |
| `WorkPrice` FK `unit_id` | onDelete: Restrict (already correct) |
| `pricing-rules.ts` | Replace `assertPartyEligibleForRole` with capability-based checks |
| `pricing-service.ts` | Split WorkPrice methods into PriceMaterialLabor and PriceLabor |
| `pricing-repository.ts` | Add 3rd table support, update types |
| `public-read.ts` | Remove readiness check, update types for 3-table model |
| UI pricing page | Split into 3 tabs, update forms for new field structure |

---

## 14. Historical field mapping — no import authorized

R1.06 permanently discarded old application data. This section is retained only
to explain old field names found in Git evidence; the clean rebuild must not
create a legacy importer or fallback from it.

### 14.1 SkuPrice → PriceMaterial

| Legacy field | Target field | Notes |
|---|---|---|
| `price_net` | `amount` | Direct map |
| `currency` | `currency` | Direct map |
| `unit` | `unit_id` | Resolve by unit code |
| `supplier_party_id` | `supplier_vendor_id` | Party → Vendor rename. NULL suppliers must be resolved to a Vendor |
| `source_link_id` | `source_link_id` | Direct map |
| `notes` | `notes` | Direct map |
| `is_current` | — | Dropped. Only import `is_current = true` rows |
| `valid_from` / `valid_to` | — | Dropped. No history |

**Special handling:** Legacy rows with `supplier_party_id = NULL` are blocked from
automatic import and placed in a manual-resolution report. The importer never
infers the Brand owner as supplier and never creates a generic "Manufacturer"
Vendor. A staff member must select or create the real Vendor explicitly before
the row can be imported.

### 14.2 WorkPrice → PriceMaterialLabor / PriceLabor

| Legacy field | Target table | Notes |
|---|---|---|
| `kind = MATERIAL_LABOR` | → `PriceMaterialLabor` | |
| `kind = LABOR_ONLY` | → `PriceLabor` | |
| `code` | — | Dropped |
| `name` | `name` | Direct map |
| — | `slug` | Auto-generated from `name` |
| `price` / `amount` | `amount` | Direct map |
| `currency` | `currency` | Direct map |
| `category_id` | `category_id` | Direct map |
| `vendor_party_id` | `vendor_id` | Party → Vendor rename. NULL vendors must be resolved |
| `unit` / `unit_id` | `unit_id` | Direct map / resolve by code |
| `scope_note` | `scope_note` | Direct map (PriceMaterialLabor only) |
| `spec` | `spec` | Direct map |
| `dim_display` | `dim_display` | Direct map |
| `notes` | `notes` | Direct map |
| `deleted_at` | `deleted_at` | Direct map |

**Special handling:** Legacy rows with `vendor_party_id = NULL` are blocked from
automatic import and placed in the same manual-resolution flow. No Vendor is
inferred or created by fallback.

---

## Locked Decisions Summary

| # | Decision | Answer |
|---|---|---|
| Q1 | Price history (material) | No history — update in-place, audit log suffices |
| Q2 | UI tabs | 3 tabs: Material Prices, Material+Labor, Labor Only |
| Q3 | Database model | 3 separate tables: PriceMaterial, PriceMaterialLabor, PriceLabor |
| Q4 | PriceMaterial vendor | Required (NOT NULL). Manufacturer = register as Vendor |
| Q5 | Direct archive | Staff can archive any price directly |
| Q6 | Lifecycle | All 3 tables: archive/restore (deleted_at). Consistent |
| Q7 | Permanent delete | Staff request → holder of `masterdata.deletion.approve` approves/rejects |
| Q8 | Permissions | 4 permissions: price-material (read+manage) + price-work (read+manage) |
| Q9 | Audit | Direct CRUD/lifecycle actions plus deletion request/reject/final delete; parent cascades stay in the parent event |
| Q10 | Work prices vendor | Required (NOT NULL) in both ML and Labor tables |
| Q11 | PriceMaterial code | Not needed — identity = SKU × Vendor pair |
| Q12 | scope_note | Optional in PriceMaterialLabor (was mandatory). PriceLabor has no scope_note |
| Q13 | Work prices code field | Removed. That was actually the "name" |
| Q14 | UI pattern | Popup modal (same as Vendor/Brand) |
| Q15 | Work prices identity | name + auto-generated slug (same pattern as Vendor/Brand) |
| Q16 | Duplicate detection | Hard exact identity per Vendor; near-duplicate warning + confirmation for distinct work names |
| Q17 | Search & filter | Full: name, vendor, category, status, amount range, brand (material), unit |
| Q18 | BQ readiness check | Removed — BQ handles missing prices in its own logic |
| + | Party → Vendor rename | All FK references updated (supplier_party_id → supplier_vendor_id, etc.) |
| + | Capability-based eligibility | Replaces role-based checks (can_supply_material / can_supply_labor) |
| + | Cascade from parent | Vendor archived → prices archived. Brand archived → SKUs → material prices archived |
