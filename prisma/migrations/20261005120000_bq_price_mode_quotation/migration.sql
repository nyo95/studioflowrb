-- BQ price modes (owner, 2026-09-23): TBC and By Owner are marker lines whose
-- price is not shown and not counted toward the grand total. Existing Work
-- Items keep their computed price (PRICED).
CREATE TYPE "bq"."BqPriceMode" AS ENUM ('PRICED', 'TBC', 'BY_OWNER');

ALTER TABLE "bq"."bq_item" ADD COLUMN "price_mode" "bq"."BqPriceMode" NOT NULL DEFAULT 'PRICED';

-- Quotation document details. Null terms print the studio's standard terms.
ALTER TABLE "bq"."bq_project"
  ADD COLUMN "quotation_number" TEXT,
  ADD COLUMN "quotation_date" DATE,
  ADD COLUMN "quotation_terms" TEXT;
