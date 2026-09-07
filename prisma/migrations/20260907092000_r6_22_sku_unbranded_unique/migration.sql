-- R6.22 — Unbranded SKU slug uniqueness
-- Classification: DDL-only; no data is changed.
--
-- The branded SKU live-identity index (from R6.21) uses (brand_id, slug) WHERE
-- deleted_at IS NULL. PostgreSQL treats NULL as distinct in unique indexes, so
-- two unbranded SKUs with the same slug would not conflict on that index.
--
-- An unbranded SKU (brand_id IS NULL) is an orphaned entity — its Brand was
-- permanently deleted. Slug uniqueness among orphaned live SKUs is still a
-- meaningful invariant: if two orphaned SKUs share a slug they cannot both be
-- reassigned to the same Brand later without a rename, which causes hidden
-- friction. This index closes that gap.

CREATE UNIQUE INDEX IF NOT EXISTS "sku_unbranded_live_slug_unique"
  ON "master_data"."Sku" ("slug")
  WHERE "deleted_at" IS NULL AND "brand_id" IS NULL;
