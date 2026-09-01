-- Structured SKU geometry and a persisted purchase-to-base conversion.
ALTER TABLE "master_data"."Sku"
  ADD COLUMN "dimension_length" DECIMAL(12,3),
  ADD COLUMN "dimension_width" DECIMAL(12,3),
  ADD COLUMN "dimension_thickness" DECIMAL(12,3),
  ADD COLUMN "dimension_unit_id" TEXT,
  ADD COLUMN "purchase_to_base_factor" DECIMAL(18,6);

ALTER TABLE "master_data"."Sku"
  ADD CONSTRAINT "Sku_dimension_unit_id_fkey"
  FOREIGN KEY ("dimension_unit_id") REFERENCES "master_data"."Unit"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "master_data"."Sku"
  ADD CONSTRAINT "Sku_dimensions_complete_check" CHECK (
    ("dimension_length" IS NULL AND "dimension_width" IS NULL AND "dimension_unit_id" IS NULL)
    OR
    ("dimension_length" > 0 AND "dimension_width" > 0 AND "dimension_unit_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "Sku_dimension_thickness_positive_check" CHECK (
    "dimension_thickness" IS NULL OR "dimension_thickness" > 0
  ),
  ADD CONSTRAINT "Sku_purchase_to_base_factor_positive_check" CHECK (
    "purchase_to_base_factor" IS NULL OR "purchase_to_base_factor" > 0
  );

CREATE INDEX "Sku_dimension_unit_id_idx" ON "master_data"."Sku"("dimension_unit_id");

INSERT INTO "master_data"."Unit" ("id", "code", "name", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'MM', 'Millimeter', now(), now()),
  (gen_random_uuid(), 'CM', 'Centimeter', now(), now()),
  (gen_random_uuid(), 'SHEET', 'Sheet', now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "status" = 'ACTIVE',
  "archived_at" = NULL;
