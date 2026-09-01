-- Enforce the contract that every SKU has at most one product category.
-- The application requires one category for every live SKU mutation.
CREATE UNIQUE INDEX "SkuCategory_sku_id_key"
ON "master_data"."SkuCategory" ("sku_id");
