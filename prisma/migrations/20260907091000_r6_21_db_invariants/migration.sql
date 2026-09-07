-- R6.21 — Database invariant enforcement
-- Classification: DDL-only; no data is changed.
-- This migration adds partial unique index and CHECK constraints that enforce
-- rules already assumed by application code but not previously backed by the DB.

-- ── SKU live identity uniqueness ────────────────────────────────────────────
-- Uniqueness is scoped to (brand_id, slug) among non-archived rows.
-- A null brand_id is valid (unbranched SKU); two null-brand SKUs sharing a slug
-- conflict just as two same-brand SKUs do.
-- Using a partial index so archived duplicates (from before soft-delete cleanup)
-- are not blocked.
CREATE UNIQUE INDEX IF NOT EXISTS "sku_live_identity_unique"
  ON "master_data"."Sku" ("brand_id", "slug")
  WHERE "deleted_at" IS NULL;

-- ── BQ parent XOR constraints ───────────────────────────────────────────────
-- BqItem: exactly one of section_id / subsection_id must be non-null.
ALTER TABLE "bq"."bq_item"
  ADD CONSTRAINT "bq_item_parent_xor"
  CHECK (num_nonnulls("section_id", "subsection_id") = 1);

-- BqLineItem: exactly one of sub_object_id / item_id must be non-null.
ALTER TABLE "bq"."bq_line_item"
  ADD CONSTRAINT "bq_line_item_parent_xor"
  CHECK (num_nonnulls("sub_object_id", "item_id") = 1);
