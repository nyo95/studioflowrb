# Legacy Migration Inventory

Owner-designated read-only reference: `D:\Misc\ProjectsHUB\studioflow` (direction dated 2026-08-28).

Every migration report records the reference branch, commit, dirty state, and exact evidence paths. The reference is evidence, not product authority or an implementation base. Historical rows below are retained where still valid; current app contracts and `docs/15-RULE-AUDIT.md` win on conflict.

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
| `Brand.tags: String[]` | PURGE | — | Category `search_synonyms` is the controlled discovery hint; do not create a competing free-form authority. |
| `master_data.WorkPrice.category_id` FK | KEEP | stays as direct FK on `WorkPrice` | Correct; one WorkPrice → one WORK Category |
| `BqMaterialLine.snapshot_category_path` | KEEP (rename semantics) | stays on `BqMaterialLine` | For PRODUCT (flat): value = category name. For WORK: full path. Column name preserved for compatibility |
| `master-data-service.ts` (BQ's MD gateway) | MIGRATE | `src/apps/bq/infrastructure/masterdata-gateway.ts` | Only MD read gateway for BQ; import via `masterdata/public/` only |
| `SkuCategory` query logic in `master-data-service.ts` | REWRITE | Use `Sku.category` (direct relation) | SkuCategory junction removed; single join now |
| `ProjectProductRequest.vendor_quoted_price` upsert to MD | PURGE | — | Ownership violation: Gate #1 resolved. StudioFlow cannot write to MD pricing |
| `BqProject` standalone (no FK to StudioFlow Project) | KEEP | `prisma/schema.prisma` → `bq.BqProject` | Gate #3 resolved: BQ and StudioFlow projects are separate domains, no FK |
| Singular rebuild `Sku.price` / unique `SkuPrice.sku_id` | REWRITE — RESOLVED 2026-08-28 | Master Data schema/application/public/UI | Final law is current price per SKU × supplier pair; expose eligible `prices[]`. Implemented by migration `20260828000000_master_data_sku_pair_pricing` (pair partial unique indexes, NULL supplier kept deterministic, no supplier invented for legacy rows) and the `prices[]` public DTO. See RA-01 (resolved) and `docs/09-EXECUTION-PLAN.md` Gate B. |
| Temporal supplier offers / cheapest/latest/preferred fallback | PURGE | — | Current pair rows hold truth; audit holds change history; consumers select explicitly. |
| BQ snapshot refresh/drift replacement | PURGE | — | Existing snapshots never refresh. A deliberate new acquisition creates a new snapshot. |
| `BqSubObject` as a new feature foundation | LEGACY + REWRITE | BQ Works with L3 material/service lines | Existing data may need compatibility migration, but new hierarchy is L0/L1 grouping → L2 Works → L3 lines. |
| BQ calculation helpers | KEEP + REWRITE | `src/apps/bq/domain` / pure calculation module | Preserve verified coefficient × snapshot price and post-order rollup; do not copy component/service reductions. |
| StudioFlow phase/review actions | KEEP + REWRITE | `src/apps/studioflow/domain` + `application` | Preserve approved transition behavior and evidence; centralize transition policy rather than copying action structure. |
| StudioFlow direct Master Data reads/writes | REWRITE / PURGE writes | `masterdata/public` consumer gateway | Reads cross the public contract; implicit writes/promotions are forbidden. |

Rule: never copy a folder or source text wholesale. Migrate a capability only after its owner, contract, dependencies, tests, and destination are known, following `docs/16-LEGACY-MIGRATION-PLAYBOOK.md`.
