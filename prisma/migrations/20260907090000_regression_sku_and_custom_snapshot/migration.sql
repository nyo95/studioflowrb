-- Owner correction: Brand and SKU may each exist independently.
ALTER TABLE "master_data"."Sku" ALTER COLUMN "brand_id" DROP NOT NULL;

-- CUSTOM rows have no imported price baseline. Preserve their working price.
UPDATE "bq"."bq_line_item"
SET "source_price_snapshot" = NULL
WHERE "source_type" = 'CUSTOM' AND "source_price_snapshot" IS NOT NULL;

ALTER TABLE "bq"."bq_line_item"
ADD CONSTRAINT "bq_line_item_custom_no_source_price"
CHECK ("source_type" <> 'CUSTOM' OR "source_price_snapshot" IS NULL);
