# Vendor Contract — Master Data

> **R5.05 owner amendment — 2026-09-06.** The persisted entity and route remain
> `Vendor`/`/masterdata/vendors`, but every user-facing label is **Supplier**.
> R6.20 owner correction: Suppliers own company information links as well as
> operational profiles and contacts. Catalog/product resources remain Brand-owned.
> Before `VendorLink` purge, complete company/contact link records are preserved
> in `Vendor.info_links`; ambiguous resource records stay in
> `Vendor.link_review_snapshot` for owner review. Neither field restores a Supplier
> catalog. Existing purged data cannot be reconstructed without a rebuild backup.
> `BrandSupplier` remains, but mutation is owned only by Brand; Supplier displays
> supplied Brands as an explicit read-only projection.

Status: **OWNER-APPROVED LOGIC CONTRACT — not yet an executable work order**

Authority: Owner decisions locked in navigator session and reconciled with the
shared rules in [`masterdata.md`](masterdata.md). All references to CORE.md §4
(RBAC) and §5 (Audit) use the foundation contracts at repository root.

---

## 1. Domain Identity

**UI label:** Suppliers.

**Domain model name:** `Vendor` (renamed from legacy `Party`). One `Vendor` row
= one business/commercial identity as a whole. A branch is not split merely
because its address differs. It becomes a separate Vendor only when staff must
treat it as an independently quoted/invoiced commercial identity. A reusable
multi-location sub-entity is not in the current scope.

**Slug:** Auto-generated from `name` (lowercase, strip special characters, dash separator). Unique among live (non-archived) records. Not manually editable.

**Canonical terminology:** User-facing UI and public copy use **Supplier** and
**Supplier Type**. Persisted models, database fields, internal service symbols,
audit entity types, and the existing permission namespace retain `Vendor` and
`VendorType`; this avoids a migration with no business value. The legacy
`Party` name remains retired.

---

## 2. Vendor Type — Single-Dimension Model

### 2.1 Design decision

The legacy two-dimension model (operational `PartyRoleKind` enum + descriptive `BusinessType` dictionary) is collapsed into a **single dimension**: one controlled dictionary called **VendorType** with embedded capability flags.

Each VendorType entry carries:

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `code` | String, unique, immutable | Canonical code (e.g. `SUPPLIER`, `DISTRIBUTOR`) |
| `label` | String | Display label |
| `description` | String? | Optional description |
| `can_supply_material` | Boolean | This type qualifies a Vendor for PriceMaterial supplier pickers |
| `can_supply_labor` | Boolean | This type qualifies a Vendor for PriceMaterialLabor/PriceLabor pickers |
| `sort_order` | Int | Display ordering |
| `created_at` | DateTime | |
| `updated_at` | DateTime | |
| `deleted_at` | DateTime? | Soft delete (archive) |

### 2.2 Cardinality

One Vendor may have **multiple** VendorType assignments simultaneously (many-to-many via a join table `VendorVendorType`, replacing both `PartyRole` and `PartyBusinessType`).

### 2.3 Capability resolution

A Vendor is eligible when it is live (`deleted_at IS NULL`) and holds at least one live VendorType with the matching flag:

- **Material supplier** (PriceMaterial picker): `can_supply_material = true` on any assigned live VendorType
- **Labor vendor** (PriceMaterialLabor/PriceLabor picker): `can_supply_labor = true` on any assigned live VendorType

This replaces all hardcoded role-to-eligibility mappings (`canBePriceSource`, `canBeWorkVendor`, `PRICE_SOURCE_ROLES`, `WORK_VENDOR_ROLES` from legacy, and `assertPartyEligibleForRole` from rebuild).

Removing a VendorType assignment, archiving a VendorType, or switching off a
capability flag is blocked when it would remove the last qualifying capability
from a live Vendor that still has a live dependent requiring it. Material
capability protects live PriceMaterial and BrandSupplier relations; labor
capability protects live PriceMaterialLabor and PriceLabor rows. Another assigned
live VendorType with the same capability satisfies the guard. Staff must archive
or reassign the dependent relation first.

### 2.4 Controlled dictionary behavior

Same pattern as Category and Unit, but with stricter access:

