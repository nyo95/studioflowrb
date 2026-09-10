-- StudioFlow-owned Product Catalogue reuse pool.
-- Additive only; no cross-schema foreign keys and no Master Data SKU/unit/price reads.

CREATE TABLE "studioflow"."sf_product_catalogue" (
  "id"             TEXT         NOT NULL,
  "brand_md_id"    TEXT,
  "brand_name"     TEXT,
  "product_name"   TEXT         NOT NULL,
  "colour"         TEXT,
  "finishing"      TEXT,
  "dimension_text" TEXT,
  "unit"           TEXT,
  "notes"          TEXT,
  "search_key"     TEXT         NOT NULL,
  "sort_order"     INTEGER      NOT NULL DEFAULT 0,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  "deleted_at"     TIMESTAMP(3),
  CONSTRAINT "sf_product_catalogue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sf_product_catalogue_search_key_idx"
  ON "studioflow"."sf_product_catalogue"("search_key");

CREATE INDEX "sf_product_catalogue_brand_md_id_idx"
  ON "studioflow"."sf_product_catalogue"("brand_md_id");

CREATE INDEX "sf_product_catalogue_deleted_sort_idx"
  ON "studioflow"."sf_product_catalogue"("deleted_at", "sort_order");
