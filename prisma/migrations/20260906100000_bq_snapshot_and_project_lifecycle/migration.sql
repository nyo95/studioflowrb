-- Migration: R6.02 — BqProjectStatus lifecycle + source_price_snapshot
-- Rename DRAFT -> ACTIVE, add ARCHIVED to BqProjectStatus enum
-- Add source_price_snapshot to BqLineItem

-- Step 1: Add new enum values
ALTER TYPE "bq"."BqProjectStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "bq"."BqProjectStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

-- Step 2: Migrate existing DRAFT rows to ACTIVE
-- Must run in separate transaction from ADD VALUE (Postgres restriction)
-- We use DO block to ensure idempotency
DO $$
BEGIN
  UPDATE "bq"."BqProject" SET "status" = 'ACTIVE' WHERE "status" = 'DRAFT';
END $$;

-- Step 3: Drop DRAFT from the enum (requires recreating the type in Postgres)
-- Postgres does not support DROP VALUE, so we must recreate the type
ALTER TYPE "bq"."BqProjectStatus" RENAME TO "BqProjectStatus_old";
CREATE TYPE "bq"."BqProjectStatus" AS ENUM ('ACTIVE', 'LOCKED', 'ARCHIVED');
ALTER TABLE "bq"."BqProject"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "bq"."BqProjectStatus"
    USING "status"::text::"bq"."BqProjectStatus",
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"bq"."BqProjectStatus";
DROP TYPE "bq"."BqProjectStatus_old";

-- Step 4: Add source_price_snapshot to BqLineItem
ALTER TABLE "bq"."BqLineItem"
  ADD COLUMN IF NOT EXISTS "source_price_snapshot" DECIMAL(18,4) NULL;

-- Step 5: Backfill — treat current harga_snapshot as the baseline for all existing rows
UPDATE "bq"."BqLineItem" SET "source_price_snapshot" = "harga_snapshot" WHERE "source_price_snapshot" IS NULL;
