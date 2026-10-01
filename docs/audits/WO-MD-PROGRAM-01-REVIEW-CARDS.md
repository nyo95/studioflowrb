# WO-MD-PROGRAM-01 Review Cards

## Phase 1 — lowercase unit codes (R8.270)

### What changed

Unit codes are now saved in lowercase, regardless of how staff type them.
For example, entering `PCS` is stored and returned as `pcs`.
The database rejects a future uppercase code as an extra safety net.
Existing BQ and StudioFlow unit text changed only when it matched a known unit;
free-typed text remains unchanged.

| Requirement | Evidence | Result |
| --- | --- | --- |
| 1. Lowercase storage and case-insensitive service input | `src/apps/masterdata/service.integration.test.ts` — `handles Unit update and list queries` | PASS |
| 2. Database CHECK and duplicate pre-check | `prisma/migrations/20261001100000_masterdata_lowercase_unit_codes/migration.sql` — `Unit_code_lowercase_check` and pre-check block | PASS |
| 3. BQ/StudioFlow plain-text values change only when they match a unit | Same migration — `EXISTS` lookups against `master_data.Unit` for every listed snapshot/unit column | PASS |
| 4. Existing unit lookups use stored lowercase | `src/apps/masterdata/service.integration.test.ts` fixture queries and full `npm test` | PASS |

Lead re-check commands:

1. `npm test -- --test-name-pattern="handles Unit update and list queries"`
2. `psql "$DATABASE_URL" -c 'SELECT code FROM master_data."Unit" WHERE code <> lower(code);'`
3. `npx prisma migrate status`

| Table | Before | After |
| --- | ---: | ---: |
| `master_data.Unit` | 11 code rows; migration normalizes each non-lowercase row | 11 lowercase rows |
| BQ unit/snapshot fields | 2 rows present across targeted tables; only matching values were eligible | 2 rows present; matching values lowercase |
| StudioFlow unit fields | 1 row present across targeted tables; only matching values were eligible | 1 row present; matching values lowercase |

### Deviations and deferred items

None. The explicitly owner-approved cross-app migration exception is recorded in the boundary checker's migration allow-list.

## Phase 2 — Brand → Supplier → Price (R8.271)

### What changed

A priced branded SKU now needs a supplier that carries its Brand, unless that supplier owns the Brand.
This is checked for ordinary prices, initial SKU prices, imports and sample-price sync because they use the same price service.
Removing a Brand/Supplier link and changing a SKU Brand stop when live prices would become invalid.
The new idempotent link command creates the approved relationship and writes an audit event.

| Requirement | Evidence | Result |
| --- | --- | --- |
| 1. Material price chain on create/update/restore | `assertPriceMaterialBrandSupplierChain` in `shared.ts`, called by `pricing.service.ts` and restore validation | PASS |
| 2. Initial SKU price chain | `sku.service.ts` validates each created price inside its transaction | PASS |
| 3. Unsafe unlink and SKU Brand change blocked | `brand.service.ts` / `sku.service.ts` live-price guards | PASS |
| 4. Idempotent audited link command | `brand.service.ts` — `linkBrandToSupplier` | PASS |
| 5. Pricing references expose allowed Brand ids | `vendor.service.ts` — additive `brandIds` on material suppliers | PASS |

Lead re-check commands:

1. `npm test`
2. `psql "$DATABASE_URL" -c 'SELECT p.id FROM master_data."PriceMaterial" p JOIN master_data."Sku" s ON s.id=p.sku_id JOIN master_data."Brand" b ON b.id=s.brand_id WHERE s.brand_id IS NOT NULL AND b.owner_vendor_id IS DISTINCT FROM p.supplier_vendor_id AND NOT EXISTS (SELECT 1 FROM master_data."BrandSupplier" bs WHERE bs.brand_id=s.brand_id AND bs.vendor_id=p.supplier_vendor_id);'`
3. `npx prisma migrate status`

| Table | Before | After |
| --- | ---: | ---: |
| `master_data.PriceMaterial` | Read-only violation check required | Read-only violation check required |

### Deviations and deferred items

No schema migration was needed; this phase is service-level enforcement.
