# 06 — Data Ownership & Dependency Contract

## Ownership matrix

| Data / Capability | Owner | Consumers |
|---|---|---|
| Auth identity | Platform Core | all apps |
| Permission engine | Platform Core | all apps |
| Audit infrastructure | Platform Core | all apps |
| Brand | Master Data | StudioFlow, BQ if needed |
| SKU/Product | Master Data | StudioFlow, BQ |
| Category (PRODUCT + WORK) | Master Data | StudioFlow (discovery), BQ (snapshot) |
| Supplier/Party | Master Data | Master Data, BQ reads |
| Material price per SKU × supplier | Master Data | BQ |
| Labor price | Master Data | BQ |
| Material+Labor price | Master Data | BQ |
| Project | StudioFlow | StudioFlow |
| Project workflow | StudioFlow | StudioFlow |
| BQ breakdown | BQ | BQ |
| BQ project snapshot | BQ | BQ |
| BQ recipe library | BQ | BQ |

---

## Dependency law

Allowed:
```text
app -> platform
app -> other-app/public
```

Forbidden:
```text
app -> other-app/domain
app -> other-app/application
app -> other-app/infrastructure
app -> other-app/ui
platform -> app
```

---

## Snapshot law

A snapshot copies the minimum fields necessary to preserve business meaning at one acquisition point. Upstream changes never mutate it. If a workflow allows the user to acquire a newer source value, that action creates/reselects a new explicit snapshot; it does not refresh the existing historical snapshot.

For BQ specifically, refresh-all, refresh-selected, drift replacement, and automatic propagation are forbidden.

### Supplier-price ownership

Master Data owns current `SkuPrice` state per `(sku_id, supplier_party_id)`. BQ reads every eligible option through `masterdata/public`, requires explicit estimator selection, and freezes exactly one option into a project line. BQ does not own a preferred supplier rule and never writes the selection back.

---

## No duplicate ownership

Foreign references and snapshots are allowed. Recreating a competing canonical Brand/SKU/Supplier/Price/Category table in another app is not.

---

## Category ownership (owner-confirmed 2026-08-22)

Category is a **global controlled dictionary** owned exclusively by Master Data.

### Two kinds, one table

| CategoryKind | Used by | Hierarchy |
|---|---|---|
| `PRODUCT` | SKU classification, Brand discovery | **Flat for MVP** — `parent_id` present in schema for future expansion; UI does not expose it for PRODUCT |
| `WORK` | WorkPrice classification | **Hierarchical** — `parent_id` and materialized `path` are maintained and used |

### Two distinct relations — must not be merged

**Brand ↔ Category (`BrandCategory`)** = discovery / catalog classification.
- Explicit assignment by staff. Never auto-derived from SKU assignments.
- A brand with no SKUs yet must still be discoverable by category (e.g. a new HPL brand before its first SKU is entered).
- `BrandCategory` is a standalone relation with its own business meaning.

**SKU → Category (`Sku.category_id`)** = product classification.
- Direct FK, one primary category per SKU.
- This is the authority for BQ line display: `[HPL] - AS-14094-CS98 Deep Mode Walnut`.
- Frozen into `snapshot_category_name` (and `snapshot_category_path` for WORK) when a BQ line is created.

### `search_synonyms` on Category

The `search_synonyms: String[]` field on `Category` stores discovery aliases (e.g. Category "HPL" → `["high pressure laminate", "laminasi"]`). These are search hints only — not display labels, not authority classifiers.

### Soft-delete pattern

Category uses `deleted_at DateTime?` (consistent with Party and Brand). Not `is_active: Boolean`. A partial unique index on `(kind, slug) WHERE deleted_at IS NULL` allows slug reuse after deletion.

### Business rules (enforced at application layer, not schema)

1. **Brand creation requires at least one PRODUCT Category.** A brand without a category cannot be saved. This ensures every brand is discoverable from day one.

2. **An ACTIVE SKU requires a `category_id`.** A SKU may exist without a category while in `DRAFT` status; it must have one before transitioning to `ACTIVE`.

### BQ snapshot contract for Category

- BQ reads `Sku.category` at line-creation time and freezes:
  - `snapshot_category_name` — the category's display name (e.g. `"HPL"`)
  - `snapshot_category_path` — the materialized path; for PRODUCT (flat), this equals `category.name`; for WORK, this is the full path (e.g. `"pekerjaan-dinding/cat-dinding"`)
- BQ **never** joins back to the `Category` table when displaying existing lines.
- Drift detection for category is not implemented — category reassignment on a SKU does not produce a drift alert.

### StudioFlow reads Category via Master Data public contract only

StudioFlow reads category lists (for Brand Library discovery UI) via `src/apps/masterdata/public/`. It does not import from Master Data domain, application, or infrastructure layers directly.