- **Seeded** with initial values from `seed-inventory.ts` (see §2.5)
- **Restricted policy set**: only holders of `masterdata.dictionary.manage` can add new types, edit labels, set capability flags, and archive
- **Hard delete**: requires the shared `masterdata.deletion.approve` workflow grant
- **Case-insensitive** normalization for uniqueness check
- **Near-duplicate detection**: warning shown but an authorized dictionary manager may proceed (same as Brand/Category)
- Staff can only **select** from existing types when assigning to a vendor

### 2.5 Seed values

Six types are seeded with simple English labels and capability flags aligned with
the three curated Pricing categories.

| Code | Label | can_supply_material | can_supply_labor |
|---|---|---|---|
| `SUPPLIER` | Supplier | ✓ | ✗ |
| `DISTRIBUTOR` | Distributor | ✓ | ✗ |
| `STORE` | Retail | ✓ | ✗ |
| `FACTORY` | Factory | ✓ | ✗ |
| `SUBCON` | Subcon | ✓ | ✓ |
| `SERVICE` | Service | ✗ | ✓ |

An authorized dictionary manager may add types like `FABRICATOR` or `AGENT`
after go-live. Other staff select from existing types only.

---

## 3. Vendor Fields

The Vendor model retains these fields (renamed from `Party`):

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `name` | String | Required. Case-insensitive unique among live records |
| `slug` | String | Auto-generated, unique among live records |
| `legal_name` | String? | Optional legal/tax name |
| `address` | String? | Free-text address |
| `notes` | String? | |
| `created_at` | DateTime | |
| `updated_at` | DateTime | |
| `deleted_at` | DateTime? | Effective archive state; cause provenance follows `masterdata.md` §4.1 |

**Removed:** `type` field (`PartyType` enum: `ORGANIZATION`/`INDIVIDUAL`). YAGNI — can be reintroduced later as optional field if tax administration requires it.

---

## 4. Sub-Entity: Contacts (`VendorContact`)

Renamed from `PartyContact`. Many contacts per Vendor. Structure:

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `vendor_id` | FK → Vendor | Required |
| `person_name` | String | Required |
| `job_title` | String? | |
| `phone` | String? | |
| `email` | String? | |
| `is_primary` | Boolean | Display preference, not uniqueness constraint |
| `notes` | String? | |
| `brand_id` | FK → Brand? | Optional brand scope. NULL = general contact |

Brand-scoped contact validation: the Brand must be live, and the Vendor must own or supply it (existing `assertBrandScopedContactAllowed` logic retained, references updated from Party to Vendor).

---

## 5. Supplier Company Information Links (`Vendor.info_links`)

> **R6.20 / R6.21 redesign.** The old `VendorLink` sub-entity (with MARKETPLACE / DRIVE / PRICE_LIST / OTHER kinds) has been purged. Company and contact links are now stored as a JSONB array on `Vendor.info_links`. Ambiguous records from the purge are held in `Vendor.link_review_snapshot` until an authorised user resolves them.

### 5.1 Schema

`Vendor.info_links` is a `Json @default("[]")` column (schema: `master_data`). Each element is a plain object:

```json
{ "kind": "WEBSITE", "url": "https://…", "label": "optional display name" }
```

Allowed `kind` values (exact, uppercase): `WEBSITE`, `INSTAGRAM`, `FACEBOOK`, `TIKTOK`, `YOUTUBE`, `LINKEDIN`, `WHATSAPP`.

Constraints enforced by the service before any write:
- URL must start with `http://` or `https://` and parse as a valid URL.
- URL max length: 2048 characters. Label max length: 200 characters.
- Maximum 20 links per Vendor. Duplicate URLs within one submission are deduplicated (first occurrence kept).

### 5.2 Review snapshot

`Vendor.link_review_snapshot` (`Json @default("[]")`) holds records from the purge that were ambiguous. An authorised user accepts or discards them from the Edit Supplier dialog. Accepted items are merged into `info_links`; the rest are discarded. The snapshot is cleared on resolution.

### 5.3 Mutation surface (R6.23 / R6.24)

