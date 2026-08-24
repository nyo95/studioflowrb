# Legacy Migration Inventory

Canonical legacy evidence: `https://github.com/nyo95/studioflow/commit/548fbd6bd00ef9fd7d53df66a3561a32fbb56944`

All paths below are relative to that immutable snapshot. A local checkout is not evidence authority.

Use only these decisions:

| Legacy item | Decision | New destination | Reason |
|---|---|---|---|
| `master_data.Category` model | MIGRATE | `prisma/schema.prisma` → `master_data.Category` | Keep structure; replace `is_active` with `deleted_at`; add `search_synonyms`; `parent_id`/`path` retained (WORK only active in MVP) |
| `enum CategoryKind` (PRODUCT/WORK) | KEEP | `prisma/schema.prisma` | Distinguishes SKU categories from WorkPrice categories; both needed |
| `master_data.BrandCategory` model | MIGRATE | `prisma/schema.prisma` → `master_data.BrandCategory` | Keep as explicit discovery relation; remove `source` field and `CategorySource` enum |
| `enum CategorySource` (SEED/DERIVED_FROM_SKU) | PURGE | — | Auto-derive logic removed; BrandCategory is always explicit |
| `BrandCategory.source` field | PURGE | — | Depends on removed enum |
| `master_data.SkuCategory` model | PURGE | — | Replaced by direct `Sku.category_id` FK |
| `Sku.category_id` (new direct FK) | NEW | `prisma/schema.prisma` → `Sku.category_id` | Owner decision: one primary category per SKU; replaces SkuCategory junction |
| `Category.is_active: Boolean` | REWRITE | `Category.deleted_at: DateTime?` | Soft-delete consistent with Party/Brand; partial unique index pattern |
| `Category.path` (materialized path) | KEEP | stays on `Category` | Used by WORK categories; PRODUCT always null in MVP |
| `category-tree-rules.ts` (`categorySlug`, `buildCategoryPath`, `splitCategoryInput`) | REWRITE | `src/apps/masterdata/domain/category-rules.ts` | Keep only the generic pure helpers; bind `categorySlug` to the approved platform slug utility; purge retired PRODUCT hierarchy constants and inference helpers |
| `category-tree-service.ts` (`upsertCategory`, `propagateDescendantPaths`) | REWRITE | `src/apps/masterdata/infrastructure/category-tree-service.ts` | Descendant path propagation is useful for WORK, but the legacy service still uses `is_active`, auto-creates dictionaries, and encodes obsolete two-level/PRODUCT assumptions; adapt only after the Category application contract is locked |
| `Brand.tags: String[]` | LEGACY | stays on `Brand` (no structural role) | Search hint only; `search_synonyms` on Category is the authority field for discovery |
| `master_data.WorkPrice.category_id` FK | KEEP | stays as direct FK on `WorkPrice` | Correct; one WorkPrice → one WORK Category |
| `BqMaterialLine.snapshot_category_path` | KEEP (rename semantics) | stays on `BqMaterialLine` | For PRODUCT (flat): value = category name. For WORK: full path. Column name preserved for compatibility |
| `master-data-service.ts` (BQ's MD gateway) | MIGRATE | `src/apps/bq/infrastructure/masterdata-gateway.ts` | Only MD read gateway for BQ; import via `masterdata/public/` only |
| `SkuCategory` query logic in `master-data-service.ts` | REWRITE | Use `Sku.category` (direct relation) | SkuCategory junction removed; single join now |
| `ProjectProductRequest.vendor_quoted_price` upsert to MD | PURGE | — | Ownership violation: Gate #1 resolved. StudioFlow cannot write to MD pricing |
| `BqProject` standalone (no FK to StudioFlow Project) | KEEP | `prisma/schema.prisma` → `bq.BqProject` | Gate #3 resolved: BQ and StudioFlow projects are separate domains, no FK |

Rule: never copy a folder wholesale. Migrate a capability only after its owner, contract, dependencies, tests, and destination are known.
