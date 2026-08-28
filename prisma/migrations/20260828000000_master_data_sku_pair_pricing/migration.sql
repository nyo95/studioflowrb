-- Gate B (RA-01): singular pricing -> current price per SKU x supplier pair.
--
-- Existing rows keep their identity and their supplier_party_id exactly as
-- stored. Legacy rows with a NULL supplier are NOT given an invented supplier:
-- NULL remains a deterministic pair member (at most one NULL-supplier row per
-- SKU). Because the previous schema enforced one row per SKU, no pair
-- conflict can exist in migrated data and no row rejection is possible.
--
-- Plain UNIQUE ("sku_id", "supplier_party_id") is insufficient because
-- PostgreSQL treats NULLs as distinct; the NULL-supplier partition therefore
-- needs its own partial unique index.

DROP INDEX "master_data"."SkuPrice_sku_id_key";

CREATE UNIQUE INDEX "SkuPrice_pair_supplier_uniq"
  ON "master_data"."SkuPrice"("sku_id", "supplier_party_id")
  WHERE "supplier_party_id" IS NOT NULL;

CREATE UNIQUE INDEX "SkuPrice_pair_nosupplier_uniq"
  ON "master_data"."SkuPrice"("sku_id")
  WHERE "supplier_party_id" IS NULL;

CREATE INDEX "SkuPrice_sku_id_idx" ON "master_data"."SkuPrice"("sku_id");
