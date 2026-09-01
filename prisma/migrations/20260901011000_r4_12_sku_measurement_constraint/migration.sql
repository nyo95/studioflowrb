ALTER TABLE "master_data"."Sku"
  DROP CONSTRAINT "Sku_dimensions_complete_check",
  ADD CONSTRAINT "Sku_dimensions_complete_check" CHECK (
    (
      "dimension_length" IS NULL
      AND "dimension_width" IS NULL
      AND "dimension_thickness" IS NULL
      AND "dimension_unit_id" IS NULL
      AND "purchase_to_base_factor" IS NULL
    )
    OR
    (
      "dimension_length" > 0
      AND "dimension_width" > 0
      AND "dimension_unit_id" IS NOT NULL
      AND "purchase_to_base_factor" > 0
    )
  );
