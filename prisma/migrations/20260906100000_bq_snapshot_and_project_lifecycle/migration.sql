-- Migration: BqProjectStatus lifecycle + source_price_snapshot
-- Rename DRAFT -> ACTIVE, add ARCHIVED to BqProjectStatus enum
-- Add source_price_snapshot to BqLineItem

-- Replace the enum in one transaction. The CASE maps historical DRAFT rows
-- without attempting to use a freshly-added enum value before commit.
CREATE TYPE "bq"."BqProjectStatus_new" AS ENUM ('ACTIVE', 'LOCKED', 'ARCHIVED');
ALTER TABLE "bq"."bq_project"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "bq"."BqProjectStatus_new"
    USING (CASE WHEN "status"::text = 'DRAFT' THEN 'ACTIVE' ELSE "status"::text END)::"bq"."BqProjectStatus_new",
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"bq"."BqProjectStatus_new";
DROP TYPE "bq"."BqProjectStatus";
ALTER TYPE "bq"."BqProjectStatus_new" RENAME TO "BqProjectStatus";

-- Add source_price_snapshot to BqLineItem
ALTER TABLE "bq"."bq_line_item"
  ADD COLUMN IF NOT EXISTS "source_price_snapshot" DECIMAL(18,4) NULL;

-- Imported rows alone have a source baseline; CUSTOM has none.
UPDATE "bq"."bq_line_item" SET "source_price_snapshot" = "harga_snapshot"
WHERE "source_price_snapshot" IS NULL AND "source_type" IN ('MASTERDATA', 'BQ_LIBRARY');