Link changes are part of the **Edit Supplier** form and are committed **atomically** with the rest of the vendor profile (name, types, contacts) in a single `updateVendor` transaction. There is no separate link-only save; Cancel in the Edit dialog discards all staged changes including link edits.

---

## 6. Vendor–Brand Relations

### 6.1 Brand ownership

`Brand.owner_vendor_id` → optional FK to Vendor (renamed from `owner_party_id`). At most one owner per Brand. Retained as-is.

### 6.2 BrandSupplier

Many-to-many Brand ↔ Vendor. Retained with FK fixes for defense-in-depth:

- `vendor_id` FK (renamed from `party_id`): `onDelete: Restrict` — DB rejects Vendor deletion while BrandSupplier rows exist
- `brand_id` FK: `onDelete: Restrict` — DB rejects Brand deletion while BrandSupplier rows exist (changed from Cascade)

Both sides use Restrict because both Brand and Vendor are independent entities. Delete guards at the application layer are the primary protection; FK Restrict is the safety net.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `brand_id` | FK → Brand | onDelete: Restrict |
| `vendor_id` | FK → Vendor | onDelete: Restrict |
| `is_authorized` | Boolean | Default false |
| `notes` | String? | |

Unique constraint on (brand_id, vendor_id).

---

## 7. Lifecycle

Brand and Vendor follow the **same lifecycle pattern** — independent entities with cascading archive/restore to their dependents.

| Operation | Who | Notes |
|---|---|---|
| **Read / List** | Staff with `masterdata.vendor.read` | |
| **Create** | Staff with `masterdata.vendor.manage` | |
| **Update** | Staff with `masterdata.vendor.manage` | |
| **Archive** | Staff with `masterdata.vendor.manage` | Soft delete — cascades to dependents (see §7.1) |
| **Restore** | Staff with `masterdata.vendor.manage` | Removes this Vendor's archive causes and restores only dependents with no remaining cause (see §7.2) |
| **Request permanent delete** | Staff with `masterdata.vendor.manage` | Staff can only REQUEST deletion of archived records |
| **Approve/reject and execute permanent delete** | Staff with `masterdata.deletion.approve` | The seeded Admin Role may receive this grant; code never authorizes by Role name |

### 7.1 Archive behavior — cascade to dependents

When a Vendor is archived:

