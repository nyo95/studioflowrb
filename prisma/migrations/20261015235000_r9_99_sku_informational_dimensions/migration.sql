-- Existing base/purchase units and factors are retained for historical rows, but
-- new SKUs may omit them. Dimensions are informational and never require a factor.
ALTER TABLE "master_data"."Sku"
  ALTER COLUMN "base_unit_id" DROP NOT NULL,
  DROP CONSTRAINT "Sku_dimensions_complete_check",
  ADD CONSTRAINT "Sku_dimensions_complete_check" CHECK (
    (
      "dimension_length" IS NULL
      AND "dimension_width" IS NULL
      AND "dimension_thickness" IS NULL
      AND "dimension_unit_id" IS NULL
    ) OR (
      "dimension_length" > 0
      AND "dimension_width" > 0
      AND "dimension_unit_id" IS NOT NULL
    )
  );
