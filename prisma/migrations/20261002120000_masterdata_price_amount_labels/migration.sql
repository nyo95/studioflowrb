-- WO-MD-PRICE-LABEL-01: a price may carry a short text label ("call sales") next to an amount of 0.
-- Pre-check: the columns are new, so no existing row can carry a label; what the CHECK constraints must still
-- never meet is a non-negative amount shape they do not know. Report row counts, then add the columns.
DO $$
DECLARE material_rows INTEGER; material_labor_rows INTEGER; labor_rows INTEGER;
BEGIN
  SELECT COUNT(*) INTO material_rows FROM "master_data"."PriceMaterial";
  SELECT COUNT(*) INTO material_labor_rows FROM "master_data"."PriceMaterialLabor";
  SELECT COUNT(*) INTO labor_rows FROM "master_data"."PriceLabor";
  RAISE NOTICE 'Price label precheck: PriceMaterial %, PriceMaterialLabor %, PriceLabor % rows keep a NULL label', material_rows, material_labor_rows, labor_rows;
END $$;

ALTER TABLE "master_data"."PriceMaterial" ADD COLUMN "amount_label" VARCHAR(64);
ALTER TABLE "master_data"."PriceMaterialLabor" ADD COLUMN "amount_label" VARCHAR(64);
ALTER TABLE "master_data"."PriceLabor" ADD COLUMN "amount_label" VARCHAR(64);

-- Validated against every existing row (all NULL), not NOT VALID.
ALTER TABLE "master_data"."PriceMaterial" ADD CONSTRAINT "price_material_amount_label_check"
  CHECK ("amount_label" IS NULL OR ("amount" = 0 AND char_length(btrim("amount_label")) BETWEEN 1 AND 64));
ALTER TABLE "master_data"."PriceMaterialLabor" ADD CONSTRAINT "price_material_labor_amount_label_check"
  CHECK ("amount_label" IS NULL OR ("amount" = 0 AND char_length(btrim("amount_label")) BETWEEN 1 AND 64));
ALTER TABLE "master_data"."PriceLabor" ADD CONSTRAINT "price_labor_amount_label_check"
  CHECK ("amount_label" IS NULL OR ("amount" = 0 AND char_length(btrim("amount_label")) BETWEEN 1 AND 64));