1. add the Vendor's direct archive cause and set its effective `deleted_at` state;
2. add this Vendor as an archive cause to all PriceMaterial rows where it is the supplier;
3. add this Vendor as an archive cause to all PriceMaterialLabor and PriceLabor rows where it is the provider;
4. **Contacts** and **Links** are preserved as children (they follow the vendor)
5. **BrandSupplier** relations are preserved (the vendor just won't appear in pickers)

The Vendor disappears from all pickers. Existing prices are archived — they no longer appear as active pricing.

**Important:** Archiving a Vendor does NOT affect any Brand. Brands are independent. If IMAM (vendor) is archived, TACO (brand) continues to exist — only IMAM's prices are archived.

### 7.2 Restore behavior — cascade restore

When a Vendor is restored, remove only the direct Vendor cause and the cascade
causes created by that Vendor archive. A price becomes live only when no direct
or other-parent cause remains. A price archived manually before the Vendor, or
still blocked by Brand/SKU state, stays archived. The Vendor reappears in pickers
only after its own causes are cleared.

Multiple Vendors may offer the same material or work. Restore still validates
the exact uniqueness rules from the Pricing contract: a PriceMaterial SKU ×
Vendor pair and an exact work-name × Vendor identity may not conflict with a row
that became live while this Vendor was archived.

Restore validation:
1. **Name/slug conflict** — if another live Vendor now uses this name or slug, restore is blocked
2. **VendorType integrity** — assigned VendorTypes used for an eligibility claim must still be live;
3. **Relationship integrity** — retained BrandSupplier relations require live material capability;
4. **Pricing integrity** — Units, Categories, SKUs, source links, and live unique identities required by each price remain valid.

Cascade archive/restore uses the persisted cause semantics in
[`masterdata.md`](masterdata.md) §4.1; audit events are not operational state.

### 7.3 Delete guard (permanent delete)

Permanent delete is blocked if the Vendor still has ANY references:

- Owned Brands (`Brand.owner_vendor_id`)
- BrandSupplier rows (live or archived)
- PriceMaterial rows (live or archived)
- PriceMaterialLabor rows (live or archived)
- PriceLabor rows (live or archived)

Permanent delete only works on already-archived Vendors with zero references
remaining. Staff can request it; `masterdata.deletion.approve` authorizes the
decision and execution.

### 7.4 Brand lifecycle alignment

Brand is governed by [`brand-contract.md`](brand-contract.md). It uses the same
archive-cause and deletion-approval mechanics while remaining an independent root.

---

## 8. Permissions

Following the existing 2-level pattern used by Brand (`read` + `manage`), consistent with CORE.md §4. Namespace renamed from `party` to `vendor`:

| Permission ID | Grants |
|---|---|
| `masterdata.access` | App entry (shared across Master Data) |
| `masterdata.vendor.read` | View vendor directory and details |
| `masterdata.vendor.manage` | Create, update, archive, restore Vendors and request permanent deletion |
| `masterdata.dictionary.read` | View controlled dictionaries including VendorType (shared with Unit) |
| `masterdata.dictionary.manage` | Add, edit, archive, and request deletion of VendorType entries; authorization is grant-based, never checked by Role name |
| `masterdata.deletion.approve` | Approve/reject and execute permanent deletion requests across Master Data |

The curated Vendor resource vocabulary remains two-level (`read` + `manage`).
Deletion approval is a separate cross-resource workflow permission defined by
[`masterdata.md`](masterdata.md) §4.2.

---

## 9. Audit

All operations follow CORE.md §5 `AuditEventInput` envelope. One real operation
produces one primary event in the same transaction.

Audited operations:

- `vendor.created` — Vendor created (initial state in deltas)
- `vendor.updated` — Vendor fields changed, including sub-entity changes: VendorType assignments, contacts, links, BrandSupplier relations. All captured as safe field deltas in one event.
- `vendor.archived` — Vendor archived (with cascade info in deltas: how many prices archived)
- `vendor.restored` — Vendor restored (with cascade info in deltas: how many prices restored)
- `vendor.deletion-requested` — Staff requested deletion of an archived Vendor
- `vendor.deletion-rejected` — An authorized approver rejected the pending request
- `vendor.deleted` — Approval and permanent deletion completed atomically, with request/approver metadata

No-op updates produce no audit event. Approval is not emitted as a second event
beside `vendor.deleted`; the one final event represents the approved delete
operation, preserving CORE.md's one-operation/one-primary-event rule.

### 9.1 Brand audit alignment

Brand action names and lifecycle evidence are authoritative in
[`brand-contract.md`](brand-contract.md) §§6–7.

---

## 10. Duplicate Detection

- **Unique constraint:** case-insensitive `lower(name)` partial unique index on live records (`WHERE deleted_at IS NULL`), matching Brand pattern (`Vendor_live_name_uniq`).
- **Slug uniqueness:** partial unique index on `slug` for live records (`Vendor_live_slug_uniq`).
- **Near-duplicate warning:** On create/update, if a vendor name has low edit distance to an existing live vendor name, show a warning: _"Vendor serupa sudah ada: [nama]"_. Staff may proceed anyway.

---

## 11. Quick Entry

Minimal quick creation from Pricing contexts:

**Required fields:** name + at least one existing VendorType that grants the
capability required by that picker. PriceMaterial requires
`can_supply_material`; PriceMaterialLabor/PriceLabor require
`can_supply_labor`. New VendorTypes cannot be created inline.

The full Vendor directory may create an owner-only or otherwise unclassified
Vendor with zero VendorTypes. Such a Vendor is ineligible for every price picker
until an authorized assignment grants a capability.

Other fields (legal_name, address, contacts, links, brand relations) can be completed later from the Vendor directory.

Quick entry validates:
- Name is non-empty after normalization
- At least one VendorType is selected
- Near-duplicate check runs (warning, not blocking)

---

## 12. Search & Filter

### 12.1 Text search

- Vendor name (case-insensitive, partial match)
- Contact person name (searches across all contacts of matching vendors)

### 12.2 Filters

| Filter | Type | Notes |
|---|---|---|
| Vendor Type | Multi-select | Filter by assigned VendorType(s) |
| Capability | Toggle/select | Can supply material / Can supply labor |
| Brand | Select | Has BrandSupplier relation with selected brand |
| Address | Text search | Partial match on address field |
| Status | Select | Active (live) / Archived |
| Created date | Date range | |
| Has contacts | Boolean | Whether vendor has any contacts |

---

## 13. UI / UX

### 13.1 Directory table columns

| Column | Content |
|---|---|
| Name | Vendor name |
| Type(s) | VendorType labels as badge/tags |
| Capability | Icons for material supply / labor provision |
| Primary Contact | Name of `is_primary` contact (if any) |
| Brands | Count of associated BrandSupplier records |
| Status | Shared marker-style `StatusBadge`, never a filled status pill |

### 13.2 Detail / Edit view

**Pattern:** Same as Brand — popup modal.

**Create dialog** — single form, no tabs: Vendor trade name (required), Legal entity name, Vendor types, Address, Notes, and an optional Contacts section (same fields as the edit dialog's Contacts tab: name, job title, phone, email, brand scope, primary toggle) so a vendor can be created with its first contacts in one step. Links are still added after creation via the edit dialog.

**Edit dialog — Tabs (3 + read-only Brand Suppliers view):**

1. **Profile & Types** — Vendor info (name, legal name, address, notes) and VendorType assignments (add/remove via searchable select from the controlled dictionary)
2. **Contacts** — Contact list with CRUD. Each contact has: name, job title, phone, email, brand scope (optional), and a primary contact toggle. Brand-scoped contacts grouped under their brand header for readability.
3. **Links** — External references using the vendor-scoped `LinkKind` vocabulary (§5 — CATALOG excluded). Each link has: type, URL, optional display label, optional archive URL.
4. **Brand Suppliers** (read-only, edit dialog only) — Displays BrandSupplier relationships for visibility. Management of these relations belongs to the Brand workflow.

BrandSupplier relations are managed from the Brand workflow, not from Vendor
create/edit. The Vendor form must not silently replace those relations when it
saves profile, contact, or link changes.

**No Prices tab** — prices are managed from the SKU/Work side, not from Vendor detail.

**Audit metadata:** The edit dialog footer displays "Updated by [actor] · [relative time]" drawn from the most recent `vendor.*` AuditEvent for that Vendor (matches the Brand pattern — any lifecycle event counts, not just create/update). This is a read-only display; actor identity is stored in AuditEvent, not denormalized onto the Vendor row.

The page uses `DirectoryShell`, `DataTable`, sortable headers, pagination,
`RowActionMenu`, shared `Dialog` forms, `ConfirmDialog`, unsaved-change guards,
and permission-aware actions. It must cover loading, empty, error, denied,
pending, validation, conflict, archived, disabled, long-content, collapsed-rail,
narrow-viewport, and horizontal-overflow states before acceptance.

---

## 14. Retired R1.05 implementation ledger

The source artifacts below were permanently removed from the active tree in
R1.06 and are recoverable only through Git history. The ledger preserves
KEEP/FIX/MERGE/PURGE intent for the clean rebuild; it is not a data-migration
instruction.

### 14.1 PURGE

| Current artifact | Action | Reason |
|---|---|---|
| `PartyType` enum | Drop | Q7: ORGANIZATION/INDIVIDUAL distinction removed |
| `Party.type` field | Drop | No longer needed |
| `PartyRoleKind` enum | Drop | Replaced by VendorType capability flags |
| `PartyRole` model/table | Drop | Replaced by Vendor ↔ VendorType join |
| `PARTY_TYPES` constant | Remove | |
| `PARTY_ROLES` constant | Remove | |
| `normalizePartyType()` | Remove | |
| `assertPartyEligibleForRole()` | Remove | Replaced by capability-based eligibility |
| `assertPartyRoleCanBeRemoved()` | Remove | Replaced by VendorType removal logic |
| `normalizePartyRoles()` | Remove | |
| `operationalRolesFromRelationshipEvidence()` | Remove | |
| `assessPartyQuickEntry()` roles logic | Rewrite | Quick entry uses VendorType, not roles |

### 14.2 MERGE / RENAME

| Current artifact | Target | Notes |
|---|---|---|
| `Party` model | **Vendor** | Full rename — table, fields, references |
| `PartyContact` model | **VendorContact** | Rename `party_id` → `vendor_id` |
| `PartyLink` model | Purged — data migrated to `Vendor.info_links` / `link_review_snapshot` (R6.20) |
| `BusinessType` model | **VendorType** | Add `can_supply_material`, `can_supply_labor` boolean fields |
| `PartyBusinessType` join | **VendorVendorType** | Rename party_id → vendor_id, business_type_id → vendor_type_id |
| `BUSINESS_TYPE_SEEDS` | **VENDOR_TYPE_SEEDS** | Add capability flag values per §2.5 |
| `LEGACY_PARTY_MAPPINGS` | Update | Map legacy roles to VendorType codes per §15 |
| `Brand.owner_party_id` | **`Brand.owner_vendor_id`** | FK rename |
| `BrandSupplier.party_id` | **`BrandSupplier.vendor_id`** | FK rename |
| `SkuPrice.supplier_party_id` | **`PriceMaterial.supplier_vendor_id`** | Owned by Pricing split; required FK |
| `WorkPrice.vendor_party_id` | **`PriceMaterialLabor.vendor_id` / `PriceLabor.vendor_id`** | Owned by Pricing split; required FKs |
| `masterdata.party.read` | **`masterdata.vendor.read`** | Permission rename |
| `masterdata.party.manage` | **`masterdata.vendor.manage`** | Permission rename |

### 14.3 KEEP

| Current artifact | Notes |
|---|---|
| `LinkKind` enum | Shared with BrandLink, unchanged |
| `BrandSupplier` model | Retained (FK fixes in §14.4) |
| `assertVendorCanBeDeleted()` | Logic retained from `assertPartyCanBeDeleted`, references updated |
| `assertBrandScopedContactAllowed()` | Retained, references updated to Vendor |
| `mapLegacyPartyClassification()` | Updated to map to VendorType codes per §15 |
| Partial unique indexes (name, slug) | Retained, renamed |

### 14.4 FIX

| Current artifact | Fix |
|---|---|
| `PartyRecord` type in repository | Rename to `VendorRecord`. Remove `type`, `roles`; replace `businessTypeIds` with `vendorTypeIds` and resolved capability flags |
| `PartyListFilter` | Rename to `VendorListFilter`. Replace role filter with vendorType + capability filters |
| `party-service.ts` | Rename to `vendor-service.ts`. Replace role-based eligibility with capability-based eligibility |
| `assessPartyQuickEntry()` | Rename. Change required fields from name+type+roles to name+vendorType |
| `brand-rules.ts` `assertBrandSuppliers()` | Replace `assertPartyEligibleForRole(s, "MATERIAL_SUPPLIER")` with capability-based check (`can_supply_material`) |
| `BrandSupplier.vendor_id` FK | `onDelete: Restrict` (was Cascade on `party_id`) |
| `BrandSupplier.brand_id` FK | `onDelete: Restrict` (was Cascade) — defense in depth |
| `VendorContact.vendor_id` FK | `onDelete: Cascade` (children follow parent) |
| `VendorLink.vendor_id` FK | Removed — model no longer exists (R6.20) |
| `Brand.owner_vendor_id` FK | `onDelete: SetNull` (retained) + delete guard checks ownership |
| `PriceMaterial.supplier_vendor_id` FK | Required, `onDelete: Restrict`; replaces nullable `SkuPrice.supplier_party_id` |
| `PriceMaterialLabor.vendor_id` / `PriceLabor.vendor_id` FKs | Required, `onDelete: Restrict`; replace nullable `WorkPrice.vendor_party_id` |
| Brand `softDelete` audit action | Rename `brand.deleted` → `brand.archived` |
| Brand permanent delete | Add method + `brand.deleted` audit action (currently missing) |
| Brand lifecycle | Add request/approve permanent delete flow (matching Vendor) |
| Brand archive | Add cascade to SKUs + material prices |
| Brand restore | Add cascade restore of SKUs + material prices |

---

## 15. Historical vocabulary mapping

The legacy 6-value `PartyRoleKind` maps to the new VendorType seed codes:

| Legacy value | VendorType code | Notes |
|---|---|---|
| `SUPPLIER` | `SUPPLIER` | Direct match |
| `RETAIL` | `STORE` | |
| `DISTRIBUTOR` | `DISTRIBUTOR` | Direct match |
| `SUBCON` | `SUBCON` | Direct match |
| `SERVICE_VENDOR` | `SERVICE` | |
| `MANUFACTURER` | `FACTORY` | |

All legacy values have a direct VendorType code mapping for evidence review. The
R1.06 reset discarded old app data, so no automatic legacy import is planned.

---

## 16. Brand–Vendor alignment

Brand and Vendor are independent roots. The authoritative Brand rules now live in
[`brand-contract.md`](brand-contract.md); this Vendor contract does not duplicate
them.

- Archiving Brand never archives Vendor. It affects that Brand's SKUs and their
  PriceMaterial rows.
- Archiving Vendor never archives Brand. It affects that Vendor's material and
  work prices.
- Owner and BrandSupplier relations are preserved through archive/restore and
  deliberately cleared before a permanent delete where required.
- Both roots use the shared archive-cause and deletion-approval semantics from
  [`masterdata.md`](masterdata.md) §4.

---

## Locked Decisions Summary

| # | Decision | Answer |
|---|---|---|
| Q1 | Vendor = one entity or per-branch | One business identity; a branch is separate only when independently quoted/invoiced |
| Q2 | Type dimensions | Single dimension (rejected two-dimension split) |
| Q3 | Multiple types per vendor | Yes |
| Q4 | Eligibility mechanism | Capability flags per VendorType |
| Q5 | Type list extensibility | Seed + extensible by holders of `masterdata.dictionary.manage` |
| Q6 | UI label | Suppliers & Vendors |
| Q7 | ORGANIZATION/INDIVIDUAL distinction | Removed |
| Q8 | Contact structure | Retained as-is (renamed to VendorContact) |
| Q9 | Brand relations | Both owner + BrandSupplier retained |
| Q10 | Lifecycle | Same pattern as Brand — independent root with provenance-safe cascade archive/restore |
| Q11 | Archive impact on prices | **Cascade** — prices terikat ikut archived |
| Q12 | VendorLink structure | Purged — replaced by `Vendor.info_links` JSON (R6.20) |
| Q13 | Duplicate detection | Case-insensitive unique + near-duplicate warning |
| Q14 | Permission model | 2-level Vendor read/manage plus shared `masterdata.deletion.approve` workflow grant |
| Q15 | VendorType management | Holders of `masterdata.dictionary.manage` (shared with Unit) |
| Q16 | Search & filter | Full: type, capability, brand, address, status, date, contacts |
| Q17 | Table columns | Name, types, capability, primary contact, brands, status |
| Q18 | Detail view pattern | Same as Brand (popup modal) |
| Q19 | Detail tabs | Overview, Contacts, Brands (no Prices tab) |
| Q20 | Quick entry | Yes, minimal: name + type |
| Q21 | Audit | create/update/archive/restore plus deletion request/reject/final delete |
| Q22 | Slug | Auto-generated, not editable |
| + | Domain name | **Vendor** (renamed from Party) |
| + | Seed values | 6 types: SUPPLIER, DISTRIBUTOR, STORE, FACTORY, SUBCON, SERVICE |
| + | Terminology | `can_supply_material` + `can_supply_labor`, shared by Vendor and Pricing |
| + | BrandSupplier FK | Both sides `onDelete: Restrict` (defense in depth) |
| + | Audit prefix | `vendor.*` |
| + | Restore validation | Name/slug conflict + VendorType integrity |
| + | Restore cascade | Only matching Vendor archive causes are removed; independent causes remain |
| + | Permanent delete flow | Staff request → holder of `masterdata.deletion.approve` approves/rejects |
| + | Brand alignment | Brand must follow same lifecycle pattern (§16) |
